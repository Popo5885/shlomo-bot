import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add bot_token to connected_accounts for Telegram bot integration
  // Stored as encrypted JSONB payload (via app-level AES-256-GCM, same as auth_data)
  await knex.raw(`
    ALTER TABLE connected_accounts
    ADD COLUMN bot_token JSONB;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE connected_accounts DROP COLUMN IF EXISTS bot_token;
  `);
}
