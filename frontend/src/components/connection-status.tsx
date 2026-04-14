"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ConnectionStatus } from "@/types/api";

const statusConfig: Record<
  ConnectionStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  connected: {
    label: "מחובר",
    dotClass: "bg-emerald-400 shadow-emerald-400/50 shadow-sm",
    badgeClass:
      "border-emerald-200/50 bg-emerald-50/80 text-emerald-700 backdrop-blur-sm",
  },
  disconnected: {
    label: "מנותק",
    dotClass: "bg-slate-400",
    badgeClass:
      "border-slate-200/50 bg-slate-50/80 text-slate-600 backdrop-blur-sm",
  },
  qr_pending: {
    label: "ממתין לסריקה",
    dotClass: "bg-amber-400 animate-pulse shadow-amber-400/50 shadow-sm",
    badgeClass:
      "border-amber-200/50 bg-amber-50/80 text-amber-700 backdrop-blur-sm",
  },
  banned: {
    label: "חסום",
    dotClass: "bg-red-500 shadow-red-500/50 shadow-sm",
    badgeClass:
      "border-red-200/50 bg-red-50/80 text-red-700 backdrop-blur-sm",
  },
  rate_limited: {
    label: "מוגבל",
    dotClass: "bg-orange-400 shadow-orange-400/50 shadow-sm",
    badgeClass:
      "border-orange-200/50 bg-orange-50/80 text-orange-700 backdrop-blur-sm",
  },
};

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus | null;
  className?: string;
}

export function ConnectionStatusBadge({
  status,
  className,
}: ConnectionStatusBadgeProps) {
  if (!status) {
    return (
      <Badge
        variant="outline"
        className={cn("text-muted-foreground", className)}
      >
        לא ידוע
      </Badge>
    );
  }

  const config = statusConfig[status];

  return (
    <Badge variant="outline" className={cn(config.badgeClass, className)}>
      <span
        className={cn(
          "ml-1.5 inline-block h-2 w-2 rounded-full",
          config.dotClass
        )}
      />
      {config.label}
    </Badge>
  );
}
