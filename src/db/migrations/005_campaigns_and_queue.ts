import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── campaigns ──
  await knex.raw(`
    CREATE TABLE campaigns (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name                VARCHAR(255) NOT NULL,
      description         TEXT,
      status              VARCHAR(30) DEFAULT 'draft'
                          CHECK (status IN ('draft','pending_approval','approved','running','paused','completed','cancelled','failed')),
      message_text        TEXT,
      media_url           TEXT,
      media_type          VARCHAR(20)
                          CHECK (media_type IN ('image','video','document','audio', NULL)),
      append_suffix       TEXT,

      scheduled_at        TIMESTAMPTZ,
      started_at          TIMESTAMPTZ,
      completed_at        TIMESTAMPTZ,

      delay_preset        VARCHAR(20) DEFAULT 'medium',
      delay_min_seconds   INTEGER DEFAULT 30,
      delay_max_seconds   INTEGER DEFAULT 60,

      requires_approval   BOOLEAN DEFAULT FALSE,
      approved_by         UUID REFERENCES workspace_members(id),
      approved_at         TIMESTAMPTZ,
      rejection_reason    TEXT,

      total_targets       INTEGER DEFAULT 0,
      sent_count          INTEGER DEFAULT 0,
      delivered_count     INTEGER DEFAULT 0,
      failed_count        INTEGER DEFAULT 0,
      success_rate        NUMERIC(5,2),

      created_by          UUID REFERENCES workspace_members(id),
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_campaigns_workspace ON campaigns(workspace_id, status);
    CREATE INDEX idx_campaigns_scheduled ON campaigns(scheduled_at) WHERE scheduled_at IS NOT NULL;
  `);

  // ── campaign_targets ──
  await knex.raw(`
    CREATE TABLE campaign_targets (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      destination_id  UUID NOT NULL REFERENCES destinations(id),
      sort_order      SMALLINT DEFAULT 0,
      UNIQUE(campaign_id, destination_id)
    );
  `);

  // ── message_queue ──
  await knex.raw(`
    CREATE TABLE message_queue (
      id                    BIGSERIAL PRIMARY KEY,
      queue_id              UUID DEFAULT gen_random_uuid(),
      workspace_id          UUID NOT NULL REFERENCES workspaces(id),

      source_type           VARCHAR(20) NOT NULL
                            CHECK (source_type IN ('trigger','campaign','manual')),
      source_rule_id        UUID REFERENCES distribution_rules(id),
      campaign_id           UUID REFERENCES campaigns(id),

      destination_id        UUID NOT NULL REFERENCES destinations(id),
      connected_account_id  UUID NOT NULL REFERENCES connected_accounts(id),

      message_text          TEXT,
      media_url             TEXT,
      media_type            VARCHAR(20),
      original_platform_msg_id VARCHAR(500),
      append_suffix         TEXT,

      status                VARCHAR(20) DEFAULT 'pending'
                            CHECK (status IN ('pending','processing','sent','failed','cancelled','skipped')),
      priority              SMALLINT DEFAULT 5,
      scheduled_send_at     TIMESTAMPTZ DEFAULT NOW(),
      processing_started_at TIMESTAMPTZ,
      sent_at               TIMESTAMPTZ,

      retry_count           SMALLINT DEFAULT 0,
      max_retries           SMALLINT DEFAULT 3,
      next_retry_at         TIMESTAMPTZ,

      is_delivered          BOOLEAN,
      platform_msg_id       VARCHAR(500),

      failure_reason_internal TEXT,
      failure_display_message VARCHAR(100) DEFAULT 'ההודעה לא נשלחה',

      created_at            TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_queue_status ON message_queue(status, scheduled_send_at);
    CREATE INDEX idx_queue_workspace ON message_queue(workspace_id, status);
    CREATE INDEX idx_queue_destination ON message_queue(destination_id, status);
  `);

  // ── message_dispatches ──
  await knex.raw(`
    CREATE TABLE message_dispatches (
      id                  BIGSERIAL PRIMARY KEY,
      dispatch_id         UUID DEFAULT gen_random_uuid(),
      workspace_id        UUID NOT NULL REFERENCES workspaces(id),
      queue_item_id       BIGINT REFERENCES message_queue(id),
      destination_id      UUID NOT NULL REFERENCES destinations(id),
      campaign_id         UUID REFERENCES campaigns(id),
      rule_id             UUID REFERENCES distribution_rules(id),

      platform            VARCHAR(30) NOT NULL,
      destination_type    VARCHAR(30) NOT NULL,
      platform_msg_id     VARCHAR(500),

      status              VARCHAR(20) NOT NULL
                          CHECK (status IN ('sent','delivered','failed','deleted')),

      sent_at             TIMESTAMPTZ,
      is_success          BOOLEAN,

      response_time_ms    INTEGER,
      http_status_code    INTEGER,
      platform_error_code VARCHAR(100),

      created_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_dispatches_workspace ON message_dispatches(workspace_id, sent_at DESC);
    CREATE INDEX idx_dispatches_campaign ON message_dispatches(campaign_id);
    CREATE INDEX idx_dispatches_destination ON message_dispatches(destination_id, sent_at DESC);
  `);

  // ── approval_requests ──
  await knex.raw(`
    CREATE TABLE approval_requests (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id        UUID NOT NULL REFERENCES workspaces(id),
      requested_by        UUID NOT NULL REFERENCES workspace_members(id),
      reviewed_by         UUID REFERENCES workspace_members(id),

      request_type        VARCHAR(20) NOT NULL
                          CHECK (request_type IN ('campaign_send','rule_activate','manual_message')),
      reference_id        UUID,

      message_preview     TEXT,
      target_count        INTEGER,

      status              VARCHAR(20) DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected','cancelled')),
      reviewer_note       TEXT,
      requested_at        TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at         TIMESTAMPTZ
    );

    CREATE INDEX idx_approvals_workspace ON approval_requests(workspace_id, status);
  `);

  // ── global_delete_events + items ──
  await knex.raw(`
    CREATE TABLE global_delete_events (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id        UUID NOT NULL REFERENCES workspaces(id),
      initiated_by        UUID REFERENCES workspace_members(id),
      original_platform_msg_id VARCHAR(500) NOT NULL,

      total_targets       INTEGER,
      deleted_count       INTEGER DEFAULT 0,
      failed_count        INTEGER DEFAULT 0,
      status              VARCHAR(20) DEFAULT 'running'
                          CHECK (status IN ('running','completed','partial_failure','failed')),

      started_at          TIMESTAMPTZ DEFAULT NOW(),
      completed_at        TIMESTAMPTZ
    );

    CREATE TABLE global_delete_items (
      id                  BIGSERIAL PRIMARY KEY,
      delete_event_id     UUID NOT NULL REFERENCES global_delete_events(id) ON DELETE CASCADE,
      destination_id      UUID NOT NULL REFERENCES destinations(id),
      platform_msg_id     VARCHAR(500),
      status              VARCHAR(20) DEFAULT 'pending'
                          CHECK (status IN ('pending','deleted','failed','not_found')),
      deleted_at          TIMESTAMPTZ,
      failure_reason      TEXT
    );
  `);

  // ── bot_conflict_settings ──
  await knex.raw(`
    CREATE TABLE bot_conflict_settings (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
      rule_id             UUID REFERENCES distribution_rules(id),

      on_bot_conflict     VARCHAR(30) DEFAULT 'run_both'
                          CHECK (on_bot_conflict IN ('run_both','run_distribution_only','run_bot_only','pause_all','notify_admin')),
      bot_detection_keywords TEXT[],
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS bot_conflict_settings CASCADE');
  await knex.raw('DROP TABLE IF EXISTS global_delete_items CASCADE');
  await knex.raw('DROP TABLE IF EXISTS global_delete_events CASCADE');
  await knex.raw('DROP TABLE IF EXISTS approval_requests CASCADE');
  await knex.raw('DROP TABLE IF EXISTS message_dispatches CASCADE');
  await knex.raw('DROP TABLE IF EXISTS message_queue CASCADE');
  await knex.raw('DROP TABLE IF EXISTS campaign_targets CASCADE');
  await knex.raw('DROP TABLE IF EXISTS campaigns CASCADE');
}
