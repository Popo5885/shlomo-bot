# 🗄️ DB Schema — SaaS Community Management Platform

> **גרסה:** 1.0 | **תאריך:** אפריל 2026
> **הערה:** כל הטבלאות מחולקות לשתי שכבות הרשאה ברורות:
> - 🔴 **SUPER_ADMIN ONLY** — נגיש רק לך (בעל המערכת). אף לקוח לא רואה זאת.
> - 🔵 **CLIENT LAYER** — נגיש ל-Workspaces של הלקוחות.

---

## 📐 ארכיטקטורת Multi-Tenancy

```
SUPER_ADMIN LAYER (🔴)          CLIENT LAYER (🔵)
─────────────────────          ─────────────────────
super_admins                   workspaces (tenants)
system_error_logs              workspace_members
api_request_logs               workspace_roles
server_health_logs             connected_accounts
platform_api_status            source_groups
                               destinations
                               distribution_rules
                               campaigns
                               message_queue
                               message_dispatches
                               dispatch_stats (aggregated)
                               contacts / leads
                               pipelines / deals
                               approval_requests
                               bot_conflict_settings
```

---

## 🔴 SUPER ADMIN LAYER — טבלאות נסתרות (גישה בלעדית לבעל המערכת)

### 1. `super_admins`
```sql
CREATE TABLE super_admins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       VARCHAR(255),
  mfa_secret      TEXT,                        -- TOTP secret לאימות דו-שלבי
  last_login_at   TIMESTAMPTZ,
  ip_whitelist    TEXT[],                      -- רשימת IPs מורשים לגישה לפאנל
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 2. `system_error_logs` 🔴
> שגיאות קוד, קריסות, Unhandled Exceptions — **לעולם לא נחשפות ללקוח**

```sql
CREATE TABLE system_error_logs (
  id              BIGSERIAL PRIMARY KEY,
  error_id        UUID DEFAULT gen_random_uuid(),    -- מזהה ייחודי לשגיאה
  workspace_id    UUID REFERENCES workspaces(id),    -- איזה לקוח קשור (אם רלוונטי)
  severity        VARCHAR(20) NOT NULL               -- 'DEBUG','INFO','WARN','ERROR','CRITICAL'
                  CHECK (severity IN ('DEBUG','INFO','WARN','ERROR','CRITICAL')),
  source          VARCHAR(100),                      -- שם המודול/סרוויס: 'whatsapp_sender', 'queue_worker'
  error_code      VARCHAR(50),                       -- קוד שגיאה פנימי: 'WA_RATE_LIMIT', 'TG_AUTH_FAIL'
  message         TEXT NOT NULL,                     -- הודעת השגיאה הטכנית
  stack_trace     TEXT,                              -- Stack trace מלא
  request_payload JSONB,                             -- ה-payload שגרם לשגיאה
  metadata        JSONB,                             -- מידע נוסף (env, version, node_id)
  resolved        BOOLEAN DEFAULT FALSE,
  resolved_by     UUID REFERENCES super_admins(id),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_error_logs_severity ON system_error_logs(severity);
CREATE INDEX idx_error_logs_workspace ON system_error_logs(workspace_id);
CREATE INDEX idx_error_logs_created ON system_error_logs(created_at DESC);
```

---

### 3. `api_request_logs` 🔴
> לוג כל בקשות ה-API לפלטפורמות חיצוניות (WhatsApp, Telegram, etc.)

```sql
CREATE TABLE api_request_logs (
  id                BIGSERIAL PRIMARY KEY,
  workspace_id      UUID REFERENCES workspaces(id),
  platform          VARCHAR(30) NOT NULL               -- 'WHATSAPP_WEB', 'WHATSAPP_BUSINESS', 'TELEGRAM'
                    CHECK (platform IN ('WHATSAPP_WEB','WHATSAPP_BUSINESS_API','TELEGRAM_BOT','TELEGRAM_USERBOT')),
  connected_account_id UUID REFERENCES connected_accounts(id),
  direction         VARCHAR(10) CHECK (direction IN ('OUTBOUND','INBOUND')),
  endpoint          TEXT,                              -- ה-URL שנקרא
  method            VARCHAR(10),                       -- GET, POST, etc.
  request_headers   JSONB,
  request_body      JSONB,
  response_status   INTEGER,                           -- 200, 429, 403, etc.
  response_body     JSONB,
  response_time_ms  INTEGER,                           -- זמן תגובה במילישניות
  is_rate_limited   BOOLEAN DEFAULT FALSE,
  retry_count       SMALLINT DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_logs_platform ON api_request_logs(platform, created_at DESC);
CREATE INDEX idx_api_logs_status ON api_request_logs(response_status);
CREATE INDEX idx_api_logs_workspace ON api_request_logs(workspace_id, created_at DESC);
```

---

### 4. `server_health_logs` 🔴
> ניטור בריאות שרת, Queue, Workers

```sql
CREATE TABLE server_health_logs (
  id              BIGSERIAL PRIMARY KEY,
  metric_name     VARCHAR(100) NOT NULL,   -- 'queue_depth', 'worker_count', 'memory_mb', 'cpu_pct'
  metric_value    NUMERIC,
  unit            VARCHAR(30),             -- 'messages', 'MB', 'percent', 'ms'
  worker_id       VARCHAR(100),            -- שם ה-worker הספציפי
  node_id         VARCHAR(100),            -- שם ה-server node
  tags            JSONB,                   -- תגיות נוספות לפילטור
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_health_metric ON server_health_logs(metric_name, recorded_at DESC);
```

---

### 5. `platform_api_status` 🔴
> מצב עדכני של כל ה-APIs (לניטור פאנל ה-Super Admin)

```sql
CREATE TABLE platform_api_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform        VARCHAR(50) UNIQUE NOT NULL,
  is_operational  BOOLEAN DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ,
  incident_note   TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔵 CLIENT LAYER — טבלאות לקוחות

### 6. `workspaces` (Tenants)
> כל לקוח = Workspace אחד. הבסיס לכל מידע הלקוח.

```sql
CREATE TABLE workspaces (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255) NOT NULL,
  slug              VARCHAR(100) UNIQUE NOT NULL,      -- לכתובת URL: app.yourplatform.com/ws/slug
  plan              VARCHAR(50) DEFAULT 'trial'        -- 'trial', 'starter', 'pro', 'enterprise'
                    CHECK (plan IN ('trial','starter','pro','enterprise')),
  plan_limits       JSONB DEFAULT '{
                      "max_destinations": 100,
                      "max_campaigns": 50,
                      "max_members": 10,
                      "monthly_messages": 10000
                    }',
  owner_email       VARCHAR(255) NOT NULL,
  timezone          VARCHAR(100) DEFAULT 'Asia/Jerusalem',
  is_active         BOOLEAN DEFAULT TRUE,
  trial_ends_at     TIMESTAMPTZ,
  billing_info      JSONB,                             -- נתוני חיוב (לא כרטיס אשראי!)
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 7. `workspace_members`
> חברי צוות בתוך כל workspace

```sql
CREATE TABLE workspace_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email           VARCHAR(255) NOT NULL,
  full_name       VARCHAR(255),
  password_hash   TEXT,
  avatar_url      TEXT,
  role_id         UUID REFERENCES workspace_roles(id),
  is_owner        BOOLEAN DEFAULT FALSE,               -- הבעלים הראשי של ה-workspace
  is_active       BOOLEAN DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  invited_by      UUID REFERENCES workspace_members(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, email)
);
```

---

### 8. `workspace_roles`
> מערכת הרשאות מתקדמת בתוך ה-workspace

```sql
CREATE TABLE workspace_roles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                  VARCHAR(100) NOT NULL,          -- 'ראשי', 'שליחה חופשית', 'צופה'
  slug                  VARCHAR(50) NOT NULL,            -- 'admin', 'free_sender', 'viewer'

  -- הרשאות הפצה
  can_send_free         BOOLEAN DEFAULT FALSE,           -- שליחה חופשית (עוקף אישור מנהל)
  requires_approval     BOOLEAN DEFAULT TRUE,            -- הודעות צריכות אישור לפני שליחה
  can_approve_messages  BOOLEAN DEFAULT FALSE,           -- יכול לאשר הודעות של אחרים
  can_global_delete     BOOLEAN DEFAULT FALSE,           -- מחיקה גלובלית בכל היעדים

  -- הרשאות ניהול
  can_manage_campaigns  BOOLEAN DEFAULT FALSE,
  can_manage_members    BOOLEAN DEFAULT FALSE,
  can_manage_destinations BOOLEAN DEFAULT FALSE,
  can_view_analytics    BOOLEAN DEFAULT TRUE,
  can_manage_crm        BOOLEAN DEFAULT FALSE,

  -- הגדרות בוט
  can_manage_bot_settings BOOLEAN DEFAULT FALSE,

  is_system_role        BOOLEAN DEFAULT FALSE,          -- תפקיד ברירת מחדל שלא ניתן למחוק
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, slug)
);

