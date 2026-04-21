import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add referral_code to workspaces
  await knex.raw(`
    ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE,
    ADD COLUMN IF NOT EXISTS referred_by_code VARCHAR(20);
  `);

  // Add referral tracking table
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS referral_conversions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      referred_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      discount_applied  BOOLEAN DEFAULT false,
      created_at    TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Generate referral codes for all existing workspaces that don't have one
  await knex.raw(`
    UPDATE workspaces
    SET referral_code = UPPER(SUBSTRING(MD5(id::text || 'ref_salt_2026'), 1, 8))
    WHERE referral_code IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS referral_conversions CASCADE');
  await knex.raw('ALTER TABLE workspaces DROP COLUMN IF EXISTS referral_code');
  await knex.raw('ALTER TABLE workspaces DROP COLUMN IF EXISTS referred_by_code');
}
