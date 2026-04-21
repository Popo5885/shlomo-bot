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
          const recipientJid = update.key.remoteJid ?? 'unknown';

          const updated = await db('message_dispatches')
            .where({ platform_msg_id: platformMsgId })
            .increment('views_count', 1);

          if (updated > 0) {
            logger.debug(`Views incremented for platform_msg_id=${platformMsgId}`);

            // Record unique view in message_views for analytics
            const dispatch = await db('message_dispatches')
              .where({ platform_msg_id: platformMsgId })
              .select('workspace_id', 'campaign_id')
              .first();

            if (dispatch) {
              await db('message_views')
                .insert({
                  workspace_id: dispatch.workspace_id,
                  campaign_id: dispatch.campaign_id ?? null,
                  wa_message_id: platformMsgId,
                  recipient_jid: recipientJid,
                  viewed_at: db.fn.now(),
                })
                .onConflict(['wa_message_id', 'recipient_jid'])
                .ignore();
            }
          }
        }
      } catch (err) {
        logger.error(`Read receipt handler error:`, err);
      }
    }
  });

  // ── Incoming message handler ──
  socket.ev.on('messages.upsert', async (event: { messages: WAMessage[]; type: MessageUpsertType }) => {
    logger.info(`[WA] messages.upsert: type=${event.type} count=${event.messages.length} account=${accountId}`);

    // Only process real-time messages, not history sync
    if (event.type !== 'notify') return;

    for (const msg of event.messages) {
      const jid = msg.key?.remoteJid ?? 'unknown';
      const fromMe = msg.key?.fromMe ?? false;
      logger.info(`[WA] message from=${jid} fromMe=${fromMe} id=${msg.key?.id}`);

      try {
        await handleMessage(msg, socket, accountId, workspaceId);
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

/**
 * Persist a raw message to wa_messages so the Chat view can display it.
 * Called for ALL messages (including fromMe) before any business logic.
 */
async function persistMessage(msg: WAMessage, accountId: string, workspaceId: string): Promise<void> {
  try {
    const jid = msg.key.remoteJid;
    if (!jid || jid === 'status@broadcast') return;

    const m = msg.message;
    if (!m) return;

    let contentType = 'text';
    let textContent: string | null = null;

    if (m.conversation) { textContent = m.conversation; }
    else if (m.extendedTextMessage?.text) { textContent = m.extendedTextMessage.text; }
    else if (m.imageMessage) { contentType = 'image'; textContent = m.imageMessage.caption ?? null; }
    else if (m.videoMessage) { contentType = 'video'; textContent = m.videoMessage.caption ?? null; }
    else if (m.documentMessage) { contentType = 'document'; textContent = m.documentMessage.caption ?? null; }
    else if (m.audioMessage) { contentType = 'audio'; }
    else if (m.stickerMessage) { contentType = 'sticker'; }
    else if ((m as any).pollCreationMessage) { contentType = 'poll'; textContent = (m as any).pollCreationMessage.name ?? null; }
    else { contentType = 'other'; }

    const senderJid = msg.key.fromMe
      ? null
      : (msg.key.participant ?? msg.key.remoteJid ?? null);

    const ts = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000)
      : new Date();

    await db('wa_messages').insert({
      workspace_id: workspaceId,
      account_id: accountId,
      jid,
      message_id: msg.key.id ?? `${Date.now()}`,
      sender_jid: senderJid,
      sender_name: (msg as any).pushName ?? null,
      content_type: contentType,
      text_content: textContent,
      is_from_me: msg.key.fromMe ?? false,
      ts,
    }).onConflict(['account_id', 'message_id']).ignore();
  } catch (err) {
    // Never crash the listener for a persistence error
    logger.error(`wa_messages persist error (account=${accountId}):`, err);
  }
}

async function handleMessage(
  msg: WAMessage,
  socket: WASocket,
  accountId: string,
  workspaceId: string
): Promise<void> {
  // ── Persist ALL messages to wa_messages for Chat view ──
  await persistMessage(msg, accountId, workspaceId);

  // ── Filter out irrelevant messages for distribution engine ──

  // Skip messages sent by us (after persisting so they appear in chat)
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
    // Auto-reply greeting + lead notification (runs before bot trigger logic)
    await handleDmLeadCapture(socket, msg, remoteJid, accountId, workspaceId);

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
 * Auto-Reply + Lead Notification for private DMs.
 *
 * When a new message arrives from a contact we haven't recently replied to:
 * 1. Sends an auto-reply greeting (if configured and not in cooldown)
 * 2. Sends a lead notification WhatsApp message to the workspace owner's phone
 */
async function handleDmLeadCapture(
  socket: WASocket,
  msg: WAMessage,
  remoteJid: string,
  accountId: string,
  workspaceId: string
): Promise<void> {
  try {
    // Load auto-reply settings
    const settings = await db('auto_reply_settings')
      .where({ workspace_id: workspaceId })
      .first();

    if (!settings?.is_enabled) return;

    const cooldownMinutes = settings.cooldown_minutes ?? 60;
    const cutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000);

    // Cooldown: skip if we already replied to this number within the window
    const recentOutbound = await db('wa_messages')
      .where({ account_id: accountId, jid: remoteJid, is_from_me: true })
      .where('ts', '>=', cutoff)
      .first();

    if (recentOutbound) {
      logger.debug(`Auto-reply cooldown active for ${remoteJid} (replied within ${cooldownMinutes}m)`);
      return;
    }

    const senderPhone = remoteJid.replace('@s.whatsapp.net', '');
    const senderName: string = (msg as any).pushName || senderPhone;

    // ── 1. Send auto-reply greeting ──
    if (settings.greeting_text) {
      await socket.sendMessage(remoteJid, { text: settings.greeting_text });
      logger.info(`Auto-reply sent to ${remoteJid} (${senderName})`);
    }

    // ── 2. Send lead notification to workspace owner ──
    if (settings.send_lead_notification) {
      // Prefer settings override, fall back to workspace contact_phone
      let notifPhone: string | null = settings.notification_phone ?? null;
      if (!notifPhone) {
        const workspace = await db('workspaces')
          .where({ id: workspaceId })
          .select('contact_phone')
          .first();
        notifPhone = workspace?.contact_phone ?? null;
      }

      if (notifPhone) {
        const normalizedNotif = normalizePhone(notifPhone);
        const ownerJid = `${normalizedNotif}@s.whatsapp.net`;

        // Don't notify the owner if THEY are the sender
        if (ownerJid === remoteJid) return;

        const waLink = `https://wa.me/${senderPhone}`;
        const notificationText =
          `🎯 *ליד חדש הגיע!*\n\n` +
          `📱 מספר: +${senderPhone}\n` +
          `👤 שם: ${senderName}\n\n` +
          `לפתיחת שיחה:\n${waLink}`;

        await socket.sendMessage(ownerJid, { text: notificationText });
        logger.info(`Lead notification sent to owner (${ownerJid}) for new contact ${remoteJid}`);
      }
    }
  } catch (err) {
    // Non-critical — never crash the listener
    logger.error(`handleDmLeadCapture error for ${remoteJid}:`, err);
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
