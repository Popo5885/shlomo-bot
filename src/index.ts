/**
 * HTTP Server — Entry Point
 *
 * Serves the API for the client dashboard and admin panel.
 * Runs as an independent process from the Worker.
 */

import { createServer } from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { whatsappAuthRouter } from './routes/whatsappAuth.routes.js';
import { superAdminRouter } from './routes/superAdmin.routes.js';
import { clientLoginRouter } from './routes/clientLogin.routes.js';
import { clientRouter } from './routes/client.routes.js';
import { sessionManager } from './services/whatsapp/sessionManager.js';
import { restoreAllTelegramBots } from './services/telegram/telegramBot.js';
import { attachWebSocket } from './websocket.js';

const app = express();
const httpServer = createServer(app);

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
  });
});

// ── Routes ──
app.use('/api/wa', whatsappAuthRouter);
app.use('/api/admin', superAdminRouter);
app.use('/api/client', clientLoginRouter); // Public (login — no auth)
app.use('/api/client', clientRouter);     // Protected (requires JWT)

// ── Error Handler (must be last) ──
app.use(errorHandler);

// ── Startup ──
async function start(): Promise<void> {
  // Restore WhatsApp sessions that were connected before restart
  await sessionManager.restoreAllSessions();

  // Restore Telegram bots that were connected before restart
  await restoreAllTelegramBots();

  // Attach WebSocket server for real-time QR + status updates
  attachWebSocket(httpServer);

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
  await sessionManager.disconnectAll();
  httpServer.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
