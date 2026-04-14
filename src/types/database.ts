// ============================================================
// TypeScript interfaces matching the DB schema tables
// Used by Phase 0 & 1 services. More types will be added as needed.
// ============================================================

export type ConnectionStatus = 'connected' | 'disconnected' | 'qr_pending' | 'banned' | 'rate_limited';
export type Platform = 'WHATSAPP_WEB' | 'WHATSAPP_BUSINESS_API' | 'TELEGRAM_BOT' | 'TELEGRAM_USERBOT';
export type QueueStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled' | 'skipped';
export type DelayMode = 'fixed' | 'random' | 'burst';
export type DelayPreset = 'fast' | 'medium' | 'slow' | 'custom';
export type Severity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface ConnectedAccount {
  id: string;
  workspace_id: string;
  platform: Platform;
  display_name: string | null;
  account_identifier: string | null;
  auth_data: unknown; // Encrypted JSONB
  webhook_url: string | null;
  is_connected: boolean;
  last_seen_at: Date | null;
  qr_code_data: string | null;
  connection_status: ConnectionStatus;
  rate_limit_until: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface MessageQueue {
  id: number;
  queue_id: string;
  workspace_id: string;
  source_type: 'trigger' | 'campaign' | 'manual';
  source_rule_id: string | null;
  campaign_id: string | null;
  destination_id: string;
  connected_account_id: string;
  message_text: string | null;
  media_url: string | null;
  media_type: string | null;
  original_platform_msg_id: string | null;
  append_suffix: string | null;
  status: QueueStatus;
  priority: number;
  scheduled_send_at: Date;
  processing_started_at: Date | null;
  sent_at: Date | null;
  retry_count: number;
  max_retries: number;
  next_retry_at: Date | null;
  is_delivered: boolean | null;
  platform_msg_id: string | null;
  failure_reason_internal: string | null;
  failure_display_message: string | null;
  created_at: Date;
}

export interface DistributionRule {
  id: string;
  workspace_id: string;
  name: string;
  source_group_id: string;
  is_active: boolean;
  delay_mode: DelayMode;
  delay_min_seconds: number;
  delay_max_seconds: number;
  delay_preset: DelayPreset | null;
  append_suffix: string | null;
  append_suffix_enabled: boolean;
  forward_media: boolean;
  forward_files: boolean;
  strip_sender_info: boolean;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: Date | null;
  total_dispatched: number;
  total_failed: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SystemErrorLog {
  id: number;
  error_id: string;
  workspace_id: string | null;
  severity: Severity;
  source: string | null;
  error_code: string | null;
  message: string;
  stack_trace: string | null;
  request_payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

export interface ApiRequestLog {
  id: number;
  workspace_id: string | null;
  platform: Platform;
  connected_account_id: string | null;
  direction: 'OUTBOUND' | 'INBOUND';
  endpoint: string | null;
  method: string | null;
  request_headers: Record<string, unknown> | null;
  request_body: Record<string, unknown> | null;
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  response_time_ms: number | null;
  is_rate_limited: boolean;
  retry_count: number;
  created_at: Date;
}

export interface SuperAdmin {
  id: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  mfa_secret: string | null;
  last_login_at: Date | null;
  ip_whitelist: string[] | null;
  created_at: Date;
  updated_at: Date;
}

export interface ServerHealthLog {
  id: number;
  metric_name: string;
  metric_value: number | null;
  unit: string | null;
  worker_id: string | null;
  node_id: string | null;
  tags: Record<string, unknown> | null;
  recorded_at: Date;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: 'trial' | 'starter' | 'pro' | 'enterprise';
  plan_limits: Record<string, unknown>;
  owner_email: string;
  timezone: string;
  is_active: boolean;
  trial_ends_at: Date | null;
  billing_info: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface Destination {
  id: string;
  workspace_id: string;
  connected_account_id: string;
  platform: Platform;
  destination_type: string;
  platform_dest_id: string;
  display_name: string | null;
  participant_count: number | null;
  tags: string[] | null;
  is_active: boolean;
  last_message_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface MessageDispatch {
  id: number;
  dispatch_id: string;
  workspace_id: string;
  queue_item_id: number | null;
  destination_id: string;
  campaign_id: string | null;
  rule_id: string | null;
  platform: Platform;
  destination_type: string;
  platform_msg_id: string | null;
  status: 'sent' | 'delivered' | 'failed' | 'deleted';
  sent_at: Date | null;
  is_success: boolean | null;
  response_time_ms: number | null;
  http_status_code: number | null;
  platform_error_code: string | null;
  created_at: Date;
}
