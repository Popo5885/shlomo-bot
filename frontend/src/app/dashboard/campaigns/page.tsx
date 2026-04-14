"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Send,
  Plus,
  Loader2,
  Play,
  Pause,
  CheckCircle2,
  Clock,
  FileEdit,
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
import type { Campaign, CampaignStatus } from "@/types/api";

const statusIcons: Record<CampaignStatus, typeof Play> = {
  draft: FileEdit,
  pending_approval: Clock,
  running: Play,
  completed: CheckCircle2,
  cancelled: Pause,
};

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

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Campaign[]>("/api/client/campaigns")
      .then(setCampaigns)
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
          <h1 className="text-2xl font-bold tracking-tight">קמפיינים</h1>
          <p className="text-muted-foreground">
            צור ונהל קמפיינים להפצת הודעות
          </p>
        </div>
        <Link href="/dashboard/campaigns/new">
          <Button className="bg-gradient-to-r from-blue-500 to-blue-700 shadow-lg shadow-blue-500/25">
            <Plus className="h-4 w-4" />
            קמפיין חדש
          </Button>
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200/50 bg-red-50/80 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Send className="h-8 w-8 text-primary/50" />
            </div>
            <div className="text-center">
              <p className="font-semibold">אין קמפיינים עדיין</p>
              <p className="mt-1 text-sm text-muted-foreground">
                צור את הקמפיין הראשון שלך כדי להתחיל לשלוח הודעות
              </p>
            </div>
            <Link href="/dashboard/campaigns/new">
              <Button>
                <Plus className="h-4 w-4" />
                צור קמפיין
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const StatusIcon = statusIcons[campaign.status];
            return (
              <TiltCard key={campaign.id} className="rounded-xl" maxTilt={5}>
                <Link href={`/dashboard/campaigns/${campaign.id}`}>
                  <Card className="h-full cursor-pointer transition-all duration-200 hover:shadow-lg">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base line-clamp-1">
                          {campaign.name}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className={statusStyles[campaign.status]}
                        >
                          <StatusIcon className="ml-1 h-3 w-3" />
                          {statusLabels[campaign.status]}
                        </Badge>
                      </div>
                      {campaign.description && (
                        <CardDescription className="line-clamp-2">
                          {campaign.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <BarChart3 className="h-3.5 w-3.5" />
                          <span>
                            {campaign.sent_count}/{campaign.total_targets}
                          </span>
                        </div>
                        {campaign.success_rate > 0 && (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            <span>{campaign.success_rate}%</span>
                          </div>
                        )}
                        <span className="mr-auto text-xs">
                          {campaign.delay_preset}
                        </span>
                      </div>
                      {campaign.status === "running" &&
                        campaign.total_targets > 0 && (
                          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                              style={{
                                width: `${(campaign.sent_count / campaign.total_targets) * 100}%`,
                              }}
                            />
                          </div>
                        )}
                    </CardContent>
                  </Card>
                </Link>
              </TiltCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
