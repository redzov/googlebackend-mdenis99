export default async function workspacesRoutes(fastify, options) {
  const { prisma } = fastify;

  // Get all workspaces
  fastify.get('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { page = 1, limit = 20, search = '' } = request.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const where = search ? {
      OR: [
        { domain: { contains: search, mode: 'insensitive' } },
        { note: { contains: search, mode: 'insensitive' } }
      ]
    } : {};

    // Get date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [workspaces, total] = await Promise.all([
      prisma.workspace.findMany({
        where,
        include: {
          recoveryEmail: {
            select: { id: true, email: true }
          },
          _count: {
            select: { accounts: true, keys: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.workspace.count({ where })
    ]);

    // Get 30-day stats for each workspace
    const workspacesWithStats = await Promise.all(
      workspaces.map(async (ws) => {
        const created30Days = await prisma.account.count({
          where: {
            workspaceId: ws.id,
            createdAt: { gte: thirtyDaysAgo }
          }
        });

        return {
          ...ws,
          createdTotal: ws._count.accounts,
          created30Days,
          keysCount: ws._count.keys
        };
      })
    );

    return {
      data: workspacesWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  });

  // Get single workspace
  fastify.get('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        recoveryEmail: true,
        _count: {
          select: { accounts: true, keys: true }
        }
      }
    });

    if (!workspace) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    // Get 30-day stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const created30Days = await prisma.account.count({
      where: {
        workspaceId: id,
        createdAt: { gte: thirtyDaysAgo }
      }
    });

    return {
      ...workspace,
      createdTotal: workspace._count.accounts,
      created30Days
    };
  });

  // Create new workspace
  fastify.post('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const {
      domain, recoveryEmailId, note, serviceAccountJson, adminEmail,
      // Static Proxy for Admin API
      staticProxyHost, staticProxyPort, staticProxyUsername, staticProxyPassword, staticProxyProtocol
    } = request.body;

    if (!domain) {
      return reply.status(400).send({ error: 'Domain required' });
    }

    // Check if domain already exists
    const existingWorkspace = await prisma.workspace.findUnique({
      where: { domain }
    });

    if (existingWorkspace) {
      return reply.status(400).send({ error: 'Domain already exists' });
    }

    // Verify recovery email exists if provided
    if (recoveryEmailId) {
      const recoveryEmail = await prisma.recoveryEmail.findUnique({
        where: { id: recoveryEmailId }
      });
      if (!recoveryEmail) {
        return reply.status(404).send({ error: 'Recovery email not found' });
      }
    }

    const workspace = await prisma.workspace.create({
      data: {
        domain,
        recoveryEmailId,
        note,
        serviceAccountJson,
        adminEmail,
        // Static Proxy fields
        staticProxyHost,
        staticProxyPort: staticProxyPort ? parseInt(staticProxyPort) : null,
        staticProxyUsername,
        staticProxyPassword,
        staticProxyProtocol
      },
      include: {
        recoveryEmail: {
          select: { id: true, email: true }
        }
      }
    });

    return workspace;
  });

  // Update workspace
  fastify.put('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;
    const {
      domain, recoveryEmailId, note, serviceAccountJson, adminEmail,
      // Static Proxy for Admin API
      staticProxyHost, staticProxyPort, staticProxyUsername, staticProxyPassword, staticProxyProtocol
    } = request.body;

    const existingWorkspace = await prisma.workspace.findUnique({
      where: { id }
    });

    if (!existingWorkspace) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    // Check domain uniqueness if changing
    if (domain && domain !== existingWorkspace.domain) {
      const domainExists = await prisma.workspace.findUnique({
        where: { domain }
      });
      if (domainExists) {
        return reply.status(400).send({ error: 'Domain already exists' });
      }
    }

    const updateData = {};
    if (domain !== undefined) updateData.domain = domain;
    if (recoveryEmailId !== undefined) updateData.recoveryEmailId = recoveryEmailId;
    if (note !== undefined) updateData.note = note;
    if (serviceAccountJson !== undefined) updateData.serviceAccountJson = serviceAccountJson;
    if (adminEmail !== undefined) updateData.adminEmail = adminEmail;
    // Static Proxy fields
    if (staticProxyHost !== undefined) updateData.staticProxyHost = staticProxyHost;
    if (staticProxyPort !== undefined) updateData.staticProxyPort = staticProxyPort ? parseInt(staticProxyPort) : null;
    if (staticProxyUsername !== undefined) updateData.staticProxyUsername = staticProxyUsername;
    if (staticProxyPassword !== undefined) updateData.staticProxyPassword = staticProxyPassword;
    if (staticProxyProtocol !== undefined) updateData.staticProxyProtocol = staticProxyProtocol;

    const updatedWorkspace = await prisma.workspace.update({
      where: { id },
      data: updateData,
      include: {
        recoveryEmail: {
          select: { id: true, email: true }
        }
      }
    });

    return updatedWorkspace;
  });

  // Delete workspace
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const existingWorkspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        _count: {
          select: { accounts: true, keys: true }
        }
      }
    });

    if (!existingWorkspace) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    // Check if workspace has accounts or keys
    if (existingWorkspace._count.accounts > 0 || existingWorkspace._count.keys > 0) {
      return reply.status(400).send({ 
        error: 'Cannot delete workspace with existing accounts or keys',
        accounts: existingWorkspace._count.accounts,
        keys: existingWorkspace._count.keys
      });
    }

    await prisma.workspace.delete({
      where: { id }
    });

    return { success: true, message: 'Workspace deleted' };
  });

  // Get workspace list for selectors (simple format)
  fastify.get('/list/simple', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const workspaces = await prisma.workspace.findMany({
      select: {
        id: true,
        domain: true
      },
      orderBy: { domain: 'asc' }
    });

    return workspaces;
  });

  // Ping workspace - test Google API connection
  fastify.post('/:id/ping', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: { recoveryEmail: true }
    });

    if (!workspace) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    // Check if service account is configured
    if (!workspace.serviceAccountJson || !workspace.adminEmail) {
      return {
        success: false,
        message: 'Google API not configured. Add Service Account JSON and Admin Email.'
      };
    }

    try {
      // Try to create workspace service and list users
      const { createWorkspaceService } = await import('../services/googleWorkspace.js');
      const gwService = await createWorkspaceService(workspace);

      // Try to list users (limit 1) to verify connection
      const result = await gwService.listUsers(workspace.domain, 1);

      return {
        success: true,
        message: `Connected to ${workspace.domain}. Found ${result.users?.length || 0} user(s).`,
        domain: workspace.domain,
        hasRecoveryEmail: !!workspace.recoveryEmail
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to connect to Google API',
        error: error.code || 'UNKNOWN'
      };
    }
  });
}
