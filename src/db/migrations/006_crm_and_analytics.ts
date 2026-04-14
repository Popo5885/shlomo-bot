import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── pipelines + stages (must come before pipeline_deals) ──
  await knex.raw(`
    CREATE TABLE pipelines (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name            VARCHAR(255) NOT NULL,
      is_default      BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE pipeline_stages (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pipeline_id     UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      name            VARCHAR(100) NOT NULL,
      color           VARCHAR(7),
      sort_order      SMALLINT NOT NULL,
      is_won          BOOLEAN DEFAULT FALSE,
      is_lost         BOOLEAN DEFAULT FALSE,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── contacts ──
  await knex.raw(`
    CREATE TABLE contacts (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      full_name           VARCHAR(255),
      phone               VARCHAR(50),
      email               VARCHAR(255),
      platform            VARCHAR(30),
      platform_user_id    VARCHAR(255),
      source_group_id     UUID REFERENCES source_groups(id),
      tags                TEXT[],
      notes               TEXT,
      custom_fields       JSONB,
      is_lead             BOOLEAN DEFAULT FALSE,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, platform, platform_user_id)
    );

    CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
    CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
  `);

  // ── pipeline_deals ──
  await knex.raw(`
    CREATE TABLE pipeline_deals (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      pipeline_id     UUID NOT NULL REFERENCES pipelines(id),
      stage_id        UUID NOT NULL REFERENCES pipeline_stages(id),
      contact_id      UUID REFERENCES contacts(id),
      title           VARCHAR(255) NOT NULL,
      value           NUMERIC(12,2),
      currency        VARCHAR(3) DEFAULT 'ILS',
      assigned_to     UUID REFERENCES workspace_members(id),
      notes           TEXT,
      closed_at       TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── lead_signals ──
  await knex.raw(`
    CREATE TABLE lead_signals (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id        UUID NOT NULL REFERENCES workspaces(id),
      contact_id          UUID REFERENCES contacts(id),
      source_group_id     UUID REFERENCES source_groups(id),
      platform_msg_id     VARCHAR(500),
      message_text        TEXT,
      signal_type         VARCHAR(50),
      confidence_score    NUMERIC(3,2),
      detected_at         TIMESTAMPTZ DEFAULT NOW(),
      is_processed        BOOLEAN DEFAULT FALSE,
      pipeline_deal_id    UUID REFERENCES pipeline_deals(id)
    );
  `);

  // ── dispatch_stats_daily ──
  await knex.raw(`
    CREATE TABLE dispatch_stats_daily (
      id                  BIGSERIAL PRIMARY KEY,
      workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      stat_date           DATE NOT NULL,
      destination_id      UUID REFERENCES destinations(id),
      campaign_id         UUID REFERENCES campaigns(id),
      rule_id             UUID REFERENCES distribution_rules(id),
      platform            VARCHAR(30),
      destination_type    VARCHAR(30),

      total_sent          INTEGER DEFAULT 0,
      total_delivered     INTEGER DEFAULT 0,
      total_failed        INTEGER DEFAULT 0,
      success_rate        NUMERIC(5,2),

      UNIQUE(workspace_id, stat_date, destination_id, campaign_id, rule_id)
    );

    CREATE INDEX idx_stats_workspace_date ON dispatch_stats_daily(workspace_id, stat_date DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS dispatch_stats_daily CASCADE');
  await knex.raw('DROP TABLE IF EXISTS lead_signals CASCADE');
  await knex.raw('DROP TABLE IF EXISTS pipeline_deals CASCADE');
  await knex.raw('DROP TABLE IF EXISTS contacts CASCADE');
  await knex.raw('DROP TABLE IF EXISTS pipeline_stages CASCADE');
  await knex.raw('DROP TABLE IF EXISTS pipelines CASCADE');
}
