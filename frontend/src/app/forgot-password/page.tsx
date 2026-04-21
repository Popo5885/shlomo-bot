"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Loader2, ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Aurora } from "@/components/effects/aurora";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/client/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "שגיאה");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b18] px-4 py-12">
      <Aurora />
      <div className="relative w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-violet-500/20 opacity-75 blur-xl" />
        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl shadow-2xl" dir="rtl">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 shadow-xl shadow-emerald-500/30">
              <MessageSquare className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">שחזור סיסמה</h1>
            <p className="mt-1 text-sm text-white/50">נשלח לך קישור לאיפוס הסיסמה</p>
          </div>

          {sent ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-8 text-center space-y-3">
              <div className="text-4xl">📧</div>
              <p className="text-emerald-300 font-semibold text-lg">המייל נשלח!</p>
              <p className="text-sm text-white/60">
                אם הכתובת {email} קיימת במערכת, ישלח אליה קישור לאיפוס סיסמה תוך מספר דקות.
              </p>
              <Button onClick={() => router.push("/login")} variant="outline" className="mt-2 border-white/20 text-white hover:bg-white/10">
                חזרה להתחברות
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> כתובת אימייל
                </label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>שלח קישור לאיפוס</span><ArrowLeft className="h-4 w-4" /></>}
              </Button>

              <button
                type="button"
                onClick={() => router.push("/login")}
                className="w-full text-center text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                חזרה להתחברות
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
