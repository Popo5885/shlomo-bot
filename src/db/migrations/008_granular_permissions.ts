import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add allowed_destination_ids to workspace_members for granular group permissions
  // NULL = unrestricted (full access), empty array = no access, array of UUIDs = only those destinations
  await knex.raw(`
    ALTER TABLE workspace_members
    ADD COLUMN allowed_destination_ids UUID[] DEFAULT NULL;

    CREATE INDEX idx_members_dest_ids
    ON workspace_members USING GIN(allowed_destination_ids)
    WHERE allowed_destination_ids IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_members_dest_ids;
    ALTER TABLE workspace_members DROP COLUMN IF EXISTS allowed_destination_ids;
  `);
}
