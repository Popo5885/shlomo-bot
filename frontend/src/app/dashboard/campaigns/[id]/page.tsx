"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Loader2,
  Play,
  XCircle,
  Trash2,
  Send,
  CheckCircle2,
  Clock,
  BarChart3,
  Target,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
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
import { MagneticButton } from "@/components/effects/magnetic-button";
import { api, ApiError } from "@/lib/api";
import type { Campaign, CampaignStatus } from "@/types/api";

interface Dispatch {
  id: string;
  destination_id: string;
  destination_name?: string;
  is_success: boolean | null;
  failure_reason?: string;
  platform_error_code?: string;
  sent_at?: string;
  views_count?: number;
}

const statusStyles: Record<CampaignStatus, string> = {
  draft: "border-slate-200/50 bg-slate-50/80 text-slate-600",
  pending_approval: "border-amber-200/50 bg-amber-50/80 text-amber-700",
  running: "border-blue-200/50 bg-blue-50/80 text-blue-700",
  completed: "border-emerald-200/50 bg-emerald-50/80 text-emerald-700",
  cancelled: "border-red-200/50 bg-red-50/80 text-red-700",
};

const statusLabels: Record<CampaignStatus, string> = {
  draft: "טיוטה",
  pending_approval: "ממתין לאישור",
  running: "פעיל",
  completed: "הושלם",
  cancelled: "בוטל",
};

