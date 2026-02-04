export default async function statsRoutes(fastify, options) {
  const { prisma } = fastify;

  // Get dashboard statistics
  fastify.get('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalAccounts,
      availableAccounts,
      issuedAccounts,
      badAccounts,
      totalKeys,
      totalWorkspaces,
      totalRecoveryEmails,
      accountsLast30Days,
      settings
    ] = await Promise.all([
      prisma.account.count(),
      prisma.account.count({ where: { status: 'AVAILABLE' } }),
      prisma.account.count({ where: { status: 'ISSUED' } }),
      prisma.account.count({ where: { status: 'BAD' } }),
      prisma.key.count(),
      prisma.workspace.count(),
      prisma.recoveryEmail.count(),
      prisma.account.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.settings.findUnique({ where: { id: 'main' } })
    ]);

    return {
      accounts: {
        total: totalAccounts,
        available: availableAccounts,
        issued: issuedAccounts,
        bad: badAccounts,
        last30Days: accountsLast30Days
      },
      keys: {
        total: totalKeys
      },
      workspaces: {
        total: totalWorkspaces
      },
      recoveryEmails: {
        total: totalRecoveryEmails
      },
      settings: {
        threads: settings?.threads || 1
      }
    };
  });

  // Get accounts creation history (for charts)
  fastify.get('/accounts/history', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { days = 30 } = request.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);

    const accounts = await prisma.account.findMany({
      where: {
        createdAt: { gte: startDate }
      },
      select: {
        createdAt: true,
        status: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Group by date
    const history = {};
    for (let i = 0; i <= parseInt(days); i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      history[dateStr] = { date: dateStr, count: 0 };
    }

    accounts.forEach(acc => {
      const dateStr = acc.createdAt.toISOString().split('T')[0];
      if (history[dateStr]) {
        history[dateStr].count++;
      }
    });

    return Object.values(history);
  });

  // Get API usage history
  fastify.get('/api/history', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { days = 7 } = request.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);

    const logs = await prisma.apiLog.findMany({
      where: {
        createdAt: { gte: startDate }
      },
      select: {
        createdAt: true,
        status: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Group by date
    const history = {};
    for (let i = 0; i <= parseInt(days); i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      history[dateStr] = { date: dateStr, requests: 0, errors: 0 };
    }

    logs.forEach(log => {
      const dateStr = log.createdAt.toISOString().split('T')[0];
      if (history[dateStr]) {
        history[dateStr].requests++;
        if (log.status >= 400) {
          history[dateStr].errors++;
        }
      }
    });

    return Object.values(history);
  });

  // Get top keys by usage
  fastify.get('/keys/top', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { limit = 10 } = request.query;

    const keys = await prisma.key.findMany({
      include: {
        workspace: {
          select: { domain: true }
        },
        _count: {
          select: { accounts: true }
        }
      },
      orderBy: {
        accounts: {
          _count: 'desc'
        }
      },
      take: parseInt(limit)
    });

    return keys.map(k => ({
      id: k.id,
      keyId: k.keyId,
      domain: k.workspace.domain,
      accountsIssued: k._count.accounts,
      quotaLimit: k.quotaLimit,
      usagePercent: Math.round((k._count.accounts / k.quotaLimit) * 100)
    }));
  });
}
