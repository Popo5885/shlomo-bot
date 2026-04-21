/**
 * Email Service — Gmail SMTP via Nodemailer
 *
 * Features:
 *  - Unsubscribe token in every outbound email (HMAC-SHA256)
 *  - Pre-send unsubscribe check (skips if opted-out)
 *  - Email audit log written on every attempt
 *  - Professional footer signature
 *  - Newsletter + receipt helpers
 */

import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { db } from '../../config/database.js';

// ── Transporter ───────────────────────────────────────────────
function createTransporter() {
  const user = process.env.EMAIL_FROM;
  const pass = process.env.EMAIL_APP_PASSWORD;
  if (!user || !pass) {
    logger.warn('Email not configured — EMAIL_FROM or EMAIL_APP_PASSWORD missing.');
    return null;
  }
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

const FROM_NAME = 'GroupPulse';

function fromAddress(): string {
  const email = process.env.EMAIL_FROM || 'noreply@grouppulse.app';
  return `"${FROM_NAME}" <${email}>`;
}

function frontendUrl(): string {
  const u = process.env.FRONTEND_URL || 'http://localhost:3001';
  return u.split(',')[0].trim();
}

// ── Unsubscribe token (HMAC of email, no DB lookup needed) ────
function unsubscribeToken(email: string): string {
  const secret = process.env.JWT_SECRET || 'changeme';
  return crypto.createHmac('sha256', secret).update(email.toLowerCase()).digest('base64url');
}

export function unsubscribeTokenFor(email: string): string {
  return unsubscribeToken(email);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  return unsubscribeToken(email) === token;
}

// ── Unsubscribe check ─────────────────────────────────────────
async function isUnsubscribed(email: string): Promise<boolean> {
  try {
    const row = await db('email_unsubscribes').where({ email: email.toLowerCase() }).first();
    return !!row;
  } catch {
    return false;
  }
}

export async function addUnsubscribe(email: string): Promise<void> {
  await db('email_unsubscribes')
    .insert({ email: email.toLowerCase() })
    .onConflict('email').ignore();
}

export async function removeUnsubscribe(email: string): Promise<void> {
  await db('email_unsubscribes').where({ email: email.toLowerCase() }).delete();
}

// ── Email log ─────────────────────────────────────────────────
async function logEmail(opts: {
  workspaceId?: string;
  to: string;
  subject: string;
  templateName?: string;
  status: 'sent' | 'failed' | 'skipped';
  errorMsg?: string;
}): Promise<void> {
  try {
    await db('email_log').insert({
      workspace_id: opts.workspaceId ?? null,
      to_email: opts.to,
      subject: opts.subject,
      template_name: opts.templateName ?? null,
      status: opts.status,
      error_msg: opts.errorMsg ?? null,
    });
  } catch (err) {
    logger.warn('Failed to write email_log entry:', err);
  }
}

// ── Generic send helper ───────────────────────────────────────
async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  templateName?: string;
  workspaceId?: string;
}): Promise<void> {
  const normalised = opts.to.toLowerCase();

  // Skip if globally unsubscribed
  const opted_out = await isUnsubscribed(normalised);
  if (opted_out) {
    logger.info(`Email to ${opts.to} skipped — unsubscribed.`);
    await logEmail({ ...opts, to: normalised, status: 'skipped' });
    return;
  }

  const transporter = createTransporter();
  if (!transporter) {
    await logEmail({ ...opts, to: normalised, status: 'failed', errorMsg: 'Transporter not configured' });
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    logger.info(`Email sent to ${opts.to} — messageId: ${info.messageId}`);
    await logEmail({ ...opts, to: normalised, status: 'sent' });
  } catch (err: any) {
    logger.error(`Failed to send email to ${opts.to}:`, err);
    await logEmail({ ...opts, to: normalised, status: 'failed', errorMsg: String(err?.message ?? err) });
  }
}

