/**
 * Baileys Message Listener
 *
 * Hooks into messages.upsert to detect incoming messages in source groups,
 * applies keyword filters, and fires the distribution rule trigger engine.
 *
 * Integrated into SessionManager — starts listening automatically
 * when a WhatsApp socket connects.
 */

import type { WASocket, WAMessage, MessageUpsertType } from '@whiskeysockets/baileys';
import { db } from '../../config/database.js';
import { processIncomingMessage, matchesKeywordFilter } from '../triggers/ruleTrigger.js';
import { enqueueBatch, type DelayConfig } from '../queue/queueService.js';
import { handleApprovalResponse } from '../approvals/approvalNotifier.js';
import { logger } from '../../utils/logger.js';

interface SourceGroupRow {
  id: string;
  workspace_id: string;
  trigger_all: boolean;
  trigger_keywords: string[] | null;
}

/**
 * Attach the message listener to a Baileys socket.
 * Called by SessionManager after a successful connection.
 */
export function attachMessageListener(
  socket: WASocket,
  accountId: string,
  workspaceId: string
): void {
  // ── Read receipt tracking (views_count) ──
  socket.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      try {
        // Status 4 = READ by recipient
        if (update.update?.status === 4 && update.key?.id) {
          const platformMsgId = update.key.id;
          const updated = await db('message_dispatches')
            .where({ platform_msg_id: platformMsgId })
            .increment('views_count', 1);

          if (updated > 0) {
            logger.debug(`Views incremented for platform_msg_id=${platformMsgId}`);
          }
        }
      } catch (err) {
        logger.error(`Read receipt handler error:`, err);
      }
    }
  });

  // ── Incoming message handler ──
  socket.ev.on('messages.upsert', async (event: { messages: WAMessage[]; type: MessageUpsertType }) => {
    // Only process real-time messages, not history sync
    if (event.type !== 'notify') return;

    for (const msg of event.messages) {
      try {
        await handleMessage(msg, accountId, workspaceId);
      } catch (err) {
        logger.error(`Message handler error (account: ${accountId}):`, err);

        // Log to system_error_logs — don't let listener crash
        await db('system_error_logs').insert({
          workspace_id: workspaceId,
          severity: 'ERROR',
          source: 'message_listener',
          error_code: 'MSG_HANDLER_FAILED',
          message: (err as Error).message,
          stack_trace: (err as Error).stack,
          request_payload: {
            account_id: accountId,
            msg_id: msg.key?.id,
            remote_jid: msg.key?.remoteJid,
          },
        }).catch(() => {});
      }
    }
  });

  logger.info(`Message listener attached for account ${accountId}`);
}