-- תפקידי ברירת מחדל מוכנים לכל workspace חדש:
-- 1. 'admin'       → כל ההרשאות = TRUE
-- 2. 'free_sender' → can_send_free=TRUE, requires_approval=FALSE
-- 3. 'viewer'      → רק can_view_analytics=TRUE
```

---

### 9. `connected_accounts`
> חשבונות WhatsApp / Telegram המחוברים ל-workspace

```sql
CREATE TABLE connected_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform            VARCHAR(30) NOT NULL
                      CHECK (platform IN ('WHATSAPP_WEB','WHATSAPP_BUSINESS_API','TELEGRAM_BOT','TELEGRAM_USERBOT')),
  display_name        VARCHAR(255),                   -- שם לתצוגה: "חשבון ראשי", "בוט מכירות"
  account_identifier  VARCHAR(255),                   -- מספר טלפון / bot username
  auth_data           JSONB,                          -- 🔒 session tokens, API keys (מוצפן AES-256)
  webhook_url         TEXT,                           -- Webhook URL לקבלת הודעות
  is_connected        BOOLEAN DEFAULT FALSE,
  last_seen_at        TIMESTAMPTZ,
  qr_code_data        TEXT,                           -- לחיבור WhatsApp Web (זמני)
  connection_status   VARCHAR(30) DEFAULT 'disconnected'
                      CHECK (connection_status IN ('connected','disconnected','qr_pending','banned','rate_limited')),
  rate_limit_until    TIMESTAMPTZ,                    -- מתי מסתיימת חסימת Rate Limit
  metadata            JSONB,                          -- נתוני device, phone info, etc.
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_connected_accounts_workspace ON connected_accounts(workspace_id, platform);
```

---

### 10. `source_groups` (קבוצות מקור / טריגרים)
> הקבוצות שמהן מאזינים להודעות טריגר

```sql
CREATE TABLE source_groups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connected_account_id UUID NOT NULL REFERENCES connected_accounts(id),
  platform            VARCHAR(30) NOT NULL,
  platform_group_id   VARCHAR(500) NOT NULL,           -- מזהה הקבוצה בפלטפורמה
  display_name        VARCHAR(255),
  description         TEXT,
  group_type          VARCHAR(30)                      -- 'group', 'channel', 'supergroup'
                      CHECK (group_type IN ('group','channel','supergroup','broadcast_list')),
  is_active           BOOLEAN DEFAULT TRUE,
  trigger_keywords    TEXT[],                          -- אם מוגדר, רק הודעות עם מילות מפתח אלו יופצו
  trigger_all         BOOLEAN DEFAULT TRUE,            -- TRUE = כל הודעה מהמקור מפוצה
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, connected_account_id, platform_group_id)
);
```

---

### 11. `destinations` (יעדי הפצה)
> כל הקבוצות, ערוצים ויעדים שאליהם שולחים הודעות

```sql
CREATE TABLE destinations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connected_account_id UUID NOT NULL REFERENCES connected_accounts(id),
  platform            VARCHAR(30) NOT NULL
                      CHECK (platform IN ('WHATSAPP_WEB','WHATSAPP_BUSINESS_API','TELEGRAM_BOT','TELEGRAM_USERBOT')),
  destination_type    VARCHAR(30) NOT NULL
                      CHECK (destination_type IN (
                        'WA_GROUP',           -- קבוצת וואטסאפ
                        'WA_CHANNEL',         -- ערוץ וואטסאפ
                        'TG_GROUP',           -- קבוצת טלגרם
                        'TG_CHANNEL',         -- ערוץ טלגרם
                        'TG_SUPERGROUP'       -- סופרגרופ טלגרם
                      )),
  platform_dest_id    VARCHAR(500) NOT NULL,           -- מזהה הקבוצה/ערוץ בפלטפורמה
  display_name        VARCHAR(255),
  participant_count   INTEGER,                         -- מספר משתתפים (לסטטיסטיקה)
  tags                TEXT[],                          -- תגיות לארגון: ['VIP', 'קמפיין_2026']
  is_active           BOOLEAN DEFAULT TRUE,
  last_message_at     TIMESTAMPTZ,
  metadata            JSONB,                           -- avatar URL, invite link, etc.
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, connected_account_id, platform_dest_id)
);

