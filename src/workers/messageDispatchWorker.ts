/**
 * Message Dispatch Worker (BullMQ Processor)
 *
 * Consumes jobs from the message-dispatch queue:
 * 1. Loads queue item from DB
 * 2. Gets the WhatsApp socket from SessionManager
 * 3. Sends the message via Baileys
 * 4. Updates message_queue status
 * 5. Logs to message_dispatches and api_request_logs
 * 6. Handles retries and error logging
 */

import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { db } from '../config/database.js';
import { sessionManager } from '../services/whatsapp/sessionManager.js';
import { sendQueueMessage, sendPoll } from '../services/whatsapp/messageSender.js';
import { sendTelegramMessage } from '../services/telegram/telegramSender.js';
import { QUEUE_NAME, enqueueMessage } from '../services/queue/queueService.js';
import { shouldRetry, getNextRetryAt, calculateRetryDelay } from '../services/queue/retryStrategy.js';
import { isShabbatBlocked } from '../services/shabbat/shabbatBlocker.js';
import { logger } from '../utils/logger.js';
import type { MessageQueue, ConnectedAccount, Destination } from '../types/database.js';

interface JobPayload {
  queueItemId: number;
}

/**
 * Create and return the BullMQ Worker instance.
 */
export function createDispatchWorker(concurrency: number = 3): Worker {
  const worker = new Worker<JobPayload>(
    QUEUE_NAME,
    processMessage,
    {
      connection: createRedisConnection(),
      concurrency,
      limiter: {
        max: 10,
        duration: 1000, // max 10 jobs per second globally
      },
    }
  );

  worker.on('completed', (job) => {
    logger.debug(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err.message}`);
  });

  worker.on('error', (err) => {
    logger.error('Worker error:', err);
  });

  return worker;
}

/**
 * Main processor function — handles a single message dispatch job.
 */
async function processMessage(job: Job<JobPayload>): Promise<void> {
  const { queueItemId } = job.data;

  // ── 1. Load queue item ──
  const queueItem = await db('message_queue')
    .where({ id: queueItemId })
    .first<MessageQueue>();

  if (!queueItem) {
    logger.warn(`Queue item ${queueItemId} not found, skipping`);
    return;
  }

  // ── 2. Idempotency guard ──
  if (queueItem.status !== 'pending' && queueItem.status !== 'failed') {
    logger.debug(`Queue item ${queueItemId} is ${queueItem.status}, skipping`);
    return;
  }

  // ── 2b. Shabbat blocker check ──
  try {
    const shabbatBlocked = await isShabbatBlocked(queueItem.workspace_id);
    if (shabbatBlocked) {
      await requeueWithDelay(queueItem, 3 * 60 * 60 * 1000, 'Shabbat blocking active');
      return;
    }
  } catch {
    // Fail-open: if shabbat check fails, proceed with sending
  }

  // ── 3. Mark as processing ──
  await db('message_queue')
    .where({ id: queueItemId })
    .update({
      status: 'processing',
      processing_started_at: db.fn.now(),
    });

  try {
    // ── 4. Check connected account ──
    const account = await db('connected_accounts')
      .where({ id: queueItem.connected_account_id })
      .first<ConnectedAccount>();

    if (!account) {
      await failMessage(queueItem, 'Connected account not found', 'ACCOUNT_NOT_FOUND');
      return;
    }

    if (account.connection_status === 'banned') {
      // Queue freeze — don't fail, pause awaiting new number
      await db('message_queue').where({ id: queueItemId }).update({
        status: 'paused_awaiting_number',
        original_status: queueItem.status,
        paused_reason: 'Account banned — awaiting fallback number',
      });

      // Check for fallback rotation
      try {
        const fallback = await db('account_fallback_rotation')
          .where({ primary_account_id: queueItem.connected_account_id, is_active: true })
          .first();

        if (fallback && fallback.fallback_account_ids?.length > 0) {
          const nextAccountId = fallback.fallback_account_ids[fallback.rotation_order % fallback.fallback_account_ids.length];
          await db('message_queue').where({ id: queueItemId }).update({
            connected_account_id: nextAccountId,
            status: 'pending',
            paused_reason: null,
          });
          await enqueueMessage(queueItemId, 5000);
          logger.info(`Rotated banned account to fallback: ${nextAccountId}`);
        } else {
          logger.warn(`No fallback rotation for banned account ${queueItem.connected_account_id} — ${queueItemId} paused`);
        }
      } catch (rotErr) {
        logger.error('Fallback rotation check failed:', rotErr);
      }
      return;
    }

    if (account.connection_status === 'rate_limited' && account.rate_limit_until) {
      if (new Date(account.rate_limit_until) > new Date()) {
        // Re-queue with delay until rate limit expires
        const delayMs = new Date(account.rate_limit_until).getTime() - Date.now();
        await requeueWithDelay(queueItem, delayMs, 'Account rate limited');
        return;
      }
    }

    // ── 5. Resolve destination ──
    const destination = await db('destinations')
      .where({ id: queueItem.destination_id })
      .first<Destination>();

    if (!destination) {
      await failMessage(queueItem, 'Destination not found', 'DEST_NOT_FOUND');
      return;
    }

    // ── 6. Platform routing ──
    let sendResult: { platformMsgId?: string; responseTimeMs?: number };

    if (account.platform === 'TELEGRAM_BOT') {
      // ── Telegram dispatch ──
      const tgResult = await sendTelegramMessage({
        accountId: account.id,
        chatId: destination.platform_dest_id,
        text: queueItem.message_text
          ? (queueItem.append_suffix ? `${queueItem.message_text}\n\n${queueItem.append_suffix}` : queueItem.message_text)
          : undefined,
        mediaUrl: queueItem.media_url ?? undefined,
        mediaType: queueItem.media_type as any,
      });
      if (!tgResult.success) {
        if (shouldRetry(queueItem.retry_count, queueItem.max_retries)) {
          await retryMessage(queueItem, tgResult.error || 'Telegram send failed');
        } else {
          await failMessage(queueItem, tgResult.error || 'Telegram send failed', 'TG_SEND_FAILED');
        }
        return;
      }
      sendResult = { platformMsgId: tgResult.platformMsgId, responseTimeMs: 0 };
    } else {
      // ── WhatsApp dispatch (default) ──
      const socket = sessionManager.getSocket(queueItem.connected_account_id);
      if (!socket) {
        if (shouldRetry(queueItem.retry_count, queueItem.max_retries)) {
          await retryMessage(queueItem, 'WhatsApp session not available');
        } else {
          await failMessage(queueItem, 'WhatsApp session not available after retries', 'WA_NO_SESSION');
        }
        return;
      }
      const jid = destination.platform_dest_id;

      // Check if this is a poll (media_type='poll', media_url has JSON poll data)
      let pollData: { name: string; options: string[]; selectableCount: number } | null = null;
      if (queueItem.media_type === 'poll' && queueItem.media_url) {
        try {
          pollData = JSON.parse(queueItem.media_url);
        } catch {
          logger.warn(`Invalid poll data JSON for queue item ${queueItemId}`);
        }
      }

      sendResult = await sendQueueMessage(socket, {
        jid,
        messageText: queueItem.message_text,
        mediaUrl: queueItem.media_type === 'poll' ? null : queueItem.media_url,
        mediaType: queueItem.media_type === 'poll' ? null : queueItem.media_type,
        appendSuffix: queueItem.append_suffix,
        pollData,
      });
    }

    // ── 8. Mark as sent ──
    await db('message_queue')
      .where({ id: queueItemId })
      .update({
        status: 'sent',
        sent_at: db.fn.now(),
        is_delivered: true,
        platform_msg_id: sendResult.platformMsgId,
      });

    // ── 9. Log to message_dispatches ──
    await db('message_dispatches').insert({
      workspace_id: queueItem.workspace_id,
      queue_item_id: queueItemId,
      destination_id: queueItem.destination_id,
      campaign_id: queueItem.campaign_id,
      rule_id: queueItem.source_rule_id,
      platform: account.platform,
      destination_type: destination.destination_type,
      platform_msg_id: sendResult.platformMsgId,
      status: 'sent',
      sent_at: db.fn.now(),
      is_success: true,
      response_time_ms: sendResult.responseTimeMs,
    });

    // ── 10. Log to api_request_logs ──
    await db('api_request_logs').insert({
      workspace_id: queueItem.workspace_id,
      platform: account.platform,
      connected_account_id: account.id,
      direction: 'OUTBOUND',
      endpoint: `${account.platform === 'TELEGRAM_BOT' ? 'tg' : 'wa'}://sendMessage/${destination.platform_dest_id}`,
      method: 'SEND',
      response_status: 200,
      response_time_ms: sendResult.responseTimeMs,
      is_rate_limited: false,
    });

    logger.info(`Message sent: queue=${queueItemId} dest=${destination.display_name ?? destination.platform_dest_id} time=${sendResult.responseTimeMs}ms`);

  } catch (err) {
    await handleSendError(queueItem, err as Error);
  }
}

