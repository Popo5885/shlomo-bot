/**
 * Queue Worker — Entry Point
 *
 * Runs as an INDEPENDENT process from the HTTP server.
 * Consumes message_queue jobs via BullMQ and sends WhatsApp messages.
 *
 * On Railway: deploy as a separate service with `npm run start:worker`.
 */

import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { sessionManager } from './services/whatsapp/sessionManager.js';
import { createDispatchWorker } from './workers/messageDispatchWorker.js';
import { startHealthCollector, stopHealthCollector } from './workers/healthCollector.js';
import { closeQueue } from './services/queue/queueService.js';
import type { Worker } from 'bullmq';

let dispatchWorker: Worker | null = null;

// Generate a unique worker ID for this process
const WORKER_ID = `worker-${process.pid}-${Date.now().toString(36)}`;

async function start(): Promise<void> {
  logger.info(`Queue Worker starting (${env.NODE_ENV}, id: ${WORKER_ID})...`);

  // 1. Restore WhatsApp sessions — the worker needs its own socket pool
  await sessionManager.restoreAllSessions();

  // 2. Start the BullMQ dispatch worker (concurrency = 3)
  dispatchWorker = createDispatchWorker(3);
  logger.info('BullMQ dispatch worker created (concurrency: 3)');

  // 3. Start health metrics collector (every 60s)
  startHealthCollector(WORKER_ID);

  logger.info('Queue Worker is ready and processing jobs.');
}

start().catch((err) => {
  logger.error('Failed to start Queue Worker:', err);
  process.exit(1);
});

// ── Graceful Shutdown ──
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down Worker ${WORKER_ID}...`);

  // 1. Stop accepting new jobs
  if (dispatchWorker) {
    logger.info('Closing BullMQ worker (draining in-flight jobs)...');
    await dispatchWorker.close();
  }

  // 2. Stop health collector
  stopHealthCollector();

  // 3. Close queue connection
  await closeQueue();

  // 4. Disconnect WhatsApp sessions
  await sessionManager.disconnectAll();

  logger.info('Worker shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
