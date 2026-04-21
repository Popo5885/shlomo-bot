import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Workspace onboarding status + contact info
  await knex.raw(`
    ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'
      CHECK (status IN ('pending', 'active', 'suspended')),
    ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);
  `);

  // For existing workspaces that are already active, set status='active'
  await knex.raw(`
    UPDATE workspaces SET status = 'active' WHERE is_active = true AND status = 'pending';
  `);

  // 2. Contract signing fields on workspaces
  await knex.raw(`
    ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS contract_signed BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS contract_version VARCHAR(50) DEFAULT 'v1',
    ADD COLUMN IF NOT EXISTS contract_document_url TEXT,
    ADD COLUMN IF NOT EXISTS contract_revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS contract_revoked_reason TEXT;
  `);

  // Existing active workspaces skip the contract requirement (grandfather clause)
  await knex.raw(`
    UPDATE workspaces SET contract_signed = true, contract_signed_at = now() WHERE status = 'active';
  `);

  // 3. Permanent standalone connection token for each WhatsApp account
  await knex.raw(`
    ALTER TABLE connected_accounts
    ADD COLUMN IF NOT EXISTS connection_token UUID UNIQUE DEFAULT gen_random_uuid();
  `);

  // Backfill tokens for existing accounts
  await knex.raw(`
    UPDATE connected_accounts
    SET connection_token = gen_random_uuid()
    WHERE connection_token IS NULL;
  `);

  // 4. Enhance invoices table for local file storage
  await knex.raw(`
    ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS file_path TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS uploaded_by TEXT;
  `);

  // 5. Admin global settings (contract template URL, etc.)
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await knex.raw(`
    INSERT INTO admin_settings (key, value) VALUES
      ('default_contract_url', ''),
      ('default_contract_version', 'v1'),
      ('site_name', 'GroupPulse')
    ON CONFLICT (key) DO NOTHING;
  `);

  // 6. Enhance feature_requests for public (anonymous) submissions
  await knex.raw(`
    ALTER TABLE feature_requests
    ADD COLUMN IF NOT EXISTS submitter_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS votes INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS ai_group VARCHAR(255);
  `);

  // 7. Index for fast token lookups
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_connected_accounts_token ON connected_accounts(connection_token);
  `);

  // 8. Index for workspace status
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_connected_accounts_token');
  await knex.raw('DROP INDEX IF EXISTS idx_workspaces_status');
  await knex.raw('DROP TABLE IF EXISTS admin_settings CASCADE');

  await knex.raw('ALTER TABLE workspaces DROP COLUMN IF EXISTS status');
  await knex.raw('ALTER TABLE workspaces DROP COLUMN IF EXISTS contact_phone');
  await knex.raw('ALTER TABLE workspaces DROP COLUMN IF EXISTS contract_signed');
  await knex.raw('ALTER TABLE workspaces DROP COLUMN IF EXISTS contract_signed_at');
  await knex.raw('ALTER TABLE workspaces DROP COLUMN IF EXISTS contract_version');
  await knex.raw('ALTER TABLE workspaces DROP COLUMN IF EXISTS contract_document_url');
  await knex.raw('ALTER TABLE workspaces DROP COLUMN IF EXISTS contract_revoked_at');
  await knex.raw('ALTER TABLE workspaces DROP COLUMN IF EXISTS contract_revoked_reason');

  await knex.raw('ALTER TABLE connected_accounts DROP COLUMN IF EXISTS connection_token');

  await knex.raw('ALTER TABLE invoices DROP COLUMN IF EXISTS file_path');
  await knex.raw('ALTER TABLE invoices DROP COLUMN IF EXISTS description');
  await knex.raw('ALTER TABLE invoices DROP COLUMN IF EXISTS uploaded_by');

  await knex.raw('ALTER TABLE feature_requests DROP COLUMN IF EXISTS submitter_email');
  await knex.raw('ALTER TABLE feature_requests DROP COLUMN IF EXISTS votes');
  await knex.raw('ALTER TABLE feature_requests DROP COLUMN IF EXISTS ai_group');
}