// ── Shared HTML wrapper ───────────────────────────────────────
function htmlWrapper(content: string, recipientEmail?: string): string {
  const base = frontendUrl();
  const token = recipientEmail ? unsubscribeToken(recipientEmail) : '';
  const unsubUrl = recipientEmail
    ? `${base}/unsubscribe/${token}?email=${encodeURIComponent(recipientEmail)}`
    : `${base}/unsubscribe`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GroupPulse</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#2563eb,#7c3aed);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">GroupPulse</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:14px;">פלטפורמת הפצת הודעות חכמה</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${content}
            </td>
          </tr>
          <!-- Professional footer -->
          <tr>
            <td style="background:#f8fafc;padding:28px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 4px;color:#374151;font-size:13px;font-weight:600;">
                שלמה פופוביץ — שירותי אוטומציה לעסקים
              </p>
              <p style="margin:0 0 12px;color:#9ca3af;font-size:12px;">
                © ${new Date().getFullYear()} כל הזכויות שמורות
              </p>
              <p style="margin:0;color:#d1d5db;font-size:11px;">
                אינך רוצה לקבל עוד עדכונים?
                <a href="${unsubUrl}" style="color:#6366f1;text-decoration:underline;">הסרה מרשימת התפוצה</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function actionButton(text: string, href: string): string {
  return `<div style="text-align:center;margin:32px 0;">
    <a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:12px;font-size:16px;font-weight:700;letter-spacing:0.3px;">
      ${text}
    </a>
  </div>`;
}

// ── Template helpers ──────────────────────────────────────────
function interpolate(tmpl: string, vars: Record<string, string>): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

// ════════════════════════════════════════════════════════════
//  PUBLIC EMAIL FUNCTIONS
// ════════════════════════════════════════════════════════════

/** 1. Welcome email — user who just signed up */
export async function sendWelcomeEmail(opts: {
  to: string;
  fullName: string;
  businessName: string;
  workspaceId?: string;
}): Promise<void> {
  const { to, fullName, businessName, workspaceId } = opts;

  // Try DB template first
  const tmpl = await db('email_templates').where({ name: 'welcome', is_active: true }).first();
  let body: string;
  if (tmpl) {
    body = interpolate(tmpl.body_html, { fullName, businessName, email: to })
      + actionButton('כניסה למערכת', `${frontendUrl()}/login`);
    await sendMail({ to, subject: tmpl.subject, html: htmlWrapper(body, to), templateName: 'welcome', workspaceId });
  } else {
    body = `<h2 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:700;">שלום ${fullName}! 👋</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.7;">
        ברוכים הבאים ל-<strong>GroupPulse</strong>.
      </p>
      <div style="background:#f0f4ff;border-right:4px solid #6366f1;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
        <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
          <strong>שם עסק:</strong> ${businessName}<br/>
          <strong>אימייל:</strong> ${to}
        </p>
      </div>
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
        ההרשמה שלך התקבלה בהצלחה! ✅<br/>
        <strong>הצוות שלנו יבדוק את הבקשה ויאשר את החשבון בהקדם האפשרי.</strong>
      </p>
      ${actionButton('כניסה למערכת', `${frontendUrl()}/login`)}`;
    await sendMail({ to, subject: '🎉 ברוכים הבאים ל-GroupPulse!', html: htmlWrapper(body, to), templateName: 'welcome', workspaceId });
  }
}

/** 2. Owner notification — new workspace created */
export async function sendOwnerNewSignupNotification(opts: {
  fullName: string;
  businessName: string;
  email: string;
  phone: string;
}): Promise<void> {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) return;

  const { fullName, businessName, email, phone } = opts;
  const adminUrl = `${frontendUrl()}/admin`;

  const body = `
    <h2 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">🆕 משתמש חדש נרשם!</h2>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">פרטי ההרשמה:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;overflow:hidden;margin:0 0 24px;">
      ${[
        ['👤 שם מלא', fullName],
        ['🏢 שם עסק', businessName],
        ['📧 אימייל', email],
        ['📱 טלפון', phone],
      ].map(([label, value], i) => `
        <tr style="border-bottom:${i < 3 ? '1px solid #e5e7eb' : 'none'}">
          <td style="padding:14px 20px;color:#6b7280;font-size:13px;font-weight:600;width:40%;">${label}</td>
          <td style="padding:14px 20px;color:#111827;font-size:14px;">${value}</td>
        </tr>
      `).join('')}
    </table>
    ${actionButton('כניסה לפאנל הניהול ←', adminUrl)}`;

  await sendMail({
    to: ownerEmail,
    subject: `🆕 הרשמה חדשה: ${businessName}`,
    html: htmlWrapper(body, ownerEmail),
    templateName: 'owner_notification',
  });
}

/** 3. Approval email */
export async function sendApprovalEmail(opts: {
  to: string;
  fullName: string;
  workspaceName: string;
  workspaceId?: string;
}): Promise<void> {
  const { to, fullName, workspaceName, workspaceId } = opts;

  const tmpl = await db('email_templates').where({ name: 'approval', is_active: true }).first();
  let body: string;
  if (tmpl) {
    body = interpolate(tmpl.body_html, { fullName, workspaceName })
      + actionButton('התחבר עכשיו →', `${frontendUrl()}/login`);
    await sendMail({ to, subject: tmpl.subject, html: htmlWrapper(body, to), templateName: 'approval', workspaceId });
  } else {
    body = `<h2 style="margin:0;color:#111827;font-size:24px;font-weight:700;">החשבון אושר! ✅</h2>
      <p style="margin:16px 0;color:#374151;font-size:15px;line-height:1.7;">שלום <strong>${fullName}</strong>, החשבון שלך ב-<strong>${workspaceName}</strong> אושר בהצלחה!</p>
      ${actionButton('התחבר עכשיו →', `${frontendUrl()}/login`)}`;
    await sendMail({ to, subject: '✅ החשבון שלך אושר — ברוך הבא ל-GroupPulse!', html: htmlWrapper(body, to), templateName: 'approval', workspaceId });
  }
}

