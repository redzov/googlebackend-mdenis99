import { getAccountCreationFullService } from '../services/accountCreationFull.js';
import { getQueueStatus, isRedisAvailable } from '../services/queueService.js';

export default async function manualRoutes(fastify, options) {
  const { prisma } = fastify;

  // Start manual account creation (Full 7-step process)
  fastify.post('/create', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { workspaceId, count = 10 } = request.body;

    if (!workspaceId) {
      return reply.status(400).send({ error: 'Workspace ID required' });
    }

    const actualCount = Math.min(Math.max(1, parseInt(count)), 500);

    // Verify workspace
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { recoveryEmail: true }
    });

    if (!workspace) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    if (!workspace.serviceAccountJson || !workspace.adminEmail) {
      return reply.status(400).send({
        error: 'Workspace missing Google API credentials',
        details: 'Configure serviceAccountJson and adminEmail'
      });
    }

    const service = getAccountCreationFullService(prisma);

    if (service.isRunning) {
      return reply.status(409).send({
        error: 'Account creation already in progress',
        progress: service.getProgress()
      });
    }

    // Initialize and start
    await service.initialize();

    service.createAccounts(workspaceId, actualCount, 'Manual')
      .catch(err => {
        console.error('Manual creation error:', err);
      });

    return {
      success: true,
      message: `Started creating ${actualCount} accounts`,
      progress: service.getProgress()
    };
  });

  // Get creation progress
  fastify.get('/progress', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const service = getAccountCreationFullService(prisma);
    const progress = service.getProgress();

    // Add queue status if available
    let queueStatus = null;
    try {
      if (await isRedisAvailable()) {
        queueStatus = await getQueueStatus();
      }
    } catch (error) {
      // Redis not available
    }

    return {
      ...progress,
      queueStatus
    };
  });

  // Stop creation
  fastify.post('/stop', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const service = getAccountCreationFullService(prisma);

    if (!service.isRunning) {
      return reply.status(400).send({ error: 'No creation in progress' });
    }

    service.stop();

    return {
      success: true,
      message: 'Stopping after current account...',
      progress: service.getProgress()
    };
  });

  // Get recently created accounts
  fastify.get('/recent', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { limit = 100 } = request.query;

    const accounts = await prisma.account.findMany({
      where: { issuedTo: 'Manual' },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    return {
      data: accounts,
      total: accounts.length
    };
  });

  // Download recently created accounts
  fastify.get('/download', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { limit = 1000, workspaceId } = request.query;

    const where = { issuedTo: 'Manual' };
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }

    const accounts = await prisma.account.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    const content = accounts
      .map(a => `${a.email}:${a.password}:${a.recovery || ''}`)
      .join('\n');

    reply.header('Content-Type', 'text/plain');
    reply.header('Content-Disposition', 'attachment; filename="manual-accounts.txt"');

    return content;
  });

  // Simple endpoint - creates real accounts via Admin SDK only (no browser, no OTP)
  fastify.post('/simple', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { workspaceId, count = 1 } = request.body;

    if (!workspaceId) {
      return reply.status(400).send({ error: 'Workspace ID required' });
    }

    const actualCount = Math.min(Math.max(1, parseInt(count)), 50);

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { recoveryEmail: true }
    });

    if (!workspace) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    if (!workspace.serviceAccountJson || !workspace.adminEmail) {
      return reply.status(400).send({
        error: 'Workspace missing Google API credentials',
        details: 'Configure serviceAccountJson and adminEmail'
      });
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'main' }
    });

    const defaultPassword = settings?.defaultPassword || 'ChangeMe123!';
    const recoveryEmail = workspace.recoveryEmail?.email || null;

    // Import and create Google Workspace service
    const { createWorkspaceService } = await import('../services/googleWorkspace.js');
    const gwService = await createWorkspaceService(workspace);

    const accounts = [];
    const errors = [];

    for (let i = 0; i < actualCount; i++) {
      try {
        // Create user via Google Admin SDK
        // Note: Recovery email NOT added via API - should be added via browser
        const result = await gwService.createUser(
          workspace.domain,
          defaultPassword,
          null // Recovery email will be added via browser, not API
        );

        // Save to database
        const account = await prisma.account.create({
          data: {
            email: result.email,
            password: defaultPassword,
            recovery: recoveryEmail,
            workspaceId: workspace.id,
            status: 'AVAILABLE',
            issuedTo: 'Manual',
            issuedAt: new Date()
          }
        });

        accounts.push(account);

        // Small delay between creations
        if (i < actualCount - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (error) {
        errors.push({ index: i + 1, error: error.message });
      }
    }

    return {
      success: accounts.length > 0,
      message: `Created ${accounts.length} account(s) via Admin SDK`,
      created: accounts.length,
      failed: errors.length,
      accounts,
      errors
    };
  });

  // Demo endpoint - creates fake accounts without Google API
  fastify.post('/demo', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { workspaceId, count = 10 } = request.body;

    if (!workspaceId) {
      return reply.status(400).send({ error: 'Workspace ID required' });
    }

    const actualCount = Math.min(Math.max(1, parseInt(count)), 100);

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { recoveryEmail: true }
    });

    if (!workspace) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'main' }
    });

    const defaultPassword = settings?.defaultPassword || 'ChangeMe123!';
    const recoveryEmail = workspace.recoveryEmail?.email || null;

    const accounts = [];
    for (let i = 0; i < actualCount; i++) {
      const random = Math.floor(Math.random() * 10000000000);
      const email = `user${random}@${workspace.domain}`;

      const account = await prisma.account.create({
        data: {
          email,
          password: defaultPassword,
          recovery: recoveryEmail,
          workspaceId: workspace.id,
          status: 'AVAILABLE',
          issuedTo: 'Manual',
          issuedAt: new Date()
        }
      });

      accounts.push(account);
    }

    return {
      success: true,
      message: `Created ${accounts.length} demo accounts`,
      accounts
    };
  });

  // Test browser login - tries to login to Google account via GoLogin + proxy
  fastify.post('/test-login', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { email, password, workspaceId } = request.body;

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password required' });
    }

    const settings = await prisma.settings.findUnique({
      where: { id: 'main' }
    });

    if (!settings?.goLoginApiKey) {
      return reply.status(400).send({ error: 'GoLogin not configured' });
    }

    // Get proxy from workspace if provided
    let proxy = null;
    if (workspaceId) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId }
      });
      if (workspace?.staticProxyHost) {
        proxy = {
          mode: workspace.staticProxyProtocol || 'http',
          host: workspace.staticProxyHost,
          port: workspace.staticProxyPort,
          username: workspace.staticProxyUsername,
          password: workspace.staticProxyPassword
        };
      }
    }

    const { BrowserAutomation } = await import('../services/browserAutomation.js');
    const browser = new BrowserAutomation(settings);

    try {
      console.log(`Test login: ${email} via GoLogin${proxy ? ' + proxy' : ''}...`);

      // Start browser with proxy
      await browser.start(proxy);

      // Optional warm-up (shorter for test)
      // await browser.warmUp(30);

      // Try to login
      const result = await browser.loginGoogle(email, password);

      // Get final URL and screenshot
      const finalUrl = browser.getCurrentUrl();
      await browser.screenshot('test_login_final');

      return {
        success: result === true,
        message: result === true ? 'Login successful!' : 'Login returned challenge',
        result,
        finalUrl,
        proxyUsed: proxy ? `${proxy.host}:${proxy.port}` : 'none',
        mode: browser.mode
      };

    } catch (error) {
      console.error('Test login failed:', error);
      await browser.screenshot('test_login_error');

      return reply.status(500).send({
        success: false,
        error: error.message,
        proxyUsed: proxy ? `${proxy.host}:${proxy.port}` : 'none'
      });
    } finally {
      await browser.cleanup();
    }
  });

  // Get service status (check external APIs)
  fastify.get('/status', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const settings = await prisma.settings.findUnique({
      where: { id: 'main' }
    });

    // Check GoLogin API connection
    let goLoginApiStatus = false;
    if (settings?.goLoginApiKey) {
      try {
        const { getGoLoginService } = await import('../services/goLoginService.js');
        const goLoginService = getGoLoginService(settings);
        const result = await goLoginService.testConnection();
        goLoginApiStatus = result.success;
      } catch (error) {
        console.warn('GoLogin API check failed:', error.message);
        goLoginApiStatus = false;
      }
    }

    const status = {
      googleApi: true, // Checked per-workspace when creating accounts
      proxyApi: !!(settings?.proxyHost && settings?.proxyUsername && settings?.proxyPassword),
      goLoginApi: goLoginApiStatus,
      redis: await isRedisAvailable().catch(() => false),
      threads: settings?.threads || 1
    };

    return {
      status,
      mode: status.goLoginApi ? 'full' : 'simple',
      description: status.goLoginApi
        ? 'Full 7-step process with GoLogin browser automation'
        : 'Simple Google Admin SDK only (no browser verification)'
    };
  });
}
