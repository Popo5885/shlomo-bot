import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── source_groups ──
  await knex.raw(`
    CREATE TABLE source_groups (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      connected_account_id UUID NOT NULL REFERENCES connected_accounts(id),
      platform            VARCHAR(30) NOT NULL,
      platform_group_id   VARCHAR(500) NOT NULL,
      display_name        VARCHAR(255),
      description         TEXT,
      group_type          VARCHAR(30)
                          CHECK (group_type IN ('group','channel','supergroup','broadcast_list')),
      is_active           BOOLEAN DEFAULT TRUE,
      trigger_keywords    TEXT[],
      trigger_all         BOOLEAN DEFAULT TRUE,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, connected_account_id, platform_group_id)
    );
  `);

  // ── destinations ──
  await knex.raw(`
    CREATE TABLE destinations (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      connected_account_id UUID NOT NULL REFERENCES connected_accounts(id),
      platform            VARCHAR(30) NOT NULL
                          CHECK (platform IN ('WHATSAPP_WEB','WHATSAPP_BUSINESS_API','TELEGRAM_BOT','TELEGRAM_USERBOT')),
      destination_type    VARCHAR(30) NOT NULL
                          CHECK (destination_type IN ('WA_GROUP','WA_CHANNEL','TG_GROUP','TG_CHANNEL','TG_SUPERGROUP')),
      platform_dest_id    VARCHAR(500) NOT NULL,
      display_name        VARCHAR(255),
      participant_count   INTEGER,
      tags                TEXT[],
      is_active           BOOLEAN DEFAULT TRUE,
      last_message_at     TIMESTAMPTZ,
      metadata            JSONB,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, connected_account_id, platform_dest_id)
    );

    CREATE INDEX idx_destinations_workspace ON destinations(workspace_id, destination_type);
    CREATE INDEX idx_destinations_tags ON destinations USING GIN(tags);
  `);

  // ── distribution_rules ──
  await knex.raw(`
    CREATE TABLE distribution_rules (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name                VARCHAR(255) NOT NULL,
      source_group_id     UUID NOT NULL REFERENCES source_groups(id),
      is_active           BOOLEAN DEFAULT TRUE,

      delay_mode          VARCHAR(20) DEFAULT 'random'
                          CHECK (delay_mode IN ('fixed','random','burst')),
      delay_min_seconds   INTEGER DEFAULT 3,
      delay_max_seconds   INTEGER DEFAULT 10,
      delay_preset        VARCHAR(20)
                          CHECK (delay_preset IN ('fast','medium','slow','custom')),

      append_suffix       TEXT,
      append_suffix_enabled BOOLEAN DEFAULT FALSE,
      forward_media       BOOLEAN DEFAULT TRUE,
      forward_files       BOOLEAN DEFAULT TRUE,
      strip_sender_info   BOOLEAN DEFAULT TRUE,

      requires_approval   BOOLEAN DEFAULT FALSE,
      approved_by         UUID REFERENCES workspace_members(id),
      approved_at         TIMESTAMPTZ,

      total_dispatched    BIGINT DEFAULT 0,
      total_failed        BIGINT DEFAULT 0,

      created_by          UUID REFERENCES workspace_members(id),
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── rule_destinations (many-to-many) ──
  await knex.raw(`
    CREATE TABLE rule_destinations (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_id         UUID NOT NULL REFERENCES distribution_rules(id) ON DELETE CASCADE,
      destination_id  UUID NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
      sort_order      SMALLINT DEFAULT 0,
      is_active       BOOLEAN DEFAULT TRUE,
      added_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(rule_id, destination_id)
    );

    CREATE INDEX idx_rule_destinations_rule ON rule_destinations(rule_id, sort_order);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS rule_destinations CASCADE');
  await knex.raw('DROP TABLE IF EXISTS distribution_rules CASCADE');
  await knex.raw('DROP TABLE IF EXISTS destinations CASCADE');
  await knex.raw('DROP TABLE IF EXISTS source_groups CASCADE');
}
