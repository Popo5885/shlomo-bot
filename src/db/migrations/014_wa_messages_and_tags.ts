import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. wa_messages — stores every message seen by connected WhatsApp accounts
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS wa_messages (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      account_id  UUID NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
      jid         TEXT NOT NULL,
      message_id  TEXT NOT NULL,
      sender_jid  TEXT,
      sender_name TEXT,
      content_type VARCHAR(30) NOT NULL DEFAULT 'text',
      text_content TEXT,
      is_from_me  BOOLEAN NOT NULL DEFAULT false,
      ts          TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT now(),
      UNIQUE(account_id, message_id)
    );
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_wa_messages_account_jid_ts
      ON wa_messages(account_id, jid, ts DESC);
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_wa_messages_workspace_ts
      ON wa_messages(workspace_id, ts DESC);
  `);

  // 2. Workspace client tags (TEXT array, no separate table needed)
  await knex.raw(`
    ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
  `);

  // 3. Update default site_name in admin_settings if table exists
  await knex.raw(`
    INSERT INTO admin_settings (key, value) VALUES
      ('site_name', 'שלמה פופוביץ שירותי אוטומציה לעסקים')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  `).catch(() => { /* admin_settings table may not exist yet */ });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS wa_messages CASCADE');
  await knex.raw('ALTER TABLE workspaces DROP COLUMN IF EXISTS tags');
}