CREATE INDEX idx_destinations_workspace ON destinations(workspace_id, destination_type);
CREATE INDEX idx_destinations_tags ON destinations USING GIN(tags);
```

---

### 12. `distribution_rules` (חוקי הפצה — קישור מקור ← → יעדים)
> הגדרה: "כשמגיעה הודעה מ-[מקור X], שלח ל-[עד 100 יעדים]"

```sql
CREATE TABLE distribution_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  source_group_id     UUID NOT NULL REFERENCES source_groups(id),
  is_active           BOOLEAN DEFAULT TRUE,

  -- הגדרות עיכוב חכם (Anti-Ban Queue)
  delay_mode          VARCHAR(20) DEFAULT 'random'
                      CHECK (delay_mode IN ('fixed','random','burst')),
  delay_min_seconds   INTEGER DEFAULT 3,               -- עיכוב מינימלי בין יעדים
  delay_max_seconds   INTEGER DEFAULT 10,              -- עיכוב מקסימלי בין יעדים
  -- רמות עיכוב: fast(3-5s), medium(30-60s), slow(5-10min)
  delay_preset        VARCHAR(20)
                      CHECK (delay_preset IN ('fast','medium','slow','custom')),

  -- הגדרות תוכן
  append_suffix       TEXT,                            -- סיומת קבועה לכל הודעה
  append_suffix_enabled BOOLEAN DEFAULT FALSE,
  forward_media       BOOLEAN DEFAULT TRUE,            -- האם להעביר תמונות/סרטונים
  forward_files       BOOLEAN DEFAULT TRUE,            -- האם להעביר קבצים
  strip_sender_info   BOOLEAN DEFAULT TRUE,            -- הסתרת שם השולח המקורי

  -- הרשאות
  requires_approval   BOOLEAN DEFAULT FALSE,           -- צריך אישור מנהל לפני שליחה
  approved_by         UUID REFERENCES workspace_members(id),
  approved_at         TIMESTAMPTZ,

  -- סטטיסטיקות מצטברות (מתעדכנות ב-background job)
  total_dispatched    BIGINT DEFAULT 0,
  total_failed        BIGINT DEFAULT 0,

  created_by          UUID REFERENCES workspace_members(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 13. `rule_destinations` (many-to-many: חוקים ← → יעדים)
> מאפשר לכל חוק הפצה לקשר עד 100 יעדים

```sql
CREATE TABLE rule_destinations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         UUID NOT NULL REFERENCES distribution_rules(id) ON DELETE CASCADE,
  destination_id  UUID NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  sort_order      SMALLINT DEFAULT 0,                  -- סדר השליחה
  is_active       BOOLEAN DEFAULT TRUE,
  added_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rule_id, destination_id)
);

CREATE INDEX idx_rule_destinations_rule ON rule_destinations(rule_id, sort_order);
```

---

### 14. `campaigns`
> קמפיינים ידניים (שליחת הודעה אקטיבית לרשימת יעדים)

```sql
CREATE TABLE campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  description         TEXT,
  status              VARCHAR(30) DEFAULT 'draft'
                      CHECK (status IN ('draft','pending_approval','approved','running','paused','completed','cancelled','failed')),

  -- תוכן
  message_text        TEXT,
  media_url           TEXT,                            -- URL לתמונה/סרטון (S3/CDN)
  media_type          VARCHAR(20)
                      CHECK (media_type IN ('image','video','document','audio', NULL)),
  append_suffix       TEXT,

  -- תזמון
  scheduled_at        TIMESTAMPTZ,                     -- NULL = שלח עכשיו
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,

  -- עיכוב
  delay_preset        VARCHAR(20) DEFAULT 'medium',
  delay_min_seconds   INTEGER DEFAULT 30,
  delay_max_seconds   INTEGER DEFAULT 60,

  -- אישור
  requires_approval   BOOLEAN DEFAULT FALSE,
  approved_by         UUID REFERENCES workspace_members(id),
  approved_at         TIMESTAMPTZ,
  rejection_reason    TEXT,

  -- סטטיסטיקות (נחשפות ללקוח — ללא פרטים טכניים)
  total_targets       INTEGER DEFAULT 0,
  sent_count          INTEGER DEFAULT 0,
  delivered_count     INTEGER DEFAULT 0,
  failed_count        INTEGER DEFAULT 0,
  success_rate        NUMERIC(5,2),                    -- אחוז הצלחה (0-100)

  created_by          UUID REFERENCES workspace_members(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaigns_workspace ON campaigns(workspace_id, status);
CREATE INDEX idx_campaigns_scheduled ON campaigns(scheduled_at) WHERE scheduled_at IS NOT NULL;
```

---

### 15. `campaign_targets` (יעדי קמפיין)
```sql
CREATE TABLE campaign_targets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  destination_id  UUID NOT NULL REFERENCES destinations(id),
  sort_order      SMALLINT DEFAULT 0,
  UNIQUE(campaign_id, destination_id)
);
```

---

### 16. `message_queue` (תור הודעות — מנוע הפצה)
> כל הודעה שנוצרת עוברת דרך התור הזה לפני שליחה

```sql
CREATE TABLE message_queue (
  id                  BIGSERIAL PRIMARY KEY,
  queue_id            UUID DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id),

  -- מקור ההודעה
  source_type         VARCHAR(20) NOT NULL
                      CHECK (source_type IN ('trigger','campaign','manual')),
  source_rule_id      UUID REFERENCES distribution_rules(id),   -- אם trigger
  campaign_id         UUID REFERENCES campaigns(id),             -- אם campaign

  -- יעד ספציפי
  destination_id      UUID NOT NULL REFERENCES destinations(id),
  connected_account_id UUID NOT NULL REFERENCES connected_accounts(id),

  -- תוכן ההודעה
  message_text        TEXT,
  media_url           TEXT,
  media_type          VARCHAR(20),
  original_platform_msg_id VARCHAR(500),          -- מזהה ההודעה המקורית (לforward)
  append_suffix       TEXT,

  -- תזמון תור
  status              VARCHAR(20) DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','sent','failed','cancelled','skipped')),
  priority            SMALLINT DEFAULT 5,             -- 1=גבוה, 10=נמוך
  scheduled_send_at   TIMESTAMPTZ DEFAULT NOW(),      -- מתי לשלוח (לפי עיכוב חכם)
  processing_started_at TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,

  -- ניסיונות חוזרים
  retry_count         SMALLINT DEFAULT 0,
  max_retries         SMALLINT DEFAULT 3,
  next_retry_at       TIMESTAMPTZ,

  -- תוצאה (מוצגת ללקוח באופן מינימלי — ללא פרטים טכניים)
  is_delivered        BOOLEAN,
  platform_msg_id     VARCHAR(500),               -- מזהה ההודעה שנשלחה (לצורך מחיקה גלובלית)

  -- 🔴 פרטי כשל (שמורים בטבלה, אך ללקוח מוצגת רק "נכשל" ללא פרטים)
  failure_reason_internal TEXT,                   -- 🔴 SUPER ADMIN רואה זאת
  failure_display_message VARCHAR(100)            -- 🔵 לקוח רואה: "ההודעה לא נשלחה"
                      DEFAULT 'ההודעה לא נשלחה',

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_queue_status ON message_queue(status, scheduled_send_at);
CREATE INDEX idx_queue_workspace ON message_queue(workspace_id, status);
CREATE INDEX idx_queue_destination ON message_queue(destination_id, status);
```

---

### 17. `message_dispatches` (ארכיון שליחות — היסטוריה מלאה)
> רשומה סופית לכל הודעה שנשלחה (בין אם הצליחה ובין אם לא)

```sql
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
  platform_msg_id     VARCHAR(500),                   -- מזהה ב-WhatsApp/Telegram (לגלובל-דיליט)

  status              VARCHAR(20) NOT NULL
                      CHECK (status IN ('sent','delivered','failed','deleted')),

  -- 🔵 לקוח רואה רק את העמודות הללו:
  sent_at             TIMESTAMPTZ,
  is_success          BOOLEAN,

  -- 🔴 Super Admin רואה גם:
  response_time_ms    INTEGER,
  http_status_code    INTEGER,
  platform_error_code VARCHAR(100),

  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dispatches_workspace ON message_dispatches(workspace_id, sent_at DESC);
CREATE INDEX idx_dispatches_campaign ON message_dispatches(campaign_id);
CREATE INDEX idx_dispatches_destination ON message_dispatches(destination_id, sent_at DESC);
```

---

### 18. `approval_requests` (אישורי הודעות)
> כשחבר צוות שולח הודעה וצריך אישור מנהל ראשי

```sql
CREATE TABLE approval_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id),
  requested_by        UUID NOT NULL REFERENCES workspace_members(id),
  reviewed_by         UUID REFERENCES workspace_members(id),

  request_type        VARCHAR(20) NOT NULL
                      CHECK (request_type IN ('campaign_send','rule_activate','manual_message')),
  reference_id        UUID,                            -- מזהה הקמפיין / חוק / הודעה

  message_preview     TEXT,                            -- תצוגה מקדימה של ההודעה
  target_count        INTEGER,                         -- לכמה יעדים

  status              VARCHAR(20) DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewer_note       TEXT,
  requested_at        TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at         TIMESTAMPTZ
);

CREATE INDEX idx_approvals_workspace ON approval_requests(workspace_id, status);
```

---

### 19. `global_delete_events` (מחיקה גלובלית)
> כשמוחקים הודעה במקור, מחיקה אוטומטית בכל יעדי ההפצה

```sql
CREATE TABLE global_delete_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id),
  initiated_by        UUID REFERENCES workspace_members(id),
  original_platform_msg_id VARCHAR(500) NOT NULL,      -- מזהה ההודעה המקורית שנמחקה

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
  platform_msg_id     VARCHAR(500),                    -- מזהה ההודעה שנשלחה ביעד (לצורך מחיקה)
  status              VARCHAR(20) DEFAULT 'pending'
                      CHECK (status IN ('pending','deleted','failed','not_found')),
  deleted_at          TIMESTAMPTZ,
  failure_reason      TEXT                             -- 🔴 רק Super Admin רואה
);
```

---

### 20. `bot_conflict_settings` (הגדרות התנגשות בוטים)
```sql
CREATE TABLE bot_conflict_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
  rule_id             UUID REFERENCES distribution_rules(id),  -- NULL = הגדרה גלובלית ל-workspace

  -- מה לעשות כשמזוהה בוט אחר בקבוצה
  on_bot_conflict     VARCHAR(30) DEFAULT 'run_both'
                      CHECK (on_bot_conflict IN (
                        'run_both',            -- הפעל גם הבוט וגם ההפצה
                        'run_distribution_only', -- הפעל רק ההפצה
                        'run_bot_only',        -- הפעל רק הבוט
                        'pause_all',           -- עצור הכל עד הוראה ידנית
                        'notify_admin'         -- שלח התראה למנהל
                      )),
  bot_detection_keywords TEXT[],                       -- מילות מפתח לזיהוי תגובות בוט
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 📊 CRM & Leads

### 21. `contacts`
```sql
CREATE TABLE contacts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  full_name           VARCHAR(255),
  phone               VARCHAR(50),
  email               VARCHAR(255),
  platform            VARCHAR(30),                     -- 'WHATSAPP', 'TELEGRAM'
  platform_user_id    VARCHAR(255),                    -- מזהה המשתמש בפלטפורמה
  source_group_id     UUID REFERENCES source_groups(id), -- מאיפה הגיע הליד
  tags                TEXT[],
  notes               TEXT,
  custom_fields       JSONB,                           -- שדות מותאמים אישית
  is_lead             BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, platform, platform_user_id)
);

CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
```

---

### 22. `lead_signals` (איתותי קנייה אוטומטיים)
> הודעות שזוהו אוטומטית כסיגנל רכישה

```sql
CREATE TABLE lead_signals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id),
  contact_id          UUID REFERENCES contacts(id),
  source_group_id     UUID REFERENCES source_groups(id),
  platform_msg_id     VARCHAR(500),
  message_text        TEXT,
  signal_type         VARCHAR(50),                     -- 'price_inquiry','interested','complaint','urgent'
  confidence_score    NUMERIC(3,2),                    -- 0.00-1.00 (ציון מנוע ה-NLP)
  detected_at         TIMESTAMPTZ DEFAULT NOW(),
  is_processed        BOOLEAN DEFAULT FALSE,           -- האם הועבר ל-Pipeline
  pipeline_deal_id    UUID REFERENCES pipeline_deals(id)
);
```

---

### 23. `pipelines` & `pipeline_stages`
```sql
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
  name            VARCHAR(100) NOT NULL,               -- 'ליד חדש', 'בטיפול', 'הצעת מחיר', 'סגור'
  color           VARCHAR(7),                          -- hex color: '#3B82F6'
  sort_order      SMALLINT NOT NULL,
  is_won          BOOLEAN DEFAULT FALSE,               -- שלב "זכייה"
  is_lost         BOOLEAN DEFAULT FALSE,               -- שלב "הפסד"
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pipeline_deals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pipeline_id     UUID NOT NULL REFERENCES pipelines(id),
  stage_id        UUID NOT NULL REFERENCES pipeline_stages(id),
  contact_id      UUID REFERENCES contacts(id),
  title           VARCHAR(255) NOT NULL,
  value           NUMERIC(12,2),                       -- ערך עסקה
  currency        VARCHAR(3) DEFAULT 'ILS',
  assigned_to     UUID REFERENCES workspace_members(id),
  notes           TEXT,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 📈 Analytics (מוצג ללקוח — ללא מידע טכני)

