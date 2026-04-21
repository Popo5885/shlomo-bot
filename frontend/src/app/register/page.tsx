"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Loader2, ArrowLeft, User, Mail, Phone, Lock, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Aurora } from "@/components/effects/aurora";
import { MagneticButton } from "@/components/effects/magnetic-button";
import { correctEmail } from "@/lib/utils/emailCorrect";

const API = process.env.NEXT_PUBLIC_API_URL || "";

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<"network" | "generic" | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (k === "email") setEmailSuggestion(null);
  };

  const handleEmailBlur = () => {
    if (!form.email) return;
    const { corrected, changed } = correctEmail(form.email);
    if (changed) setEmailSuggestion(corrected);
    else setEmailSuggestion(null);
  };

  const applyEmailSuggestion = () => {
    if (emailSuggestion) {
      setForm((f) => ({ ...f, email: emailSuggestion }));
      setEmailSuggestion(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrorKind(null);
    setLoading(true);

    // Apply email correction silently before sending
    const { corrected } = correctEmail(form.email);
    const finalForm = { ...form, email: corrected };
    if (corrected !== form.email) setForm(finalForm);

    try {
      const res = await fetch(`${API}/api/client/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalForm),
      });
      const json = await res.json().catch(() => ({ message: "שגיאת שרת" }));
      if (!res.ok || !json.success) throw new Error(json.message || "ההרשמה נכשלה");
      setSuccess(true);
    } catch (err) {
      if (err instanceof TypeError) {
        setErrorKind("network");
        setError("בעיית חיבור לשרת — בדוק אינטרנט ונסה שוב");
      } else {
        setErrorKind("generic");
        setError(err instanceof Error ? err.message : "ההרשמה נכשלה");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b18] px-4 py-12">
      <Aurora />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-1/4 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl animate-pulse" />
        <div className="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl animate-pulse [animation-delay:1s]" />
      </div>

      <div className="relative w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-emerald-500/20 via-blue-500/20 to-violet-500/20 opacity-75 blur-xl" />
        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl shadow-2xl" dir="rtl">
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-blue-600 shadow-xl shadow-emerald-500/30">
              <MessageSquare className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">GroupPulse</h1>
            <p className="mt-1 text-sm text-white/50">הצטרפו לפלטפורמה המשתלמת ביותר בישראל</p>
          </div>

          {success ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-8 text-center space-y-3">
              <div className="text-4xl">🎉</div>
              <p className="text-emerald-300 font-semibold text-lg">הרשמה הצליחה!</p>
              <p className="text-sm text-white/60">ניצור איתך קשר בקרוב לאישור החשבון.</p>
              <Button onClick={() => router.push("/login")} variant="outline" className="mt-2 border-white/20 text-white hover:bg-white/10">
                לדף ההתחברות
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Network error */}
              {errorKind === "network" && (
                <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 flex items-start gap-3">
                  <Wifi className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-orange-300">{error}</p>
                </div>
              )}
              {/* Generic error */}
              {errorKind === "generic" && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {/* Fields */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> שם מלא
                </label>
                <Input type="text" placeholder="ישראל ישראלי" value={form.full_name} onChange={update("full_name")} required
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-emerald-500/40" />
              </div>

              {/* Email with autocorrect */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> אימייל
                </label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={update("email")}
                  onBlur={handleEmailBlur}
                  required
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-emerald-500/40"
                />
                {emailSuggestion && (
                  <div className="flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs">
                    <span className="text-blue-300">
                      תיקנו ל: <strong>{emailSuggestion}</strong> — זה נכון?
                    </span>
                    <div className="flex gap-2 mr-2">
                      <button type="button" onClick={applyEmailSuggestion} className="text-emerald-400 hover:text-emerald-300 font-medium">כן</button>
                      <button type="button" onClick={() => setEmailSuggestion(null)} className="text-white/40 hover:text-white/60">לא</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> מספר טלפון
                </label>
                <Input type="tel" placeholder="054-1234567" value={form.phone} onChange={update("phone")} required
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-emerald-500/40" />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> סיסמה
                </label>
                <Input type="password" placeholder="לפחות 6 תווים" value={form.password} onChange={update("password")} required
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-emerald-500/40" />
              </div>

              <MagneticButton className="w-full">
                <Button type="submit" className="w-full bg-gradient-to-r from-emerald-500 to-blue-600 shadow-xl shadow-emerald-500/25 text-white border-0 mt-2" disabled={loading} size="lg">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>הרשמה חינמית</span><ArrowLeft className="h-4 w-4" /></>}
                </Button>
              </MagneticButton>

              <button type="button" onClick={() => router.push("/login")} className="w-full text-center text-sm text-blue-400 hover:text-blue-300 transition-colors">
                יש לך חשבון? התחבר
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs text-white/30">או</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <a
                href={`${API}/api/auth/google`}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors"
              >
                <GoogleIcon />
                הרשמה עם Google
              </a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
