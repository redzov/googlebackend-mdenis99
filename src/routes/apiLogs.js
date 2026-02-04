export default async function apiLogsRoutes(fastify, options) {
  const { prisma } = fastify;

  // Get all logs with pagination and filters
  fastify.get('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { 
      page = 1, 
      limit = 50, 
      search = '',
      status,
      endpoint,
      keyId
    } = request.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const where = {};
    
    if (search) {
      where.OR = [
        { logId: { contains: search, mode: 'insensitive' } },
        { key: { keyId: { contains: search, mode: 'insensitive' } } },
        { key: { key: { contains: search, mode: 'insensitive' } } }
      ];
    }
    
    if (status) {
      where.status = parseInt(status);
    }
    
    if (endpoint) {
      where.endpoint = endpoint;
    }
    
    if (keyId) {
      where.keyId = keyId;
    }

    const [logs, total] = await Promise.all([
      prisma.apiLog.findMany({
        where,
        include: {
          key: {
            select: { id: true, keyId: true, key: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.apiLog.count({ where })
    ]);

    return {
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  });

  // Get single log
  fastify.get('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const log = await prisma.apiLog.findUnique({
      where: { id },
      include: {
        key: true
      }
    });

    if (!log) {
      return reply.status(404).send({ error: 'Log not found' });
    }

    return log;
  });

  // Download logs with filters
  fastify.get('/download', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { status, endpoint, keyId, format = 'json' } = request.query;

    const where = {};
    if (status) where.status = parseInt(status);
    if (endpoint) where.endpoint = endpoint;
    if (keyId) where.keyId = keyId;

    const logs = await prisma.apiLog.findMany({
      where,
      include: {
        key: {
          select: { keyId: true, key: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (format === 'json') {
      const data = logs.map(l => ({
        ts: l.createdAt,
        endpoint: l.endpoint,
        keyId: l.key?.keyId || null,
        status: l.status,
        latencyMs: l.latencyMs,
        message: l.message
      }));

      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', 'attachment; filename="api-logs.json"');
      return data;
    }

    // Format: ID:Date:Key:Endpoint:Status:LatencyMs
    const content = logs
      .map(l => `${l.logId}:${l.createdAt.toISOString()}:${l.key?.keyId || 'N/A'}:${l.endpoint}:${l.status}:${l.latencyMs}`)
      .join('\n');

    reply.header('Content-Type', 'text/plain');
    reply.header('Content-Disposition', 'attachment; filename="api-logs.txt"');
    
    return content;
  });

  // Get unique endpoints for filter
  fastify.get('/endpoints', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const endpoints = await prisma.apiLog.findMany({
      select: { endpoint: true },
      distinct: ['endpoint']
    });

    return endpoints.map(e => e.endpoint);
  });

  // Get unique statuses for filter
  fastify.get('/statuses', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const statuses = await prisma.apiLog.findMany({
      select: { status: true },
      distinct: ['status']
    });

    return statuses.map(s => s.status);
  });

  // Clear old logs (older than X days)
  fastify.delete('/clear', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { days = 30 } = request.query;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    const result = await prisma.apiLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate }
      }
    });

    return { 
      success: true, 
      deleted: result.count,
      message: `Deleted ${result.count} logs older than ${days} days`
    };
  });
}
