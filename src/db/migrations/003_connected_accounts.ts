import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE connected_accounts (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      platform            VARCHAR(30) NOT NULL
                          CHECK (platform IN ('WHATSAPP_WEB','WHATSAPP_BUSINESS_API','TELEGRAM_BOT','TELEGRAM_USERBOT')),
      display_name        VARCHAR(255),
      account_identifier  VARCHAR(255),
      auth_data           JSONB,
      webhook_url         TEXT,
      is_connected        BOOLEAN DEFAULT FALSE,
      last_seen_at        TIMESTAMPTZ,
      qr_code_data        TEXT,
      connection_status   VARCHAR(30) DEFAULT 'disconnected'
                          CHECK (connection_status IN ('connected','disconnected','qr_pending','banned','rate_limited')),
      rate_limit_until    TIMESTAMPTZ,
      metadata            JSONB,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_connected_accounts_workspace ON connected_accounts(workspace_id, platform);
  `);

  // Add deferred FK from api_request_logs
  await knex.raw(`
    ALTER TABLE api_request_logs
      ADD CONSTRAINT fk_api_logs_connected_account
      FOREIGN KEY (connected_account_id) REFERENCES connected_accounts(id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE api_request_logs DROP CONSTRAINT IF EXISTS fk_api_logs_connected_account');
  await knex.raw('DROP TABLE IF EXISTS connected_accounts CASCADE');
}
