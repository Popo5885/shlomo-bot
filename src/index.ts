/**
 * HTTP Server — Entry Point
 *
 * Serves the API for the client dashboard and admin panel.
 * Also runs the BullMQ dispatch worker in-process so a second terminal
 * is not required for development.
 */

import { createServer } from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import Knex from 'knex';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { whatsappAuthRouter } from './routes/whatsappAuth.routes.js';
import { superAdminRouter } from './routes/superAdmin.routes.js';
import { emailAdminRouter } from './routes/emailAdmin.routes.js';
import { emailPublicRouter } from './routes/emailPublic.routes.js';
import { clientLoginRouter } from './routes/clientLogin.routes.js';
import { clientRouter } from './routes/client.routes.js';
import { sessionManager } from './services/whatsapp/sessionManager.js';
import { restoreAllTelegramBots } from './services/telegram/telegramBot.js';
import { attachWebSocket } from './websocket.js';
import { createDispatchWorker } from './workers/messageDispatchWorker.js';
import type { Worker } from 'bullmq';

const app = express();
const httpServer = createServer(app);
let inProcessWorker: Worker | null = null;

// ── Global Middleware ──
app.use(helmet());
const allowedOrigins: string[] = [
  'http://localhost:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
];
if (env.FRONTEND_URL) {
  env.FRONTEND_URL.split(',').forEach(u => allowedOrigins.push(u.trim()));
}
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// ── Health Check ──
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'api-server',
    uptime: process.uptime(),
    activeSessions: sessionManager.activeCount,
    inProcessWorker: inProcessWorker !== null,
  });
});

// ── Routes ──
app.use('/api/wa', whatsappAuthRouter);
app.use('/api/admin', superAdminRouter);
app.use('/api/admin', emailAdminRouter);
app.use('/api/email', emailPublicRouter);
app.use('/api/client', clientLoginRouter); // Public (login — no auth)
app.use('/api/client', clientRouter);     // Protected (requires JWT)

// ── Error Handler (must be last) ──
app.use(errorHandler);

// ── Auto-run pending migrations ──
async function runMigrations(): Promise<void> {
  const knex = Knex({
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: new URL('./db/migrations', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
      extension: 'ts',
    },
  });
  try {
    const [batch, list] = await knex.migrate.latest();
    if (list.length > 0) {
      logger.info(`Migrations applied (batch ${batch}): ${list.join(', ')}`);
    } else {
      logger.info('Database schema is up to date');
    }
  } catch (err) {
    logger.error('Migration failed:', err);
    // Don't exit — server may still work on existing schema
  } finally {
    await knex.destroy();
  }
}

// ── Startup ──
async function start(): Promise<void> {
  // 0. Run any pending migrations first
  await runMigrations();

  // 1. Restore WhatsApp sessions
  await sessionManager.restoreAllSessions();

  // 2. Restore Telegram bots
  await restoreAllTelegramBots();

  // 3. Attach WebSocket server
  attachWebSocket(httpServer);

  // 4. Start BullMQ dispatch worker in-process (concurrency=2)
  //    This means the HTTP server also processes the send queue —
  //    no separate `npm run dev:worker` required.
  try {
    inProcessWorker = createDispatchWorker(2);
    logger.info('In-process BullMQ dispatch worker started (concurrency: 2)');
  } catch (err) {
    // Redis not available — worker disabled, manual sends won't work
    logger.warn('BullMQ worker could not start (Redis unavailable?). Queue processing disabled.', err);
  }

  httpServer.listen(env.PORT, () => {
    logger.info(`API Server running on port ${env.PORT} (${env.NODE_ENV})`);
    logger.info(`WebSocket available at ws://localhost:${env.PORT}/ws`);
  });
}

start().catch((err) => {
  logger.error('Failed to start API server:', err);
  process.exit(1);
});

// ── Graceful Shutdown ──
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down API server...`);
  if (inProcessWorker) {
    await inProcessWorker.close();
  }
  await sessionManager.disconnectAll();
  httpServer.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Zero-crash: log unhandled errors but don't die ──
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION (process will continue):', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION (process will continue):', reason);
});
