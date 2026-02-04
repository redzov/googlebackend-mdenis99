export default async function settingsRoutes(fastify, options) {
  const { prisma } = fastify;

  // Get settings
  fastify.get('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    let settings = await prisma.settings.findUnique({
      where: { id: 'main' }
    });

    if (!settings) {
      // Create default settings
      settings = await prisma.settings.create({
        data: {
          id: 'main',
          defaultPassword: 'ChangeMe123!',
          threads: 1
        }
      });
    }

    // Get counts for dashboard
    const [accountsAvailable, workspacesCount, recoveryEmailsCount] = await Promise.all([
      prisma.account.count({ where: { status: 'AVAILABLE' } }),
      prisma.workspace.count(),
      prisma.recoveryEmail.count()
    ]);

    return {
      ...settings,
      // Hide sensitive keys partially
      goLoginApiKey: settings.goLoginApiKey ? '********' + settings.goLoginApiKey.slice(-4) : null,
      proxyPassword: settings.proxyPassword ? '********' + settings.proxyPassword.slice(-4) : null,
      // Legacy keys (for backwards compatibility)
      proxyApiKey: settings.proxyApiKey ? '********' + settings.proxyApiKey.slice(-4) : null,
      fingerprintApiKey: settings.fingerprintApiKey ? '********' + settings.fingerprintApiKey.slice(-4) : null,
      // Keep URLs and non-sensitive fields visible
      proxyHost: settings.proxyHost,
      proxyPort: settings.proxyPort,
      proxyUsername: settings.proxyUsername,
      proxyProtocol: settings.proxyProtocol,
      proxyApiUrl: settings.proxyApiUrl,
      fingerprintApiUrl: settings.fingerprintApiUrl,
      // Dashboard stats
      stats: {
        accountsAvailable,
        workspacesCount,
        recoveryEmailsCount,
        threads: settings.threads
      }
    };
  });

  // Update settings
  fastify.put('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const {
      // GoLogin
      goLoginApiKey,
      // Webshare Proxy
      proxyHost,
      proxyPort,
      proxyUsername,
      proxyPassword,
      proxyProtocol,
      // Legacy fields
      proxyApiKey,
      proxyApiUrl,
      fingerprintApiKey,
      fingerprintApiUrl,
      // General
      defaultPassword,
      threads
    } = request.body;

    const updateData = {};

    // GoLogin API key
    if (goLoginApiKey !== undefined) {
      updateData.goLoginApiKey = goLoginApiKey || null;
    }

    // Webshare Proxy settings
    if (proxyHost !== undefined) {
      updateData.proxyHost = proxyHost || null;
    }
    if (proxyPort !== undefined) {
      updateData.proxyPort = proxyPort ? parseInt(proxyPort) : null;
    }
    if (proxyUsername !== undefined) {
      updateData.proxyUsername = proxyUsername || null;
    }
    if (proxyPassword !== undefined) {
      updateData.proxyPassword = proxyPassword || null;
    }
    if (proxyProtocol !== undefined) {
      updateData.proxyProtocol = proxyProtocol || 'socks5';
    }

    // Legacy fields (for backwards compatibility)
    if (proxyApiKey !== undefined) {
      updateData.proxyApiKey = proxyApiKey || null;
    }
    if (proxyApiUrl !== undefined) {
      updateData.proxyApiUrl = proxyApiUrl || null;
    }
    if (fingerprintApiKey !== undefined) {
      updateData.fingerprintApiKey = fingerprintApiKey || null;
    }
    if (fingerprintApiUrl !== undefined) {
      updateData.fingerprintApiUrl = fingerprintApiUrl || null;
    }

    // General settings
    if (defaultPassword !== undefined && defaultPassword) {
      updateData.defaultPassword = defaultPassword;
    }
    if (threads !== undefined) {
      updateData.threads = Math.max(1, Math.min(10, parseInt(threads) || 1));
    }

    const settings = await prisma.settings.upsert({
      where: { id: 'main' },
      update: updateData,
      create: {
        id: 'main',
        ...updateData,
        defaultPassword: defaultPassword || 'ChangeMe123!',
        threads: threads || 1
      }
    });

    return {
      success: true,
      settings: {
        ...settings,
        goLoginApiKey: settings.goLoginApiKey ? '********' + settings.goLoginApiKey.slice(-4) : null,
        proxyPassword: settings.proxyPassword ? '********' + settings.proxyPassword.slice(-4) : null,
        proxyApiKey: settings.proxyApiKey ? '********' + settings.proxyApiKey.slice(-4) : null,
        fingerprintApiKey: settings.fingerprintApiKey ? '********' + settings.fingerprintApiKey.slice(-4) : null
      }
    };
  });

  // Get full API keys (for internal use)
  fastify.get('/keys', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const settings = await prisma.settings.findUnique({
      where: { id: 'main' }
    });

    if (!settings) {
      return reply.status(404).send({ error: 'Settings not found' });
    }

    return {
      goLoginApiKey: settings.goLoginApiKey,
      proxyHost: settings.proxyHost,
      proxyPort: settings.proxyPort,
      proxyUsername: settings.proxyUsername,
      proxyPassword: settings.proxyPassword,
      proxyProtocol: settings.proxyProtocol,
      // Legacy
      proxyApiKey: settings.proxyApiKey,
      fingerprintApiKey: settings.fingerprintApiKey
    };
  });

  // Test GoLogin connection
  fastify.post('/test-gologin', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const settings = await prisma.settings.findUnique({
      where: { id: 'main' }
    });

    if (!settings?.goLoginApiKey) {
      return { success: false, message: 'GoLogin API key not configured' };
    }

    try {
      const { getGoLoginService } = await import('../services/goLoginService.js');
      const goLoginService = getGoLoginService(settings);
      const result = await goLoginService.testConnection();
      return result;
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // Test Webshare proxy
  fastify.post('/test-proxy', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const settings = await prisma.settings.findUnique({
      where: { id: 'main' }
    });

    if (!settings?.proxyHost || !settings?.proxyUsername || !settings?.proxyPassword) {
      return { success: false, message: 'Webshare proxy not configured' };
    }

    try {
      const { getProxyService } = await import('../services/proxyService.js');
      const proxyService = getProxyService(settings);
      const proxyUrl = proxyService.getRotatingProxyUrl();

      // Test proxy by making a request
      const testResult = await proxyService.testProxy(proxyUrl);

      return {
        success: testResult,
        message: testResult ? 'Proxy working' : 'Proxy test failed',
        proxyUrl: `${settings.proxyProtocol}://${settings.proxyUsername}:****@${settings.proxyHost}:${settings.proxyPort}`
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
}
