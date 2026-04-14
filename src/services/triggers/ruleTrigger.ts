/**
 * Distribution Rule Trigger
 *
 * Fired when a message arrives in a source_group that has active rules.
 * Resolves all destination targets for the rule, formulates queue items,
 * and pushes them with anti-ban delays.
 *
 * This is the "automatic forwarding" engine:
 *   source_group message → distribution_rule → N destinations
 */

import { db } from '../../config/database.js';
import { enqueueBatch, type DelayConfig } from '../queue/queueService.js';
import { sendApprovalNotification } from '../approvals/approvalNotifier.js';
import { logger } from '../../utils/logger.js';
import type { DelayMode, DelayPreset } from '../../types/database.js';

interface IncomingMessage {
  workspaceId: string;
  sourceGroupId: string;
  connectedAccountId: string;
  messageText?: string;
  mediaUrl?: string;
  mediaType?: string;
  platformMsgId?: string; // original message ID for forwarding
  pollData?: { name: string; options: string[]; selectableCount: number } | null;
  linkPreviewDisabled?: boolean;
}

interface RuleWithDestinations {
  rule_id: string;
  delay_mode: DelayMode;
  delay_preset: DelayPreset | null;
  delay_min_seconds: number;
  delay_max_seconds: number;
  append_suffix: string | null;
  append_suffix_enabled: boolean;
  requires_approval: boolean;
  destinations: Array<{
    destination_id: string;
    connected_account_id: string;
    sort_order: number;
  }>;
}

/**
 * Process an incoming message from a source group.
 * Finds all active distribution rules and enqueues messages for each.
 *
 * @returns Total number of messages enqueued across all rules
 */
export async function processIncomingMessage(msg: IncomingMessage): Promise<number> {
  // ── 1. Find all active rules for this source group ──
  // Supports both: normal source_group match AND direct bot rules (NULL source_group_id matched by rule ID)
  const rules = await db('distribution_rules')
    .where('workspace_id', msg.workspaceId)
    .where('is_active', true)
    .where(function () {
      this.where('source_group_id', msg.sourceGroupId)
        .orWhere(function () {
          this.whereNull('source_group_id').where('id', msg.sourceGroupId);
        });
    })
    .select(
      'id as rule_id',
      'delay_mode',
      'delay_preset',
      'delay_min_seconds',
      'delay_max_seconds',
      'append_suffix',
      'append_suffix_enabled',
      'requires_approval',
      'top_banner',
      'top_banner_enabled',
      'telegram_suffix',
      'telegram_suffix_enabled'
    );

  if (rules.length === 0) {
    logger.debug(`No active rules for source group ${msg.sourceGroupId}`);
    return 0;
  }

  let totalEnqueued = 0;

  for (const rule of rules) {
    // ── 2. Skip rules that require approval (handled by approval_requests flow) ──
    if (rule.requires_approval) {
      // Count destinations for the approval message
      const destCount = await db('rule_destinations')
        .where({ rule_id: rule.rule_id, is_active: true })
        .count('* as count')
        .first();

      const [approvalRequest] = await db('approval_requests').insert({
        workspace_id: msg.workspaceId,
        requested_by: msg.connectedAccountId,
        request_type: 'rule_activate',
        reference_id: rule.rule_id,
        message_preview: msg.messageText?.slice(0, 500),
        target_count: Number(destCount?.count ?? 0),
        status: 'pending',
      }).returning('id');

      // Send personalized interactive WhatsApp approval message
      await sendApprovalNotification({
        workspaceId: msg.workspaceId,
        ruleId: rule.rule_id,
        approvalRequestId: approvalRequest.id,
        targetCount: Number(destCount?.count ?? 0),
        messagePreview: msg.messageText?.slice(0, 200),
        connectedAccountId: msg.connectedAccountId,
      }).catch((err) => {
        logger.error(`Failed to send approval notification: ${(err as Error).message}`);
      });

      logger.info(`Rule ${rule.rule_id} requires approval — request created & notification sent`);
      continue;
    }

    // ── 3. Load destinations for this rule ──
    const destinations = await db('rule_destinations as rd')
      .join('destinations as d', 'd.id', 'rd.destination_id')
      .where('rd.rule_id', rule.rule_id)
      .where('rd.is_active', true)
      .where('d.is_active', true)
      .select(
        'd.id as destination_id',
        'd.connected_account_id',
        'rd.sort_order'
      )
      .orderBy('rd.sort_order', 'asc');

    if (destinations.length === 0) {
      logger.debug(`Rule ${rule.rule_id} has no active destinations, skipping`);
      continue;
    }

    // ── 4. Build delay config from rule ──
    const delayConfig: DelayConfig = {
      delay_mode: rule.delay_mode,
      delay_preset: rule.delay_preset,
      delay_min_seconds: rule.delay_min_seconds,
      delay_max_seconds: rule.delay_max_seconds,
    };

    // ── 5. Build queue items ──
    const suffix = rule.append_suffix_enabled ? rule.append_suffix : undefined;
    const topBanner = rule.top_banner_enabled ? rule.top_banner : undefined;

    // For polls: encode poll data as JSON in media_url with media_type='poll'
    let effectiveMediaUrl = msg.mediaUrl;
    let effectiveMediaType = msg.mediaType;
    if (msg.pollData) {
      effectiveMediaUrl = JSON.stringify(msg.pollData);
      effectiveMediaType = 'poll';
    }

    // Build message text with top banner
    let effectiveText = msg.messageText;
    if (topBanner && effectiveText) {
      effectiveText = `${topBanner}\n\n${effectiveText}`;
    } else if (topBanner) {
      effectiveText = topBanner;
    }

    const items = destinations.map((dest) => ({
      workspace_id: msg.workspaceId,
      source_type: 'trigger' as const,
      source_rule_id: rule.rule_id,
      destination_id: dest.destination_id,
      connected_account_id: dest.connected_account_id,
      message_text: effectiveText,
      media_url: effectiveMediaUrl,
      media_type: effectiveMediaType,
      original_platform_msg_id: msg.platformMsgId,
      append_suffix: suffix ?? undefined,
      priority: 5, // default priority for triggers
    }));

    // ── 6. Enqueue ──
    const ids = await enqueueBatch(items, delayConfig);
    totalEnqueued += ids.length;

    // Update rule stats
    await db('distribution_rules')
      .where({ id: rule.rule_id })
      .increment('total_dispatched', ids.length);

    logger.info(
      `Rule "${rule.rule_id}" triggered: ${ids.length} messages to ${destinations.length} destinations ` +
      `(mode: ${rule.delay_mode}, preset: ${rule.delay_preset})`
    );
  }

  return totalEnqueued;
}

/**
 * Check if an incoming message matches the source group's keyword filters.
 * Returns true if the message should trigger distribution.
 */
export function matchesKeywordFilter(
  messageText: string,
  triggerAll: boolean,
  triggerKeywords: string[] | null
): boolean {
  // If trigger_all is true, every message triggers
  if (triggerAll) return true;

  // If no keywords defined, don't trigger
  if (!triggerKeywords || triggerKeywords.length === 0) return false;

  const lowerText = messageText.toLowerCase();
  return triggerKeywords.some((kw) => lowerText.includes(kw.toLowerCase()));
}
