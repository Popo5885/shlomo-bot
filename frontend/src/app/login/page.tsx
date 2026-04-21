"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Aurora } from "@/components/effects/aurora";
import { MagneticButton } from "@/components/effects/magnetic-button";
import { useAuthStore } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [regSlug, setRegSlug] = useState("");
  const [regFullName, setRegFullName] = useState("");
  const [regSuccess, setRegSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isRegister) {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || ""}/api/client/register`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspace_slug: regSlug,
              email,
              password,
              full_name: regFullName,
            }),
          }
        );
        const contentType = res.headers.get("content-type") || "";
        if (!res.ok) {
          const data = contentType.includes("json")
            ? await res.json()
            : { message: await res.text() };
          throw new Error(data.message || "ההרשמה נכשלה");
        }
        setRegSuccess(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "ההרשמה נכשלה");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      await login(email, password);
      // Redirect based on workspace status immediately — don't rely on
      // dashboard layout guard (avoids flash + gives instant feedback)
      const { workspace } = useAuthStore.getState();
      if (workspace?.status === "pending") {
        router.push("/pending");
      } else if (!workspace?.contract_signed || workspace?.contract_revoked_at) {
        router.push("/sign-contract");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההתחברות נכשלה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070b18] px-4">
      {/* Aurora background */}
      <Aurora />

      {/* Floating orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-1/4 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl animate-pulse" />
        <div className="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl animate-pulse [animation-delay:1s]" />
      </div>

      {/* Login card */}
      <div className="relative w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Glow behind card */}
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-blue-500/20 via-violet-500/20 to-emerald-500/20 opacity-75 blur-xl" />

        <div className="relative rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-2xl shadow-2xl">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 shadow-xl shadow-blue-500/30">
              <MessageSquare className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">שליחת תפוצה לקבוצות</h1>
            <p className="mt-1 text-sm text-white/50">
              ברוכים השבים — התחבר לסביבת העבודה שלך
            </p>
          </div>

          {regSuccess ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-6 text-center">
              <p className="text-emerald-300 font-medium text-lg mb-2">הבקשה נשלחה בהצלחה!</p>
              <p className="text-sm text-emerald-200/70">החשבון ממתין לאישור מנהל. תקבל הודעה כשהחשבון יאושר.</p>
              <button
                onClick={() => { setIsRegister(false); setRegSuccess(false); }}
                className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline"
              >
                חזור להתחברות
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 backdrop-blur-sm">
                  {error}
                </div>
              )}

              {isRegister && (
                <>
                  <div className="space-y-2">
                    <label htmlFor="regSlug" className="text-sm font-medium text-white/70">
                      מזהה סביבת עבודה (slug)
                    </label>
                    <Input
                      id="regSlug"
                      type="text"
                      placeholder="my-workspace"
                      value={regSlug}
                      onChange={(e) => setRegSlug(e.target.value)}
                      required
                      className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-blue-500/40 focus-visible:border-blue-500/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="regName" className="text-sm font-medium text-white/70">
                      שם מלא
                    </label>
                    <Input
                      id="regName"
                      type="text"
                      placeholder="ישראל ישראלי"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      required
                      className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-blue-500/40 focus-visible:border-blue-500/50"
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-white/70">
                  אימייל
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-blue-500/40 focus-visible:border-blue-500/50"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-white/70">
                  סיסמה
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder={isRegister ? "בחר סיסמה" : "הזן סיסמה"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/30 focus-visible:ring-blue-500/40 focus-visible:border-blue-500/50"
                />
              </div>

              <MagneticButton className="w-full">
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-500 to-violet-600 shadow-xl shadow-blue-500/25 hover:shadow-2xl hover:shadow-blue-500/40 text-white border-0"
                  disabled={loading}
                  size="lg"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {isRegister ? "הרשמה" : "התחבר"}
                      <ArrowLeft className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </MagneticButton>

              <button
                type="button"
                onClick={() => { setIsRegister(!isRegister); setError(null); }}
                className="w-full text-center text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                {isRegister ? "יש לך חשבון? התחבר" : "אין לך חשבון? הרשם עכשיו"}
              </button>

              {!isRegister && (
                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="w-full text-center text-xs text-white/40 hover:text-white/60 transition-colors"
                >
                  שכחתי סיסמה
                </button>
              )}
            </form>
          )}

          {/* Google Sign-in divider */}
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">או</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL || ""}/api/auth/google`}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition-colors"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              המשך עם Google
            </a>
          </div>

          {/* Bottom decoration */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
            <span className="text-xs text-white/30">
              שליחת תפוצה לקבוצות
            </span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
