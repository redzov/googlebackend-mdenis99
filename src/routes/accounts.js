export default async function accountsRoutes(fastify, options) {
  const { prisma } = fastify;

  // Get all accounts with pagination, search and filters
  fastify.get('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { 
      page = 1, 
      limit = 50, 
      search = '',
      status,
      workspaceId 
    } = request.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const where = {};
    
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { workspace: { domain: { contains: search, mode: 'insensitive' } } }
      ];
    }
    
    if (status) {
      where.status = status;
    }
    
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        include: {
          workspace: {
            select: { id: true, domain: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.account.count({ where })
    ]);

    return {
      data: accounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  });

  // Get single account
  fastify.get('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        workspace: true,
        key: true
      }
    });

    if (!account) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    return account;
  });

  // Update account status
  fastify.put('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;
    const { status } = request.body;

    if (!status || !['AVAILABLE', 'ISSUED', 'BAD'].includes(status)) {
      return reply.status(400).send({ error: 'Valid status required (AVAILABLE, ISSUED, BAD)' });
    }

    const existingAccount = await prisma.account.findUnique({
      where: { id }
    });

    if (!existingAccount) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    const updatedAccount = await prisma.account.update({
      where: { id },
      data: { status },
      include: {
        workspace: {
          select: { id: true, domain: true }
        }
      }
    });

    return updatedAccount;
  });

  // Bulk update account status
  fastify.post('/bulk-status', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { ids, status } = request.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: 'Account IDs array required' });
    }

    if (!status || !['AVAILABLE', 'ISSUED', 'BAD'].includes(status)) {
      return reply.status(400).send({ error: 'Valid status required (AVAILABLE, ISSUED, BAD)' });
    }

    const result = await prisma.account.updateMany({
      where: { id: { in: ids } },
      data: { status }
    });

    return { 
      success: true, 
      updated: result.count 
    };
  });

  // Delete account
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const existingAccount = await prisma.account.findUnique({
      where: { id }
    });

    if (!existingAccount) {
      return reply.status(404).send({ error: 'Account not found' });
    }

    await prisma.account.delete({
      where: { id }
    });

    return { success: true, message: 'Account deleted' };
  });

  // Download accounts with filters
  fastify.get('/download', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { status, workspaceId, format = 'txt' } = request.query;

    const where = {};
    if (status) where.status = status;
    if (workspaceId) where.workspaceId = workspaceId;

    const accounts = await prisma.account.findMany({
      where,
      include: {
        workspace: {
          select: { domain: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (format === 'json') {
      // Format: JSON array
      const data = accounts.map(a => ({
        issuedAt: a.issuedAt,
        status: a.status,
        email: a.email,
        password: a.password,
        recovery: a.recovery
      }));

      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', 'attachment; filename="accounts.json"');
      return data;
    }

    // Format: Issued At:Status:Email:Password:Recovery
    const content = accounts
      .map(a => `${a.issuedAt.toISOString()}:${a.status}:${a.email}:${a.password}:${a.recovery || ''}`)
      .join('\n');

    reply.header('Content-Type', 'text/plain');
    reply.header('Content-Disposition', 'attachment; filename="accounts.txt"');
    
    return content;
  });

  // Get account statistics
  fastify.get('/stats', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const [total, available, issued, bad] = await Promise.all([
      prisma.account.count(),
      prisma.account.count({ where: { status: 'AVAILABLE' } }),
      prisma.account.count({ where: { status: 'ISSUED' } }),
      prisma.account.count({ where: { status: 'BAD' } })
    ]);

    return {
      total,
      available,
      issued,
      bad
    };
  });
}
