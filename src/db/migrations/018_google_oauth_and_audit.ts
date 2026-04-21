import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add google_id to workspace_members for OAuth login
  await knex.schema.alterTable('workspace_members', (t) => {
    t.string('google_id').nullable().after('password_hash');
    t.index('google_id');
  });

  // Audit log table
  await knex.schema.createTable('audit_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('workspace_id').notNullable().references('id').inTable('workspaces').onDelete('CASCADE');
    t.uuid('actor_member_id').nullable().references('id').inTable('workspace_members').onDelete('SET NULL');
    t.string('actor_email').nullable();
    t.string('action').notNullable(); // e.g. 'campaign.created', 'member.approved'
    t.string('entity_type').nullable(); // e.g. 'campaign', 'member'
    t.uuid('entity_id').nullable();
    t.jsonb('meta').defaultTo('{}');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['workspace_id', 'created_at']);
  });

  // Message views table for read-receipt tracking
  await knex.schema.createTable('message_views', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('workspace_id').notNullable().references('id').inTable('workspaces').onDelete('CASCADE');
    t.uuid('campaign_id').nullable().references('id').inTable('campaigns').onDelete('SET NULL');
    t.string('wa_message_id').nullable(); // Baileys message ID
    t.string('recipient_jid').notNullable(); // WhatsApp JID of the reader
    t.timestamp('viewed_at').notNullable();
    t.index(['workspace_id', 'campaign_id']);
    t.index('wa_message_id');
    t.unique(['wa_message_id', 'recipient_jid']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('message_views');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.alterTable('workspace_members', (t) => {
    t.dropColumn('google_id');
  });
}
