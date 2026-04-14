/**
 * BullMQ Queue Service
 *
 * Defines the message-dispatch queue and provides helpers for enqueueing jobs.
 * Used by the HTTP server to enqueue messages; consumed by the Worker.
 */

import { Queue, type JobsOptions } from 'bullmq';
import { createRedisConnection } from '../../config/redis.js';
import { db } from '../../config/database.js';
import { calculateBatchDelays } from './delayCalculator.js';
import type { DelayConfig } from './delayCalculator.js';
export type { DelayConfig } from './delayCalculator.js';
import { logger } from '../../utils/logger.js';

export const QUEUE_NAME = 'message-dispatch';

// Lazy-initialized queue (created on first use)
let _queue: Queue | null = null;

export function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: createRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },  // keep last 1000 completed
        removeOnFail: { count: 5000 },       // keep last 5000 failed
        attempts: 1,                          // retries handled by our own logic
      },
    });
  }
  return _queue;
}

/**
 * Enqueue a single message for dispatch.
 */
export async function enqueueMessage(
  queueItemId: number,
  delayMs: number = 0
): Promise<void> {
  const opts: JobsOptions = {};
  if (delayMs > 0) {
    opts.delay = delayMs;
  }

  await getQueue().add(
    'send-message',
    { queueItemId },
    {
      ...opts,
      jobId: `msg-${queueItemId}`,  // prevent duplicates
    }
  );
}

/**
 * Enqueue a batch of messages with staggered anti-ban delays.
 *
 * 1. Inserts rows into message_queue (DB source of truth)
 * 2. Enqueues BullMQ jobs with calculated delays
 *
 * @param items - Array of message_queue row data to insert
 * @param delayConfig - Delay configuration from the distribution_rule or campaign
 * @returns Array of inserted queue item IDs
 */
export async function enqueueBatch(
  items: Array<{
    workspace_id: string;
    source_type: 'trigger' | 'campaign' | 'manual';
    source_rule_id?: string;
    campaign_id?: string;
    destination_id: string;
    connected_account_id: string;
    message_text?: string;
    media_url?: string;
    media_type?: string;
    original_platform_msg_id?: string;
    append_suffix?: string;
    priority?: number;
  }>,
  delayConfig: DelayConfig
): Promise<number[]> {
  if (items.length === 0) return [];

  // Calculate staggered delays
  const delays = calculateBatchDelays(delayConfig, items.length);

  // Insert all rows into message_queue in a single transaction
  const insertedIds = await db.transaction(async (trx) => {
    const rows = items.map((item, i) => ({
      ...item,
      status: 'pending' as const,
      scheduled_send_at: new Date(Date.now() + delays[i]),
      priority: item.priority ?? 5,
    }));

    const inserted = await trx('message_queue')
      .insert(rows)
      .returning('id');

    return inserted.map((r: { id: number }) => r.id);
  });

  // Enqueue BullMQ jobs with matching delays
  const queue = getQueue();
  const bulkJobs = insertedIds.map((id, i) => ({
    name: 'send-message',
    data: { queueItemId: id },
    opts: {
      delay: delays[i],
      jobId: `msg-${id}`,
    },
  }));

  await queue.addBulk(bulkJobs);

  logger.info(`Enqueued batch of ${items.length} messages`, {
    firstDelay: `${Math.round(delays[0] / 1000)}s`,
    lastDelay: `${Math.round(delays[delays.length - 1] / 1000)}s`,
  });

  return insertedIds;
}

/**
 * Close the queue connection gracefully.
 */
export async function closeQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