// ══════════════════════════════════════════════════════════════
//  Error Handling Helpers
// ══════════════════════════════════════════════════════════════

async function handleSendError(queueItem: MessageQueue, err: Error): Promise<void> {
  const errorMessage = err.message ?? 'Unknown error';

  logger.error(`Send failed for queue item ${queueItem.id}: ${errorMessage}`);

  // Log to system_error_logs
  await db('system_error_logs').insert({
    workspace_id: queueItem.workspace_id,
    severity: 'ERROR',
    source: 'queue_worker',
    error_code: 'WA_SEND_FAILED',
    message: errorMessage,
    stack_trace: err.stack,
    request_payload: {
      queue_item_id: queueItem.id,
      destination_id: queueItem.destination_id,
      connected_account_id: queueItem.connected_account_id,
    },
  }).catch(() => {}); // don't let logging failure break the flow

  // Check for rate limit (429-like errors from Baileys)
  if (errorMessage.includes('rate') || errorMessage.includes('429')) {
    await db('connected_accounts')
      .where({ id: queueItem.connected_account_id })
      .update({
        connection_status: 'rate_limited',
        rate_limit_until: new Date(Date.now() + 30 * 60 * 1000),
        updated_at: db.fn.now(),
      });
  }

  // Retry or fail
  if (shouldRetry(queueItem.retry_count, queueItem.max_retries)) {
    await retryMessage(queueItem, errorMessage);
  } else {
    await failMessage(queueItem, errorMessage, 'WA_SEND_FAILED');
  }
}

