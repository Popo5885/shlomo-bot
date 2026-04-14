"use client";

import Link from "next/link";
import {
  MessageSquare,
  Shield,
  BarChart3,
  ArrowLeft,
  Send,
  Users,
  Zap,
  TrendingUp,
  CheckCircle2,
  Bot,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Aurora } from "@/components/effects/aurora";
import { TiltCard } from "@/components/effects/tilt-card";
import { MagneticButton } from "@/components/effects/magnetic-button";

const features = [
  {
    icon: Radio,
    title: "וואטסאפ וטלגרם בממשק אחד",
    description:
      "חברו את כל הערוצים שלכם — WhatsApp ו-Telegram — וניהלו הפצות מריכוז אחד עם סנכרון אוטומטי של קבוצות.",
    gradient: "from-emerald-500 to-teal-500",
    glow: "shadow-emerald-500/20",
  },
  {
    icon: Shield,
    title: "מנגנון חסינות חכם",
    description:
      "השהיה אקראית מובנית בין הודעות, זיהוי rate-limit אוטומטי ומנגנון retry חכם — כדי שהחשבון שלכם יישאר בטוח.",
    gradient: "from-violet-500 to-purple-500",
    glow: "shadow-violet-500/20",
  },
  {
    icon: BarChart3,
    title: "תובנות וניתוח בזמן אמת",
    description:
      "מעקב צפיות, אחוזי הצלחה, ניתוח שעות שליחה אידיאליות והמלצות AI לאופטימיזציה של הקמפיינים.",
    gradient: "from-blue-500 to-cyan-500",
    glow: "shadow-blue-500/20",
  },
];

const stats = [
  { label: "הודעות נשלחו", value: "1.2M+", icon: Send },
  { label: "קבוצות פעילות", value: "8,400+", icon: Users },
  { label: "אחוז הצלחה", value: "99.2%", icon: TrendingUp },
  { label: "לקוחות מרוצים", value: "350+", icon: CheckCircle2 },
];

