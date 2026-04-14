import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Shabbat settings table
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS shabbat_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      is_enabled BOOLEAN DEFAULT false,
      city VARCHAR(50) DEFAULT 'jerusalem',
      custom_start_offset_min INT DEFAULT 0,
      custom_end_offset_min INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(workspace_id)
    );
  `);

  // 2. Add hash_strip and link_preview_disabled to distribution_rules
  await knex.raw(`
    ALTER TABLE distribution_rules
    ADD COLUMN IF NOT EXISTS hash_strip_enabled BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS forward_polls BOOLEAN DEFAULT true;
  `);

  // 3. Queue freeze / fallback rotation
  await knex.raw(`
    ALTER TABLE message_queue
    ADD COLUMN IF NOT EXISTS original_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS paused_reason VARCHAR(100);
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS account_fallback_rotation (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      primary_account_id UUID NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
      fallback_account_ids UUID[] NOT NULL DEFAULT '{}',
      rotation_order INT DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // 4. Drip campaigns (multi-step sequences)
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS campaign_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      step_order INT NOT NULL DEFAULT 0,
      message_text TEXT,
      media_url TEXT,
      media_type VARCHAR(20),
      delay_after_prev_minutes INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(campaign_id, step_order)
    );
  `);

  // 5. Add failure_reason columns visible to frontend
  await knex.raw(`
    ALTER TABLE message_dispatches
    ADD COLUMN IF NOT EXISTS failure_reason TEXT;
  `);

  // 6. CRM leads table enhancements
  await knex.raw(`
    ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS source_group_jid VARCHAR(100),
    ADD COLUMN IF NOT EXISTS detected_intent TEXT,
    ADD COLUMN IF NOT EXISTS intent_confidence FLOAT DEFAULT 0;
  `);

  // 7. Feature requests table
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS feature_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
      requested_by UUID REFERENCES workspace_members(id) ON DELETE SET NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
      admin_note TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // 8. Suffix per destination overrides
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS destination_suffix_overrides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_id UUID NOT NULL REFERENCES distribution_rules(id) ON DELETE CASCADE,
      destination_id UUID NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
      suffix_mode VARCHAR(20) DEFAULT 'default' CHECK (suffix_mode IN ('default', 'custom', 'none', 'telegram')),
      custom_suffix TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(rule_id, destination_id)
    );
  `);

  // 9. Top banner per rule
  await knex.raw(`
    ALTER TABLE distribution_rules
    ADD COLUMN IF NOT EXISTS top_banner TEXT,
    ADD COLUMN IF NOT EXISTS top_banner_enabled BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS telegram_suffix TEXT,
    ADD COLUMN IF NOT EXISTS telegram_suffix_enabled BOOLEAN DEFAULT false;
  `);

  // 10. Authorized senders enhancements
  await knex.raw(`
    ALTER TABLE distribution_rules
    ADD COLUMN IF NOT EXISTS authorized_senders_mode VARCHAR(20) DEFAULT 'all' CHECK (authorized_senders_mode IN ('all', 'specific')),
    ADD COLUMN IF NOT EXISTS authorized_phone_numbers TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS sender_permissions JSONB DEFAULT '{}';
  `);

  // 11. Invoices/Receipts
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      invoice_number VARCHAR(50) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'ILS',
      status VARCHAR(20) DEFAULT 'paid',
      issued_at TIMESTAMPTZ DEFAULT now(),
      pdf_url TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // 12. System error auto-heal tracking
  await knex.raw(`
    ALTER TABLE system_error_logs
    ADD COLUMN IF NOT EXISTS auto_heal_attempted BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS auto_heal_result TEXT;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS destination_suffix_overrides CASCADE');
  await knex.raw('DROP TABLE IF EXISTS campaign_steps CASCADE');
  await knex.raw('DROP TABLE IF EXISTS feature_requests CASCADE');
  await knex.raw('DROP TABLE IF EXISTS invoices CASCADE');
  await knex.raw('DROP TABLE IF EXISTS shabbat_settings CASCADE');
  await knex.raw('DROP TABLE IF EXISTS account_fallback_rotation CASCADE');

  await knex.raw('ALTER TABLE distribution_rules DROP COLUMN IF EXISTS hash_strip_enabled');
  await knex.raw('ALTER TABLE distribution_rules DROP COLUMN IF EXISTS forward_polls');
  await knex.raw('ALTER TABLE distribution_rules DROP COLUMN IF EXISTS top_banner');
  await knex.raw('ALTER TABLE distribution_rules DROP COLUMN IF EXISTS top_banner_enabled');
  await knex.raw('ALTER TABLE distribution_rules DROP COLUMN IF EXISTS telegram_suffix');
  await knex.raw('ALTER TABLE distribution_rules DROP COLUMN IF EXISTS telegram_suffix_enabled');
  await knex.raw('ALTER TABLE distribution_rules DROP COLUMN IF EXISTS authorized_senders_mode');
  await knex.raw('ALTER TABLE distribution_rules DROP COLUMN IF EXISTS authorized_phone_numbers');
  await knex.raw('ALTER TABLE distribution_rules DROP COLUMN IF EXISTS sender_permissions');

  await knex.raw('ALTER TABLE message_queue DROP COLUMN IF EXISTS original_status');
  await knex.raw('ALTER TABLE message_queue DROP COLUMN IF EXISTS paused_reason');
  await knex.raw('ALTER TABLE message_dispatches DROP COLUMN IF EXISTS failure_reason');
  await knex.raw('ALTER TABLE contacts DROP COLUMN IF EXISTS source_group_jid');
  await knex.raw('ALTER TABLE contacts DROP COLUMN IF EXISTS detected_intent');
  await knex.raw('ALTER TABLE contacts DROP COLUMN IF EXISTS intent_confidence');
  await knex.raw('ALTER TABLE system_error_logs DROP COLUMN IF EXISTS auto_heal_attempted');
  await knex.raw('ALTER TABLE system_error_logs DROP COLUMN IF EXISTS auto_heal_result');
}
