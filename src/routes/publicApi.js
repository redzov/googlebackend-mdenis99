import { generateLogId } from '../utils/generators.js';
import { getAccountCreationService } from '../services/accountCreation.js';
import { checkRateLimit } from '../utils/rateLimiter.js';

export default async function publicApiRoutes(fastify, options) {
  const { prisma } = fastify;

  // Middleware to validate API key and check rate limit
  const validateApiKey = async (request, reply) => {
    const startTime = Date.now();

    const apiKey = request.headers['x-api-key'] || request.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      await logRequest(prisma, null, request, 401, startTime, 'Missing API key');
      return reply.status(401).send({ error: 'API key required' });
    }

    const key = await prisma.key.findUnique({
      where: { key: apiKey },
      include: {
        workspace: true,
        _count: {
          select: { accounts: true }
        }
      }
    });

    if (!key) {
      await logRequest(prisma, null, request, 401, startTime, 'Invalid API key');
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    // Check rate limit (100 req/min per key)
    const rateLimit = checkRateLimit(key.id);

    // Add rate limit headers
    reply.header('X-RateLimit-Limit', '100');
    reply.header('X-RateLimit-Remaining', rateLimit.remaining.toString());
    reply.header('X-RateLimit-Reset', Math.ceil(rateLimit.resetAt / 1000).toString());

    if (!rateLimit.allowed) {
      reply.header('Retry-After', rateLimit.retryAfter.toString());
      await logRequest(prisma, key.id, request, 429, startTime, 'Rate limit exceeded');
      return reply.status(429).send({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${rateLimit.retryAfter} seconds`,
        retryAfter: rateLimit.retryAfter
      });
    }

    // Attach key to request
    request.apiKey = key;
    request.startTime = startTime;
  };

  // Get accounts (issue from pool)
  fastify.get('/accounts', {
    preHandler: [validateApiKey]
  }, async (request, reply) => {
    const { count = 1 } = request.query;
    const key = request.apiKey;
    const startTime = request.startTime;

    try {
      const actualCount = Math.min(Math.max(1, parseInt(count)), 100);

      // Check quota
      const currentUsage = key._count.accounts;
      const remainingQuota = key.quotaLimit - currentUsage;

      if (remainingQuota <= 0) {
        await logRequest(prisma, key.id, request, 403, startTime, 'Quota exceeded');
        return reply.status(403).send({ 
          error: 'Quota exceeded',
          quota: {
            used: currentUsage,
            limit: key.quotaLimit,
            remaining: 0
          }
        });
      }

      // Get available accounts from workspace
      const requestedCount = Math.min(actualCount, remainingQuota);
      
      const availableAccounts = await prisma.account.findMany({
        where: {
          workspaceId: key.workspaceId,
          status: 'AVAILABLE'
        },
        take: requestedCount
      });

      if (availableAccounts.length === 0) {
        await logRequest(prisma, key.id, request, 404, startTime, 'No available accounts');
        return reply.status(404).send({ 
          error: 'No available accounts',
          message: 'Please wait for more accounts to be created'
        });
      }

      // Issue accounts to this key
      await prisma.account.updateMany({
        where: {
          id: { in: availableAccounts.map(a => a.id) }
        },
        data: {
          keyId: key.id,
          status: 'ISSUED',
          issuedTo: key.keyId,
          issuedAt: new Date()
        }
      });

      // Format response
      const accounts = availableAccounts.map(a => ({
        email: a.email,
        password: a.password,
        recovery: a.recovery
      }));

      await logRequest(prisma, key.id, request, 200, startTime, `Issued ${accounts.length} accounts`);

      return {
        success: true,
        accounts,
        count: accounts.length,
        quota: {
          used: currentUsage + accounts.length,
          limit: key.quotaLimit,
          remaining: remainingQuota - accounts.length
        }
      };

    } catch (error) {
      await logRequest(prisma, key.id, request, 500, startTime, error.message);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Create new accounts on demand
  fastify.post('/accounts/create', {
    preHandler: [validateApiKey]
  }, async (request, reply) => {
    const { count = 1 } = request.body;
    const key = request.apiKey;
    const startTime = request.startTime;

    try {
      const actualCount = Math.min(Math.max(1, parseInt(count)), 50);

      // Check quota
      const currentUsage = key._count.accounts;
      const remainingQuota = key.quotaLimit - currentUsage;

      if (remainingQuota <= 0) {
        await logRequest(prisma, key.id, request, 403, startTime, 'Quota exceeded');
        return reply.status(403).send({ 
          error: 'Quota exceeded',
          quota: {
            used: currentUsage,
            limit: key.quotaLimit,
            remaining: 0
          }
        });
      }

      // Check workspace has credentials
      if (!key.workspace.serviceAccountJson || !key.workspace.adminEmail) {
        await logRequest(prisma, key.id, request, 400, startTime, 'Workspace not configured');
        return reply.status(400).send({ 
          error: 'Workspace not configured for account creation'
        });
      }

      const service = getAccountCreationService(prisma);

      // Check if creation is already running
      if (service.isRunning) {
        await logRequest(prisma, key.id, request, 409, startTime, 'Creation already in progress');
        return reply.status(409).send({ 
          error: 'Account creation already in progress',
          message: 'Please try again later'
        });
      }

      // Create accounts
      const result = await service.createAccountsForKey(key.id, actualCount);

      // Format response
      const accounts = result.accounts.map(a => ({
        email: a.email,
        password: a.password,
        recovery: a.recovery
      }));

      await logRequest(prisma, key.id, request, 200, startTime, `Created ${accounts.length} accounts`);

      return {
        success: true,
        accounts,
        count: accounts.length,
        failed: result.failed,
        quota: {
          used: currentUsage + accounts.length,
          limit: key.quotaLimit,
          remaining: result.quotaRemaining
        }
      };

    } catch (error) {
      await logRequest(prisma, key.id, request, 500, startTime, error.message);
      return reply.status(500).send({ error: error.message || 'Internal server error' });
    }
  });

  // Get quota info
  fastify.get('/quota', {
    preHandler: [validateApiKey]
  }, async (request, reply) => {
    const key = request.apiKey;
    const startTime = request.startTime;

    const currentUsage = key._count.accounts;

    await logRequest(prisma, key.id, request, 200, startTime, 'Quota check');

    return {
      keyId: key.keyId,
      workspace: key.workspace.domain,
      quota: {
        used: currentUsage,
        limit: key.quotaLimit,
        remaining: key.quotaLimit - currentUsage
      }
    };
  });

  // Get issued accounts history
  fastify.get('/accounts/history', {
    preHandler: [validateApiKey]
  }, async (request, reply) => {
    const { page = 1, limit = 50 } = request.query;
    const key = request.apiKey;
    const startTime = request.startTime;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where: { keyId: key.id },
        select: {
          email: true,
          password: true,
          recovery: true,
          status: true,
          issuedAt: true
        },
        skip,
        take: parseInt(limit),
        orderBy: { issuedAt: 'desc' }
      }),
      prisma.account.count({ where: { keyId: key.id } })
    ]);

    await logRequest(prisma, key.id, request, 200, startTime, 'History request');

    return {
      accounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  });

  // Report bad account
  fastify.post('/accounts/report', {
    preHandler: [validateApiKey]
  }, async (request, reply) => {
    const { email } = request.body;
    const key = request.apiKey;
    const startTime = request.startTime;

    if (!email) {
      await logRequest(prisma, key.id, request, 400, startTime, 'Email required');
      return reply.status(400).send({ error: 'Email required' });
    }

    // Find account
    const account = await prisma.account.findFirst({
      where: {
        email,
        keyId: key.id
      }
    });

    if (!account) {
      await logRequest(prisma, key.id, request, 404, startTime, 'Account not found');
      return reply.status(404).send({ error: 'Account not found or not issued to this key' });
    }

    // Update status to BAD
    await prisma.account.update({
      where: { id: account.id },
      data: { status: 'BAD' }
    });

    await logRequest(prisma, key.id, request, 200, startTime, `Reported bad: ${email}`);

    return {
      success: true,
      message: 'Account marked as bad'
    };
  });

  // Health check (no auth required)
  fastify.get('/health', async (request, reply) => {
    return { 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  });
}

/**
 * Log API request
 */
async function logRequest(prisma, keyId, request, status, startTime, message) {
  const latencyMs = Date.now() - startTime;
  const logId = generateLogId();

  try {
    await prisma.apiLog.create({
      data: {
        logId,
        keyId,
        endpoint: request.url.split('?')[0],
        method: request.method,
        status,
        latencyMs,
        message,
        request: {
          query: request.query,
          body: request.body,
          ip: request.ip
        }
      }
    });
  } catch (error) {
    console.error('Failed to log request:', error);
  }
}
