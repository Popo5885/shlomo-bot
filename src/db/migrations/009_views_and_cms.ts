import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add views_count to message_dispatches for read receipt tracking
  await knex.raw(`
    ALTER TABLE message_dispatches
    ADD COLUMN views_count INTEGER DEFAULT 0;

    CREATE INDEX idx_dispatches_platform_msg
    ON message_dispatches(platform_msg_id)
    WHERE platform_msg_id IS NOT NULL;
  `);

  // Create system_texts table for dynamic CMS
  await knex.raw(`
    CREATE TABLE system_texts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key             VARCHAR(100) UNIQUE NOT NULL,
      value           TEXT NOT NULL DEFAULT '',
      category        VARCHAR(50) NOT NULL DEFAULT 'general',
      description     VARCHAR(255),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_system_texts_category ON system_texts(category);
  `);

  // Seed default brand/CMS texts
  await knex('system_texts').insert([
    { key: 'brand_name', value: 'שליחת תפוצה לקבוצות', category: 'branding', description: 'שם המותג הראשי' },
    { key: 'business_name', value: 'שלמה פופוביץ פתרונות אוטמציה לעסקים', category: 'branding', description: 'שם העסק הרשמי' },
    { key: 'brand_tagline', value: 'מערכת שליחת הודעות מתקדמת לקבוצות', category: 'branding', description: 'תיאור קצר של המותג' },
    { key: 'login_title', value: 'שליחת תפוצה לקבוצות', category: 'auth', description: 'כותרת דף התחברות' },
    { key: 'login_subtitle', value: 'ברוכים השבים — התחבר לסביבת העבודה שלך', category: 'auth', description: 'תת כותרת דף התחברות' },
    { key: 'sidebar_title', value: 'שליחת תפוצה לקבוצות', category: 'navigation', description: 'כותרת בסרגל הצד' },
    { key: 'dashboard_welcome', value: 'מרכז הבקרה', category: 'dashboard', description: 'כותרת דף הבית' },
    { key: 'footer_copyright', value: '© 2026 שלמה פופוביץ פתרונות אוטמציה לעסקים. כל הזכויות שמורות.', category: 'general', description: 'טקסט זכויות יוצרים' },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP TABLE IF EXISTS system_texts;
    DROP INDEX IF EXISTS idx_dispatches_platform_msg;
    ALTER TABLE message_dispatches DROP COLUMN IF EXISTS views_count;
  `);
}
