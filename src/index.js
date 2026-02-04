import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Routes
import authRoutes from './routes/auth.js';
import keysRoutes from './routes/keys.js';
import accountsRoutes from './routes/accounts.js';
import workspacesRoutes from './routes/workspaces.js';
import recoveryEmailsRoutes from './routes/recoveryEmails.js';
import settingsRoutes from './routes/settings.js';
import apiLogsRoutes from './routes/apiLogs.js';
import publicApiRoutes from './routes/publicApi.js';
import statsRoutes from './routes/stats.js';
import manualRoutes from './routes/manual.js';
import creationLogsRoutes from './routes/creationLogs.js';

// Utils
import { initializeAdmin, initializeSettings } from './utils/init.js';
import { initAutoConfirmation, stopAutoConfirmation } from './utils/accountConfirmation.js';

dotenv.config();

const prisma = new PrismaClient();
const fastify = Fastify({ 
  logger: true,
  bodyLimit: 10485760 // 10MB for service account JSON uploads
});

// Register plugins
await fastify.register(cors, {
  origin: true,
  credentials: true
});

await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'default-secret-change-me'
});

// Decorate fastify with prisma
fastify.decorate('prisma', prisma);

// Auth middleware decorator
fastify.decorate('authenticate', async function(request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
});

// Register routes
fastify.register(authRoutes, { prefix: '/api/auth' });
fastify.register(keysRoutes, { prefix: '/api/keys' });
fastify.register(accountsRoutes, { prefix: '/api/accounts' });
fastify.register(workspacesRoutes, { prefix: '/api/workspaces' });
fastify.register(recoveryEmailsRoutes, { prefix: '/api/recovery-emails' });
fastify.register(settingsRoutes, { prefix: '/api/settings' });
fastify.register(apiLogsRoutes, { prefix: '/api/logs' });
fastify.register(statsRoutes, { prefix: '/api/stats' });
fastify.register(manualRoutes, { prefix: '/api/manual' });
fastify.register(creationLogsRoutes, { prefix: '/api/creation-logs' });

// Public API for clients (key-based auth)
fastify.register(publicApiRoutes, { prefix: '/v1' });

// Health check
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// Start server
const start = async () => {
  try {
    // Initialize admin user and settings
    await initializeAdmin(prisma);
    await initializeSettings(prisma);

    // Start auto-confirmation service (15 minute rule)
    initAutoConfirmation(prisma);

    const port = parseInt(process.env.PORT || '3000');
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    console.log(`Server running on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  stopAutoConfirmation();
  await prisma.$disconnect();
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
