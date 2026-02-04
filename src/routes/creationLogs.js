import { generateCreationLogId } from '../utils/generators.js';

export default async function creationLogsRoutes(fastify, options) {
  const { prisma } = fastify;

  // Get creation logs with pagination and filters
  fastify.get('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const {
      page = 1,
      limit = 50,
      status,
      workspaceId,
      createdBy,
      search
    } = request.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {};

    if (status) {
      where.status = status;
    }
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }
    if (createdBy) {
      where.createdBy = createdBy;
    }
    if (search) {
      where.OR = [
        { logId: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.creationLog.findMany({
        where,
        include: {
          workspace: {
            select: { id: true, domain: true }
          },
          account: {
            select: { id: true, email: true, status: true }
          }
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.creationLog.count({ where })
    ]);

    return {
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    };
  });

  // Get single creation log
  fastify.get('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const log = await prisma.creationLog.findUnique({
      where: { id },
      include: {
        workspace: true,
        account: true
      }
    });

    if (!log) {
      return reply.status(404).send({ error: 'Creation log not found' });
    }

    return log;
  });

  // Get creation log stats
  fastify.get('/stats/summary', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const [
      total,
      pending,
      creating,
      browserAuth,
      waitingOtp,
      success,
      failed,
      today
    ] = await Promise.all([
      prisma.creationLog.count(),
      prisma.creationLog.count({ where: { status: 'PENDING' } }),
      prisma.creationLog.count({ where: { status: 'CREATING' } }),
      prisma.creationLog.count({ where: { status: 'BROWSER_AUTH' } }),
      prisma.creationLog.count({ where: { status: 'WAITING_OTP' } }),
      prisma.creationLog.count({ where: { status: 'SUCCESS' } }),
      prisma.creationLog.count({ where: { status: 'FAILED' } }),
      prisma.creationLog.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      })
    ]);

    const inProgress = pending + creating + browserAuth + waitingOtp;

    return {
      total,
      pending,
      inProgress,
      success,
      failed,
      today,
      successRate: total > 0 ? Math.round((success / total) * 100) : 0
    };
  });

  // Get available statuses (matching the enum)
  fastify.get('/statuses', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    return {
      statuses: [
        { key: 'PENDING', label: 'В очереди', color: 'neutral' },
        { key: 'CREATING', label: 'Создание в Google', color: 'info' },
        { key: 'BROWSER_AUTH', label: 'Авторизация', color: 'info' },
        { key: 'ADDING_RECOVERY', label: 'Добавление recovery', color: 'info' },
        { key: 'WAITING_OTP', label: 'Ожидание OTP', color: 'warning' },
        { key: 'CONFIRMING_OTP', label: 'Подтверждение OTP', color: 'warning' },
        { key: 'SUCCESS', label: 'Успешно', color: 'success' },
        { key: 'FAILED', label: 'Ошибка', color: 'danger' }
      ]
    };
  });

  // Clear old logs (older than 30 days)
  fastify.delete('/cleanup', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await prisma.creationLog.deleteMany({
      where: {
        createdAt: { lt: thirtyDaysAgo }
      }
    });

    return {
      success: true,
      deleted: result.count,
      message: `Deleted ${result.count} logs older than 30 days`
    };
  });

  // Get logs for specific workspace
  fastify.get('/workspace/:workspaceId', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { workspaceId } = request.params;
    const { limit = 50 } = request.query;

    const logs = await prisma.creationLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    return { data: logs };
  });
}

/**
 * Create a new creation log entry
 */
export async function createCreationLog(prisma, data) {
  const logId = generateCreationLogId();

  return prisma.creationLog.create({
    data: {
      logId,
      workspaceId: data.workspaceId,
      status: data.status || 'PENDING',
      currentStep: data.currentStep || data.step,
      email: data.email,
      proxyUsed: data.proxyUsed,
      fingerprintId: data.fingerprintId,
      error: data.error || data.errorMessage,
      durationMs: data.durationMs || data.duration,
      stepDurations: data.stepDurations,
      createdBy: data.createdBy || 'Manual'
    }
  });
}

/**
 * Update creation log status
 */
export async function updateCreationLog(prisma, id, data) {
  const updateData = {};

  if (data.status !== undefined) updateData.status = data.status;
  if (data.currentStep !== undefined) updateData.currentStep = data.currentStep;
  if (data.step !== undefined) updateData.currentStep = data.step;
  if (data.accountId !== undefined) updateData.accountId = data.accountId;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.proxyUsed !== undefined) updateData.proxyUsed = data.proxyUsed;
  if (data.fingerprintId !== undefined) updateData.fingerprintId = data.fingerprintId;
  if (data.error !== undefined) updateData.error = data.error;
  if (data.errorMessage !== undefined) updateData.error = data.errorMessage;
  if (data.durationMs !== undefined) updateData.durationMs = data.durationMs;
  if (data.duration !== undefined) updateData.durationMs = data.duration;
  if (data.stepDurations !== undefined) updateData.stepDurations = data.stepDurations;

  return prisma.creationLog.update({
    where: { id },
    data: updateData
  });
}
