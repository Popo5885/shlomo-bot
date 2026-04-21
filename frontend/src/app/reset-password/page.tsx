"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquare, Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Aurora } from "@/components/effects/aurora";

const API = process.env.NEXT_PUBLIC_API_URL || "";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("הסיסמאות אינן תואמות"); return; }
    if (password.length < 6) { setError("הסיסמה חייבת להכיל לפחות 6 תווים"); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/client/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "שגיאה");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <div className="text-4xl">❌</div>
        <p className="text-red-300">קישור לא תקין. בקש קישור חדש.</p>
        <Button onClick={() => router.push("/forgot-password")} variant="outline" className="border-white/20 text-white hover:bg-white/10">
          בקש קישור חדש
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8 flex flex-col items-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 shadow-xl shadow-emerald-500/30">
          <MessageSquare className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white">הגדרת סיסמה חדשה</h1>
        <p className="mt-1 text-sm text-white/50">בחר סיסמה חזקה לחשבונך</p>
      </div>

      {done ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-8 text-center space-y-3">
          <div className="text-4xl">✅</div>
          <p className="text-emerald-300 font-semibold text-lg">הסיסמה עודכנה!</p>
          <p className="text-sm text-white/60">כעת תוכל להתחבר עם הסיסמה החדשה שלך.</p>
          <Button onClick={() => router.push("/login")} className="bg-emerald-600 hover:bg-emerald-700 text-white mt-2">
            התחבר עכשיו
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-white/70 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> סיסמה חדשה
            </label>
            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                placeholder="לפחות 6 תווים"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-emerald-500/40 pr-3"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-white/70 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> אימות סיסמה
            </label>
            <Input
              type="password"
              placeholder="הזן שוב את הסיסמה"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-emerald-500/40"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-emerald-500 to-blue-600 text-white border-0 mt-2"
            disabled={loading}
            size="lg"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "עדכן סיסמה"}
          </Button>
        </form>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b18] px-4 py-12">
      <Aurora />
      <div className="relative w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-violet-500/20 opacity-75 blur-xl" />
        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl shadow-2xl">
          <Suspense fallback={<div className="text-center text-white/50 py-8"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