const capabilities = [
  "הפצה אוטומטית לכל הקבוצות בלחיצה",
  "אישורים אינטראקטיביים לפני שליחה",
  "כללי הפצה גמישים עם מסננים",
  "הרשאות גרנולריות לכל חבר צוות",
  "CMS דינמי לניהול תוכן",
  "דוחות ואנליטיקה מתקדמים",
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-[#0a0a1a] text-white overflow-hidden" dir="rtl">
      <Aurora />

      {/* ═══ Sticky Header ═══ */}
      <header className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-2xl bg-white/[0.03]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-lg shadow-violet-500/30">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              שליחת תפוצה לקבוצות
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button
                variant="glass"
                size="sm"
                className="rounded-full px-5"
              >
                כניסה
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ═══ Hero Section ═══ */}
      <section className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
        {/* Decorative grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative flex flex-col items-center text-center">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300 backdrop-blur-sm">
            <Zap className="h-3.5 w-3.5" />
            הפלטפורמה #1 להפצת הודעות בישראל
          </div>

          {/* Title */}
          <h1 className="max-w-4xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            <span className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
              הפצת הודעות חכמה
            </span>
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
              לוואטסאפ וטלגרם
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/50 sm:text-xl">
            המערכת המתקדמת ביותר לניהול והפצת הודעות אוטומטית בקבוצות, עם
            אישורים חכמים ואנליטיקה בזמן אמת.
          </p>

          {/* CTA */}
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <MagneticButton>
              <Link href="/login">
                <Button
                  size="lg"
                  className="rounded-full bg-gradient-to-r from-violet-500 to-blue-600 px-10 text-base shadow-2xl shadow-violet-500/30 hover:shadow-violet-500/50 hover:brightness-110"
                >
                  כניסה למערכת
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
            </MagneticButton>
          </div>

          {/* Platform icons */}
          <div className="mt-8 flex items-center gap-3 text-sm text-white/30">
            <MessageSquare className="h-4 w-4" />
            <span>WhatsApp</span>
            <span className="text-white/10">·</span>
            <Bot className="h-4 w-4" />
            <span>Telegram</span>
          </div>
        </div>
      </section>

      {/* ═══ Stats Bar ═══ */}
      <section className="relative border-y border-white/5 bg-white/[0.02] backdrop-blur-sm">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px sm:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col items-center gap-1.5 px-6 py-8 text-center"
            >
              <stat.icon className="h-5 w-5 text-violet-400 mb-1" />
              <p className="text-2xl font-bold text-white sm:text-3xl">
                {stat.value}
              </p>
              <p className="text-xs text-white/40">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Feature Grid ═══ */}
      <section className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              הכל במקום אחד
            </span>
          </h2>
          <p className="mt-3 text-white/40">
            כל מה שצריך כדי לנהל הפצת הודעות מקצועית
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {features.map((feature) => (
            <TiltCard key={feature.title} className="rounded-2xl" maxTilt={6}>
              <div
                className={`group relative h-full rounded-2xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl transition-all duration-300 hover:border-white/20 hover:bg-white/[0.07] shadow-xl ${feature.glow}`}
              >
                {/* Icon */}
                <div
                  className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.gradient} shadow-lg`}
                >
                  <feature.icon className="h-7 w-7 text-white" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/40">
                  {feature.description}
                </p>

                {/* Decorative corner glow */}
                <div
                  className={`pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-full bg-gradient-to-br ${feature.gradient} opacity-10 blur-3xl transition-opacity duration-500 group-hover:opacity-20`}
                />
              </div>
            </TiltCard>
          ))}
        </div>
      </section>

      {/* ═══ Dashboard Preview ═══ */}
      <section className="relative mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">
            <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              לוח בקרה מתקדם
            </span>
          </h2>
          <p className="mt-3 text-white/40">
            תצוגה מקדימה של ממשק הניהול שלכם
          </p>
        </div>

        <TiltCard className="rounded-3xl" maxTilt={3}>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-2xl shadow-2xl sm:p-10">
            {/* Mock header */}
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-sm text-white/30">שלום, מנהל</p>
                <h3 className="text-xl font-bold text-white">מרכז הבקרה</h3>
              </div>
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                <div className="h-3 w-3 rounded-full bg-yellow-500 shadow-lg shadow-yellow-500/50" />
                <div className="h-3 w-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
              </div>
            </div>

            {/* Mock stat cards */}
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                { label: "נשלחו היום", value: "1,247", color: "from-violet-500 to-purple-500" },
                { label: "סה״כ נשלחו", value: "142.8K", color: "from-blue-500 to-cyan-500" },
                { label: "קבוצות", value: "86", color: "from-emerald-500 to-teal-500" },
                { label: "כללים פעילים", value: "12", color: "from-orange-500 to-amber-500" },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"
                >
                  <p className="text-xs text-white/30">{card.label}</p>
                  <p
                    className={`mt-2 text-2xl font-bold bg-gradient-to-r ${card.color} bg-clip-text text-transparent`}
                  >
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Mock activity rows */}
            <div className="mt-6 space-y-3">
              {[
                { name: "עדכוני בוקר ללקוחות", count: "34 קבוצות", status: "פעיל" },
                { name: "מבצעים שבועיים", count: "22 קבוצות", status: "פעיל" },
                { name: "הודעות דחופות", count: "86 קבוצות", status: "ממתין לאישור" },
              ].map((rule) => (
                <div
                  key={rule.name}
                  className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-5 py-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                    <span className="text-sm font-medium text-white/70">
                      {rule.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-white/30">{rule.count}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                        rule.status === "פעיל"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                      }`}
                    >
                      {rule.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TiltCard>
      </section>

      {/* ═══ Capabilities List ═══ */}
      <section className="relative mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-xl sm:p-12">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">
              <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                יכולות הפלטפורמה
              </span>
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {capabilities.map((cap) => (
              <div key={cap} className="flex items-center gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500">
                  <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm text-white/60">{cap}</span>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <MagneticButton>
              <Link href="/login">
                <Button
                  size="lg"
                  className="rounded-full bg-gradient-to-r from-violet-500 to-blue-600 px-10 shadow-2xl shadow-violet-500/30"
                >
                  התחל עכשיו — חינם
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
            </MagneticButton>
          </div>
        </div>
      </section>

      {/* ═══ Footer ═══ */}
      <footer className="border-t border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            {/* Brand */}
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-600">
                <MessageSquare className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-white/60">
                שליחת תפוצה לקבוצות
              </span>
            </div>

            {/* Legal links */}
            <nav className="flex items-center gap-6 text-sm text-white/30">
              <Link
                href="/privacy"
                className="transition-colors hover:text-white/60"
              >
                מדיניות פרטיות
              </Link>
              <Link
                href="/terms"
                className="transition-colors hover:text-white/60"
              >
                תנאי שימוש
              </Link>
              <Link
                href="/accessibility"
                className="transition-colors hover:text-white/60"
              >
                הצהרת נגישות
              </Link>
            </nav>
          </div>

          {/* Copyright */}
          <div className="mt-8 border-t border-white/5 pt-6 text-center text-xs text-white/20">
            &copy; {new Date().getFullYear()} שלמה פופוביץ פתרונות אוטמציה
            לעסקים. כל הזכויות שמורות.
          </div>
        </div>
      </footer>
    </div>
  );
}