interface CampaignWithTargets extends Campaign {
  targets?: { id: string; display_name: string | null }[];
}

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignWithTargets | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [dispatchesLoading, setDispatchesLoading] = useState(false);
  const [showDispatches, setShowDispatches] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<CampaignWithTargets>(`/api/client/campaigns/${id}`)
      .then(setCampaign)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const loadDispatches = async () => {
    setDispatchesLoading(true);
    try {
      const data = await api.get<Dispatch[]>(`/api/client/campaigns/${id}/dispatches`);
      setDispatches(data);
      setShowDispatches(true);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setDispatchesLoading(false);
    }
  };

  const resendFailed = async () => {
    setResendLoading(true);
    setError(null);
    try {
      const res = await api.post<{ requeued: number }>(`/api/client/campaigns/${id}/resend-failed`);
      setError(null);
      // Refresh dispatches and campaign
      const [updatedCampaign, updatedDispatches] = await Promise.all([
        api.get<CampaignWithTargets>(`/api/client/campaigns/${id}`),
        api.get<Dispatch[]>(`/api/client/campaigns/${id}/dispatches`),
      ]);
      setCampaign(updatedCampaign);
      setDispatches(updatedDispatches);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setResendLoading(false);
    }
  };

  const triggerCampaign = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await api.post<{ messages_enqueued: number }>(
        `/api/client/campaigns/${id}/trigger`
      );
      setCampaign((prev) =>
        prev ? { ...prev, status: "running", total_targets: res.messages_enqueued } : prev
      );
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const cancelCampaign = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await api.post(`/api/client/campaigns/${id}/cancel`);
      setCampaign((prev) =>
        prev ? { ...prev, status: "cancelled" } : prev
      );
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const deleteCampaign = async () => {
    setActionLoading(true);
    try {
      await api.delete(`/api/client/campaigns/${id}`);
      router.push("/dashboard/campaigns");
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

  if (!campaign) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        הקמפיין לא נמצא
      </div>
    );
  }

  const progress =
    campaign.total_targets > 0
      ? (campaign.sent_count / campaign.total_targets) * 100
      : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/campaigns">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {campaign.name}
              </h1>
              <Badge
                variant="outline"
                className={statusStyles[campaign.status]}
              >
                {statusLabels[campaign.status]}
              </Badge>
            </div>
            {campaign.description && (
              <p className="mt-1 text-muted-foreground">
                {campaign.description}
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

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          {
            label: "סה״כ יעדים",
            value: campaign.total_targets,
            icon: Target,
            color: "text-blue-600 bg-blue-100",
          },
          {
            label: "נשלחו",
            value: campaign.sent_count,
            icon: Send,
            color: "text-violet-600 bg-violet-100",
          },
          {
            label: "נמסרו",
            value: campaign.delivered_count,
            icon: CheckCircle2,
            color: "text-emerald-600 bg-emerald-100",
          },
          {
            label: "נכשלו",
            value: campaign.failed_count,
            icon: XCircle,
            color: "text-red-600 bg-red-100",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.color}`}
              >
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress */}
      {campaign.total_targets > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">התקדמות</span>
              <span className="font-semibold">{progress.toFixed(1)}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500 transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campaign Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">הגדרות</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">מהירות שליחה</dt>
              <dd className="font-medium capitalize">{campaign.delay_preset}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">טווח השהייה</dt>
              <dd className="font-medium">
                {campaign.delay_min_seconds}s - {campaign.delay_max_seconds}s
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">אחוז הצלחה</dt>
              <dd className="font-medium">{campaign.success_rate}%</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">אישור</dt>
              <dd className="font-medium">
                {campaign.requires_approval ? "נדרש" : "לא נדרש"}
              </dd>
            </div>
            {campaign.scheduled_at && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">מתוזמן ל</dt>
                <dd className="font-medium">
                  {new Date(campaign.scheduled_at).toLocaleString("he-IL")}
                </dd>
              </div>
            )}
            {campaign.message_text && (
              <div className="col-span-2">
                <dt className="text-muted-foreground">הודעה</dt>
                <dd className="mt-1 rounded-lg bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">
                  {campaign.message_text}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Dispatches Drill-Down */}
      {(campaign.status === "running" || campaign.status === "completed" || campaign.status === "cancelled") && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">פירוט שליחות</CardTitle>
              <div className="flex items-center gap-2">
                {campaign.failed_count > 0 && showDispatches && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={resendFailed}
                    disabled={resendLoading}
                    className="text-amber-600 border-amber-200 hover:bg-amber-50"
                  >
                    {resendLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    שלח מחדש נכשלים
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (showDispatches) {
                      setShowDispatches(false);
                    } else {
                      loadDispatches();
                    }
                  }}
                  disabled={dispatchesLoading}
                >
                  {dispatchesLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : showDispatches ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  {showDispatches ? "הסתר" : "הצג פירוט"}
                </Button>
              </div>
            </div>
          </CardHeader>
          {showDispatches && (
            <CardContent>
              {dispatches.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  אין שליחות להצגה
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-right text-muted-foreground">
                        <th className="p-3">יעד</th>
                        <th className="p-3">סטטוס</th>
                        <th className="p-3">צפיות</th>
                        <th className="p-3">זמן שליחה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispatches.map((d) => (
                        <>
                          <tr
                            key={d.id}
                            className={`border-b transition-colors hover:bg-muted/50 ${
                              d.is_success === false ? "cursor-pointer" : ""
                            }`}
                            onClick={() => {
                              if (d.is_success === false) {
                                setExpandedRow(expandedRow === d.id ? null : d.id);
                              }
                            }}
                          >
                            <td className="p-3 font-medium">
                              {d.destination_name || d.destination_id.slice(0, 8)}
                            </td>
                            <td className="p-3">
                              {d.is_success === true && (
                                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                                  <CheckCircle2 className="h-3 w-3 ml-1" />
                                  נשלח
                                </Badge>
                              )}
                              {d.is_success === false && (
                                <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                                  <AlertTriangle className="h-3 w-3 ml-1" />
                                  נכשל
                                  <ChevronDown className="h-3 w-3 mr-1" />
                                </Badge>
                              )}
                              {d.is_success === null && (
                                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                                  <Clock className="h-3 w-3 ml-1" />
                                  ממתין
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {d.views_count ?? "—"}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {d.sent_at
                                ? new Date(d.sent_at).toLocaleString("he-IL")
                                : "—"}
                            </td>
                          </tr>
                          {expandedRow === d.id && d.is_success === false && (
                            <tr key={`${d.id}-detail`} className="bg-red-50/50">
                              <td colSpan={4} className="px-6 py-3">
                                <div className="flex items-start gap-3 text-sm">
                                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                                  <div className="space-y-1">
                                    {d.failure_reason && (
                                      <p className="text-red-700">
                                        <span className="font-medium">סיבה: </span>
                                        {d.failure_reason}
                                      </p>
                                    )}
                                    {d.platform_error_code && (
                                      <p className="text-red-600/70 font-mono text-xs">
                                        קוד שגיאה: {d.platform_error_code}
                                      </p>
                                    )}
                                    {!d.failure_reason && !d.platform_error_code && (
                                      <p className="text-red-600/70">לא צוינה סיבת כשלון</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">פעולות</CardTitle>
          <CardDescription>
            ניהול מחזור חיי הקמפיין
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {campaign.status === "draft" && (
            <>
              <MagneticButton>
                <Button
                  onClick={triggerCampaign}
                  disabled={actionLoading}
                  className="bg-gradient-to-r from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-500/25"
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  הפעל קמפיין
                </Button>
              </MagneticButton>
              <Button
                variant="destructive"
                onClick={deleteCampaign}
                disabled={actionLoading}
              >
                <Trash2 className="h-4 w-4" />
                מחק
              </Button>
            </>
          )}
          {campaign.status === "running" && (
            <Button
              variant="destructive"
              onClick={cancelCampaign}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              בטל קמפיין
            </Button>
          )}
          {(campaign.status === "completed" ||
            campaign.status === "cancelled") && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BarChart3 className="h-4 w-4" />
              הקמפיין {statusLabels[campaign.status]}. אין פעולות זמינות.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
