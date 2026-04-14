"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  GitBranch,
  Plus,
  Loader2,
  ArrowLeft,
  Zap,
  ZapOff,
  BarChart3,
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
import { TiltCard } from "@/components/effects/tilt-card";
import { api, ApiError } from "@/lib/api";
import type { DistributionRule } from "@/types/api";

export default function RulesPage() {
  const [rules, setRules] = useState<DistributionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DistributionRule[]>("/api/client/rules")
      .then(setRules)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            כללי הפצה
          </h1>
          <p className="text-muted-foreground">
            העברה אוטומטית של הודעות מקבוצת מקור לקבוצות יעד
          </p>
        </div>
        <Link href="/dashboard/rules/new">
          <Button className="bg-gradient-to-r from-violet-500 to-violet-700 shadow-lg shadow-violet-500/25">
            <Plus className="h-4 w-4" />
            הפצה חדשה
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200/50 bg-red-50/80 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10">
              <GitBranch className="h-8 w-8 text-violet-500/50" />
            </div>
            <div className="text-center">
              <p className="font-semibold">אין כללי הפצה מוגדרים</p>
              <p className="mt-1 text-sm text-muted-foreground">
                צור כלל הפצה כדי להתחיל להעביר הודעות אוטומטית
              </p>
            </div>
            <Link href="/dashboard/rules/new">
              <Button>
                <Plus className="h-4 w-4" />
                צור הפצה
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((rule) => (
            <TiltCard key={rule.id} className="rounded-xl" maxTilt={5}>
              <Link href={`/dashboard/rules/${rule.id}`}>
                <Card className="h-full cursor-pointer transition-all duration-200 hover:shadow-lg">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base line-clamp-1">
                        {rule.name}
                      </CardTitle>
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
                      <CardDescription className="line-clamp-1">
                        מקור: {rule.source_group_name}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <BarChart3 className="h-3.5 w-3.5" />
                          <span>{rule.total_dispatched} נשלחו</span>
                        </div>
                        {rule.total_failed > 0 && (
                          <span className="text-red-500">
                            {rule.total_failed} נכשלו
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs capitalize">
                        {rule.delay_preset || rule.delay_mode}
                        <ArrowLeft className="h-3 w-3" />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {rule.forward_media && (
                        <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          מדיה
                        </span>
                      )}
                      {rule.forward_files && (
                        <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          קבצים
                        </span>
                      )}
                      {rule.strip_sender_info && (
                        <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          אנונימי
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </TiltCard>
          ))}
        </div>
      )}
    </div>
  );
}