/** 4. Rejection email */
export async function sendRejectionEmail(opts: {
  to: string;
  fullName: string;
  reason?: string;
  workspaceId?: string;
}): Promise<void> {
  const { to, fullName, reason, workspaceId } = opts;

  const tmpl = await db('email_templates').where({ name: 'rejection', is_active: true }).first();
  const reasonBlock = reason
    ? `<div style="background:#fff7ed;border-right:4px solid #f97316;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;color:#374151;font-size:14px;"><strong>סיבה:</strong> ${reason}</p>
      </div>`
    : '';

  let body: string;
  if (tmpl) {
    body = interpolate(tmpl.body_html, { fullName }) + reasonBlock;
    await sendMail({ to, subject: tmpl.subject, html: htmlWrapper(body, to), templateName: 'rejection', workspaceId });
  } else {
    body = `<h2 style="margin:0 0 16px;color:#111827;font-size:22px;font-weight:700;">שלום ${fullName},</h2>
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">לצערנו לא נוכל לאשר את הצטרפותך בשלב זה.</p>
      ${reasonBlock}`;
    await sendMail({ to, subject: 'עדכון לגבי הבקשה שלך ל-GroupPulse', html: htmlWrapper(body, to), templateName: 'rejection', workspaceId });
  }
}

/** 5. Newsletter — send to one recipient (caller handles looping) */
export async function sendNewsletterEmail(opts: {
  to: string;
  subject: string;
  content: string;
  workspaceId?: string;
}): Promise<void> {
  const { to, subject, content, workspaceId } = opts;

  const tmpl = await db('email_templates').where({ name: 'newsletter', is_active: true }).first();
  let body: string;
  if (tmpl) {
    body = interpolate(tmpl.body_html, { subject, content });
  } else {
    body = `<h2 style="margin:0 0 16px;color:#111827;font-size:24px;font-weight:700;">${subject}</h2>
      <div style="color:#374151;font-size:15px;line-height:1.8;">${content}</div>`;
  }
  const emailSubject = tmpl ? interpolate(tmpl.subject, { subject }) : subject;
  await sendMail({ to, subject: emailSubject, html: htmlWrapper(body, to), templateName: 'newsletter', workspaceId });
}

/** 6. Receipt / invoice email */
export async function sendReceiptEmail(opts: {
  to: string;
  invoiceNumber: string;
  description: string;
  amount: number;
  currency: string;
  issuedAt: string;
  downloadUrl?: string;
  workspaceId?: string;
}): Promise<void> {
  const { to, invoiceNumber, description, amount, currency, issuedAt, downloadUrl, workspaceId } = opts;

  const tmpl = await db('email_templates').where({ name: 'receipt', is_active: true }).first();
  const vars = {
    invoiceNumber,
    description,
    amount: String(amount),
    currency,
    issuedAt: new Date(issuedAt).toLocaleDateString('he-IL'),
  };

  let body: string;
  if (tmpl) {
    body = interpolate(tmpl.body_html, vars);
  } else {
    body = `<h2 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">🧾 קבלה / חשבונית</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">תאריך: ${vars.issuedAt}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;overflow:hidden;margin:0 0 24px;">
        <tr><td style="padding:14px 20px;color:#6b7280;font-size:13px;font-weight:600;width:40%;border-bottom:1px solid #e5e7eb;">מס׳ חשבונית</td><td style="padding:14px 20px;color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">${invoiceNumber}</td></tr>
        <tr><td style="padding:14px 20px;color:#6b7280;font-size:13px;font-weight:600;width:40%;border-bottom:1px solid #e5e7eb;">תיאור</td><td style="padding:14px 20px;color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">${description}</td></tr>
        <tr><td style="padding:14px 20px;color:#6b7280;font-size:13px;font-weight:600;width:40%;">סכום</td><td style="padding:14px 20px;color:#111827;font-size:16px;font-weight:700;">${amount} ${currency}</td></tr>
      </table>
      <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">תודה רבה על האמון! לכל שאלה הקשורה לחשבונית זו, אנא צור קשר.</p>`;
  }

  const subject = tmpl
    ? interpolate(tmpl.subject, vars)
    : `🧾 קבלה מס׳ ${invoiceNumber} — GroupPulse`;

  if (downloadUrl) {
    body += actionButton('הורד חשבונית PDF ↓', downloadUrl);
  }

  await sendMail({ to, subject, html: htmlWrapper(body, to), templateName: 'receipt', workspaceId });
}