### 24. `dispatch_stats_daily` (סטטיסטיקות יומיות מצטברות)
> נוצרת על ידי job לילי — הלקוח רואה רק מידע מצטבר ונקי

```sql
CREATE TABLE dispatch_stats_daily (
  id                  BIGSERIAL PRIMARY KEY,
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  stat_date           DATE NOT NULL,
  destination_id      UUID REFERENCES destinations(id),
  campaign_id         UUID REFERENCES campaigns(id),
  rule_id             UUID REFERENCES distribution_rules(id),
  platform            VARCHAR(30),
  destination_type    VARCHAR(30),

  -- 🔵 נחשפים ללקוח
  total_sent          INTEGER DEFAULT 0,
  total_delivered     INTEGER DEFAULT 0,
  total_failed        INTEGER DEFAULT 0,
  success_rate        NUMERIC(5,2),                    -- אחוז הצלחה (ללא הסבר טכני)

  UNIQUE(workspace_id, stat_date, destination_id, campaign_id, rule_id)
);

CREATE INDEX idx_stats_workspace_date ON dispatch_stats_daily(workspace_id, stat_date DESC);
```

---

## 🔐 הפרדת הרשאות — מדיניות Row-Level Security (RLS)

```sql
-- עיקרון: כל שאילתה מ-Client Layer מסוננת לפי workspace_id
-- שאילתות ל-SUPER ADMIN LAYER דורשות JWT מיוחד עם role='super_admin'

-- דוגמת מדיניות RLS על טבלת error_logs:
ALTER TABLE system_error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY super_admin_only ON system_error_logs
  USING (current_setting('app.current_role') = 'super_admin');

-- דוגמת מדיניות RLS על טבלת workspaces:
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON workspaces
  USING (
    id = current_setting('app.current_workspace_id')::UUID
    OR current_setting('app.current_role') = 'super_admin'
  );
```

