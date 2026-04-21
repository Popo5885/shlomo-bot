import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Auto-reply settings per workspace
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS auto_reply_settings (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      is_enabled            BOOLEAN DEFAULT false,
      greeting_text         TEXT DEFAULT 'שלום! קיבלנו את הודעתך ונחזור אליך בהקדם 😊',
      send_lead_notification BOOLEAN DEFAULT true,
      notification_phone    VARCHAR(50),
      cooldown_minutes      INT DEFAULT 60,
      created_at            TIMESTAMPTZ DEFAULT now(),
      updated_at            TIMESTAMPTZ DEFAULT now(),
      UNIQUE(workspace_id)
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS auto_reply_settings CASCADE');
}
