/**
 * Email Service — Gmail SMTP via Nodemailer
 *
 * Sends transactional Hebrew emails:
 *   - Welcome email on new signup (to registrant)
 *   - Owner notification on new signup (to admin)
 *   - Approval confirmation when admin approves a member (to member)
 *   - Rejection notification when admin rejects a member (to member)
 *
 * Requires in .env:
 *   EMAIL_FROM        — sender Gmail address (e.g. aknvpupuch@gmail.com)
 *   EMAIL_APP_PASSWORD — Gmail App Password (NOT the regular Gmail password)
 *   OWNER_EMAIL       — admin notification target (e.g. aknvpupuch@gmail.com)
 *   FRONTEND_URL      — base URL for links in emails
 */

import nodemailer from 'nodemailer';
import { logger } from '../../utils/logger.js';

// ── Transporter ──────────────────────────────────────────────
function createTransporter() {
  const user = process.env.EMAIL_FROM;
  const pass = process.env.EMAIL_APP_PASSWORD;

  if (!user || !pass) {
    logger.warn('Email not configured — EMAIL_FROM or EMAIL_APP_PASSWORD missing. Skipping email send.');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

const FROM_NAME = 'GroupPulse';

function fromAddress(): string {
  const email = process.env.EMAIL_FROM || 'noreply@grouppulse.app';
  return `"${FROM_NAME}" <${email}>`;
}

function frontendUrl(): string {
  const u = process.env.FRONTEND_URL || 'http://localhost:3001';
  // Always use the first URL if comma-separated
  return u.split(',')[0].trim();
}

// ── Generic send helper ──────────────────────────────────────
async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) return;

  try {
    const info = await transporter.sendMail({
      from: fromAddress(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    logger.info(`Email sent to ${opts.to} — messageId: ${info.messageId}`);
  } catch (err) {
    // Never crash the caller — email is best-effort
    logger.error(`Failed to send email to ${opts.to}:`, err);
  }
}

// ── Shared HTML wrapper ──────────────────────────────────────
function htmlWrapper(content: string): string {
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
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© 2026 GroupPulse · כל הזכויות שמורות</p>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:12px;">
                <a href="${frontendUrl()}" style="color:#6366f1;text-decoration:none;">${frontendUrl()}</a>
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

// ════════════════════════════════════════════════════════════
//  PUBLIC EMAIL FUNCTIONS
// ════════════════════════════════════════════════════════════

/**
 * 1. Welcome email → sent to the user who just signed up.
 *    Lets them know their account is under review.
 */
export async function sendWelcomeEmail(opts: {
  to: string;
  fullName: string;
  businessName: string;
}): Promise<void> {
  const { to, fullName, businessName } = opts;

  await sendMail({
    to,
    subject: '🎉 ברוכים הבאים ל-GroupPulse!',
    html: htmlWrapper(`
      <h2 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:700;">שלום ${fullName}! 👋</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.7;">
        ברוכים הבאים ל-<strong>GroupPulse</strong> — פלטפורמת הפצת ההודעות המתקדמת לעסקים בישראל.
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

      <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.7;">
        תקבל מייל נוסף ברגע שהחשבון שלך יאושר ותוכל להתחיל להשתמש במערכת.
      </p>

      ${actionButton('כניסה למערכת', `${frontendUrl()}/login`)}

      <p style="margin:24px 0 0;color:#9ca3af;font-size:13px;text-align:center;">
        לכל שאלה ניתן לפנות אלינו ישירות במייל.
      </p>
    `),
  });
}

/**
 * 2. Owner notification → sent to the admin when a new workspace is created.
 *    Includes quick link to the admin panel.
 */
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

  await sendMail({
    to: ownerEmail,
    subject: `🆕 הרשמה חדשה: ${businessName}`,
    html: htmlWrapper(`
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

      <p style="margin:0 0 8px;color:#374151;font-size:14px;">
        <strong>פעולה נדרשת:</strong> נא לבדוק את הבקשה ולאשר/לדחות אותה בפאנל הניהול.
      </p>

      ${actionButton('כניסה לפאנל הניהול ←', adminUrl)}
    `),
  });
}

/**
 * 3. Approval email → sent to the member when the admin approves them.
 */
export async function sendApprovalEmail(opts: {
  to: string;
  fullName: string;
  workspaceName: string;
}): Promise<void> {
  const { to, fullName, workspaceName } = opts;

  await sendMail({
    to,
    subject: '✅ החשבון שלך אושר — ברוך הבא ל-GroupPulse!',
    html: htmlWrapper(`
      <div style="text-align:center;margin:0 0 32px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:72px;height:72px;background:linear-gradient(135deg,#10b981,#059669);border-radius:20px;margin:0 0 16px;">
          <span style="font-size:36px;">✅</span>
        </div>
        <h2 style="margin:0;color:#111827;font-size:24px;font-weight:700;">החשבון אושר!</h2>
      </div>

      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
        שלום <strong>${fullName}</strong>,<br/>
        אנו שמחים לבשר שהחשבון שלך ב-<strong>${workspaceName}</strong> אושר בהצלחה!
      </p>

      <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
        תוכל כעת להתחבר ולהתחיל להשתמש בכל יכולות המערכת:
      </p>

      <ul style="margin:0 0 24px;padding-right:20px;color:#374151;font-size:14px;line-height:2;">
        <li>📢 שלח תפוצות לקבוצות וערוצים</li>
        <li>🤖 הגדר כללי אוטומציה</li>
        <li>📊 עקוב אחר נתוני השליחה</li>
        <li>🎯 נהל לידים ולקוחות</li>
      </ul>

      ${actionButton('התחבר עכשיו →', `${frontendUrl()}/login`)}

      <p style="margin:24px 0 0;color:#9ca3af;font-size:13px;text-align:center;">
        נתקלת בבעיה? צור איתנו קשר ונשמח לעזור.
      </p>
    `),
  });
}

/**
 * 4. Rejection email → sent to the member when the admin rejects them.
 */
export async function sendRejectionEmail(opts: {
  to: string;
  fullName: string;
  reason?: string;
}): Promise<void> {
  const { to, fullName, reason } = opts;

  await sendMail({
    to,
    subject: 'עדכון לגבי הבקשה שלך ל-GroupPulse',
    html: htmlWrapper(`
      <h2 style="margin:0 0 16px;color:#111827;font-size:22px;font-weight:700;">שלום ${fullName},</h2>

      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
        לאחר בדיקת הבקשה שלך, לצערנו לא נוכל לאשר את הצטרפותך בשלב זה.
      </p>

      ${reason ? `
        <div style="background:#fff7ed;border-right:4px solid #f97316;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
          <p style="margin:0;color:#374151;font-size:14px;"><strong>סיבה:</strong> ${reason}</p>
        </div>
      ` : ''}

      <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.7;">
        אם יש לך שאלות או ברצונך לערער על ההחלטה, אנא צור קשר ישירות עמנו.
      </p>

      ${actionButton('צור קשר', `mailto:${process.env.OWNER_EMAIL || process.env.EMAIL_FROM || ''}`)}
    `),
  });
}