---

## 🗺️ תרשים יחסים מרכזי (ERD Summary)

```
workspaces
  ├── workspace_members ──── workspace_roles
  ├── connected_accounts
  ├── source_groups ─────────────────────────┐
  ├── destinations                            │
  ├── distribution_rules ──── rule_destinations (↔ destinations)
  │     └── [trigger from source_groups] ────┘
  ├── campaigns ──── campaign_targets (↔ destinations)
  ├── message_queue ──── message_dispatches
  ├── global_delete_events ──── global_delete_items
  ├── approval_requests
  ├── bot_conflict_settings
  ├── contacts ──── lead_signals ──── pipeline_deals
  ├── pipelines ──── pipeline_stages
  └── dispatch_stats_daily

SUPER ADMIN (נפרד לחלוטין):
  super_admins
  system_error_logs  ←── (workspace_id FK, אבל גישה רק ל-Super Admin)
  api_request_logs
  server_health_logs
  platform_api_status
```

---

## 📋 רשימת אינדקסים מומלצים נוספים

```sql
-- ביצועי תור הודעות
CREATE INDEX idx_queue_scheduled ON message_queue(scheduled_send_at, status)
  WHERE status = 'pending';
CREATE INDEX idx_queue_retry ON message_queue(next_retry_at)
  WHERE status = 'failed' AND retry_count < max_retries;

-- ביצועי CRM
CREATE INDEX idx_contacts_phone ON contacts(workspace_id, phone);
CREATE INDEX idx_lead_signals_unprocessed ON lead_signals(workspace_id, detected_at)
  WHERE is_processed = FALSE;

-- ביצועי לוגים (Super Admin)
CREATE INDEX idx_error_logs_unresolved ON system_error_logs(created_at DESC)
  WHERE resolved = FALSE;
```

