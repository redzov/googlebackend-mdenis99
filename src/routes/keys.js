import { generateKeyId, generateApiKey } from '../utils/generators.js';

export default async function keysRoutes(fastify, options) {
  const { prisma } = fastify;

  // Get all keys with pagination and search
  fastify.get('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { 
      page = 1, 
      limit = 20, 
      search = '',
      workspaceId 
    } = request.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const where = {};
    
    if (search) {
      where.OR = [
        { keyId: { contains: search, mode: 'insensitive' } },
        { key: { contains: search, mode: 'insensitive' } },
        { note: { contains: search, mode: 'insensitive' } },
        { workspace: { domain: { contains: search, mode: 'insensitive' } } }
      ];
    }
    
    if (workspaceId) {
      where.workspaceId = workspaceId;
    }

    const [keys, total] = await Promise.all([
      prisma.key.findMany({
        where,
        include: {
          workspace: {
            select: { id: true, domain: true }
          },
          _count: {
            select: { accounts: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.key.count({ where })
    ]);

    return {
      data: keys.map(k => ({
        ...k,
        quotaUsed: k._count.accounts
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  });

  // Get single key
  fastify.get('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const key = await prisma.key.findUnique({
      where: { id },
      include: {
        workspace: true,
        _count: {
          select: { accounts: true }
        }
      }
    });

    if (!key) {
      return reply.status(404).send({ error: 'Key not found' });
    }

    return { ...key, quotaUsed: key._count.accounts };
  });

  // Create new key
  fastify.post('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { workspaceId, quotaLimit = 100, note, customKey } = request.body;

    if (!workspaceId) {
      return reply.status(400).send({ error: 'Workspace ID required' });
    }

    // Verify workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }
    });

    if (!workspace) {
      return reply.status(404).send({ error: 'Workspace not found' });
    }

    const keyId = generateKeyId();
    const key = customKey || generateApiKey();

    // Check if key already exists
    const existingKey = await prisma.key.findUnique({
      where: { key }
    });

    if (existingKey) {
      return reply.status(400).send({ error: 'Key already exists, try again' });
    }

    const newKey = await prisma.key.create({
      data: {
        keyId,
        key,
        workspaceId,
        quotaLimit: parseInt(quotaLimit),
        note
      },
      include: {
        workspace: {
          select: { id: true, domain: true }
        }
      }
    });

    return newKey;
  });

  // Update key
  fastify.put('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;
    const { workspaceId, quotaLimit, note } = request.body;

    const existingKey = await prisma.key.findUnique({
      where: { id }
    });

    if (!existingKey) {
      return reply.status(404).send({ error: 'Key not found' });
    }

    const updateData = {};
    if (workspaceId !== undefined) updateData.workspaceId = workspaceId;
    if (quotaLimit !== undefined) updateData.quotaLimit = parseInt(quotaLimit);
    if (note !== undefined) updateData.note = note;

    const updatedKey = await prisma.key.update({
      where: { id },
      data: updateData,
      include: {
        workspace: {
          select: { id: true, domain: true }
        }
      }
    });

    return updatedKey;
  });

  // Delete key
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const existingKey = await prisma.key.findUnique({
      where: { id }
    });

    if (!existingKey) {
      return reply.status(404).send({ error: 'Key not found' });
    }

    // Delete related api logs first
    await prisma.apiLog.deleteMany({
      where: { keyId: id }
    });

    // Update accounts to remove key reference
    await prisma.account.updateMany({
      where: { keyId: id },
      data: { keyId: null }
    });

    await prisma.key.delete({
      where: { id }
    });

    return { success: true, message: 'Key deleted' };
  });

  // Download accounts for key (as txt)
  fastify.get('/:id/download', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const key = await prisma.key.findUnique({
      where: { id },
      include: {
        accounts: {
          where: { keyId: id }
        }
      }
    });

    if (!key) {
      return reply.status(404).send({ error: 'Key not found' });
    }

    // Format: email:password:recovery
    const content = key.accounts
      .map(a => `${a.email}:${a.password}:${a.recovery || ''}`)
      .join('\n');

    reply.header('Content-Type', 'text/plain');
    reply.header('Content-Disposition', `attachment; filename="${key.keyId}-accounts.txt"`);
    
    return content;
  });
}
