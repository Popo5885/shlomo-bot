import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // email_unsubscribes — global per-address opt-out list
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS email_unsubscribes (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       VARCHAR(320) NOT NULL,
      created_at  TIMESTAMPTZ  DEFAULT now(),
      UNIQUE (email)
    );
  `);

  // email_log — audit trail for every outbound email
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS email_log (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id  UUID REFERENCES workspaces(id) ON DELETE SET NULL,
      to_email      VARCHAR(320) NOT NULL,
      subject       VARCHAR(998) NOT NULL,
      template_name VARCHAR(100),
      status        VARCHAR(20)  NOT NULL DEFAULT 'sent'
                    CHECK (status IN ('sent','failed','skipped')),
      error_msg     TEXT,
      sent_at       TIMESTAMPTZ  DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_email_log_sent_at   ON email_log (sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_email_log_workspace ON email_log (workspace_id);
    CREATE INDEX IF NOT EXISTS idx_email_log_to_email  ON email_log (to_email);
  `);

  // email_templates — editable bodies for admin-managed templates
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        VARCHAR(100) NOT NULL UNIQUE,
      label_he    VARCHAR(200) NOT NULL,
      subject     VARCHAR(998) NOT NULL,
      body_html   TEXT         NOT NULL,
      is_active   BOOLEAN      NOT NULL DEFAULT true,
      updated_at  TIMESTAMPTZ  DEFAULT now()
    );
  `);

  // workspace_members — auto-notification toggle (admin-controlled)
  await knex.raw(`
    ALTER TABLE workspace_members
    ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT true;
  `);

  // Seed default templates
  await knex('email_templates').insert([
    {
      name: 'welcome',
      label_he: 'ברוכים הבאים',
      subject: '🎉 ברוכים הבאים ל-GroupPulse!',
      body_html: `<h2 style="margin:0 0 8px;color:#111827;font-size:24px;font-weight:700;">שלום {{fullName}}! 👋</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.7;">
  ברוכים הבאים ל-<strong>GroupPulse</strong> — פלטפורמת הפצת ההודעות המתקדמת לעסקים בישראל.
</p>
<div style="background:#f0f4ff;border-right:4px solid #6366f1;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
  <p style="margin:0;color:#374151;font-size:14px;line-height:1.7;">
    <strong>שם עסק:</strong> {{businessName}}<br/>
    <strong>אימייל:</strong> {{email}}
  </p>
</div>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
  ההרשמה שלך התקבלה בהצלחה! ✅<br/>
  <strong>הצוות שלנו יבדוק את הבקשה ויאשר את החשבון בהקדם האפשרי.</strong>
</p>
<p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.7;">
  תקבל מייל נוסף ברגע שהחשבון שלך יאושר ותוכל להתחיל להשתמש במערכת.
</p>`,
    },
    {
      name: 'approval',
      label_he: 'אישור חשבון',
      subject: '✅ החשבון שלך אושר — ברוך הבא ל-GroupPulse!',
      body_html: `<div style="text-align:center;margin:0 0 32px;">
  <h2 style="margin:0;color:#111827;font-size:24px;font-weight:700;">החשבון אושר! ✅</h2>
</div>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
  שלום <strong>{{fullName}}</strong>,<br/>
  אנו שמחים לבשר שהחשבון שלך ב-<strong>{{workspaceName}}</strong> אושר בהצלחה!
</p>
<ul style="margin:0 0 24px;padding-right:20px;color:#374151;font-size:14px;line-height:2;">
  <li>📢 שלח תפוצות לקבוצות וערוצים</li>
  <li>🤖 הגדר כללי אוטומציה</li>
  <li>📊 עקוב אחר נתוני השליחה</li>
  <li>🎯 נהל לידים ולקוחות</li>
</ul>`,
    },
    {
      name: 'rejection',
      label_he: 'דחיית בקשה',
      subject: 'עדכון לגבי הבקשה שלך ל-GroupPulse',
      body_html: `<h2 style="margin:0 0 16px;color:#111827;font-size:22px;font-weight:700;">שלום {{fullName}},</h2>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;">
  לאחר בדיקת הבקשה שלך, לצערנו לא נוכל לאשר את הצטרפותך בשלב זה.
</p>
<p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.7;">
  אם יש לך שאלות או ברצונך לערער על ההחלטה, אנא צור קשר ישירות עמנו.
</p>`,
    },
    {
      name: 'newsletter',
      label_he: 'ניוזלטר',
      subject: '📣 עדכון חשוב מ-GroupPulse',
      body_html: `<h2 style="margin:0 0 16px;color:#111827;font-size:24px;font-weight:700;">{{subject}}</h2>
<div style="color:#374151;font-size:15px;line-height:1.8;">
  {{content}}
</div>`,
    },
    {
      name: 'receipt',
      label_he: 'קבלה/חשבונית',
      subject: '🧾 קבלה מס׳ {{invoiceNumber}} — GroupPulse',
      body_html: `<h2 style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">🧾 קבלה / חשבונית</h2>
<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">תאריך: {{issuedAt}}</p>

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;overflow:hidden;margin:0 0 24px;">
  <tr>
    <td style="padding:14px 20px;color:#6b7280;font-size:13px;font-weight:600;width:40%;border-bottom:1px solid #e5e7eb;">מס׳ חשבונית</td>
    <td style="padding:14px 20px;color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">{{invoiceNumber}}</td>
  </tr>
  <tr>
    <td style="padding:14px 20px;color:#6b7280;font-size:13px;font-weight:600;width:40%;border-bottom:1px solid #e5e7eb;">תיאור</td>
    <td style="padding:14px 20px;color:#111827;font-size:14px;border-bottom:1px solid #e5e7eb;">{{description}}</td>
  </tr>
  <tr>
    <td style="padding:14px 20px;color:#6b7280;font-size:13px;font-weight:600;width:40%;">סכום</td>
    <td style="padding:14px 20px;color:#111827;font-size:16px;font-weight:700;">{{amount}} {{currency}}</td>
  </tr>
</table>

<p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.7;">
  תודה רבה על האמון! לכל שאלה הקשורה לחשבונית זו, אנא צור קשר.
</p>`,
    },
  ]).onConflict('name').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS email_log`);
  await knex.raw(`DROP TABLE IF EXISTS email_unsubscribes`);
  await knex.raw(`DROP TABLE IF EXISTS email_templates`);
  await knex.raw(`ALTER TABLE workspace_members DROP COLUMN IF EXISTS email_notifications_enabled`);
}
