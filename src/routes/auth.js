import bcrypt from 'bcrypt';

export default async function authRoutes(fastify, options) {
  const { prisma } = fastify;

  // Login
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body;

    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password required' });
    }

    const admin = await prisma.admin.findUnique({
      where: { username }
    });

    if (!admin) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, admin.password);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign({ 
      id: admin.id, 
      username: admin.username 
    }, { expiresIn: '24h' });

    return { token, username: admin.username };
  });

  // Verify token
  fastify.get('/verify', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    return { valid: true, user: request.user };
  });

  // Change password
  fastify.post('/change-password', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { currentPassword, newPassword } = request.body;

    if (!currentPassword || !newPassword) {
      return reply.status(400).send({ error: 'Current and new password required' });
    }

    const admin = await prisma.admin.findUnique({
      where: { id: request.user.id }
    });

    const validPassword = await bcrypt.compare(currentPassword, admin.password);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.admin.update({
      where: { id: admin.id },
      data: { password: hashedPassword }
    });

    return { success: true, message: 'Password changed successfully' };
  });
}
