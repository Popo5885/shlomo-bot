"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2, RefreshCw, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = process.env.NEXT_PUBLIC_API_URL || "";

function UnsubscribeContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const email = (searchParams.get("email") ?? "").toLowerCase();

  const [step, setStep] = useState<"auth" | "done" | "error">("auth");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [resubStatus, setResubStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    if (!token || !email) setStep("error");
  }, [token, email]);

  const doUnsubscribe = async () => {
    const res = await fetch(`${API}/api/email/unsubscribe/${token}?email=${encodeURIComponent(email)}`);
    const j = await res.json();
    if (!j.success) throw new Error("שגיאה בהסרה");
    setStep("done");
  };

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch(`${API}/api/client/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error("הסיסמה שגויה");
      await doUnsubscribe();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleAuth = () => {
    sessionStorage.setItem("unsubscribe_token", token);
    sessionStorage.setItem("unsubscribe_email", email);
    window.location.href = `${API}/api/auth/google`;
  };

  const resubscribe = async () => {
    setResubStatus("loading");
    try {
      const res = await fetch(`${API}/api/email/resubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      }).then((r) => r.json());
      setResubStatus(res.success ? "done" : "error");
    } catch { setResubStatus("error"); }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center px-4" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-violet-600 px-8 py-8 text-center">
          <h1 className="text-2xl font-bold text-white">GroupPulse</h1>
          <p className="text-white/70 text-sm mt-1">הסרה מרשימת התפוצה</p>
        </div>

        <div className="px-8 py-10">
          {step === "error" && (
            <div className="text-center">
              <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-800 mb-2">קישור לא תקין</h2>
              <p className="text-gray-500 text-sm">הקישור שבו השתמשת אינו תקין או חסר מידע.</p>
            </div>
          )}

          {step === "auth" && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <Mail className="h-5 w-5 text-blue-500 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">בקשת הסרת הכתובת:</p>
                  <p className="text-sm font-semibold text-gray-800">{email}</p>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-1">אימות נדרש</h2>
                <p className="text-sm text-gray-500">כדי להסיר את עצמך מרשימת התפוצה, אמת את זהותך:</p>
              </div>

              <form onSubmit={handlePasswordAuth} className="space-y-4">
                {authError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {authError}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5" /> סיסמת חשבון
                  </label>
                  <Input
                    type="password"
                    placeholder="הזן את הסיסמה שלך"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="border-gray-200"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-red-500 hover:bg-red-600 text-white"
                >
                  {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "אמת והסר אותי"}
                </Button>
              </form>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400">או</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <button
                onClick={handleGoogleAuth}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                אמת עם Google
              </button>
            </div>
          )}

          {step === "done" && resubStatus !== "done" && (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
              <h2 className="text-xl font-bold text-gray-800">הוסרת בהצלחה</h2>
              <p className="text-gray-500 text-sm mb-2">
                הכתובת <strong>{email}</strong> הוסרה מרשימת התפוצה שלנו.
              </p>
              {resubStatus === "idle" && (
                <button onClick={resubscribe} className="inline-flex items-center gap-2 text-sm text-indigo-500 hover:text-indigo-700 underline">
                  <RefreshCw className="h-3.5 w-3.5" /> הרשמה מחדש
                </button>
              )}
              {resubStatus === "loading" && <Loader2 className="h-4 w-4 animate-spin mx-auto text-gray-400" />}
              {resubStatus === "error" && <p className="text-sm text-red-400">אירעה שגיאה.</p>}
            </div>
          )}

          {resubStatus === "done" && (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-blue-500 mx-auto" />
              <h2 className="text-xl font-bold text-gray-800">נרשמת מחדש!</h2>
              <p className="text-gray-500 text-sm">הכתובת <strong>{email}</strong> נוספה בחזרה לרשימת התפוצה.</p>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-8 py-5 text-center">
          <p className="text-xs text-gray-400">שלמה פופוביץ — שירותי אוטומציה לעסקים</p>
          <p className="text-xs text-gray-300 mt-1">© {new Date().getFullYear()} כל הזכויות שמורות</p>
          <Link href="/login" className="text-xs text-indigo-400 hover:text-indigo-600 mt-2 inline-block">
            כניסה למערכת
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      </div>
    }>
      <UnsubscribeContent />
    </Suspense>
  );
}
