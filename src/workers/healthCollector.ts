/**
 * Health Collector
 *
 * Periodically writes system metrics to server_health_logs.
 * Runs inside the Worker process.
 */

import os from 'node:os';
import { db } from '../config/database.js';
import { sessionManager } from '../services/whatsapp/sessionManager.js';
import { logger } from '../utils/logger.js';

const COLLECT_INTERVAL_MS = 60_000; // 60 seconds
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let workerId: string;

export function startHealthCollector(id: string): void {
  workerId = id;
  intervalHandle = setInterval(collectMetrics, COLLECT_INTERVAL_MS);
  logger.info(`Health collector started (worker: ${workerId}, interval: ${COLLECT_INTERVAL_MS / 1000}s)`);
}

export function stopHealthCollector(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Health collector stopped');
  }
}

async function collectMetrics(): Promise<void> {
  try {
    const mem = process.memoryUsage();
    const cpus = os.cpus();
    const cpuAvg = cpus.reduce((sum, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return sum + ((total - cpu.times.idle) / total) * 100;
    }, 0) / cpus.length;

    // Queue depth
    const queueDepth = await db('message_queue')
      .where('status', 'pending')
      .count('* as total')
      .first();

    const processingCount = await db('message_queue')
      .where('status', 'processing')
      .count('* as total')
      .first();

    const metrics = [
      {
        metric_name: 'queue_depth',
        metric_value: Number(queueDepth?.total ?? 0),
        unit: 'messages',
        worker_id: workerId,
      },
      {
        metric_name: 'processing_count',
        metric_value: Number(processingCount?.total ?? 0),
        unit: 'messages',
        worker_id: workerId,
      },
      {
        metric_name: 'memory_mb',
        metric_value: Math.round(mem.heapUsed / 1024 / 1024),
        unit: 'MB',
        worker_id: workerId,
      },
      {
        metric_name: 'cpu_pct',
        metric_value: Math.round(cpuAvg * 100) / 100,
        unit: 'percent',
        worker_id: workerId,
      },
      {
        metric_name: 'active_sessions',
        metric_value: sessionManager.activeCount,
        unit: 'sessions',
        worker_id: workerId,
      },
    ];

    await db('server_health_logs').insert(metrics);

    logger.debug(`Health metrics collected: queue=${metrics[0].metric_value}, mem=${metrics[2].metric_value}MB, sessions=${metrics[4].metric_value}`);
  } catch (err) {
    logger.error('Health collection failed:', err);
  }
}
