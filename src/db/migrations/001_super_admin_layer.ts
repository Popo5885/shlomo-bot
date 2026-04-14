import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── super_admins ──
  await knex.raw(`
    CREATE TABLE super_admins (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email           VARCHAR(255) UNIQUE NOT NULL,
      password_hash   TEXT NOT NULL,
      full_name       VARCHAR(255),
      mfa_secret      TEXT,
      last_login_at   TIMESTAMPTZ,
      ip_whitelist    TEXT[],
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // ── system_error_logs ──
  // Note: workspace_id FK added in migration 002 after workspaces table exists
  await knex.raw(`
    CREATE TABLE system_error_logs (
      id              BIGSERIAL PRIMARY KEY,
      error_id        UUID DEFAULT gen_random_uuid(),
      workspace_id    UUID,
      severity        VARCHAR(20) NOT NULL
                      CHECK (severity IN ('DEBUG','INFO','WARN','ERROR','CRITICAL')),
      source          VARCHAR(100),
      error_code      VARCHAR(50),
      message         TEXT NOT NULL,
      stack_trace     TEXT,
      request_payload JSONB,
      metadata        JSONB,
      resolved        BOOLEAN DEFAULT FALSE,
      resolved_by     UUID REFERENCES super_admins(id),
      resolved_at     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_error_logs_severity ON system_error_logs(severity);
    CREATE INDEX idx_error_logs_created ON system_error_logs(created_at DESC);
  `);

  // ── api_request_logs ──
  await knex.raw(`
    CREATE TABLE api_request_logs (
      id                BIGSERIAL PRIMARY KEY,
      workspace_id      UUID,
      platform          VARCHAR(30) NOT NULL
                        CHECK (platform IN ('WHATSAPP_WEB','WHATSAPP_BUSINESS_API','TELEGRAM_BOT','TELEGRAM_USERBOT')),
      connected_account_id UUID,
      direction         VARCHAR(10) CHECK (direction IN ('OUTBOUND','INBOUND')),
      endpoint          TEXT,
      method            VARCHAR(10),
      request_headers   JSONB,
      request_body      JSONB,
      response_status   INTEGER,
      response_body     JSONB,
      response_time_ms  INTEGER,
      is_rate_limited   BOOLEAN DEFAULT FALSE,
      retry_count       SMALLINT DEFAULT 0,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_api_logs_platform ON api_request_logs(platform, created_at DESC);
    CREATE INDEX idx_api_logs_status ON api_request_logs(response_status);
  `);

  // ── server_health_logs ──
  await knex.raw(`
    CREATE TABLE server_health_logs (
      id              BIGSERIAL PRIMARY KEY,
      metric_name     VARCHAR(100) NOT NULL,
      metric_value    NUMERIC,
      unit            VARCHAR(30),
      worker_id       VARCHAR(100),
      node_id         VARCHAR(100),
      tags            JSONB,
      recorded_at     TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_health_metric ON server_health_logs(metric_name, recorded_at DESC);
  `);

  // ── platform_api_status ──
  await knex.raw(`
    CREATE TABLE platform_api_status (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      platform        VARCHAR(50) UNIQUE NOT NULL,
      is_operational  BOOLEAN DEFAULT TRUE,
      last_checked_at TIMESTAMPTZ,
      incident_note   TEXT,
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS platform_api_status CASCADE');
  await knex.raw('DROP TABLE IF EXISTS server_health_logs CASCADE');
  await knex.raw('DROP TABLE IF EXISTS api_request_logs CASCADE');
  await knex.raw('DROP TABLE IF EXISTS system_error_logs CASCADE');
  await knex.raw('DROP TABLE IF EXISTS super_admins CASCADE');
}
