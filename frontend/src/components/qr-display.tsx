"use client";

import { useWebSocket } from "@/lib/hooks/use-websocket";
import { ConnectionStatusBadge } from "@/components/connection-status";
import { Loader2, CheckCircle2 } from "lucide-react";

interface QrDisplayProps {
  accountId: string;
}

export function QrDisplay({ accountId }: QrDisplayProps) {
  const { qrCode, connectionStatus, phoneNumber, error } =
    useWebSocket(accountId);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (connectionStatus === "connected") {
    return (
      <div className="flex flex-col items-center gap-4 py-8 animate-in fade-in duration-500">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-xl shadow-emerald-500/30">
          <CheckCircle2 className="h-10 w-10 text-white" />
        </div>
        <p className="text-xl font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
          וואטסאפ מחובר
        </p>
        {phoneNumber && (
          <p className="text-sm text-muted-foreground font-mono">
            {phoneNumber}
          </p>
        )}
        <ConnectionStatusBadge status={connectionStatus} />
      </div>
    );
  }

  if (qrCode) {
    return (
      <div className="flex flex-col items-center gap-5 py-4 animate-in fade-in duration-300">
        <div className="relative rounded-2xl border-2 border-primary/20 bg-white p-5 shadow-xl shadow-primary/10">
          <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 opacity-20 blur-sm" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrCode}
            alt="WhatsApp QR Code"
            className="relative h-64 w-64 rounded-lg"
          />
        </div>
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          פתח את וואטסאפ &larr; <strong>הגדרות</strong> &larr;{" "}
          <strong>מכשירים מקושרים</strong> &larr; סרוק את הקוד
        </p>
        <ConnectionStatusBadge status={connectionStatus} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        <Loader2 className="relative h-8 w-8 animate-spin text-primary" />
      </div>
      <p className="text-sm text-muted-foreground">...מייצר קוד QR</p>
    </div>
  );
}
