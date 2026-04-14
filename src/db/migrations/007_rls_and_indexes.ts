import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Performance indexes ──
  await knex.raw(`
    -- Queue: pending messages ready to send
    CREATE INDEX idx_queue_scheduled ON message_queue(scheduled_send_at, status)
      WHERE status = 'pending';

    -- Queue: failed messages ready to retry
    CREATE INDEX idx_queue_retry ON message_queue(next_retry_at)
      WHERE status = 'failed' AND retry_count < max_retries;

    -- CRM: phone lookup
    CREATE INDEX idx_contacts_phone ON contacts(workspace_id, phone);

    -- Leads: unprocessed signals
    CREATE INDEX idx_lead_signals_unprocessed ON lead_signals(workspace_id, detected_at)
      WHERE is_processed = FALSE;

    -- Error logs: unresolved
    CREATE INDEX idx_error_logs_unresolved ON system_error_logs(created_at DESC)
      WHERE resolved = FALSE;
  `);

  // ── Row-Level Security policies ──
  await knex.raw(`
    -- Super admin tables: only accessible with super_admin role
    ALTER TABLE system_error_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY super_admin_only_errors ON system_error_logs
      USING (current_setting('app.current_role', true) = 'super_admin');

    ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY super_admin_only_api_logs ON api_request_logs
      USING (current_setting('app.current_role', true) = 'super_admin');

    ALTER TABLE server_health_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY super_admin_only_health ON server_health_logs
      USING (current_setting('app.current_role', true) = 'super_admin');

    -- Workspace isolation: clients can only see their own workspace data
    ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
    CREATE POLICY workspace_isolation ON workspaces
      USING (
        id = current_setting('app.current_workspace_id', true)::UUID
        OR current_setting('app.current_role', true) = 'super_admin'
      );

    ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY workspace_isolation_accounts ON connected_accounts
      USING (
        workspace_id = current_setting('app.current_workspace_id', true)::UUID
        OR current_setting('app.current_role', true) = 'super_admin'
      );

    ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;
    CREATE POLICY workspace_isolation_queue ON message_queue
      USING (
        workspace_id = current_setting('app.current_workspace_id', true)::UUID
        OR current_setting('app.current_role', true) = 'super_admin'
      );
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop RLS policies
  await knex.raw(`
    DROP POLICY IF EXISTS workspace_isolation_queue ON message_queue;
    ALTER TABLE message_queue DISABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS workspace_isolation_accounts ON connected_accounts;
    ALTER TABLE connected_accounts DISABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS workspace_isolation ON workspaces;
    ALTER TABLE workspaces DISABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS super_admin_only_health ON server_health_logs;
    ALTER TABLE server_health_logs DISABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS super_admin_only_api_logs ON api_request_logs;
    ALTER TABLE api_request_logs DISABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS super_admin_only_errors ON system_error_logs;
    ALTER TABLE system_error_logs DISABLE ROW LEVEL SECURITY;
  `);

  // Drop extra indexes
  await knex.raw(`
    DROP INDEX IF EXISTS idx_error_logs_unresolved;
    DROP INDEX IF EXISTS idx_lead_signals_unprocessed;
    DROP INDEX IF EXISTS idx_contacts_phone;
    DROP INDEX IF EXISTS idx_queue_retry;
    DROP INDEX IF EXISTS idx_queue_scheduled;
  `);
}
