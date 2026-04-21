"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Loader2, ArrowLeft, UserX, RefreshCw, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Aurora } from "@/components/effects/aurora";
import { MagneticButton } from "@/components/effects/magnetic-button";
import { useAuthStore } from "@/lib/auth";
import { correctEmail } from "@/lib/utils/emailCorrect";

const API = process.env.NEXT_PUBLIC_API_URL || "";

// Inline Google SVG
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

type ErrorKind = "network" | "not_found" | "generic" | null;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Error state
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Email auto-correct state
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);

  // Register mode (legacy — kept for workspace-slug join flow)
  const [isRegister, setIsRegister] = useState(false);
  const [regSlug, setRegSlug] = useState("");
  const [regFullName, setRegFullName] = useState("");
  const [regSuccess, setRegSuccess] = useState(false);

  const clearErrors = () => { setErrorKind(null); setErrorMsg(null); };

  // Check email on blur and suggest correction
  const handleEmailBlur = () => {
    if (!email) return;
    const { corrected, changed } = correctEmail(email);
    if (changed) setEmailSuggestion(corrected);
    else setEmailSuggestion(null);
  };

  const applyEmailSuggestion = () => {
    if (emailSuggestion) { setEmail(emailSuggestion); setEmailSuggestion(null); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();

    // Apply email correction before sending
    const { corrected } = correctEmail(email);
    const finalEmail = corrected;
    if (finalEmail !== email) setEmail(finalEmail);

    setLoading(true);

    if (isRegister) {
      try {
        const res = await fetch(`${API}/api/client/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace_slug: regSlug, email: finalEmail, password, full_name: regFullName }),
        });
        const data = await res.json().catch(() => ({ message: "שגיאת שרת" }));
        if (!res.ok || !data.success) throw new Error(data.message || "ההרשמה נכשלה");
        setRegSuccess(true);
      } catch (err) {
        if (err instanceof TypeError) {
          setErrorKind("network");
          setErrorMsg("בעיית חיבור לשרת — בדוק אינטרנט ונסה שוב");
        } else {
          setErrorKind("generic");
          setErrorMsg(err instanceof Error ? err.message : "ההרשמה נכשלה");
        }
      } finally { setLoading(false); }
      return;
    }

    try {
      await login(finalEmail, password);
      const { workspace } = useAuthStore.getState();
      if (workspace?.status === "pending") router.push("/pending");
      else if (!workspace?.contract_signed || workspace?.contract_revoked_at) router.push("/sign-contract");
      else router.push("/dashboard");
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      if (code === "NETWORK_ERROR") {
        setErrorKind("network");
        setErrorMsg((err as Error).message);
      } else if (code === "ACCOUNT_NOT_FOUND") {
        setErrorKind("not_found");
        setErrorMsg("החשבון לא נמצא במערכת");
      } else {
        setErrorKind("generic");
        setErrorMsg(err instanceof Error ? err.message : "ההתחברות נכשלה");
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b18] px-4">
      <Aurora />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-1/4 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl animate-pulse" />
        <div className="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl animate-pulse [animation-delay:1s]" />
      </div>

      <div className="relative w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-blue-500/20 via-violet-500/20 to-emerald-500/20 opacity-75 blur-xl" />
        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl shadow-2xl" dir="rtl">

          {/* Logo */}
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-xl shadow-blue-500/30">
              <MessageSquare className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">GroupPulse</h1>
            <p className="mt-1 text-sm text-white/50">ברוכים השבים — התחבר לסביבת העבודה שלך</p>
          </div>

          {regSuccess ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-6 text-center">
              <p className="text-emerald-300 font-medium text-lg mb-2">הבקשה נשלחה בהצלחה!</p>
              <p className="text-sm text-emerald-200/70">החשבון ממתין לאישור מנהל.</p>
              <button onClick={() => { setIsRegister(false); setRegSuccess(false); }} className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline">
                חזור להתחברות
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* ── Network error ── */}
              {errorKind === "network" && (
                <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 flex items-start gap-3">
                  <Wifi className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-orange-300">{errorMsg}</p>
                    <button type="button" onClick={clearErrors} className="mt-1 text-xs text-orange-400 hover:text-orange-300 underline">
                      נסה שוב
                    </button>
                  </div>
                </div>
              )}

              {/* ── Account not found ── */}
              {errorKind === "not_found" && (
                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <UserX className="h-5 w-5 text-yellow-400 shrink-0" />
                    <p className="text-sm font-semibold text-yellow-300">החשבון לא נמצא</p>
                  </div>
                  <p className="text-xs text-yellow-200/70">
                    לא מצאנו חשבון עם הכתובת <strong>{email}</strong>.<br/>
                    אולי עדיין לא נרשמת?
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => router.push("/register")}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    >
                      להרשמה
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => { clearErrors(); setEmail(""); setPassword(""); }}
                      className="flex-1 border-white/20 text-white hover:bg-white/10 text-xs gap-1"
                    >
                      <RefreshCw className="h-3 w-3" /> נסה שנית
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Generic error ── */}
              {errorKind === "generic" && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {errorMsg}
                </div>
              )}

              {isRegister && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/70">מזהה סביבת עבודה (slug)</label>
                    <Input type="text" placeholder="my-workspace" value={regSlug} onChange={(e) => setRegSlug(e.target.value)} required
                      className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-blue-500/40" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/70">שם מלא</label>
                    <Input type="text" placeholder="ישראל ישראלי" value={regFullName} onChange={(e) => setRegFullName(e.target.value)} required
                      className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-blue-500/40" />
                  </div>
                </>
              )}

              {/* Email field */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-white/70">אימייל</label>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailSuggestion(null); }}
                  onBlur={handleEmailBlur}
                  required
                  autoComplete="email"
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-blue-500/40"
                />
                {/* Email correction banner */}
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

              {/* Password field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">סיסמה</label>
                <Input
                  type="password"
                  placeholder={isRegister ? "בחר סיסמה" : "הזן סיסמה"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-blue-500/40"
                />
              </div>

              <MagneticButton className="w-full">
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-500 to-violet-600 shadow-xl shadow-blue-500/25 hover:shadow-2xl text-white border-0"
                  disabled={loading}
                  size="lg"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{isRegister ? "הרשמה" : "התחבר"}<ArrowLeft className="h-4 w-4" /></>}
                </Button>
              </MagneticButton>

              <button type="button" onClick={() => { setIsRegister(!isRegister); clearErrors(); }} className="w-full text-center text-sm text-blue-400 hover:text-blue-300 transition-colors">
                {isRegister ? "יש לך חשבון? התחבר" : "אין לך חשבון? הרשם עכשיו"}
              </button>

              {!isRegister && (
                <button type="button" onClick={() => router.push("/forgot-password")} className="w-full text-center text-xs text-white/40 hover:text-white/60 transition-colors">
                  שכחתי סיסמה
                </button>
              )}
            </form>
          )}

          {/* Google Sign-in */}
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">או</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <a
              href={`${API}/api/auth/google`}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors"
            >
              <GoogleIcon />
              המשך עם Google
            </a>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
            <span className="text-xs text-white/30">GroupPulse</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
