"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  ArrowRight,
  Eye,
  Clock,
  TrendingUp,
  CalendarDays,
  Loader2,
  Sparkles,
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
import { api } from "@/lib/api";
import type {
  BestSendTimeData,
  HourlyStat,
  ViewsData,
  DailyTrend,
} from "@/types/api";

export default function InsightsPage() {
  const [sendTimeData, setSendTimeData] = useState<BestSendTimeData | null>(null);
  const [viewsData, setViewsData] = useState<ViewsData | null>(null);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<BestSendTimeData>("/api/client/stats/best-send-time").catch(() => null),
      api.get<ViewsData>("/api/client/stats/views").catch(() => null),
      api.get<DailyTrend[]>("/api/client/stats/daily-trend").catch(() => []),
    ])
      .then(([st, v, dt]) => {
        setSendTimeData(st);
        setViewsData(v);
        setDailyTrend(dt as DailyTrend[]);
      })
      .finally(() => setLoading(false));
  }, []);

  const formatHour = (hour: number) => `${hour.toString().padStart(2, "0")}:00`;

  // Build full 24h array for the chart
  const hourlyChartData = Array.from({ length: 24 }, (_, h) => {
    const found = sendTimeData?.hourly.find((s) => s.hour === h);
    return {
      hour: formatHour(h),
      hourNum: h,
      total_sent: found?.total_sent ?? 0,
      success_rate: found?.success_rate ?? 0,
      total_views: found?.total_views ?? 0,
      actual_views: found?.actual_views ?? 0,
      view_rate: found?.view_rate ?? 0,
      isBest: sendTimeData?.best_hour === h,
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon">
            <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">תובנות ואנליטיקס</h1>
          <p className="text-muted-foreground">
            ניתוח מתקדם של ביצועי ההודעות שלך
          </p>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card glass>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10">
                <Eye className="h-6 w-6 text-violet-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">סה״כ צפיות</p>
                <p className="text-2xl font-bold">
                  {(viewsData?.total_views ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card glass>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
                <Clock className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">שעת שליחה מומלצת</p>
                <p className="text-2xl font-bold">
                  {sendTimeData?.best_hour !== null
                    ? formatHour(sendTimeData!.best_hour!)
                    : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card glass>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10">
                <TrendingUp className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">אחוז הצלחה גבוה</p>
                <p className="text-2xl font-bold">
                  {sendTimeData?.best_success_rate !== null
                    ? `${sendTimeData!.best_success_rate}%`
                    : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Recommendation */}
      {sendTimeData?.best_hour !== null && (
        <Card glass className="border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-blue-500/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-500">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-base font-semibold">המלצת AI לשעת שליחה</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  על סמך ניתוח הנתונים שלך, השעה{" "}
                  <span className="font-bold text-violet-600">
                    {formatHour(sendTimeData!.best_hour!)}
                  </span>{" "}
                  היא הזמן האופטימלי לשליחת הודעות עם אחוז הצלחה של{" "}
                  <span className="font-bold text-emerald-600">
                    {sendTimeData!.best_success_rate}%
                  </span>
                  . מומלץ לתזמן את הקמפיינים הבאים לשעה זו.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Best Send Time Chart */}
      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-primary" />
            שעות שליחה אופטימליות
          </CardTitle>
          <CardDescription>
            אחוז הצלחה לפי שעה ביממה (24 שעות)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyChartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "12px",
                    fontSize: "13px",
                    direction: "rtl",
                  }}
                  formatter={(value, name) => {
                    if (name === "success_rate") return [`${value}%`, "אחוז הצלחה"];
                    return [`${value}`, "הודעות"];
                  }}
                  labelFormatter={(label) => `שעה: ${label}`}
                />
                <Bar
                  dataKey="success_rate"
                  name="success_rate"
                  radius={[6, 6, 0, 0]}
                  fill="url(#barGradient)"
                />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Daily Trend Chart */}
      {dailyTrend.length > 0 && (
        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5 text-primary" />
              מגמת שליחה (30 יום אחרונים)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTrend} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="stat_date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(d) => new Date(d).toLocaleDateString("he-IL", { day: "numeric", month: "short" })}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      fontSize: "13px",
                      direction: "rtl",
                    }}
                    labelFormatter={(d) => new Date(d).toLocaleDateString("he-IL")}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = {
                        sent: "נשלחו",
                        delivered: "נמסרו",
                        failed: "נכשלו",
                      };
                      return [`${value}`, labels[name as string] || String(name)];
                    }}
                  />
                  <defs>
                    <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="deliveredGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="sent"
                    stroke="#3b82f6"
                    fill="url(#sentGrad)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="delivered"
                    stroke="#10b981"
                    fill="url(#deliveredGrad)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Views Drill-Down by Destination */}
      {viewsData && viewsData.destinations.length > 0 && (
        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Eye className="h-5 w-5 text-primary" />
              צפיות לפי קבוצת יעד
            </CardTitle>
            <CardDescription>כמה צפיות קיבלה כל הודעה בכל קבוצה</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {viewsData.destinations.map((dest) => {
                const viewRate =
                  dest.total_messages > 0
                    ? Math.round((dest.total_views / dest.total_messages) * 100)
                    : 0;

                return (
                  <div
                    key={dest.destination_id}
                    className="flex items-center justify-between rounded-xl border border-border/50 p-4 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {dest.display_name || dest.platform_dest_id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dest.total_messages} הודעות | {dest.successful} הצליחו
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-left">
                        <p className="text-lg font-bold text-violet-600">
                          {dest.total_views}
                        </p>
                        <p className="text-xs text-muted-foreground">צפיות</p>
                      </div>
                      <Badge
                        variant="secondary"
                        className="bg-violet-500/10 text-violet-600 border-violet-200/50"
                      >
                        {viewRate}%
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
