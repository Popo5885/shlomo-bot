"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  Bot,
  Wifi,
  WifiOff,
  Loader2,
  Trash2,
  QrCode,
  Phone,
  RefreshCw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TiltCard } from "@/components/effects/tilt-card";
import { QrDisplay } from "@/components/qr-display";
import { ConnectionStatusBadge } from "@/components/connection-status";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import type { ConnectedAccount } from "@/types/api";

type TabType = "whatsapp" | "telegram";

export default function ChannelsPage() {
  const workspace = useAuthStore((s) => s.workspace);
  const [activeTab, setActiveTab] = useState<TabType>("whatsapp");
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Telegram state
  const [botToken, setBotToken] = useState("");
  const [connectingTg, setConnectingTg] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);
  const [tgSuccess, setTgSuccess] = useState<string | null>(null);

  // WhatsApp QR state
  const [qrAccountId, setQrAccountId] = useState<string | null>(null);
  const [startingQr, setStartingQr] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);

  // WhatsApp pairing state
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState("");
  const [connectingPair, setConnectingPair] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);

  // Sync state
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAccounts = useCallback(() => {
    if (!workspace?.id) return;
    setLoading(true);
    api
      .get<ConnectedAccount[]>("/api/client/connected-accounts")
      .then(setAccounts)
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, [workspace?.id]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const waAccounts = accounts.filter(
    (a) =>
      a.platform === "WHATSAPP_WEB" ||
      a.platform === "WHATSAPP_BUSINESS_API"
  );
  const tgAccounts = accounts.filter(
    (a) => a.platform === "TELEGRAM_BOT" || a.platform === "TELEGRAM_USERBOT"
  );

  // Only show connected accounts (filter out stale qr_pending / disconnected without a phone)
  const activeWaAccounts = waAccounts.filter(
    (a) => a.is_connected || a.account_identifier
  );
  const staleWaAccounts = waAccounts.filter(
    (a) => !a.is_connected && !a.account_identifier
  );

  // ── WhatsApp QR Flow ──
  const startQrFlow = async () => {
    if (!workspace?.id) return;
    setWaError(null);
    setStartingQr(true);
    setQrAccountId(null);
    try {
      const result = await api.post<{ account_id: string }>(
        "/api/wa/connect/qr",
        { workspace_id: workspace.id }
      );
      setQrAccountId(result.account_id);
    } catch (err) {
      if (err instanceof ApiError) setWaError(err.message);
      else setWaError("שגיאה בהתחלת חיבור QR");
    } finally {
      setStartingQr(false);
    }
  };

  // ── WhatsApp Pairing Flow ──
  const startPairingFlow = async () => {
    if (!workspace?.id || !pairingPhone.trim()) return;
    setPairError(null);
    setConnectingPair(true);
    setPairingCode(null);
    try {
      const result = await api.post<{
        account_id: string;
        pairing_code: string;
      }>("/api/wa/connect/pair", {
        workspace_id: workspace.id,
        phone_number: pairingPhone.trim(),
      });
      setPairingCode(result.pairing_code);
    } catch (err) {
      if (err instanceof ApiError) setPairError(err.message);
      else setPairError("שגיאה בקבלת קוד חיבור");
    } finally {
      setConnectingPair(false);
    }
  };

  // ── Sync WhatsApp Groups ──
  const syncGroups = async (accountId: string) => {
    setSyncingId(accountId);
    setSyncResult(null);
    try {
      const result = await api.post<{ synced: number }>(
        `/api/wa/sync-groups/${accountId}`
      );
      setSyncResult(`סונכרנו ${result.synced} קבוצות בהצלחה!`);
      setTimeout(() => setSyncResult(null), 4000);
    } catch (err) {
      if (err instanceof ApiError) setSyncResult(`שגיאה: ${err.message}`);
      else setSyncResult("שגיאה בסנכרון קבוצות");
      setTimeout(() => setSyncResult(null), 4000);
    } finally {
      setSyncingId(null);
    }
  };

  // ── Delete WhatsApp Account ──
  const deleteAccount = async (accountId: string) => {
    setDeletingId(accountId);
    try {
      await api.delete(`/api/wa/accounts/${accountId}`);
      fetchAccounts();
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  };

  // ── Telegram Connect ──
  const connectTelegram = async () => {
    setTgError(null);
    setTgSuccess(null);
    setConnectingTg(true);
    try {
      const result = await api.post<{
        accountId: string;
        botUsername: string;
      }>("/api/client/connected-accounts/telegram", { bot_token: botToken });
      setTgSuccess(`הבוט @${result.botUsername} חובר בהצלחה!`);
      setBotToken("");
      fetchAccounts();
    } catch (err) {
      if (err instanceof ApiError) setTgError(err.message);
    } finally {
      setConnectingTg(false);
    }
  };

  const disconnectTelegram = async (accountId: string) => {
    try {
      await api.delete(
        `/api/client/connected-accounts/telegram/${accountId}`
      );
      fetchAccounts();
    } catch {
      // silent
    }
  };

  // ── Sync Telegram Groups ──
  const [syncingTgId, setSyncingTgId] = useState<string | null>(null);
  const [syncTgResult, setSyncTgResult] = useState<string | null>(null);

  const syncTelegramGroups = async (accountId: string) => {
    setSyncingTgId(accountId);
    setSyncTgResult(null);
    try {
      const result = await api.post<{ synced: number }>(
        `/api/client/connected-accounts/telegram/${accountId}/sync`
      );
      setSyncTgResult(`סונכרנו ${result.synced} קבוצות/ערוצים בהצלחה!`);
      setTimeout(() => setSyncTgResult(null), 4000);
    } catch (err) {
      if (err instanceof ApiError) setSyncTgResult(`שגיאה: ${err.message}`);
      else setSyncTgResult("שגיאה בסנכרון קבוצות טלגרם");
      setTimeout(() => setSyncTgResult(null), 4000);
    } finally {
      setSyncingTgId(null);
    }
  };

  // ── Cleanup stale accounts on mount ──
  useEffect(() => {
    if (staleWaAccounts.length > 0) {
      // Auto-clean stale sessions (qr_pending with no phone number)
      Promise.all(
        staleWaAccounts.map((acc) =>
          api.delete(`/api/wa/accounts/${acc.id}`).catch(() => {})
        )
      ).then(() => {
        if (staleWaAccounts.length > 0) fetchAccounts();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  const tabs = [
    {
      id: "whatsapp" as TabType,
      label: "WhatsApp",
      icon: MessageSquare,
      count: activeWaAccounts.length,
    },
    {
      id: "telegram" as TabType,
      label: "Telegram",
      icon: Bot,
      count: tgAccounts.length,
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ערוצים</h1>
        <p className="text-muted-foreground">
          חבר את חשבונות ה-WhatsApp וה-Telegram שלך
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 rounded-xl border border-border/50 bg-muted/30 p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-gradient-to-r from-violet-500/20 to-blue-500/20 border border-violet-500/30 text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.count > 0 && (
              <Badge variant="secondary" className="text-xs">
                {tab.count}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* ═══ WhatsApp Tab ═══ */}
      {activeTab === "whatsapp" && (
        <div className="space-y-6">
          {/* Connection Methods */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* QR Code Method */}
            <TiltCard className="rounded-2xl" maxTilt={5}>
              <Card glass className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <QrCode className="h-5 w-5 text-violet-500" />
                    סריקת QR
                  </CardTitle>
                  <CardDescription>
                    סרוק את הקוד מ-WhatsApp Web
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {qrAccountId ? (
                    <QrDisplay accountId={qrAccountId} />
                  ) : (
                    <div className="flex flex-col items-center gap-4 py-8">
                      {waError && (
                        <p className="text-sm text-destructive text-center">
                          {waError}
                        </p>
                      )}
                      <Button
                        onClick={startQrFlow}
                        disabled={startingQr}
                        className="bg-gradient-to-r from-violet-500 to-blue-600 px-8"
                      >
                        {startingQr ? (
                          <Loader2 className="h-4 w-4 animate-spin ml-2" />
                        ) : (
                          <QrCode className="h-4 w-4 ml-2" />
                        )}
                        {startingQr ? "מתחבר..." : "התחל חיבור QR"}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center max-w-xs">
                        לחץ כדי לייצר קוד QR, ואז סרוק אותו מהוואטסאפ שלך
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TiltCard>

            {/* Phone Pairing Method */}
            <TiltCard className="rounded-2xl" maxTilt={5}>
              <Card glass className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Phone className="h-5 w-5 text-blue-500" />
                    חיבור עם מספר טלפון
                  </CardTitle>
                  <CardDescription>
                    הזן את מספר הטלפון לקבלת קוד
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    placeholder="972501234567"
                    className="font-mono"
                  />
                  {pairError && (
                    <p className="text-sm text-destructive">{pairError}</p>
                  )}
                  <Button
                    onClick={startPairingFlow}
                    disabled={connectingPair || !pairingPhone.trim()}
                    className="w-full bg-gradient-to-r from-violet-500 to-blue-600"
                  >
                    {connectingPair ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "קבל קוד"
                    )}
                  </Button>
                  {pairingCode && (
                    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-2">
                        הקוד שלך:
                      </p>
                      <p className="text-3xl font-bold font-mono tracking-widest text-violet-600">
                        {pairingCode}
                      </p>
                      <p className="text-xs text-muted-foreground mt-3">
                        פתח וואטסאפ &larr; הגדרות &larr; מכשירים מקושרים
                        &larr; קישור עם מספר טלפון
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TiltCard>
          </div>

          {/* Sync result banner */}
          {syncResult && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                syncResult.startsWith("שגיאה")
                  ? "border-red-500/30 bg-red-500/10 text-red-400"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              }`}
            >
              {syncResult}
            </div>
          )}

          {/* Connected WhatsApp Accounts */}
          {activeWaAccounts.length > 0 && (
            <Card glass>
              <CardHeader>
                <CardTitle className="text-lg">
                  חשבונות WhatsApp מחוברים
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeWaAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between rounded-xl border border-border/50 p-4"
                  >
                    <div className="flex items-center gap-3">
                      {acc.is_connected ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                          <Wifi className="h-5 w-5 text-emerald-500" />
                        </div>
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <WifiOff className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium font-mono">
                          {acc.account_identifier
                            ? `+${acc.account_identifier}`
                            : acc.display_name || "WhatsApp"}
                        </p>
                        <ConnectionStatusBadge
                          status={acc.connection_status}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Sync Groups Button */}
                      {acc.is_connected && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => syncGroups(acc.id)}
                          disabled={syncingId === acc.id}
                          className="text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
                        >
                          {syncingId === acc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Users className="h-3.5 w-3.5" />
                          )}
                          <span className="mr-1.5 text-xs">סנכרן קבוצות</span>
                        </Button>
                      )}

                      {/* Reconnect Button (for disconnected accounts with a phone) */}
                      {!acc.is_connected && acc.account_identifier && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={startQrFlow}
                          className="text-violet-500 border-violet-500/30 hover:bg-violet-500/10"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span className="mr-1.5 text-xs">חבר מחדש</span>
                        </Button>
                      )}

                      {/* Delete Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteAccount(acc.id)}
                        disabled={deletingId === acc.id}
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      >
                        {deletingId === acc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {activeWaAccounts.length === 0 && !loading && (
            <div className="rounded-2xl border border-dashed border-border/50 p-12 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-lg font-medium text-muted-foreground">
                אין חשבונות WhatsApp מחוברים
              </p>
              <p className="mt-1 text-sm text-muted-foreground/70">
                השתמש בסריקת QR או בקוד חיבור למעלה כדי לחבר חשבון
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══ Telegram Tab ═══ */}
      {activeTab === "telegram" && (
        <div className="space-y-6">
          {/* Connect Bot */}
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bot className="h-5 w-5 text-blue-500" />
                חיבור בוט Telegram
              </CardTitle>
              <CardDescription>
                הזן את ה-Bot Token שקיבלת מ-@BotFather
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                className="font-mono text-sm"
                type="password"
              />

              {tgError && (
                <div className="rounded-lg border border-red-200/50 bg-red-50/80 px-3 py-2 text-sm text-red-700">
                  {tgError}
                </div>
              )}
              {tgSuccess && (
                <div className="rounded-lg border border-emerald-200/50 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-700">
                  {tgSuccess}
                </div>
              )}

              <Button
                onClick={connectTelegram}
                disabled={connectingTg || !botToken.trim()}
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-500"
              >
                {connectingTg ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "חבר בוט"
                )}
              </Button>

              <div className="rounded-lg bg-blue-50/50 border border-blue-200/30 p-3 text-xs text-blue-600">
                <p className="font-medium mb-1">איך מקבלים Bot Token?</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>פתח את @BotFather ב-Telegram</li>
                  <li>שלח /newbot ועקוב אחר ההוראות</li>
                  <li>העתק את ה-Token שתקבל והדבק כאן</li>
                  <li>
                    הוסף את הבוט לקבוצות שלך — הן יסונכרנו אוטומטית!
                  </li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* Telegram sync result banner */}
          {syncTgResult && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                syncTgResult.startsWith("שגיאה")
                  ? "border-red-500/30 bg-red-500/10 text-red-400"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              }`}
            >
              {syncTgResult}
            </div>
          )}

          {/* Connected Telegram Bots */}
          {tgAccounts.length > 0 && (
            <Card glass>
              <CardHeader>
                <CardTitle className="text-lg">בוטים מחוברים</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {tgAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between rounded-xl border border-border/50 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Bot
                        className={`h-5 w-5 ${
                          acc.is_connected
                            ? "text-blue-500"
                            : "text-muted-foreground"
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium">
                          {acc.display_name ||
                            acc.account_identifier ||
                            "Telegram Bot"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {acc.account_identifier}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Sync Telegram Groups Button */}
                      {acc.is_connected && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => syncTelegramGroups(acc.id)}
                          disabled={syncingTgId === acc.id}
                          className="text-blue-500 border-blue-500/30 hover:bg-blue-500/10"
                        >
                          {syncingTgId === acc.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Users className="h-3.5 w-3.5" />
                          )}
                          <span className="mr-1.5 text-xs">סנכרן קבוצות</span>
                        </Button>
                      )}
                      <Badge
                        className={
                          acc.is_connected
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }
                      >
                        {acc.is_connected ? "מחובר" : "מנותק"}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disconnectTelegram(acc.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
