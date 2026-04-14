"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Send,
  GitBranch,
  Users,
  Zap,
  TrendingUp,
  CalendarDays,
  CheckCircle,
  XCircle,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  FileText,
  BarChart3,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import type { DashboardStats, RuleWithStats } from "@/types/api";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingRule, setTogglingRule] = useState<string | null>(null);

  const fetchStats = () => {
    api
      .get<DashboardStats>("/api/client/stats/overview")
      .then(setStats)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const toggleRule = async (rule: RuleWithStats) => {
    setTogglingRule(rule.id);
    try {
      await api.patch(`/api/client/rules/${rule.id}`, {
        is_active: !rule.is_active,
      });
      fetchStats();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setTogglingRule(null);
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      await api.delete(`/api/client/rules/${ruleId}`);
      fetchStats();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const statCards = [
    {
      title: "סה״כ הודעות נשלחו",
      value: stats?.total_sent_all_time ?? 0,
      icon: TrendingUp,
      gradient: "from-blue-500 to-cyan-500",
      bgGlow: "bg-blue-500/10",
    },
    {
      title: "נשלחו היום",
      value: stats?.sent_today ?? 0,
      icon: CalendarDays,
      gradient: "from-violet-500 to-purple-500",
      bgGlow: "bg-violet-500/10",
    },
    {
      title: "קבוצות יעד",
      value: stats?.total_groups ?? 0,
      icon: Users,
      gradient: "from-emerald-500 to-green-500",
      bgGlow: "bg-emerald-500/10",
    },
    {
      title: "אוטומציות פעילות",
      value: stats?.active_rules ?? 0,
      icon: Zap,
      gradient: "from-amber-500 to-orange-500",
      bgGlow: "bg-amber-500/10",
    },
  ];

  return (
    <div className="space-y-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">מרכז הבקרה</h1>
          <p className="text-muted-foreground">סקירה כללית של סביבת העבודה</p>
        </div>
        <Link href="/dashboard/insights">
          <Button variant="outline" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            תובנות ואנליטיקס
          </Button>
        </Link>
      </div>

      {/* Premium Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title} glass>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight">
                    {card.value.toLocaleString()}
                  </p>
                </div>
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${card.bgGlow}`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient} shadow-lg`}
                  >
                    <card.icon className="h-5 w-5 text-white" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today's Activity */}
      {stats?.today && (
        <Card glass>
          <CardHeader>
            <CardTitle className="text-lg">פעילות היום</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl border border-blue-200/30 bg-blue-500/5 p-4 backdrop-blur-sm">
                <Send className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold text-blue-600">
                    {stats.today.sent}
                  </p>
                  <p className="text-sm text-blue-500/80">נשלחו</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200/30 bg-emerald-500/5 p-4 backdrop-blur-sm">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-2xl font-bold text-emerald-600">
                    {stats.today.delivered}
                  </p>
                  <p className="text-sm text-emerald-500/80">נמסרו</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-red-200/30 bg-red-500/5 p-4 backdrop-blur-sm">
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-2xl font-bold text-red-600">
                    {stats.today.failed}
                  </p>
                  <p className="text-sm text-red-500/80">נכשלו</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Rules Grid */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">כללי הפצה</h2>
          <Link href="/dashboard/rules/new">
            <Button className="bg-gradient-to-r from-violet-500 to-blue-600 shadow-lg shadow-violet-500/25">
              + הפצה חדשה
            </Button>
          </Link>
        </div>

        {stats?.rules && stats.rules.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.rules.map((rule) => (
              <Card key={rule.id} glass className="group relative overflow-hidden">
                <CardContent className="p-5">
                  {/* Header */}
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex-1">
                      <Link
                        href={`/dashboard/rules/${rule.id}`}
                        className="text-base font-semibold hover:text-primary transition-colors"
                      >
                        {rule.name}
                      </Link>
                    </div>
                    {/* Status Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleRule(rule)}
                      disabled={togglingRule === rule.id}
                      className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                        rule.is_active ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          rule.is_active ? "translate-x-0.5" : "translate-x-5"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Stats Row */}
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 p-3 text-center">
                      <p className="text-xl font-bold text-blue-600">
                        {rule.messages_sent}
                      </p>
                      <p className="text-xs text-muted-foreground">הודעות נשלחו</p>
                    </div>
                    <div className="rounded-lg bg-gradient-to-br from-violet-500/10 to-purple-500/10 p-3 text-center">
                      <p className="text-xl font-bold text-violet-600">
                        {rule.target_count}
                      </p>
                      <p className="text-xs text-muted-foreground">קבוצות יעד</p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="mb-3">
                    <Badge
                      variant={rule.is_active ? "default" : "secondary"}
                      className={
                        rule.is_active
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-200/50"
                          : ""
                      }
                    >
                      {rule.is_active ? "פעיל" : "מושהה"}
                    </Badge>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Link href={`/dashboard/rules/${rule.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-1.5">
                        <Pencil className="h-3.5 w-3.5" />
                        עריכה
                      </Button>
                    </Link>
                    <Link href={`/dashboard/rules/${rule.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        לוגים
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteRule(rule.id)}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card glass>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <GitBranch className="h-12 w-12 text-muted-foreground/30" />
              <p className="mt-4 text-lg font-medium text-muted-foreground">
                אין כללי הפצה עדיין
              </p>
              <p className="mt-1 text-sm text-muted-foreground/70">
                צור את כלל ההפצה הראשון שלך כדי להתחיל
              </p>
              <Link href="/dashboard/rules/new" className="mt-4">
                <Button className="bg-gradient-to-r from-violet-500 to-blue-600">
                  + צור הפצה חדשה
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