async function retryMessage(queueItem: MessageQueue, reason: string): Promise<void> {
  const newRetryCount = queueItem.retry_count + 1;
  const nextRetryAt = getNextRetryAt(newRetryCount);
  const delayMs = calculateRetryDelay(newRetryCount);

  await db('message_queue')
    .where({ id: queueItem.id })
    .update({
      status: 'pending',
      retry_count: newRetryCount,
      next_retry_at: nextRetryAt,
      failure_reason_internal: reason,
    });

  // Re-enqueue in BullMQ with backoff delay
  await enqueueMessage(queueItem.id, delayMs);

  logger.info(`Retry ${newRetryCount}/${queueItem.max_retries} for queue item ${queueItem.id} in ${Math.round(delayMs / 1000)}s`);
}

async function requeueWithDelay(queueItem: MessageQueue, delayMs: number, reason: string): Promise<void> {
  await db('message_queue')
    .where({ id: queueItem.id })
    .update({
      status: 'pending',
      failure_reason_internal: reason,
    });

  await enqueueMessage(queueItem.id, delayMs);
  logger.info(`Requeued item ${queueItem.id} with ${Math.round(delayMs / 1000)}s delay: ${reason}`);
}

async function failMessage(queueItem: MessageQueue, reason: string, errorCode?: string): Promise<void> {
  await db('message_queue')
    .where({ id: queueItem.id })
    .update({
      status: 'failed',
      failure_reason_internal: reason,
      failure_display_message: 'ההודעה לא נשלחה',
    });

  // Log failed dispatch
  const account = await db('connected_accounts')
    .where({ id: queueItem.connected_account_id })
    .select('platform')
    .first();

  const destination = await db('destinations')
    .where({ id: queueItem.destination_id })
    .select('destination_type')
    .first();

  await db('message_dispatches').insert({
    workspace_id: queueItem.workspace_id,
    queue_item_id: queueItem.id,
    destination_id: queueItem.destination_id,
    campaign_id: queueItem.campaign_id,
    rule_id: queueItem.source_rule_id,
    platform: account?.platform ?? 'WHATSAPP_WEB',
    destination_type: destination?.destination_type ?? 'WA_GROUP',
    status: 'failed',
    sent_at: db.fn.now(),
    is_success: false,
    platform_error_code: errorCode,
    failure_reason: reason,
  }).catch(() => {});

  logger.warn(`Message permanently failed: queue=${queueItem.id} reason=${reason}`);
}