---

## ✅ Checklist — כיסוי דרישות

| דרישה | טבלאות מכסות |
|-------|-------------|
| Super Admin vs Client הפרדה | `system_error_logs`, `api_request_logs`, RLS policies |
| Omnichannel (WA Groups, WA Channels, Telegram) | `destinations.destination_type`, `connected_accounts.platform` |
| מנוע טריגרים + עד 100 יעדים | `distribution_rules` + `rule_destinations` |
| השהיה חכמה Anti-Ban | `message_queue.scheduled_send_at`, `delay_min/max_seconds` |
| CRM + Pipeline + לידים | `contacts`, `lead_signals`, `pipelines`, `pipeline_deals` |
| הרשאות צוות (מנהל/חופשי/מחיקה גלובלית) | `workspace_roles` + permissions columns |
| אישור הודעות לפני שליחה | `approval_requests`, `campaigns.requires_approval` |
| מחיקה גלובלית | `global_delete_events` + `global_delete_items` |
| התנגשות בוטים | `bot_conflict_settings` |
| אנליטיקס נקי ללקוח | `dispatch_stats_daily` (success_rate ללא stack traces) |
| לידים אוטומטיים | `lead_signals.signal_type`, `confidence_score` |

---

*הצעד הבא: לאחר אישורך, נעבור לבנות את ה-Backend — Node.js/Python Server + Queue Worker + API Connectors לוואטסאפ וטלגרם.*
