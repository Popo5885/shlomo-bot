/**
 * Campaign Trigger
 *
 * Takes a campaign_id, resolves its targets and connected account,
 * formulates queue items, and pushes them into the message queue
 * with anti-ban delays via enqueueBatch().
 */

import { db } from '../../config/database.js';
import { enqueueBatch, type DelayConfig } from '../queue/queueService.js';
import { logger } from '../../utils/logger.js';
import { AppError, NotFoundError } from '../../utils/errors.js';

interface Campaign {
  id: string;
  workspace_id: string;
  status: string;
  message_text: string | null;
  media_url: string | null;
  media_type: string | null;
  append_suffix: string | null;
  delay_preset: string;
  delay_min_seconds: number;
  delay_max_seconds: number;
  total_targets: number;
}

interface CampaignTarget {
  destination_id: string;
  connected_account_id: string;
  platform_dest_id: string;
  sort_order: number;
}

/**
 * Launch a campaign — inserts messages into the queue and starts processing.
 *
 * @param campaignId - The campaign UUID
 * @returns Number of messages enqueued
 */
export async function triggerCampaign(campaignId: string): Promise<number> {
  // ── 1. Load and validate campaign ──
  const campaign = await db('campaigns')
    .where({ id: campaignId })
    .first<Campaign>();

  if (!campaign) {
    throw new NotFoundError(`Campaign ${campaignId} not found`);
  }

  if (!['approved', 'draft'].includes(campaign.status)) {
    throw new AppError(
      `Campaign cannot be triggered in status "${campaign.status}"`,
      400,
      'CAMPAIGN_INVALID_STATUS'
    );
  }

  if (!campaign.message_text && !campaign.media_url) {
    throw new AppError('Campaign has no message content', 400, 'CAMPAIGN_EMPTY');
  }

  // ── 2. Load targets with their connected accounts ──
  const targets = await db('campaign_targets as ct')
    .join('destinations as d', 'd.id', 'ct.destination_id')
    .where('ct.campaign_id', campaignId)
    .where('d.is_active', true)
    .select<CampaignTarget[]>(
      'd.id as destination_id',
      'd.connected_account_id',
      'd.platform_dest_id',
      'ct.sort_order'
    )
    .orderBy('ct.sort_order', 'asc');

  if (targets.length === 0) {
    throw new AppError('Campaign has no active targets', 400, 'CAMPAIGN_NO_TARGETS');
  }

  // ── 3. Update campaign status ──
  await db('campaigns')
    .where({ id: campaignId })
    .update({
      status: 'running',
      started_at: db.fn.now(),
      total_targets: targets.length,
      updated_at: db.fn.now(),
    });

  // ── 4. Build delay config ──
  const delayConfig: DelayConfig = {
    delay_mode: 'random', // campaigns always use random mode
    delay_preset: (campaign.delay_preset as DelayConfig['delay_preset']) ?? 'medium',
    delay_min_seconds: campaign.delay_min_seconds,
    delay_max_seconds: campaign.delay_max_seconds,
  };

  // ── 5. Build queue items ──
  const items = targets.map((target) => ({
    workspace_id: campaign.workspace_id,
    source_type: 'campaign' as const,
    campaign_id: campaignId,
    destination_id: target.destination_id,
    connected_account_id: target.connected_account_id,
    message_text: campaign.message_text ?? undefined,
    media_url: campaign.media_url ?? undefined,
    media_type: campaign.media_type ?? undefined,
    append_suffix: campaign.append_suffix ?? undefined,
    priority: 3, // campaigns get higher priority than triggers
  }));

  // ── 6. Enqueue with staggered delays ──
  const insertedIds = await enqueueBatch(items, delayConfig);

  logger.info(
    `Campaign ${campaignId} triggered: ${insertedIds.length} messages enqueued ` +
    `(preset: ${campaign.delay_preset})`
  );

  return insertedIds.length;
}

/**
 * Cancel a running campaign — marks pending queue items as cancelled.
 */
export async function cancelCampaign(campaignId: string): Promise<number> {
  const cancelled = await db('message_queue')
    .where({ campaign_id: campaignId, status: 'pending' })
    .update({ status: 'cancelled' });

  await db('campaigns')
    .where({ id: campaignId })
    .update({
      status: 'cancelled',
      updated_at: db.fn.now(),
    });

  logger.info(`Campaign ${campaignId} cancelled: ${cancelled} messages removed from queue`);
  return cancelled;
}
