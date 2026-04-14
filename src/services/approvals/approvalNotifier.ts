/**
 * Interactive WhatsApp Approval Notifier
 *
 * When a rule requires approval, sends a personalized interactive WhatsApp
 * message to the admin with native buttons: "שלח עכשיו", "תזמן שליחה", "בטל".
 *
 * Falls back to a numbered text list if button sending fails.
 */

import type { WASocket } from '@whiskeysockets/baileys';
import { db } from '../../config/database.js';
import { sessionManager } from '../whatsapp/sessionManager.js';
import { logger } from '../../utils/logger.js';

interface ApprovalContext {
  workspaceId: string;
  ruleId: string;
  approvalRequestId: string;
  targetCount: number;
  messagePreview?: string;
  connectedAccountId: string;
}

/**
 * Send an interactive approval message to the workspace admin via WhatsApp.
 */
export async function sendApprovalNotification(ctx: ApprovalContext): Promise<void> {
  try {
    // Find the admin (owner or member with can_approve_messages permission)
    const admin = await db('workspace_members as wm')
      .leftJoin('workspace_roles as wr', 'wr.id', 'wm.role_id')
      .where('wm.workspace_id', ctx.workspaceId)
      .where('wm.is_active', true)
      .where(function () {
        this.where('wm.is_owner', true).orWhere('wr.can_approve_messages', true);
      })
      .select('wm.id', 'wm.full_name', 'wm.email')
      .first();

    if (!admin) {
      logger.warn(`No admin found for workspace ${ctx.workspaceId} — cannot send approval`);
      return;
    }

    // Get the socket
    const socket = sessionManager.getSocket(ctx.connectedAccountId);
    if (!socket) {
      logger.warn(`No active socket for account ${ctx.connectedAccountId}`);
      return;
    }

    // Get the account's own phone number to determine admin JID
    const account = await db('connected_accounts')
      .where({ id: ctx.connectedAccountId })
      .select('account_identifier')
      .first();

    if (!account?.account_identifier) {
      logger.warn(`No account identifier for ${ctx.connectedAccountId}`);
      return;
    }

    // We need the admin's WhatsApp JID — use the account's own number as the admin
    // (In practice, the admin IS the connected account owner)
    const adminJid = account.account_identifier.includes('@')
      ? account.account_identifier
      : `${account.account_identifier}@s.whatsapp.net`;

    const adminName = admin.full_name || 'מנהל';
    const preview = ctx.messagePreview
      ? `\n\n📝 תצוגה מקדימה:\n"${ctx.messagePreview.slice(0, 200)}${ctx.messagePreview.length > 200 ? '...' : ''}"`
      : '';

    const messageText =
      `שלום ${adminName}! 📤\n\n` +
      `התקבלה הודעה חדשה להפצה ל-${ctx.targetCount} קבוצות.` +
      preview +
      `\n\nמה תרצה לעשות?`;

    // Try sending interactive buttons first
    try {
      await socket.sendMessage(adminJid, {
        text: messageText,
        buttons: [
          { buttonId: `approve_${ctx.approvalRequestId}`, buttonText: { displayText: 'שלח עכשיו' } },
          { buttonId: `schedule_${ctx.approvalRequestId}`, buttonText: { displayText: 'תזמן שליחה' } },
          { buttonId: `reject_${ctx.approvalRequestId}`, buttonText: { displayText: 'בטל' } },
        ],
      } as any);

      logger.info(`Sent interactive approval to ${adminJid} for request ${ctx.approvalRequestId}`);
    } catch (buttonErr) {
      // Fallback: send numbered text list
      logger.warn(`Button message failed, falling back to text: ${(buttonErr as Error).message}`);

      const fallbackText =
        messageText +
        `\n\n` +
        `הגב עם מספר:\n` +
        `1️⃣ — שלח עכשיו\n` +
        `2️⃣ — תזמן שליחה\n` +
        `3️⃣ — בטל\n\n` +
        `(מזהה: ${ctx.approvalRequestId.slice(0, 8)})`;

      await socket.sendMessage(adminJid, { text: fallbackText });
      logger.info(`Sent fallback text approval to ${adminJid}`);
    }
  } catch (err) {
    logger.error(`Failed to send approval notification:`, err);
  }
}

/**
 * Handle an approval response (button click or text reply).
 * Returns the action taken: 'approved' | 'scheduled' | 'rejected' | null
 */
export async function handleApprovalResponse(
  responseText: string,
  senderJid: string,
  workspaceId: string,
): Promise<'approved' | 'scheduled' | 'rejected' | null> {
  let action: 'approved' | 'scheduled' | 'rejected' | null = null;
  let approvalId: string | null = null;

  // Check button response format: "approve_<uuid>" / "schedule_<uuid>" / "reject_<uuid>"
  if (responseText.startsWith('approve_')) {
    action = 'approved';
    approvalId = responseText.replace('approve_', '');
  } else if (responseText.startsWith('schedule_')) {
    action = 'scheduled';
    approvalId = responseText.replace('schedule_', '');
  } else if (responseText.startsWith('reject_')) {
    action = 'rejected';
    approvalId = responseText.replace('reject_', '');
  }
  // Check numbered text response
  else if (responseText.trim() === '1') {
    action = 'approved';
  } else if (responseText.trim() === '2') {
    action = 'scheduled';
  } else if (responseText.trim() === '3') {
    action = 'rejected';
  }

  if (!action) return null;

  // If we have the approval ID from button, use it directly
  // Otherwise find the most recent pending approval for this workspace
  if (!approvalId) {
    const pending = await db('approval_requests')
      .where({ workspace_id: workspaceId, status: 'pending' })
      .orderBy('requested_at', 'desc')
      .first();

    if (!pending) return null;
    approvalId = pending.id;
  }

  // Update the approval request
  const newStatus = action === 'rejected' ? 'rejected' : 'approved';
  await db('approval_requests')
    .where({ id: approvalId, status: 'pending' })
    .update({
      status: newStatus,
      reviewed_at: db.fn.now(),
      reviewer_note: action === 'scheduled' ? 'scheduled_by_admin' : undefined,
    });

  logger.info(`Approval ${approvalId} — action: ${action}`);

  return action;
}
