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
      router.push("/dashboard");
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
            </form>
          )}

          {/* Bottom decoration */}
          <div className="mt-8 flex items-center justify-center gap-3">
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
