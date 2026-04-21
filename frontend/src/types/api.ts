// ─── Enums ───────────────────────────────────────────────
export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "qr_pending"
  | "banned"
  | "rate_limited";

export type Platform =
  | "WHATSAPP_WEB"
  | "WHATSAPP_BUSINESS_API"
  | "TELEGRAM_BOT"
  | "TELEGRAM_USERBOT";

export type DelayMode = "fixed" | "random" | "burst";
export type DelayPreset = "fast" | "medium" | "slow" | "custom";
export type QueueStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "cancelled"
  | "skipped";
export type CampaignStatus =
  | "draft"
  | "pending_approval"
  | "running"
  | "completed"
  | "cancelled";

// ─── Entities ────────────────────────────────────────────
export interface ConnectedAccount {
  id: string;
  workspace_id: string;
  platform: Platform;
  display_name: string | null;
  account_identifier: string | null;
  is_connected: boolean;
  connection_status: ConnectionStatus;
  last_seen_at: string | null;
  qr_code_data: string | null;
  rate_limit_until: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  message_text: string | null;
  media_url: string | null;
  media_type: string | null;
  append_suffix: string | null;
  scheduled_at: string | null;
  delay_preset: DelayPreset;
  delay_min_seconds: number;
  delay_max_seconds: number;
  requires_approval: boolean;
  total_targets: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  success_rate: number;
  created_at: string;
  updated_at: string;
}

export interface DistributionRule {
  id: string;
  workspace_id: string;
  name: string;
  source_group_id: string;
  source_group_name?: string;
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
  total_dispatched: number;
  total_failed: number;
  created_at: string;
  updated_at: string;
}

export interface Destination {
  id: string;
  workspace_id: string;
  platform: Platform;
  destination_type: string;
  platform_dest_id: string;
  display_name: string | null;
  participant_count: number | null;
  is_active: boolean;
  last_message_at: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: "trial" | "starter" | "pro" | "enterprise";
  plan_limits: Record<string, unknown>;
  is_active: boolean;
  status: "pending" | "active" | "suspended";
  contract_signed: boolean;
  contract_signed_at: string | null;
  contract_version: string | null;
  contract_document_url: string | null;
  contract_revoked_at: string | null;
}

export interface Invoice {
  id: string;
  workspace_id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  issued_at: string;
  pdf_url: string | null;
  has_file: boolean;
}

export interface AdminWorkspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: "pending" | "active" | "suspended";
  is_active: boolean;
  contact_phone: string | null;
  created_at: string;
  contract_signed: boolean;
  contract_signed_at: string | null;
  contract_version: string | null;
  contract_revoked_at: string | null;
  owner_email: string | null;
  owner_name: string | null;
}

export interface WorkspaceMember {
  id: string;
  email: string;
  full_name: string | null;
  is_owner: boolean;
  role_slug: string;
  permissions: MemberPermissions;
}

export interface MemberPermissions {
  can_send_free: boolean;
  requires_approval: boolean;
  can_approve_messages: boolean;
  can_global_delete: boolean;
  can_manage_campaigns: boolean;
  can_manage_members: boolean;
  can_manage_destinations: boolean;
  can_view_analytics: boolean;
  can_manage_crm: boolean;
  can_manage_bot_settings: boolean;
}

// ─── API Response Wrappers ───────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error_code?: string;
}

export interface DashboardStats {
  total_sent_all_time: number;
  sent_today: number;
  total_groups: number;
  active_rules: number;
  connected_accounts: number;
  queue_pending: number;
  today: {
    sent: number;
    delivered: number;
    failed: number;
  };
  rules: RuleWithStats[];
}

export interface RuleWithStats {
  id: string;
  name: string;
  is_active: boolean;
  delay_preset: DelayPreset | null;
  total_dispatched: number;
  total_failed: number;
  created_at: string;
  messages_sent: number;
  target_count: number;
}

export interface ViewsData {
  total_views: number;
  destinations: DestinationViews[];
}

export interface DestinationViews {
  destination_id: string;
  display_name: string | null;
  destination_type: string;
  platform_dest_id: string;
  total_views: number;
  total_messages: number;
  successful: number;
}

export interface BestSendTimeData {
  hourly: HourlyStat[];
  best_hour: number | null;
  best_view_rate: number | null;
  best_success_rate: number | null;
}

export interface HourlyStat {
  hour: number;
  total_sent: number;
  total_delivered: number;
  total_views: number;
  actual_views: number;
  view_rate: number;
  success_rate: number;
}

export interface DailyTrend {
  stat_date: string;
  sent: number;
  delivered: number;
  failed: number;
}

export interface WorkspaceMemberWithPermissions {
  id: string;
  email: string;
  full_name: string | null;
  is_owner: boolean;
  is_active: boolean;
  allowed_destination_ids: string[] | null;
  role_slug: string;
  last_login_at: string | null;
}

// ─── WebSocket Events ────────────────────────────────────
export interface WsQrEvent {
  event: "qr";
  data: string; // base64 data URL
}

export interface WsConnectionEvent {
  event: "connection";
  data: {
    status: ConnectionStatus;
    phone_number: string | null;
    rate_limit_until: string | null;
  };
}

export interface WsPongEvent {
  event: "pong";
}

export interface WsErrorEvent {
  event: "error";
  data: { message: string };
}

export type WsEvent =
  | WsQrEvent
  | WsConnectionEvent
  | WsPongEvent
  | WsErrorEvent;

// ─── Login ───────────────────────────────────────────────
export interface LoginResponse {
  token: string;
  member: WorkspaceMember;
  workspace: Workspace;
}
