"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Loader2,
  GitBranch,
  Trash2,
  Zap,
  ZapOff,
  BarChart3,
  Forward,
  Image,
  FileText,
  UserX,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import type { DistributionRule, Destination } from "@/types/api";

interface RuleWithDestinations extends DistributionRule {
  destinations?: Destination[];
}

export default function RuleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [rule, setRule] = useState<RuleWithDestinations | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<RuleWithDestinations>(`/api/client/rules/${id}`)
      .then(setRule)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const toggleActive = async () => {
    if (!rule) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.patch(`/api/client/rules/${id}`, {
        is_active: !rule.is_active,
      });
      setRule((prev) =>
        prev ? { ...prev, is_active: !prev.is_active } : prev
      );
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const deleteRule = async () => {
    setActionLoading(true);
    try {
      await api.delete(`/api/client/rules/${id}`);
      router.push("/dashboard/rules");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        כלל ההפצה לא נמצא
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/rules">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {rule.name}
              </h1>
              <Badge
                variant="outline"
                className={
                  rule.is_active
                    ? "border-emerald-200/50 bg-emerald-50/80 text-emerald-700"
                    : "border-slate-200/50 bg-slate-50/80 text-slate-600"
                }
              >
                {rule.is_active ? (
                  <Zap className="ml-1 h-3 w-3" />
                ) : (
                  <ZapOff className="ml-1 h-3 w-3" />
                )}
                {rule.is_active ? "פעיל" : "לא פעיל"}
              </Badge>
            </div>
            {rule.source_group_name && (
              <p className="mt-1 text-muted-foreground">
                מקור: {rule.source_group_name}
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200/50 bg-red-50/80 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{rule.total_dispatched}</p>
              <p className="text-xs text-muted-foreground">סה״כ נשלחו</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <Forward className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{rule.total_failed}</p>
              <p className="text-xs text-muted-foreground">נכשלו</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold capitalize">
                {rule.delay_preset || rule.delay_mode}
              </p>
              <p className="text-xs text-muted-foreground">מהירות</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">הגדרות</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">מצב השהייה</dt>
              <dd className="font-medium capitalize">{rule.delay_mode}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">טווח השהייה</dt>
              <dd className="font-medium">
                {rule.delay_min_seconds}s - {rule.delay_max_seconds}s
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              {
                active: rule.forward_media,
                icon: Image,
                label: "העברת מדיה",
              },
              {
                active: rule.forward_files,
                icon: FileText,
                label: "העברת קבצים",
              },
              {
                active: rule.strip_sender_info,
                icon: UserX,
                label: "הסרת שולח",
              },
              {
                active: rule.requires_approval,
                icon: ShieldCheck,
                label: "דורש אישור",
              },
            ].map((feat) => (
              <Badge
                key={feat.label}
                variant="outline"
                className={
                  feat.active
                    ? "border-emerald-200/50 bg-emerald-50/80 text-emerald-700"
                    : "border-slate-200/50 bg-slate-50/80 text-slate-500 line-through"
                }
              >
                <feat.icon className="ml-1 h-3 w-3" />
                {feat.label}
              </Badge>
            ))}
          </div>
          {rule.append_suffix_enabled && rule.append_suffix && (
            <div className="mt-4">
              <dt className="text-sm text-muted-foreground">סיומת</dt>
              <dd className="mt-1 rounded-lg bg-muted/50 p-3 font-mono text-xs">
                {rule.append_suffix}
              </dd>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Destinations */}
      {rule.destinations && rule.destinations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">יעדים</CardTitle>
            <CardDescription>
              {rule.destinations.length} יעדים מוגדרים
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rule.destinations.map((dest) => (
                <div
                  key={dest.id}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-background/50 p-3 backdrop-blur-sm"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {dest.display_name || dest.platform_dest_id}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {dest.platform_dest_id}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">
                    {dest.destination_type}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">פעולות</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            onClick={toggleActive}
            disabled={actionLoading}
            variant={rule.is_active ? "outline" : "default"}
            className={
              !rule.is_active
                ? "bg-gradient-to-r from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-500/25"
                : ""
            }
          >
            {actionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : rule.is_active ? (
              <ZapOff className="h-4 w-4" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {rule.is_active ? "השבת" : "הפעל"}
          </Button>
          <Button
            variant="destructive"
            onClick={deleteRule}
            disabled={actionLoading}
          >
            <Trash2 className="h-4 w-4" />
            מחק הפצה
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