async function handleMessage(
  msg: WAMessage,
  accountId: string,
  workspaceId: string
): Promise<void> {
  // ── Filter out irrelevant messages ──

  // Skip messages sent by us
  if (msg.key.fromMe) return;

  // Skip status broadcasts
  if (msg.key.remoteJid === 'status@broadcast') return;

  // Must have a remote JID (group or contact)
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid) return;

  const messageContent = msg.message;
  if (!messageContent) return;

  // ── Approval flow handling (works for both DMs and groups) ──

  // Check for button response (approval flow)
  const buttonsResponse = (messageContent as any).buttonsResponseMessage?.selectedButtonId;
  if (buttonsResponse) {
    const action = await handleApprovalResponse(buttonsResponse, remoteJid, workspaceId);
    if (action === 'approved') {
      await executeApprovedDispatch(workspaceId, buttonsResponse);
    }
    if (action) {
      logger.info(`Approval button response from ${remoteJid}: ${action}`);
      return;
    }
  }

  // Check for numbered text responses (approval fallback: "1", "2", "3") — only in DMs
  if (remoteJid.endsWith('@s.whatsapp.net')) {
    const textReply = messageContent.conversation || messageContent.extendedTextMessage?.text;
    if (textReply && ['1', '2', '3'].includes(textReply.trim())) {
      const action = await handleApprovalResponse(textReply.trim(), remoteJid, workspaceId);
      if (action === 'approved') {
        await executeApprovedDispatch(workspaceId);
      }
      if (action) {
        logger.info(`Approval text response from ${remoteJid}: ${action}`);
        return;
      }
    }
  }

  // ── Extract message text and media ──
  const extracted = extractContent(msg);
  if (!extracted.text && !extracted.mediaUrl && !extracted.pollData) return;

  // ── Hash feature — strip trailing '#' and disable link preview ──
  let linkPreviewDisabled = false;
  if (extracted.text?.endsWith('#')) {
    extracted.text = extracted.text.slice(0, -1).trimEnd();
    linkPreviewDisabled = true;
  }

  // ── DM handling — direct bot triggers ──
  if (remoteJid.endsWith('@s.whatsapp.net')) {
    const senderPhone = remoteJid.replace('@s.whatsapp.net', '');

    // Find direct bot rules (source_group_id IS NULL) for this workspace
    const directRules = await db('distribution_rules')
      .where({ workspace_id: workspaceId, is_active: true })
      .whereNull('source_group_id')
      .select('id', 'authorized_senders_mode', 'authorized_phone_numbers');

    for (const rule of directRules) {
      // Check if sender is authorized
      if (rule.authorized_senders_mode === 'specific') {
        const phones: string[] = rule.authorized_phone_numbers || [];
        const normalized = phones.map(normalizePhone);
        if (!normalized.includes(normalizePhone(senderPhone))) continue;
      }

      // Fire trigger
      const enqueued = await processIncomingMessage({
        workspaceId,
        sourceGroupId: rule.id, // use rule ID as source identifier for direct bot
        connectedAccountId: accountId,
        messageText: extracted.text,
        mediaUrl: extracted.mediaUrl,
        mediaType: extracted.mediaType,
        platformMsgId: msg.key.id ?? undefined,
        pollData: extracted.pollData,
        linkPreviewDisabled,
      });

      if (enqueued > 0) {
        logger.info(
          `Direct bot trigger fired: rule=${rule.id} sender=${senderPhone} ` +
          `messages=${enqueued} text="${(extracted.text ?? '').slice(0, 80)}"`
        );
      }
    }
    return;
  }

  // ── Group messages (@g.us) — existing logic ──
  if (!remoteJid.endsWith('@g.us') && !remoteJid.endsWith('@newsletter')) return;

  const sourceGroups = await db('source_groups')
    .where({
      connected_account_id: accountId,
      workspace_id: workspaceId,
      platform_group_id: remoteJid,
      is_active: true,
    })
    .select<SourceGroupRow[]>('id', 'workspace_id', 'trigger_all', 'trigger_keywords');

  if (sourceGroups.length === 0) return; // this group isn't a monitored source

  for (const sourceGroup of sourceGroups) {
    // ── Apply keyword filter ──
    if (extracted.text && !matchesKeywordFilter(
      extracted.text,
      sourceGroup.trigger_all,
      sourceGroup.trigger_keywords
    )) {
      logger.debug(
        `Message in ${remoteJid} skipped — no keyword match for source group ${sourceGroup.id}`
      );
      continue;
    }

    // ── Fire the trigger engine ──
    const enqueued = await processIncomingMessage({
      workspaceId: sourceGroup.workspace_id,
      sourceGroupId: sourceGroup.id,
      connectedAccountId: accountId,
      messageText: extracted.text,
      mediaUrl: extracted.mediaUrl,
      mediaType: extracted.mediaType,
      platformMsgId: msg.key.id ?? undefined,
      pollData: extracted.pollData,
      linkPreviewDisabled,
    });

    if (enqueued > 0) {
      logger.info(
        `Trigger fired: source=${sourceGroup.id} group=${remoteJid} ` +
        `messages=${enqueued} text="${(extracted.text ?? '').slice(0, 80)}"`
      );
    }
  }
}

/**
 * Normalize an Israeli phone number for comparison.
 */
function normalizePhone(phone: string): string {
  let p = phone.replace(/[-\s()]/g, '');
  if (p.startsWith('05')) p = '972' + p.slice(1);
  if (p.startsWith('+')) p = p.slice(1);
  return p;
}

/**
 * Execute approved dispatch — loads the most recent approved request and fires enqueueBatch.
 */
