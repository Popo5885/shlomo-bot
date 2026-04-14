import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── workspaces ──
  await knex.raw(`
    CREATE TABLE workspaces (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name              VARCHAR(255) NOT NULL,
      slug              VARCHAR(100) UNIQUE NOT NULL,
      plan              VARCHAR(50) DEFAULT 'trial'
                        CHECK (plan IN ('trial','starter','pro','enterprise')),
      plan_limits       JSONB DEFAULT '{"max_destinations":100,"max_campaigns":50,"max_members":10,"monthly_messages":10000}',
      owner_email       VARCHAR(255) NOT NULL,
      timezone          VARCHAR(100) DEFAULT 'Asia/Jerusalem',
      is_active         BOOLEAN DEFAULT TRUE,
      trial_ends_at     TIMESTAMPTZ,
      billing_info      JSONB,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── workspace_roles (must come before workspace_members due to FK) ──
  await knex.raw(`
    CREATE TABLE workspace_roles (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name                  VARCHAR(100) NOT NULL,
      slug                  VARCHAR(50) NOT NULL,
      can_send_free         BOOLEAN DEFAULT FALSE,
      requires_approval     BOOLEAN DEFAULT TRUE,
      can_approve_messages  BOOLEAN DEFAULT FALSE,
      can_global_delete     BOOLEAN DEFAULT FALSE,
      can_manage_campaigns  BOOLEAN DEFAULT FALSE,
      can_manage_members    BOOLEAN DEFAULT FALSE,
      can_manage_destinations BOOLEAN DEFAULT FALSE,
      can_view_analytics    BOOLEAN DEFAULT TRUE,
      can_manage_crm        BOOLEAN DEFAULT FALSE,
      can_manage_bot_settings BOOLEAN DEFAULT FALSE,
      is_system_role        BOOLEAN DEFAULT FALSE,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, slug)
    );
  `);

  // ── workspace_members ──
  await knex.raw(`
    CREATE TABLE workspace_members (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      email           VARCHAR(255) NOT NULL,
      full_name       VARCHAR(255),
      password_hash   TEXT,
      avatar_url      TEXT,
      role_id         UUID REFERENCES workspace_roles(id),
      is_owner        BOOLEAN DEFAULT FALSE,
      is_active       BOOLEAN DEFAULT TRUE,
      last_login_at   TIMESTAMPTZ,
      invited_by      UUID REFERENCES workspace_members(id),
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(workspace_id, email)
    );
  `);

  // ── Add deferred FKs from migration 001 ──
  await knex.raw(`
    ALTER TABLE system_error_logs
      ADD CONSTRAINT fk_error_logs_workspace
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id);

    CREATE INDEX idx_error_logs_workspace ON system_error_logs(workspace_id);

    ALTER TABLE api_request_logs
      ADD CONSTRAINT fk_api_logs_workspace
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id);

    CREATE INDEX idx_api_logs_workspace ON api_request_logs(workspace_id, created_at DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE api_request_logs DROP CONSTRAINT IF EXISTS fk_api_logs_workspace');
  await knex.raw('ALTER TABLE system_error_logs DROP CONSTRAINT IF EXISTS fk_error_logs_workspace');
  await knex.raw('DROP INDEX IF EXISTS idx_error_logs_workspace');
  await knex.raw('DROP INDEX IF EXISTS idx_api_logs_workspace');
  await knex.raw('DROP TABLE IF EXISTS workspace_members CASCADE');
  await knex.raw('DROP TABLE IF EXISTS workspace_roles CASCADE');
  await knex.raw('DROP TABLE IF EXISTS workspaces CASCADE');
}
