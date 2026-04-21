"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Users, Shield, Clock, Loader2, Plus, ChevronDown,
  CheckCircle, AlertCircle, Trash2
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

interface Member {
  id: string;
  email: string;
  full_name: string | null;
  is_owner: boolean;
  is_active: boolean;
  role_slug: string;
  last_login_at: string | null;
}

interface Role {
  id: string;
  name: string;
  slug: string;
  can_send_free: boolean;
  requires_approval: boolean;
  can_approve_messages: boolean;
  can_manage_campaigns: boolean;
  can_manage_members: boolean;
  can_view_analytics: boolean;
}

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string | null;
  actor_email: string | null;
  actor_name: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

const PERM_LABELS: Record<string, string> = {
  can_send_free: "שליחה חופשית",
  requires_approval: "דורש אישור",
  can_approve_messages: "אישור הודעות",
  can_manage_campaigns: "ניהול קמפיינים",
  can_manage_members: "ניהול חברים",
  can_view_analytics: "צפייה באנליטיקס",
  can_manage_crm: "ניהול CRM",
  can_manage_bot_settings: "הגדרות בוט",
  can_manage_destinations: "ניהול יעדים",
};

function actionLabel(action: string) {
  const map: Record<string, string> = {
    "member.role_changed": "שינוי תפקיד",
    "role.created": "יצירת תפקיד",
    "member.invited": "הזמנת חבר",
    "member.removed": "הסרת חבר",
    "campaign.created": "יצירת קמפיין",
    "campaign.sent": "שליחת קמפיין",
  };
  return map[action] ?? action;
}

export default function TeamPage() {
  const { member: me } = useAuthStore();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"members" | "roles" | "audit">("members");

  // Role creation form
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePerms, setNewRolePerms] = useState({
    can_send_free: false, requires_approval: true,
    can_approve_messages: false, can_manage_campaigns: false,
    can_manage_members: false, can_manage_destinations: false,
    can_view_analytics: false, can_manage_crm: false, can_manage_bot_settings: false,
  });
  const [creatingRole, setCreatingRole] = useState(false);
  const [roleMsg, setRoleMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Member[]>("/api/client/members"),
      api.get<Role[]>("/api/client/roles"),
      api.get<{ data: AuditEntry[] }>("/api/client/audit-log?limit=50"),
    ]).then(([m, r, a]) => {
      setMembers(m);
      setRoles(r);
      setAuditLog(a.data ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const changeRole = async (memberId: string, roleSlug: string) => {
    await api.patch(`/api/client/members/${memberId}/role`, { role_slug: roleSlug });
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role_slug: roleSlug } : m));
  };

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingRole(true);
    setRoleMsg(null);
    try {
      const role = await api.post<Role>("/api/client/roles", { name: newRoleName, ...newRolePerms });
      setRoles((prev) => [...prev, role]);
      setNewRoleName("");
      setRoleMsg({ type: "ok", text: "התפקיד נוצר בהצלחה!" });
    } catch (err) {
      setRoleMsg({ type: "err", text: err instanceof Error ? err.message : "שגיאה" });
    } finally {
      setCreatingRole(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/settings">
          <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">ניהול צוות</h1>
          <p className="text-muted-foreground">חברי צוות, תפקידים ויומן פעולות</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {([["members", "חברים", Users], ["roles", "תפקידים", Shield], ["audit", "יומן", Clock]] as const).map(([tab, label, Icon]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Members Tab */}
      {activeTab === "members" && (
        <div className="space-y-3">
          {members.map((m) => (
            <Card key={m.id} glass>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {(m.full_name ?? m.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{m.full_name ?? m.email}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {m.is_owner ? (
                    <Badge variant="default">בעלים</Badge>
                  ) : me?.is_owner ? (
                    <select
                      value={m.role_slug}
                      onChange={(e) => changeRole(m.id, e.target.value)}
                      className="text-xs border rounded-lg px-2 py-1 bg-background"
                    >
                      {roles.map((r) => (
                        <option key={r.slug} value={r.slug}>{r.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Badge variant="outline">{m.role_slug}</Badge>
                  )}
                  <Badge variant={m.is_active ? "default" : "outline"} className={m.is_active ? "bg-emerald-500/20 text-emerald-700" : ""}>
                    {m.is_active ? "פעיל" : "לא פעיל"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Roles Tab */}
      {activeTab === "roles" && (
        <div className="space-y-6">
          {/* Existing roles */}
          <div className="space-y-3">
            {roles.map((r) => (
              <Card key={r.id} glass>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold">{r.name}</p>
                    <Badge variant="outline" className="text-xs">{r.slug}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(PERM_LABELS).map(([key, label]) => {
                      const val = (r as any)[key];
                      if (val === undefined) return null;
                      return (
                        <span key={key} className={`text-xs px-2 py-0.5 rounded-full ${val ? "bg-emerald-500/10 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Create new role */}
          <Card glass>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> יצירת תפקיד חדש</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createRole} className="space-y-4">
                {roleMsg && (
                  <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${roleMsg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {roleMsg.type === "ok" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {roleMsg.text}
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium">שם התפקיד</label>
                  <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} required placeholder="למשל: מנהל שיווק" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(PERM_LABELS).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(newRolePerms as any)[key] ?? false}
                        onChange={(e) => setNewRolePerms((p) => ({ ...p, [key]: e.target.checked }))}
                        className="rounded"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <Button type="submit" disabled={creatingRole || !newRoleName}>
                  {creatingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : "צור תפקיד"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === "audit" && (
        <div className="space-y-2">
          {auditLog.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">אין פעולות ביומן עדיין.</p>
          )}
          {auditLog.map((entry) => (
            <Card key={entry.id} glass>
              <CardContent className="p-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <Shield className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{actionLabel(entry.action)}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.actor_name ?? entry.actor_email ?? "מערכת"}
                      {entry.entity_type && ` · ${entry.entity_type}`}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(entry.created_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
