import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add approval_status to workspace_members for signup approval flow
  await knex.raw(`
    ALTER TABLE workspace_members
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  `);

  // Make source_group_id nullable for "direct bot" trigger rules
  await knex.raw(`
    ALTER TABLE distribution_rules
    ALTER COLUMN source_group_id DROP NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE workspace_members DROP COLUMN IF EXISTS approval_status;
  `);
  await knex.raw(`
    ALTER TABLE distribution_rules
    ALTER COLUMN source_group_id SET NOT NULL;
  `);
}
