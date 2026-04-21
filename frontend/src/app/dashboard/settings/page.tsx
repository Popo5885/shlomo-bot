"use client";

import { useState, useEffect } from "react";
import {
  Building2,
  Shield,
  Users,
  CreditCard,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Globe,
  MessageSquare,
  Bot,
  Plus,
  Moon,
  FileText,
  Lightbulb,
  ListRestart,
  Send,
  BellRing,
  Phone,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import type { Destination, WorkspaceMemberWithPermissions } from "@/types/api";

/* ─── helpers & labels ─── */

const permissionLabels: Record<string, string> = {
  can_send_free: "שליחה חופשית",
  requires_approval: "דורש אישור",
  can_approve_messages: "אישור הודעות",
  can_global_delete: "מחיקה גלובלית",
  can_manage_campaigns: "ניהול קמפיינים",
  can_manage_members: "ניהול חברים",
  can_manage_destinations: "ניהול יעדים",
  can_view_analytics: "צפייה בנתונים",
  can_manage_crm: "ניהול CRM",
  can_manage_bot_settings: "הגדרות בוט",
};

const destTypeLabel: Record<string, string> = {
  WA_GROUP: "קבוצת WA",
  WA_CHANNEL: "ערוץ WA",
  TG_GROUP: "קבוצת TG",
  TG_CHANNEL: "ערוץ TG",
  TG_SUPERGROUP: "ערוץ TG",
};

function isWhatsApp(platform: string) {
  return platform === "WHATSAPP_WEB" || platform === "WHATSAPP_BUSINESS_API";
}

/* ─── types for new sections ─── */

interface ShabbatSettings {
  enabled: boolean;
  reference_cities: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  issued_at: string;
}

interface FeatureRequest {
  id: string;
  text: string;
  status: string;
  created_at: string;
}

interface QueuePausedInfo {
  paused_count: number;
}

interface ConnectedAccountOption {
  id: string;
  display_name: string | null;
  account_identifier: string | null;
}

/* ─── page ─── */

export default function SettingsPage() {
  const { workspace, member } = useAuthStore();
  const [copied, setCopied] = useState(false);

  // Group Access Manager state
  const [members, setMembers] = useState<WorkspaceMemberWithPermissions[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [savingMember, setSavingMember] = useState<string | null>(null);
  const [memberPermissions, setMemberPermissions] = useState<
    Record<string, string[] | null>
  >({});

  // Invite member state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteDestinations, setInviteDestinations] = useState<string[]>([]);
  const [inviteFullAccess, setInviteFullAccess] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Shabbat blocker state
  const [shabbatEnabled, setShabbatEnabled] = useState(false);
  const [shabbatLoading, setShabbatLoading] = useState(true);
  const [shabbatSaving, setShabbatSaving] = useState(false);

  // Auto-reply state
  interface AutoReplySettings {
    is_enabled: boolean;
    greeting_text: string;
    send_lead_notification: boolean;
    notification_phone: string | null;
    cooldown_minutes: number;
  }
  const [autoReply, setAutoReply] = useState<AutoReplySettings>({
    is_enabled: false,
    greeting_text: "שלום! קיבלנו את הודעתך ונחזור אליך בהקדם 😊",
    send_lead_notification: true,
    notification_phone: null,
    cooldown_minutes: 60,
  });
  const [autoReplyLoading, setAutoReplyLoading] = useState(true);
  const [autoReplySaving, setAutoReplySaving] = useState(false);
  const [autoReplySaved, setAutoReplySaved] = useState(false);

  // Invoices state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);

  // Feature requests state
  const [featureRequests, setFeatureRequests] = useState<FeatureRequest[]>([]);
  const [featureText, setFeatureText] = useState("");
  const [featureLoading, setFeatureLoading] = useState(true);
  const [featureSubmitting, setFeatureSubmitting] = useState(false);

  // Queue management state
  const [pausedCount, setPausedCount] = useState(0);
  const [queueLoading, setQueueLoading] = useState(true);
  const [accounts, setAccounts] = useState<ConnectedAccountOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [resuming, setResuming] = useState(false);

  const canManageMembers = member?.permissions?.can_manage_members;

  /* ─── Load members & destinations ─── */
  useEffect(() => {
    if (!canManageMembers) return;
    setLoadingMembers(true);
    Promise.all([
      api.get<WorkspaceMemberWithPermissions[]>("/api/client/members"),
      api.get<Destination[]>("/api/client/destinations"),
    ])
      .then(([m, d]) => {
        setMembers(m);
        setDestinations(d);
        const perms: Record<string, string[] | null> = {};
        for (const mem of m) {
          perms[mem.id] = mem.allowed_destination_ids;
        }
        setMemberPermissions(perms);
      })
      .catch(() => {})
      .finally(() => setLoadingMembers(false));
  }, [canManageMembers]);

  /* ─── Load shabbat settings ─── */
  useEffect(() => {
    api
      .get<ShabbatSettings>("/api/client/shabbat-settings")
      .then((s) => setShabbatEnabled(s.enabled))
      .catch(() => {})
      .finally(() => setShabbatLoading(false));
  }, []);

  /* ─── Load auto-reply settings ─── */
  useEffect(() => {
    api
      .get<AutoReplySettings>("/api/client/auto-reply-settings")
      .then((s) => setAutoReply(s))
      .catch(() => {})
      .finally(() => setAutoReplyLoading(false));
  }, []);

  /* ─── Load invoices ─── */
  useEffect(() => {
    api
      .get<Invoice[]>("/api/client/invoices")
      .then(setInvoices)
      .catch(() => {})
      .finally(() => setInvoicesLoading(false));
  }, []);

  /* ─── Load feature requests ─── */
  useEffect(() => {
    api
      .get<FeatureRequest[]>("/api/client/feature-requests")
      .then(setFeatureRequests)
      .catch(() => {})
      .finally(() => setFeatureLoading(false));
  }, []);

  /* ─── Load queue paused info ─── */
  useEffect(() => {
    Promise.all([
      api.get<QueuePausedInfo>("/api/client/queue/paused").catch(() => ({ paused_count: 0 })),
      api.get<ConnectedAccountOption[]>("/api/client/accounts").catch(() => []),
    ])
      .then(([q, a]) => {
        setPausedCount((q as QueuePausedInfo).paused_count);
        setAccounts(a as ConnectedAccountOption[]);
      })
      .finally(() => setQueueLoading(false));
  }, []);

  /* ─── handlers ─── */

  const copyId = () => {
    if (workspace?.id) {
      navigator.clipboard.writeText(workspace.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const saveAutoReply = async () => {
    setAutoReplySaving(true);
    try {
      await api.patch("/api/client/auto-reply-settings", autoReply);
      setAutoReplySaved(true);
      setTimeout(() => setAutoReplySaved(false), 3000);
    } catch {
      // keep saving=false, user will see no feedback which is acceptable
    } finally {
      setAutoReplySaving(false);
    }
  };

  const toggleShabbat = async () => {
    const next = !shabbatEnabled;
    setShabbatSaving(true);
    try {
      await api.patch("/api/client/shabbat-settings", { enabled: next });
      setShabbatEnabled(next);
    } catch {
      // revert on failure
    } finally {
      setShabbatSaving(false);
    }
  };

  const toggleDestForMember = (memberId: string, destId: string) => {
    setMemberPermissions((prev) => {
      const current = prev[memberId];
      if (current === null) return prev;
      const next = current.includes(destId)
        ? current.filter((id) => id !== destId)
        : [...current, destId];
      return { ...prev, [memberId]: next };
    });
  };

  const setFullAccess = (memberId: string) => {
    setMemberPermissions((prev) => ({ ...prev, [memberId]: null }));
  };

  const setRestrictedAccess = (memberId: string) => {
    setMemberPermissions((prev) => ({ ...prev, [memberId]: [] }));
  };

  const savePermissions = async (memberId: string) => {
    setSavingMember(memberId);
    try {
      await api.patch(`/api/client/members/${memberId}/permissions`, {
        allowed_destination_ids: memberPermissions[memberId],
      });
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, allowed_destination_ids: memberPermissions[memberId] }
            : m
        )
      );
    } catch {
      // silent
    } finally {
      setSavingMember(null);
    }
  };

  const toggleInviteDest = (destId: string) => {
    setInviteDestinations((prev) =>
      prev.includes(destId) ? prev.filter((id) => id !== destId) : [...prev, destId]
    );
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const result = await api.post<{ temp_password?: string }>(
        "/api/client/members/invite",
        {
          email: inviteEmail.trim(),
          full_name: inviteFullName.trim() || undefined,
          allowed_destination_ids: inviteFullAccess ? null : inviteDestinations,
        }
      );
      // Refresh members list
      const m = await api.get<WorkspaceMemberWithPermissions[]>("/api/client/members");
      setMembers(m);
      const perms: Record<string, string[] | null> = {};
      for (const mem of m) {
        perms[mem.id] = mem.allowed_destination_ids;
      }
      setMemberPermissions(perms);
      if (result?.temp_password) {
        setInviteSuccess(`סיסמה זמנית: ${result.temp_password}`);
      } else {
        setInviteSuccess("המשתמש הוזמן בהצלחה");
      }
      setInviteEmail("");
      setInviteFullName("");
      setInviteDestinations([]);
      setInviteFullAccess(true);
    } catch (err) {
      if (err instanceof ApiError) setInviteError(err.message);
      else setInviteError("שגיאה בהזמנת משתמש");
    } finally {
      setInviting(false);
    }
  };

  const submitFeature = async () => {
    if (!featureText.trim()) return;
    setFeatureSubmitting(true);
    try {
      const newReq = await api.post<FeatureRequest>("/api/client/feature-requests", {
        text: featureText.trim(),
      });
      if (newReq) setFeatureRequests((prev) => [newReq, ...prev]);
      setFeatureText("");
    } catch {
      // silent
    } finally {
      setFeatureSubmitting(false);
    }
  };

  const resumeQueue = async () => {
    if (!selectedAccount) return;
    setResuming(true);
    try {
      await api.post("/api/client/queue/resume-all", {
        account_id: selectedAccount,
      });
      setPausedCount(0);
    } catch {
      // silent
    } finally {
      setResuming(false);
    }
  };

  const planColors: Record<string, string> = {
    trial: "border-amber-200/50 bg-amber-50/80 text-amber-700",
    starter: "border-blue-200/50 bg-blue-50/80 text-blue-700",
    pro: "border-violet-200/50 bg-violet-50/80 text-violet-700",
    enterprise: "border-emerald-200/50 bg-emerald-50/80 text-emerald-700",
  };

  const statusColors: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    overdue: "bg-red-100 text-red-700 border-red-200",
    cancelled: "bg-slate-100 text-slate-600 border-slate-200",
  };

  const statusLabels: Record<string, string> = {
    paid: "שולם",
    pending: "ממתין",
    overdue: "באיחור",
    cancelled: "בוטל",
  };

  const featureStatusLabels: Record<string, string> = {
    pending: "ממתין",
    in_review: "בבדיקה",
    planned: "מתוכנן",
    done: "בוצע",
    rejected: "נדחה",
  };

  const featureStatusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    in_review: "bg-blue-100 text-blue-700 border-blue-200",
    planned: "bg-violet-100 text-violet-700 border-violet-200",
    done: "bg-emerald-100 text-emerald-700 border-emerald-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
  };

  const glassCard = "bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl";

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">הגדרות</h1>
        <p className="text-muted-foreground">נהל את הגדרות סביבת העבודה שלך</p>
      </div>

      {/* ═══ A) Workspace Info ═══ */}
      <Card glass className={glassCard}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5 text-primary" />
            סביבת עבודה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">שם</label>
              <p className="text-sm font-semibold">{workspace?.name || "—"}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">מזהה</label>
              <p className="text-sm font-mono">{workspace?.slug || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge
              variant="outline"
              className={`text-base px-4 py-1.5 ${planColors[workspace?.plan || "trial"]}`}
            >
              {workspace?.plan?.toUpperCase() || "TRIAL"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {workspace?.is_active ? "פעיל" : "לא פעיל"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ═══ B) User Profile ═══ */}
      <Card glass className={glassCard}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-primary" />
            הפרופיל שלך
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">שם</label>
              <p className="text-sm font-semibold">{member?.full_name || "—"}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">אימייל</label>
              <p className="text-sm">{member?.email || "—"}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">תפקיד</label>
              <p className="text-sm font-medium capitalize">
                {member?.role_slug?.replace("_", " ") || "—"}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">בעלים</label>
              <p className="text-sm">{member?.is_owner ? "כן" : "לא"}</p>
            </div>
          </div>
          {/* Permissions */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">הרשאות</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {member?.permissions &&
                Object.entries(member.permissions).map(([key, value]) => (
                  <div
                    key={key}
                    className={`flex items-center gap-2 rounded-xl border p-3 transition-all ${
                      value
                        ? "border-emerald-200/50 bg-emerald-50/50"
                        : "border-border/50 bg-muted/30 opacity-50"
                    }`}
                  >
                    <div
                      className={`h-2 w-2 rounded-full ${
                        value ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    />
                    <span className="text-xs font-medium">
                      {permissionLabels[key] || key.replace(/^can_/, "").replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ C) Shabbat Blocker ═══ */}
      <Card glass className={glassCard}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Moon className="h-5 w-5 text-primary" />
            חסימת שבת
          </CardTitle>
          <CardDescription>
            חסימת שליחה אוטומטית בשבת וחגים לפי זמני ירושלים ופתח תקווה
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shabbatLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-4">
              <div>
                <p className="text-sm font-medium">
                  {shabbatEnabled ? "חסימה פעילה" : "חסימה כבויה"}
                </p>
                <p className="text-xs text-muted-foreground">
                  ערי ייחוס: ירושלים ופתח תקווה
                </p>
              </div>
              <button
                type="button"
                onClick={toggleShabbat}
                disabled={shabbatSaving}
                className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
                  shabbatEnabled ? "bg-emerald-500" : "bg-slate-300"
                } ${shabbatSaving ? "opacity-50" : ""}`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    shabbatEnabled ? "translate-x-0.5" : "translate-x-5"
                  }`}
                />
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ D) Auto-Reply & Lead Notifications ═══ */}
      <Card glass className={glassCard}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BellRing className="h-5 w-5 text-primary" />
            מענה אוטומטי + התראות לידים
          </CardTitle>
          <CardDescription>
            שלח הודעת פתיחה אוטומטית לכל מי שפונה אליך בפרטי, וקבל התראה מיידית על כל ליד חדש
          </CardDescription>
        </CardHeader>
        <CardContent>
          {autoReplyLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Enable toggle */}
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-4">
                <div>
                  <p className="text-sm font-medium">
                    {autoReply.is_enabled ? "מענה אוטומטי פעיל" : "מענה אוטומטי כבוי"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    הפעל כדי לשלוח הודעת ברוכים הבאים לפונים חדשים
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoReply((p) => ({ ...p, is_enabled: !p.is_enabled }))}
                  className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
                    autoReply.is_enabled ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      autoReply.is_enabled ? "translate-x-0.5" : "translate-x-5"
                    }`}
                  />
                </button>
              </div>

              {/* Greeting text */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  טקסט הודעת פתיחה
                </label>
                <textarea
                  rows={3}
                  value={autoReply.greeting_text}
                  onChange={(e) => setAutoReply((p) => ({ ...p, greeting_text: e.target.value }))}
                  placeholder="שלום! קיבלנו את הודעתך ונחזור אליך בהקדם 😊"
                  className="w-full resize-none rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Lead notification toggle */}
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-4">
                <div>
                  <p className="text-sm font-medium">
                    התראה על ליד חדש
                  </p>
                  <p className="text-xs text-muted-foreground">
                    שלח הודעת וואטסאפ לבעל המערכת בכל פנייה חדשה
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoReply((p) => ({ ...p, send_lead_notification: !p.send_lead_notification }))}
                  className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
                    autoReply.send_lead_notification ? "bg-blue-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      autoReply.send_lead_notification ? "translate-x-0.5" : "translate-x-5"
                    }`}
                  />
                </button>
              </div>

              {/* Notification phone override */}
              {autoReply.send_lead_notification && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    מספר לקבלת התראות
                    <span className="text-xs font-normal text-muted-foreground">(ריק = מספר הקשר של הסביבה)</span>
                  </label>
                  <Input
                    type="tel"
                    dir="ltr"
                    value={autoReply.notification_phone ?? ""}
                    onChange={(e) =>
                      setAutoReply((p) => ({
                        ...p,
                        notification_phone: e.target.value || null,
                      }))
                    }
                    placeholder="972501234567"
                    className="font-mono text-sm"
                  />
                </div>
              )}

              {/* Cooldown */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                  זמן מנוחה בין מענה לאותו מספר
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={1440}
                    step={5}
                    value={autoReply.cooldown_minutes}
                    onChange={(e) =>
                      setAutoReply((p) => ({ ...p, cooldown_minutes: Number(e.target.value) }))
                    }
                    className="flex-1 accent-primary"
                  />
                  <span className="w-24 text-left text-sm font-medium tabular-nums text-muted-foreground">
                    {autoReply.cooldown_minutes >= 60
                      ? `${Math.round(autoReply.cooldown_minutes / 60)}ש׳`
                      : `${autoReply.cooldown_minutes} דק׳`}
                  </span>
                </div>
              </div>

              {/* Save button */}
              <Button
                onClick={saveAutoReply}
                disabled={autoReplySaving}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-700 shadow-sm"
              >
                {autoReplySaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : autoReplySaved ? (
                  <>
                    <Check className="h-4 w-4" />
                    נשמר!
                  </>
                ) : (
                  "שמור הגדרות"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ E) Group Access Manager ═══ */}
      {canManageMembers && (
        <Card glass className={glassCard}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="h-5 w-5 text-primary" />
                מנהל הרשאות קבוצות
              </CardTitle>
            </div>
            <CardDescription>
              הגדר בדיוק לאילו קבוצות יעד כל משתמש יכול לשלוח
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingMembers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                אין חברי צוות נוספים
              </p>
            ) : (
              <div className="space-y-3">
                {members.map((mem) => {
                  const isExpanded = expandedMember === mem.id;
                  const currentPerms = memberPermissions[mem.id];
                  const hasFullAccess = currentPerms === null;

                  return (
                    <div
                      key={mem.id}
                      className="rounded-xl border border-border/50 overflow-hidden transition-all"
                    >
                      {/* Member Row */}
                      <button
                        type="button"
                        onClick={() => setExpandedMember(isExpanded ? null : mem.id)}
                        className="flex w-full items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-white text-sm font-bold">
                            {(mem.full_name || mem.email)[0].toUpperCase()}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {mem.full_name || mem.email}
                            </p>
                            <p className="text-xs text-muted-foreground">{mem.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {mem.is_owner ? (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                              בעלים
                            </Badge>
                          ) : hasFullAccess ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                              גישה מלאה
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              {currentPerms?.length || 0} קבוצות
                            </Badge>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {/* Expanded: Group Checklist */}
                      {isExpanded && !mem.is_owner && (
                        <div className="border-t border-border/50 p-4 space-y-4 bg-muted/10">
                          {/* Full Access Toggle */}
                          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-3">
                            <div>
                              <p className="text-sm font-medium">גישה מלאה לכל הקבוצות</p>
                              <p className="text-xs text-muted-foreground">
                                משתמש זה יוכל לשלוח לכל קבוצות היעד
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                hasFullAccess
                                  ? setRestrictedAccess(mem.id)
                                  : setFullAccess(mem.id)
                              }
                              className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                                hasFullAccess ? "bg-emerald-500" : "bg-slate-300"
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                  hasFullAccess ? "translate-x-0.5" : "translate-x-5"
                                }`}
                              />
                            </button>
                          </div>

                          {/* Destination Checklist */}
                          {!hasFullAccess && (
                            <div className="max-h-60 overflow-y-auto space-y-1.5 rounded-lg border border-border/50 p-2">
                              {destinations.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-4">
                                  אין קבוצות יעד זמינות
                                </p>
                              ) : (
                                destinations.map((dest) => {
                                  const checked =
                                    currentPerms?.includes(dest.id) || false;
                                  const wa = isWhatsApp(dest.platform);
                                  return (
                                    <label
                                      key={dest.id}
                                      className={`flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-all ${
                                        checked
                                          ? wa
                                            ? "bg-emerald-500/10 border border-emerald-500/20"
                                            : "bg-blue-500/10 border border-blue-500/20"
                                          : wa
                                            ? "hover:bg-emerald-50 border border-transparent"
                                            : "hover:bg-blue-50 border border-transparent"
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          toggleDestForMember(mem.id, dest.id)
                                        }
                                        className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                      />
                                      {wa ? (
                                        <MessageSquare className="h-4 w-4 shrink-0 text-emerald-600" />
                                      ) : (
                                        <Bot className="h-4 w-4 shrink-0 text-blue-600" />
                                      )}
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <p className="text-sm">
                                            {dest.display_name || dest.platform_dest_id}
                                          </p>
                                          <span
                                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                              wa
                                                ? "bg-emerald-100 text-emerald-700"
                                                : "bg-blue-100 text-blue-700"
                                            }`}
                                          >
                                            {destTypeLabel[dest.destination_type] ||
                                              dest.destination_type}
                                          </span>
                                        </div>
                                      </div>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          )}

                          {/* Save Button */}
                          <Button
                            onClick={() => savePermissions(mem.id)}
                            disabled={savingMember === mem.id}
                            className="w-full bg-gradient-to-r from-violet-500 to-blue-600"
                          >
                            {savingMember === mem.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "שמור הרשאות"
                            )}
                          </Button>
                        </div>
                      )}

                      {/* Owner notice */}
                      {isExpanded && mem.is_owner && (
                        <div className="border-t border-border/50 p-4 bg-muted/10">
                          <p className="text-sm text-muted-foreground text-center">
                            לבעלים יש גישה מלאה לכל הקבוצות באופן אוטומטי
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ F) Add User ═══ */}
      {canManageMembers && (
        <Card glass className={glassCard}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-5 w-5 text-primary" />
              הוסף משתמש
            </CardTitle>
            <CardDescription>הזמן חבר צוות חדש לסביבת העבודה</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!showInviteForm ? (
              <Button
                variant="outline"
                onClick={() => {
                  setShowInviteForm(true);
                  setInviteSuccess(null);
                  setInviteError(null);
                }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                הוסף משתמש חדש
              </Button>
            ) : (
              <div className="space-y-4 rounded-xl border border-border/50 bg-muted/20 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">אימייל *</label>
                    <Input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="user@example.com"
                      type="email"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">שם מלא</label>
                    <Input
                      value={inviteFullName}
                      onChange={(e) => setInviteFullName(e.target.value)}
                      placeholder="שם מלא"
                    />
                  </div>
                </div>

                {/* Destination checklist for new user */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      הרשאות קבוצות
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setInviteFullAccess(!inviteFullAccess);
                        if (!inviteFullAccess) setInviteDestinations([]);
                      }}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="text-muted-foreground">גישה מלאה</span>
                      <span
                        className={`relative inline-block h-5 w-9 rounded-full transition-colors ${
                          inviteFullAccess ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                            inviteFullAccess ? "translate-x-0.5" : "translate-x-4"
                          }`}
                        />
                      </span>
                    </button>
                  </div>
                  {!inviteFullAccess && (
                    <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border/50 p-2">
                      {destinations.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">
                          אין קבוצות יעד זמינות
                        </p>
                      ) : (
                        destinations.map((dest) => {
                          const checked = inviteDestinations.includes(dest.id);
                          const wa = isWhatsApp(dest.platform);
                          return (
                            <label
                              key={dest.id}
                              className={`flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-all ${
                                checked
                                  ? wa
                                    ? "bg-emerald-500/10 border border-emerald-500/20"
                                    : "bg-blue-500/10 border border-blue-500/20"
                                  : "border border-transparent hover:bg-muted/30"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleInviteDest(dest.id)}
                                className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                              />
                              {wa ? (
                                <MessageSquare className="h-4 w-4 shrink-0 text-emerald-600" />
                              ) : (
                                <Bot className="h-4 w-4 shrink-0 text-blue-600" />
                              )}
                              <span className="text-sm">
                                {dest.display_name || dest.platform_dest_id}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  wa
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {destTypeLabel[dest.destination_type] || dest.destination_type}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {inviteError && <p className="text-xs text-red-600">{inviteError}</p>}
                {inviteSuccess && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm text-emerald-700 font-medium">{inviteSuccess}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={inviteMember}
                    disabled={inviting || !inviteEmail.trim()}
                    className="bg-gradient-to-r from-violet-500 to-blue-600"
                  >
                    {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "הזמן"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowInviteForm(false);
                      setInviteError(null);
                      setInviteSuccess(null);
                    }}
                  >
                    ביטול
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ F) Invoices ═══ */}
      <Card glass className={glassCard}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              קבלות וחשבוניות
            </CardTitle>
            <a href="/dashboard/settings/receipts">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                צפה בכל הקבלות
                <span className="text-base">←</span>
              </Button>
            </a>
          </div>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              אין קבלות להצגה
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="py-2 px-3 text-right font-medium">מספר חשבונית</th>
                    <th className="py-2 px-3 text-right font-medium">סכום</th>
                    <th className="py-2 px-3 text-right font-medium">סטטוס</th>
                    <th className="py-2 px-3 text-right font-medium">תאריך</th>
                    <th className="py-2 px-3 text-right font-medium">הורדה</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                    >
                      <td className="py-3 px-3 font-mono text-xs">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3 px-3">
                        {inv.amount.toLocaleString()} {inv.currency || "ILS"}
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          variant="outline"
                          className={statusColors[inv.status] || ""}
                        >
                          {statusLabels[inv.status] || inv.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">
                        {new Date(inv.issued_at).toLocaleDateString("he-IL")}
                      </td>
                      <td className="py-3 px-3">
                        <a href="/dashboard/settings/receipts">
                          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground hover:text-primary">
                            <FileText className="h-3 w-3" />
                            פרטים
                          </Button>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ G) Feature Requests ═══ */}
      <Card glass className={glassCard}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lightbulb className="h-5 w-5 text-primary" />
            בקשות פיצ&apos;ר
          </CardTitle>
          <CardDescription>הצע תכונות חדשות ועקוב אחרי הסטטוס שלהן</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Submit form */}
          <div className="flex gap-2">
            <Input
              value={featureText}
              onChange={(e) => setFeatureText(e.target.value)}
              placeholder="תאר את הפיצ'ר שהיית רוצה..."
              className="flex-1"
            />
            <Button
              onClick={submitFeature}
              disabled={featureSubmitting || !featureText.trim()}
              size="sm"
              className="bg-gradient-to-r from-violet-500 to-blue-600"
            >
              {featureSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* List */}
          {featureLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : featureRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              עדיין לא הוגשו בקשות
            </p>
          ) : (
            <div className="space-y-2">
              {featureRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 p-3"
                >
                  <p className="text-sm flex-1">{req.text}</p>
                  <Badge
                    variant="outline"
                    className={featureStatusColors[req.status] || ""}
                  >
                    {featureStatusLabels[req.status] || req.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ H) Queue Management ═══ */}
      <Card glass className={glassCard}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListRestart className="h-5 w-5 text-primary" />
            ניהול תור
          </CardTitle>
          <CardDescription>ניהול פריטים ממתינים בתור השליחה</CardDescription>
        </CardHeader>
        <CardContent>
          {queueLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : pausedCount === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              אין פריטים מושהים בתור
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-amber-200/50 bg-amber-50/50 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                  <ListRestart className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {pausedCount} פריטים מושהים בתור
                  </p>
                  <p className="text-xs text-muted-foreground">
                    בחר חשבון ושלח מחדש
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">בחר חשבון</label>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="w-full rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-sm"
                >
                  <option value="">בחר חשבון...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.display_name || acc.account_identifier || acc.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                onClick={resumeQueue}
                disabled={resuming || !selectedAccount}
                className="w-full bg-gradient-to-r from-violet-500 to-blue-600"
              >
                {resuming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "חדש שליחה"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
