import { testImapConnection } from '../services/imapService.js';

export default async function recoveryEmailsRoutes(fastify, options) {
  const { prisma } = fastify;

  // Get all recovery emails
  fastify.get('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { page = 1, limit = 20 } = request.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [emails, total] = await Promise.all([
      prisma.recoveryEmail.findMany({
        include: {
          _count: {
            select: { workspaces: true }
          }
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.recoveryEmail.count()
    ]);

    return {
      data: emails.map(e => ({
        ...e,
        workspacesCount: e._count.workspaces,
        // Hide password in list
        imapPass: '********'
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  });

  // Get single recovery email
  fastify.get('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const email = await prisma.recoveryEmail.findUnique({
      where: { id },
      include: {
        workspaces: {
          select: { id: true, domain: true }
        }
      }
    });

    if (!email) {
      return reply.status(404).send({ error: 'Recovery email not found' });
    }

    return email;
  });

  // Create new recovery email
  fastify.post('/', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { 
      email, 
      imapHost = 'imap.gmail.com', 
      imapPort = 993, 
      imapUser, 
      imapPass 
    } = request.body;

    if (!email || !imapUser || !imapPass) {
      return reply.status(400).send({ 
        error: 'Email, IMAP user and IMAP password required' 
      });
    }

    // Check if email already exists
    const existingEmail = await prisma.recoveryEmail.findUnique({
      where: { email }
    });

    if (existingEmail) {
      return reply.status(400).send({ error: 'Email already exists' });
    }

    const recoveryEmail = await prisma.recoveryEmail.create({
      data: {
        email,
        imapHost,
        imapPort: parseInt(imapPort),
        imapUser,
        imapPass
      }
    });

    return recoveryEmail;
  });

  // Update recovery email
  fastify.put('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;
    const { email, imapHost, imapPort, imapUser, imapPass } = request.body;

    const existingEmail = await prisma.recoveryEmail.findUnique({
      where: { id }
    });

    if (!existingEmail) {
      return reply.status(404).send({ error: 'Recovery email not found' });
    }

    // Check email uniqueness if changing
    if (email && email !== existingEmail.email) {
      const emailExists = await prisma.recoveryEmail.findUnique({
        where: { email }
      });
      if (emailExists) {
        return reply.status(400).send({ error: 'Email already exists' });
      }
    }

    const updateData = {};
    if (email !== undefined) updateData.email = email;
    if (imapHost !== undefined) updateData.imapHost = imapHost;
    if (imapPort !== undefined) updateData.imapPort = parseInt(imapPort);
    if (imapUser !== undefined) updateData.imapUser = imapUser;
    if (imapPass !== undefined) updateData.imapPass = imapPass;

    const updatedEmail = await prisma.recoveryEmail.update({
      where: { id },
      data: updateData
    });

    return updatedEmail;
  });

  // Delete recovery email
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const existingEmail = await prisma.recoveryEmail.findUnique({
      where: { id },
      include: {
        _count: {
          select: { workspaces: true }
        }
      }
    });

    if (!existingEmail) {
      return reply.status(404).send({ error: 'Recovery email not found' });
    }

    // Check if used by workspaces
    if (existingEmail._count.workspaces > 0) {
      return reply.status(400).send({ 
        error: 'Cannot delete recovery email used by workspaces',
        workspaces: existingEmail._count.workspaces
      });
    }

    await prisma.recoveryEmail.delete({
      where: { id }
    });

    return { success: true, message: 'Recovery email deleted' };
  });

  // Test IMAP connection
  fastify.post('/:id/test', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { id } = request.params;

    const email = await prisma.recoveryEmail.findUnique({
      where: { id }
    });

    if (!email) {
      return reply.status(404).send({ error: 'Recovery email not found' });
    }

    try {
      const result = await testImapConnection(email);
      if (result.success) {
        return { success: true, message: 'IMAP connection successful' };
      } else {
        return reply.status(400).send({
          success: false,
          error: result.error || 'Connection failed'
        });
      }
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Get simple list for selectors
  fastify.get('/list/simple', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const emails = await prisma.recoveryEmail.findMany({
      select: {
        id: true,
        email: true
      },
      orderBy: { email: 'asc' }
    });

    return emails;
  });
}