async function executeApprovedDispatch(workspaceId: string, buttonResponseId?: string): Promise<void> {
  try {
    // Find the approval request
    let approvalRequest;
    if (buttonResponseId) {
      const approvalId = buttonResponseId.replace('approve_', '');
      approvalRequest = await db('approval_requests')
        .where({ id: approvalId, workspace_id: workspaceId, status: 'approved' })
        .first();
    }
    if (!approvalRequest) {
      approvalRequest = await db('approval_requests')
        .where({ workspace_id: workspaceId, status: 'approved' })
        .orderBy('reviewed_at', 'desc')
        .first();
    }

    if (!approvalRequest) {
      logger.warn(`No approved request found for workspace ${workspaceId}`);
      return;
    }

    const ruleId = approvalRequest.reference_id;

    // Load the rule
    const rule = await db('distribution_rules')
      .where({ id: ruleId, is_active: true })
      .select(
        'id as rule_id',
        'delay_mode',
        'delay_preset',
        'delay_min_seconds',
        'delay_max_seconds',
        'append_suffix',
        'append_suffix_enabled'
      )
      .first();

    if (!rule) {
      logger.warn(`Rule ${ruleId} not found or inactive for approved dispatch`);
      return;
    }

    // Load destinations
    const destinations = await db('rule_destinations as rd')
      .join('destinations as d', 'd.id', 'rd.destination_id')
      .where('rd.rule_id', rule.rule_id)
      .where('rd.is_active', true)
      .where('d.is_active', true)
      .select('d.id as destination_id', 'd.connected_account_id', 'rd.sort_order')
      .orderBy('rd.sort_order', 'asc');

    if (destinations.length === 0) {
      logger.warn(`No active destinations for rule ${ruleId}`);
      return;
    }

    const delayConfig: DelayConfig = {
      delay_mode: rule.delay_mode,
      delay_preset: rule.delay_preset,
      delay_min_seconds: rule.delay_min_seconds,
      delay_max_seconds: rule.delay_max_seconds,
    };

    const suffix = rule.append_suffix_enabled ? rule.append_suffix : undefined;

    const items = destinations.map((dest: any) => ({
      workspace_id: workspaceId,
      source_type: 'trigger' as const,
      source_rule_id: rule.rule_id,
      destination_id: dest.destination_id,
      connected_account_id: dest.connected_account_id,
      message_text: approvalRequest.message_preview,
      append_suffix: suffix ?? undefined,
      priority: 5,
    }));

    const ids = await enqueueBatch(items, delayConfig);

    // Mark approval as dispatched
    await db('approval_requests')
      .where({ id: approvalRequest.id })
      .update({ status: 'dispatched' });

    // Update rule stats
    await db('distribution_rules')
      .where({ id: ruleId })
      .increment('total_dispatched', ids.length);

    logger.info(`Approved dispatch executed: rule=${ruleId} messages=${ids.length}`);
  } catch (err) {
    logger.error(`Failed to execute approved dispatch:`, err);
  }
}

interface PollData {
  name: string;
  options: string[];
  selectableCount: number;
}

interface ExtractedContent {
  text: string | undefined;
  mediaUrl: string | undefined;
  mediaType: 'image' | 'video' | 'document' | 'audio' | undefined;
  pollData: PollData | undefined;
}

function extractContent(msg: WAMessage): ExtractedContent {
  const m = msg.message!;
  const result: ExtractedContent = {
    text: undefined,
    mediaUrl: undefined,
    mediaType: undefined,
    pollData: undefined,
  };

  // Text message
  if (m.conversation) {
    result.text = m.conversation;
  }
  // Extended text (with link preview, etc.)
  else if (m.extendedTextMessage) {
    result.text = m.extendedTextMessage.text ?? undefined;
  }
  // Image
  else if (m.imageMessage) {
    result.text = m.imageMessage.caption ?? undefined;
    result.mediaType = 'image';
    // Media URL will be downloaded by the sender service if needed
    // For now, store the message ID so we can forward/download later
  }
  // Video
  else if (m.videoMessage) {
    result.text = m.videoMessage.caption ?? undefined;
    result.mediaType = 'video';
  }
  // Document
  else if (m.documentMessage) {
    result.text = m.documentMessage.caption ?? undefined;
    result.mediaType = 'document';
  }
  // Audio
  else if (m.audioMessage) {
    result.mediaType = 'audio';
  }
  // Poll message
  else if ((m as any).pollCreationMessage) {
    result.text = (m as any).pollCreationMessage.name ?? undefined;
    result.pollData = {
      name: (m as any).pollCreationMessage.name ?? '',
      options: ((m as any).pollCreationMessage.options ?? []).map((o: any) => o.optionName ?? ''),
      selectableCount: (m as any).pollCreationMessage.selectableOptionsCount ?? 1,
    };
  }

  return result;
}
