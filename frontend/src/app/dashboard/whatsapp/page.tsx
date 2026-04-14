"use client";

import { useEffect, useState } from "react";
import {
  MessageSquare,
  QrCode,
  Smartphone,
  Phone,
  Wifi,
  WifiOff,
  Loader2,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConnectionStatusBadge } from "@/components/connection-status";
import { QrDisplay } from "@/components/qr-display";
import { TiltCard } from "@/components/effects/tilt-card";
import { MagneticButton } from "@/components/effects/magnetic-button";
import { useAuthStore } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import type { ConnectedAccount } from "@/types/api";

type ConnectionMethod = "qr" | "pairing" | null;

export default function WhatsAppPage() {
  const { workspace } = useAuthStore();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [connectionMethod, setConnectionMethod] =
    useState<ConnectionMethod>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingAccountId, setPairingAccountId] = useState<string | null>(null);

  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const fetchAccounts = async () => {
    if (!workspace?.id) return;
    try {
      const data = await api.get<ConnectedAccount[]>(
        `/api/wa/sessions/${workspace.id}`
      );
      setAccounts(data);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  const startQrFlow = async () => {
    if (!workspace?.id) return;
    setConnecting(true);
    setError(null);
    try {
      const data = await api.post<{ account_id: string }>(
        "/api/wa/connect/qr",
        { workspace_id: workspace.id }
      );
      setActiveAccountId(data.account_id);
      setConnectionMethod("qr");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const startPairingFlow = async () => {
    if (!workspace?.id || !phoneNumber.trim()) return;
    setConnecting(true);
    setError(null);
    setPairingCode(null);
    try {
      const data = await api.post<{
        account_id: string;
        pairing_code: string;
      }>("/api/wa/connect/pair", {
        workspace_id: workspace.id,
        phone_number: phoneNumber.trim(),
      });
      setPairingCode(data.pairing_code);
      setPairingAccountId(data.account_id);
      setConnectionMethod("pairing");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const disconnectAccount = async (accountId: string) => {
    setDisconnecting(accountId);
    try {
      await api.post(`/api/wa/disconnect/${accountId}`);
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === accountId
            ? { ...a, is_connected: false, connection_status: "disconnected" }
            : a
        )
      );
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setDisconnecting(null);
    }
  };

  const resetConnectionFlow = () => {
    setConnectionMethod(null);
    setActiveAccountId(null);
    setPairingCode(null);
    setPairingAccountId(null);
    setPhoneNumber("");
    setError(null);
    fetchAccounts();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          חיבור וואטסאפ
        </h1>
        <p className="text-muted-foreground">
          חבר ונהל את חשבונות הוואטסאפ שלך
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200/50 bg-red-50/80 px-4 py-3 text-sm text-red-700 backdrop-blur-sm">
          {error}
        </div>
      )}

      {/* ─── Connect New Account ─────────────────────────── */}
      {!connectionMethod && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-5 w-5 text-primary" />
              חיבור חשבון חדש
            </CardTitle>
            <CardDescription>
              בחר כיצד לקשר את חשבון הוואטסאפ שלך
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2">
              {/* QR Code Method */}
              <TiltCard className="rounded-2xl">
                <button
                  onClick={startQrFlow}
                  disabled={connecting}
                  className="group flex w-full flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-8 text-center transition-all duration-300 hover:border-primary/40 hover:from-primary/10 hover:shadow-xl hover:shadow-primary/5 disabled:opacity-50"
                >
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-xl shadow-blue-500/30 transition-transform duration-300 group-hover:scale-110">
                    {connecting ? (
                      <Loader2 className="h-9 w-9 animate-spin" />
                    ) : (
                      <QrCode className="h-9 w-9" />
                    )}
                    <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shadow-md">
                      <Zap className="h-3 w-3 text-white" />
                    </div>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">חיבור באמצעות QR</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      סרוק קוד QR עם מצלמת הוואטסאפ בטלפון שלך
                    </p>
                  </div>
                </button>
              </TiltCard>

              {/* Pairing Code Method */}
              <TiltCard className="rounded-2xl">
                <div className="flex w-full flex-col items-center gap-5 rounded-2xl border-2 border-dashed border-violet-500/20 bg-gradient-to-b from-violet-500/5 to-transparent p-8 text-center transition-all duration-300 hover:border-violet-500/40 hover:from-violet-500/10 hover:shadow-xl hover:shadow-violet-500/5">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-xl shadow-violet-500/30">
                    <Smartphone className="h-9 w-9" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">
                      חיבור באמצעות מספר טלפון
                    </p>
                    <p className="mt-1.5 mb-4 text-sm text-muted-foreground">
                      הזן את המספר שלך לקבלת קוד צימוד בן 8 ספרות
                    </p>
                  </div>
                  <div className="flex w-full max-w-xs items-center gap-2">
                    <Input
                      type="tel"
                      placeholder="+972501234567"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="text-center"
                    />
                    <MagneticButton>
                      <Button
                        onClick={startPairingFlow}
                        disabled={connecting || !phoneNumber.trim()}
                        size="icon"
                        className="bg-gradient-to-r from-violet-500 to-violet-700 shadow-lg shadow-violet-500/25"
                      >
                        {connecting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Phone className="h-4 w-4" />
                        )}
                      </Button>
                    </MagneticButton>
                  </div>
                </div>
              </TiltCard>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── QR Code Active Flow ─────────────────────────── */}
      {connectionMethod === "qr" && activeAccountId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <QrCode className="h-5 w-5 text-primary" />
              סרוק קוד QR
            </CardTitle>
            <CardDescription>
              פתח את וואטסאפ &larr; <strong>הגדרות</strong> &larr;{" "}
              <strong>מכשירים מקושרים</strong> וסרוק
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <QrDisplay accountId={activeAccountId} />
            <Button variant="outline" onClick={resetConnectionFlow} className="mt-4">
              ביטול
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Pairing Code Active Flow ────────────────────── */}
      {connectionMethod === "pairing" && pairingCode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Smartphone className="h-5 w-5 text-violet-500" />
              הזן את קוד הצימוד בוואטסאפ
            </CardTitle>
            <CardDescription>
              פתח את וואטסאפ &larr; <strong>הגדרות</strong> &larr;{" "}
              <strong>מכשירים מקושרים</strong> &larr;{" "}
              <strong>קשר באמצעות מספר טלפון</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            <div className="relative rounded-2xl border-2 border-dashed border-violet-500/30 bg-gradient-to-b from-violet-500/10 to-transparent px-12 py-10">
              <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-violet-500 to-blue-500 opacity-10 blur-sm" />
              <p className="relative text-center font-mono text-5xl font-bold tracking-[0.35em] bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
                {pairingCode.slice(0, 4)}-{pairingCode.slice(4)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              הקוד תקף למספר דקות. הקלד אותו בוואטסאפ בדיוק כפי שמוצג.
            </p>
            {pairingAccountId && (
              <ConnectionStatusBadge status="qr_pending" />
            )}
            <Button variant="outline" onClick={resetConnectionFlow}>
              סיום / ביטול
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Connected Accounts ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="h-5 w-5" />
            חשבונות מחוברים
          </CardTitle>
          <CardDescription>
            {accounts.length === 0
              ? "אין חשבונות מחוברים עדיין"
              : `${accounts.length} חשבונות מקושרים`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                <WifiOff className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">
                חבר את חשבון הוואטסאפ הראשון שלך למעלה
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-background/50 p-4 backdrop-blur-sm transition-all duration-200 hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-sm ${
                        account.is_connected
                          ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-emerald-500/20"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {account.is_connected ? (
                        <Wifi className="h-5 w-5" />
                      ) : (
                        <WifiOff className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        {account.display_name ||
                          account.account_identifier ||
                          "חשבון וואטסאפ"}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        {account.account_identifier && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {account.account_identifier}
                          </span>
                        )}
                        <ConnectionStatusBadge
                          status={account.connection_status}
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => disconnectAccount(account.id)}
                    disabled={
                      disconnecting === account.id || !account.is_connected
                    }
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    {disconnecting === account.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
