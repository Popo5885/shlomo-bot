"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Check,
  MessageSquare,
  Globe,
  Send,
  Search,
  Users,
  Radio,
  Bot,
  Lock,
  Unlock,
  Shield,
  Clock,
  Zap,
  Gauge,
  SlidersHorizontal,
  Hash,
  FileText,
  Image,
  BarChart3,
  ChevronDown,
  ChevronUp,
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
import { TiltCard } from "@/components/effects/tilt-card";
import { MagneticButton } from "@/components/effects/magnetic-button";
import { api, ApiError } from "@/lib/api";
import type { DistributionRule, Destination } from "@/types/api";

/* ═══════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════ */

type TriggerType = "listen" | "direct" | null;
type DelayPreset = "fast" | "medium" | "slow" | "custom";
type BotConflictMode = "run_both" | "run_distribution_only" | "run_bot_only";
type SuffixOverride = "default" | "custom" | "none" | "telegram";

interface SenderPermissions {
  is_main_admin: boolean;
  can_send_free: boolean;
  can_delete_all: boolean;
  auto_new_groups: boolean;
}

interface PerGroupSuffix {
  destination_id: string;
  mode: SuffixOverride;
  custom_text: string;
}

/* ═══════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════ */

const steps = [
  { num: 1, emoji: "\uD83C\uDFAF", label: "קבוצות יעד" },
  { num: 2, emoji: "\u26A1", label: "טריגר" },
  { num: 3, emoji: "\uD83D\uDC65", label: "מורשים" },
  { num: 4, emoji: "\u2699\uFE0F", label: "הגדרות" },
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
    scale: 0.97,
  }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
    scale: 0.97,
  }),
};

const destTypeLabel: Record<string, string> = {
  WA_GROUP: "\u05E7\u05D1\u05D5\u05E6\u05EA WA",
  WA_CHANNEL: "\u05E2\u05E8\u05D5\u05E5 WA",
  TG_GROUP: "\u05E7\u05D1\u05D5\u05E6\u05EA TG",
  TG_CHANNEL: "\u05E2\u05E8\u05D5\u05E5 TG",
  TG_SUPERGROUP: "\u05E2\u05E8\u05D5\u05E5 TG",
};

function isWhatsApp(platform: string) {
  return platform === "WHATSAPP_WEB" || platform === "WHATSAPP_BUSINESS_API";
}

function isTelegram(platform: string) {
  return platform === "TELEGRAM_BOT" || platform === "TELEGRAM_USERBOT";
}

function getDestIcon(dest: Destination) {
  if (isWhatsApp(dest.platform)) {
    if (dest.destination_type === "WA_CHANNEL")
      return <Globe className="h-4 w-4 shrink-0 text-blue-400" />;
    return <MessageSquare className="h-4 w-4 shrink-0 text-emerald-400" />;
  }
  return <Send className="h-4 w-4 shrink-0 text-blue-400" />;
}

function getDestColor(dest: Destination) {
  if (isWhatsApp(dest.platform)) {
    if (dest.destination_type === "WA_CHANNEL") return "blue";
    return "emerald";
  }
  return "blue";
}

/* ═══════════════════════════════════════════════════════════
   Glassmorphism helper classes
   ═══════════════════════════════════════════════════════════ */

const glass =
  "bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl";
const glassInner =
  "bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl";

/* ═══════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════ */

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative h-7 w-12 rounded-full transition-all duration-300 ${
        value
          ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-lg shadow-emerald-500/25"
          : "bg-white/10"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300 ${
          value ? "translate-x-0.5" : "translate-x-[1.35rem]"
        }`}
      />
    </button>
  );
}

function GlassSection({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`${glass} p-6 ${className}`}>{children}</div>;
}

/* ═══════════════════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════════════════ */

export default function NewRulePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available destinations
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loadingDests, setLoadingDests] = useState(true);

  // Step 1: Target Groups
  const [destinationIds, setDestinationIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Step 2: Trigger
  const [triggerType, setTriggerType] = useState<TriggerType>(null);
  const [sourceGroupId, setSourceGroupId] = useState("");

  // Step 3: Authorized Senders
  const [allowAll, setAllowAll] = useState(false);
  const [phones, setPhones] = useState<string[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [permissions, setPermissions] = useState<SenderPermissions>({
    is_main_admin: false,
    can_send_free: false,
    can_delete_all: false,
    auto_new_groups: false,
  });

  // Step 4: Settings
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [delayPreset, setDelayPreset] = useState<DelayPreset>("medium");
  const [delayMin, setDelayMin] = useState(5);
  const [delayMax, setDelayMax] = useState(15);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [forwardMedia, setForwardMedia] = useState(true);
  const [forwardFiles, setForwardFiles] = useState(true);
  const [forwardPolls, setForwardPolls] = useState(true);
  const [stripSenderInfo, setStripSenderInfo] = useState(true);
  const [hashStripEnabled, setHashStripEnabled] = useState(false);

  // Suffix Engine
  const [defaultSuffixEnabled, setDefaultSuffixEnabled] = useState(false);
  const [defaultSuffix, setDefaultSuffix] = useState("");
  const [topBannerEnabled, setTopBannerEnabled] = useState(false);
  const [topBanner, setTopBanner] = useState("");
  const [telegramSuffixEnabled, setTelegramSuffixEnabled] = useState(false);
  const [telegramSuffix, setTelegramSuffix] = useState("");
  const [perGroupSuffixOpen, setPerGroupSuffixOpen] = useState(false);
  const [perGroupSuffixes, setPerGroupSuffixes] = useState<PerGroupSuffix[]>(
    []
  );

  // Bot Conflict
  const [botConflictMode, setBotConflictMode] =
    useState<BotConflictMode>("run_both");

  /* ─── Data Loading ─── */

  useEffect(() => {
    api
      .get<Destination[]>("/api/client/destinations")
      .then(setDestinations)
      .catch(() => {})
      .finally(() => setLoadingDests(false));
  }, []);

  // Initialize per-group suffixes when destinations change
  useEffect(() => {
    if (destinationIds.length > 0) {
      setPerGroupSuffixes((prev) => {
        const existing = new Map(prev.map((p) => [p.destination_id, p]));
        return destinationIds.map(
          (id) =>
            existing.get(id) || {
              destination_id: id,
              mode: "default" as SuffixOverride,
              custom_text: "",
            }
        );
      });
    }
  }, [destinationIds]);

  /* ─── Derived ─── */

  const filteredDestinations = useMemo(() => {
    if (!searchQuery.trim()) return destinations;
    const q = searchQuery.toLowerCase();
    return destinations.filter(
      (d) =>
        (d.display_name || "").toLowerCase().includes(q) ||
        d.platform_dest_id.toLowerCase().includes(q) ||
        (destTypeLabel[d.destination_type] || "").includes(q)
    );
  }, [destinations, searchQuery]);

  const sourceGroups = useMemo(
    () =>
      destinations.filter(
        (d) =>
          d.destination_type === "WA_GROUP" ||
          d.destination_type === "TG_GROUP" ||
          d.destination_type === "TG_SUPERGROUP" ||
          d.destination_type === "TG_CHANNEL"
      ),
    [destinations]
  );

  const allSelected =
    filteredDestinations.length > 0 &&
    filteredDestinations.every((d) => destinationIds.includes(d.id));

  /* ─── Navigation ─── */

  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  };

  /* ─── Validation ─── */

  const canProceedStep1 = destinationIds.length > 0;
  const canProceedStep2 =
    triggerType !== null &&
    (triggerType === "direct" || sourceGroupId.trim() !== "");
  const canProceedStep3 = allowAll || phones.length > 0;

  /* ─── Phone management ─── */

  const addPhone = () => {
    const p = newPhone.trim();
    if (!p || phones.includes(p)) return;
    setPhones([...phones, p]);
    setNewPhone("");
  };

  const removePhone = (idx: number) => {
    setPhones(phones.filter((_, i) => i !== idx));
  };

  /* ─── Delay presets ─── */

  useEffect(() => {
    if (delayPreset === "fast") {
      setDelayMin(1);
      setDelayMax(3);
    } else if (delayPreset === "medium") {
      setDelayMin(5);
      setDelayMax(15);
    } else if (delayPreset === "slow") {
      setDelayMin(15);
      setDelayMax(45);
    }
  }, [delayPreset]);

  /* ─── Select all toggle ─── */

  const toggleSelectAll = () => {
    if (allSelected) {
      const filteredIds = new Set(filteredDestinations.map((d) => d.id));
      setDestinationIds(destinationIds.filter((id) => !filteredIds.has(id)));
    } else {
      const newIds = new Set([
        ...destinationIds,
        ...filteredDestinations.map((d) => d.id),
      ]);
      setDestinationIds(Array.from(newIds));
    }
  };

  /* ─── Per-group suffix update ─── */

  const updatePerGroupSuffix = (
    destId: string,
    field: "mode" | "custom_text",
    value: string
  ) => {
    setPerGroupSuffixes((prev) =>
      prev.map((p) =>
        p.destination_id === destId ? { ...p, [field]: value } : p
      )
    );
  };

  /* ─── Submit ─── */

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        name,
        source_group_id:
          triggerType === "listen" ? sourceGroupId.trim() : "direct_bot",
        delay_mode: "random",
        delay_preset: delayPreset,
        delay_min_seconds: delayMin,
        delay_max_seconds: delayMax,
        forward_media: forwardMedia,
        forward_files: forwardFiles,
        forward_polls: forwardPolls,
        strip_sender_info: stripSenderInfo,
        requires_approval: requiresApproval,
        hash_strip_enabled: hashStripEnabled,
        append_suffix_enabled: defaultSuffixEnabled,
        destination_ids: destinationIds,
        bot_conflict_mode: botConflictMode,
        authorized_senders_mode: allowAll ? "all" : "whitelist",
      };

      if (description) body.description = description;
      if (defaultSuffixEnabled && defaultSuffix)
        body.append_suffix = defaultSuffix;
      if (topBannerEnabled && topBanner) body.top_banner = topBanner;
      if (telegramSuffixEnabled && telegramSuffix)
        body.telegram_suffix = telegramSuffix;

      if (!allowAll && phones.length > 0) {
        body.authorized_senders = phones;
        body.sender_permissions = permissions;
      }

      const groupOverrides = perGroupSuffixes.filter(
        (p) => p.mode !== "default"
      );
      if (groupOverrides.length > 0) {
        body.per_group_suffix_overrides = groupOverrides;
      }

      const rule = await api.post<DistributionRule>(
        "/api/client/rules",
        body
      );
      router.push(`/dashboard/rules/${rule.id}`);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("\u05E9\u05D2\u05D9\u05D0\u05D4 \u05DC\u05D0 \u05E6\u05E4\u05D5\u05D9\u05D4");
    } finally {
      setLoading(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════ */

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12" dir="rtl">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/rules">
          <Button variant="ghost" size="icon" className="text-white/60 hover:text-white hover:bg-white/10">
            <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-l from-violet-400 to-blue-400 bg-clip-text text-transparent">
            הפצה חדשה
          </h1>
          <p className="text-sm text-white/40">הגדר כלל הפצה אוטומטי חדש</p>
        </div>
      </div>

      {/* ─── Error ─── */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${glass} border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300`}
        >
          {error}
        </motion.div>
      )}

      {/* ─── Step Indicator ─── */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {steps.map((step, idx) => (
          <div key={step.num} className="flex items-center gap-2">
            <button
              onClick={() => {
                if (step.num < currentStep) goToStep(step.num);
              }}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-300 ${
                currentStep === step.num
                  ? "bg-gradient-to-r from-violet-500/20 to-blue-500/20 border border-violet-500/30 text-white shadow-lg shadow-violet-500/10"
                  : currentStep > step.num
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-white/5 border border-white/10 text-white/40"
              }`}
            >
              {currentStep > step.num ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <span>{step.emoji}</span>
              )}
              {step.label}
            </button>
            {idx < steps.length - 1 && (
              <ChevronLeft className="h-4 w-4 text-white/20" />
            )}
          </div>
        ))}
      </div>

      {/* ─── Animated Step Content ─── */}
      <AnimatePresence mode="wait" custom={direction}>
        {/* ════════════════════════════════════════════════════
           STEP 1: Target Groups
           ════════════════════════════════════════════════════ */}
        {currentStep === 1 && (
          <motion.div
            key="step1"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="space-y-6"
          >
            <GlassSection>
              <div className="space-y-1.5 mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-xl">{"\uD83C\uDFAF"}</span>
                  בחירת קבוצות יעד
                </h2>
                <p className="text-sm text-white/40">
                  סמנו את הקבוצות שיקבלו את ההודעות המופצות
                </p>
              </div>

              {loadingDests ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                </div>
              ) : destinations.length > 0 ? (
                <div className="space-y-4">
                  {/* Search + Select All */}
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="חיפוש קבוצה..."
                        className="pr-9 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                        allSelected
                          ? "bg-violet-500/20 border border-violet-500/30 text-violet-300"
                          : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      {allSelected ? "בטל הכל" : "בחר הכל"}
                    </button>
                  </div>

                  {/* List */}
                  <div className="max-h-[22rem] space-y-1.5 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 scrollbar-thin scrollbar-thumb-white/10">
                    {filteredDestinations.map((dest) => {
                      const selected = destinationIds.includes(dest.id);
                      const color = getDestColor(dest);
                      return (
                        <label
                          key={dest.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 transition-all duration-200 ${
                            selected
                              ? color === "emerald"
                                ? "bg-emerald-500/10 border border-emerald-500/20"
                                : "bg-blue-500/10 border border-blue-500/20"
                              : "border border-transparent hover:bg-white/5"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setDestinationIds([...destinationIds, dest.id]);
                              } else {
                                setDestinationIds(
                                  destinationIds.filter((id) => id !== dest.id)
                                );
                              }
                            }}
                            className="h-4 w-4 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/40"
                          />
                          {getDestIcon(dest)}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-white truncate">
                                {dest.display_name || dest.platform_dest_id}
                              </p>
                              <span
                                className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  color === "emerald"
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : "bg-blue-500/15 text-blue-300"
                                }`}
                              >
                                {destTypeLabel[dest.destination_type] ||
                                  dest.destination_type}
                              </span>
                            </div>
                            {dest.participant_count != null && (
                              <p className="text-xs text-white/30">
                                {dest.participant_count} משתתפים
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}

                    {filteredDestinations.length === 0 && (
                      <p className="py-6 text-center text-sm text-white/30">
                        לא נמצאו תוצאות
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className={`${glassInner} p-8 text-center`}>
                  <Users className="mx-auto h-8 w-8 mb-3 text-white/20" />
                  <p className="text-sm text-white/50">אין קבוצות זמינות עדיין</p>
                  <p className="text-xs text-white/30 mt-1">
                    חברו את WhatsApp / Telegram כדי לסנכרן קבוצות
                  </p>
                </div>
              )}

              {/* Counter */}
              {destinationIds.length > 0 && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
                  <p className="text-sm font-medium text-violet-300">
                    נבחרו {destinationIds.length} קבוצות
                  </p>
                </div>
              )}
            </GlassSection>

            {/* Nav */}
            <div className="flex justify-start">
              <MagneticButton>
                <Button
                  onClick={() => goToStep(2)}
                  disabled={!canProceedStep1}
                  className="bg-gradient-to-r from-violet-600 to-blue-600 shadow-lg shadow-violet-500/25 border-0 text-white"
                >
                  הבא
                  <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>
              </MagneticButton>
            </div>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════
           STEP 2: Trigger Source
           ════════════════════════════════════════════════════ */}
        {currentStep === 2 && (
          <motion.div
            key="step2"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="space-y-6"
          >
            <GlassSection>
              <div className="space-y-1.5 mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-xl">{"\u26A1"}</span>
                  מקור טריגר
                </h2>
                <p className="text-sm text-white/40">
                  מאיפה נשאב את ההודעות להפצה?
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TiltCard className="rounded-2xl" maxTilt={5}>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setTriggerType("listen")}
                    className={`group flex w-full flex-col items-center gap-4 rounded-2xl border-2 p-6 text-center transition-all duration-300 ${
                      triggerType === "listen"
                        ? "border-violet-500/60 bg-violet-500/10 shadow-lg shadow-violet-500/10"
                        : "border-white/10 hover:border-violet-500/30 hover:bg-violet-500/5"
                    }`}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20">
                      <Radio className="h-7 w-7 text-violet-400" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-white">
                        {"\uD83D\uDCE1"} האזנה לקבוצת מקור
                      </p>
                      <p className="mt-1.5 text-sm text-white/40">
                        המערכת תעתיק הודעות מקבוצה ספציפית ותפיץ אותן הלאה
                      </p>
                    </div>
                  </motion.button>
                </TiltCard>

                <TiltCard className="rounded-2xl" maxTilt={5}>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setTriggerType("direct");
                      setSourceGroupId("direct_bot");
                    }}
                    className={`group flex w-full flex-col items-center gap-4 rounded-2xl border-2 p-6 text-center transition-all duration-300 ${
                      triggerType === "direct"
                        ? "border-blue-500/60 bg-blue-500/10 shadow-lg shadow-blue-500/10"
                        : "border-white/10 hover:border-blue-500/30 hover:bg-blue-500/5"
                    }`}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
                      <Bot className="h-7 w-7 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-white">
                        {"\uD83E\uDD16"} הודעה ישירה לבוט
                      </p>
                      <p className="mt-1.5 text-sm text-white/40">
                        שליחת הודעה פרטית למספר של הבוט תשגר אותה לכל הקבוצות
                      </p>
                    </div>
                  </motion.button>
                </TiltCard>
              </div>

              {/* Source group dropdown */}
              <AnimatePresence>
                {triggerType === "listen" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className={`mt-4 space-y-2 ${glassInner} p-4`}>
                      <label className="text-sm font-medium text-white/70">
                        בחר קבוצת מקור
                      </label>
                      {sourceGroups.length > 0 ? (
                        <select
                          value={sourceGroupId}
                          onChange={(e) => setSourceGroupId(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 [&>option]:bg-slate-900 [&>option]:text-white"
                        >
                          <option value="">-- בחר קבוצה --</option>
                          {sourceGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.display_name || g.platform_dest_id}{" "}
                              ({destTypeLabel[g.destination_type] || g.destination_type})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          value={sourceGroupId}
                          onChange={(e) => setSourceGroupId(e.target.value)}
                          placeholder="הזן מזהה קבוצת מקור"
                          className="bg-white/5 border-white/10 text-white placeholder:text-white/30 font-mono text-sm"
                        />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassSection>

            {/* Nav */}
            <div className="flex justify-between">
              <MagneticButton>
                <Button
                  onClick={() => goToStep(3)}
                  disabled={!canProceedStep2}
                  className="bg-gradient-to-r from-violet-600 to-blue-600 shadow-lg shadow-violet-500/25 border-0 text-white"
                >
                  הבא
                  <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>
              </MagneticButton>
              <Button
                variant="ghost"
                onClick={() => goToStep(1)}
                className="text-white/50 hover:text-white hover:bg-white/5"
              >
                <ChevronRight className="h-4 w-4 ml-1" />
                הקודם
              </Button>
            </div>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════
           STEP 3: Authorized Senders
           ════════════════════════════════════════════════════ */}
        {currentStep === 3 && (
          <motion.div
            key="step3"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="space-y-6"
          >
            <GlassSection>
              <div className="space-y-1.5 mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-xl">{"\uD83D\uDC65"}</span>
                  הגדרת מורשי שליחה
                </h2>
                <p className="text-sm text-white/40">
                  רק הודעות מהמספרים שיוגדרו כאן יופצו לשאר הקבוצות
                </p>
              </div>

              {/* Allow all toggle */}
              <div className={`${glassInner} p-4 flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                  {allowAll ? (
                    <Unlock className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <Lock className="h-5 w-5 text-white/40" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-white">
                      {"\uD83D\uDD13"} אפשר לכולם לשלוח
                    </p>
                    <p className="text-xs text-white/30 mt-0.5">
                      כשהמתג דולק, כל הודעה של כל חבר בקבוצה תופץ
                    </p>
                  </div>
                </div>
                <Toggle value={allowAll} onChange={setAllowAll} />
              </div>

              {/* Phone inputs */}
              <AnimatePresence>
                {!allowAll && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 space-y-4">
                      {/* Add phone */}
                      <div className="flex items-center gap-2">
                        <Input
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addPhone();
                            }
                          }}
                          placeholder="05X-XXXXXXX"
                          className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                        />
                        <Button
                          type="button"
                          onClick={addPhone}
                          disabled={!newPhone.trim()}
                          size="icon"
                          className="shrink-0 bg-gradient-to-r from-violet-600 to-blue-600 shadow-md border-0 text-white h-10 w-10"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Phone list */}
                      {phones.length > 0 && (
                        <div className="space-y-1.5">
                          {phones.map((phone, idx) => (
                            <motion.div
                              key={`${phone}-${idx}`}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              className={`${glassInner} flex items-center justify-between p-3`}
                            >
                              <p className="text-sm font-mono text-white/80">
                                {phone}
                              </p>
                              <button
                                type="button"
                                onClick={() => removePhone(idx)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </motion.div>
                          ))}
                        </div>
                      )}

                      {/* Permission checkboxes */}
                      <div className={`${glassInner} p-4 space-y-3`}>
                        <p className="text-sm font-medium text-white/70 mb-2">
                          הרשאות
                        </p>
                        {[
                          {
                            key: "is_main_admin" as const,
                            label: "מנהל ראשי",
                            icon: Shield,
                          },
                          {
                            key: "can_send_free" as const,
                            label: "שליחה חופשית",
                            icon: Send,
                          },
                          {
                            key: "can_delete_all" as const,
                            label: "מחיקה מכל הקבוצות",
                            icon: X,
                          },
                          {
                            key: "auto_new_groups" as const,
                            label: "קבוצות חדשות אוטומטית",
                            icon: Plus,
                          },
                        ].map(({ key, label, icon: Icon }) => (
                          <label
                            key={key}
                            className="flex items-center gap-3 cursor-pointer group"
                          >
                            <input
                              type="checkbox"
                              checked={permissions[key]}
                              onChange={(e) =>
                                setPermissions({
                                  ...permissions,
                                  [key]: e.target.checked,
                                })
                              }
                              className="h-4 w-4 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/40"
                            />
                            <Icon className="h-4 w-4 text-white/30 group-hover:text-white/50 transition-colors" />
                            <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors">
                              {label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassSection>

            {/* Nav */}
            <div className="flex justify-between">
              <MagneticButton>
                <Button
                  onClick={() => goToStep(4)}
                  disabled={!canProceedStep3}
                  className="bg-gradient-to-r from-violet-600 to-blue-600 shadow-lg shadow-violet-500/25 border-0 text-white"
                >
                  הבא
                  <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>
              </MagneticButton>
              <Button
                variant="ghost"
                onClick={() => goToStep(2)}
                className="text-white/50 hover:text-white hover:bg-white/5"
              >
                <ChevronRight className="h-4 w-4 ml-1" />
                הקודם
              </Button>
            </div>
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════
           STEP 4: Settings
           ════════════════════════════════════════════════════ */}
        {currentStep === 4 && (
          <motion.div
            key="step4"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="space-y-6"
          >
            {/* ─── Basic Info ─── */}
            <GlassSection>
              <div className="space-y-1.5 mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-xl">{"\u2699\uFE0F"}</span>
                  הגדרות
                </h2>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">
                    שם הכלל *
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder='לדוגמה: "עדכוני בוקר ללקוחות"'
                    required
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/70">
                    תיאור (אופציונלי)
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="תיאור לשימוש פנימי..."
                    rows={2}
                    className="flex w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-sm backdrop-blur-sm ring-offset-background transition-all duration-200 placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2"
                  />
                </div>
              </div>
            </GlassSection>

            {/* ─── Delay Presets ─── */}
            <GlassSection>
              <div className="space-y-1.5 mb-5">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Clock className="h-4 w-4 text-violet-400" />
                  מנגנון השהיה
                </h3>
                <p className="text-xs text-white/30">
                  השהיה אקראית בין הודעות כדי למנוע חסימות
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    {
                      value: "fast" as DelayPreset,
                      label: "מהיר",
                      icon: Zap,
                      desc: "1-3 שניות",
                    },
                    {
                      value: "medium" as DelayPreset,
                      label: "בינוני",
                      icon: Gauge,
                      desc: "5-15 שניות",
                    },
                    {
                      value: "slow" as DelayPreset,
                      label: "איטי",
                      icon: Shield,
                      desc: "15-45 שניות",
                    },
                    {
                      value: "custom" as DelayPreset,
                      label: "מותאם",
                      icon: SlidersHorizontal,
                      desc: "הגדרה ידנית",
                    },
                  ] as const
                ).map(({ value, label, icon: Icon, desc }) => (
                  <motion.button
                    key={value}
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setDelayPreset(value)}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition-all duration-200 ${
                      delayPreset === value
                        ? "border-violet-500/60 bg-violet-500/10 shadow-md shadow-violet-500/10"
                        : "border-white/10 hover:border-white/20 hover:bg-white/5"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${
                        delayPreset === value
                          ? "text-violet-400"
                          : "text-white/30"
                      }`}
                    />
                    <span
                      className={`text-sm font-medium ${
                        delayPreset === value ? "text-white" : "text-white/60"
                      }`}
                    >
                      {label}
                    </span>
                    <span className="text-[10px] text-white/30">{desc}</span>
                  </motion.button>
                ))}
              </div>

              <AnimatePresence>
                {delayPreset === "custom" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white/50">
                          מינימום (שניות)
                        </label>
                        <Input
                          type="number"
                          value={delayMin}
                          onChange={(e) => setDelayMin(Number(e.target.value))}
                          min={1}
                          className="bg-white/5 border-white/10 text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-white/50">
                          מקסימום (שניות)
                        </label>
                        <Input
                          type="number"
                          value={delayMax}
                          onChange={(e) => setDelayMax(Number(e.target.value))}
                          min={1}
                          className="bg-white/5 border-white/10 text-white"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className={`mt-3 ${glassInner} p-3 text-sm text-blue-300/60`}>
                השהיה משתנה של {delayMin}-{delayMax} שניות בין הודעות
              </div>
            </GlassSection>

            {/* ─── Controls ─── */}
            <GlassSection>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-violet-400" />
                שליטה ובקרה
              </h3>

              <div className="space-y-3">
                {/* Requires Approval */}
                <div className={`${glassInner} p-4 flex items-center justify-between`}>
                  <div>
                    <p className="text-sm font-medium text-white">
                      דורש אישור לפני שליחה
                    </p>
                    <p className="text-xs text-white/30 mt-0.5">
                      הבוט ישלח לך כפתורי אישור לפני תחילת ההפצה
                    </p>
                  </div>
                  <Toggle
                    value={requiresApproval}
                    onChange={setRequiresApproval}
                  />
                </div>

                {/* Message types */}
                <div className={`${glassInner} p-4 space-y-3`}>
                  <p className="text-sm font-medium text-white/70 mb-2">
                    סוגי הודעות להעברה
                  </p>
                  {[
                    {
                      label: "תמונות/וידאו",
                      value: forwardMedia,
                      onChange: setForwardMedia,
                      icon: Image,
                    },
                    {
                      label: "קבצים",
                      value: forwardFiles,
                      onChange: setForwardFiles,
                      icon: FileText,
                    },
                    {
                      label: "סקרים",
                      value: forwardPolls,
                      onChange: setForwardPolls,
                      icon: BarChart3,
                    },
                  ].map(({ label, value, onChange, icon: Icon }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-white/30" />
                        <span className="text-sm text-white/60">{label}</span>
                      </div>
                      <Toggle value={value} onChange={onChange} />
                    </div>
                  ))}
                </div>

                {/* Strip sender info */}
                <div className={`${glassInner} p-4 flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-white/30" />
                    <span className="text-sm text-white/60">
                      הסר פרטי שולח
                    </span>
                  </div>
                  <Toggle
                    value={stripSenderInfo}
                    onChange={setStripSenderInfo}
                  />
                </div>

                {/* Hash strip */}
                <div className={`${glassInner} p-4 flex items-center justify-between`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-white/30" />
                      <span className="text-sm text-white/60">
                        תכונת # (שלח בלי תצוגה מקדימה)
                      </span>
                    </div>
                    <p className="text-xs text-white/20 mt-0.5 mr-6">
                      הוספת # בתחילת ההודעה תשלח ללא תצוגה מקדימה של קישורים
                    </p>
                  </div>
                  <Toggle
                    value={hashStripEnabled}
                    onChange={setHashStripEnabled}
                  />
                </div>
              </div>
            </GlassSection>

            {/* ─── Suffix Engine ─── */}
            <GlassSection>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                {"\u270D\uFE0F"} מנוע חתימות
              </h3>

              <div className="space-y-4">
                {/* Default Suffix */}
                <div className={`${glassInner} p-4 space-y-3`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white/70">
                      חתימת ברירת מחדל
                    </span>
                    <Toggle
                      value={defaultSuffixEnabled}
                      onChange={setDefaultSuffixEnabled}
                    />
                  </div>
                  <AnimatePresence>
                    {defaultSuffixEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <textarea
                          value={defaultSuffix}
                          onChange={(e) => setDefaultSuffix(e.target.value)}
                          placeholder="הכנס את החתימה שלך כאן..."
                          rows={2}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white backdrop-blur-sm placeholder:text-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Top Banner */}
                <div className={`${glassInner} p-4 space-y-3`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white/70">
                      באנר עליון
                    </span>
                    <Toggle
                      value={topBannerEnabled}
                      onChange={setTopBannerEnabled}
                    />
                  </div>
                  <AnimatePresence>
                    {topBannerEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <textarea
                          value={topBanner}
                          onChange={(e) => setTopBanner(e.target.value)}
                          placeholder="טקסט שיופיע בראש ההודעה..."
                          rows={2}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white backdrop-blur-sm placeholder:text-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Telegram Suffix */}
                <div className={`${glassInner} p-4 space-y-3`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white/70">
                      חתימת טלגרם
                    </span>
                    <Toggle
                      value={telegramSuffixEnabled}
                      onChange={setTelegramSuffixEnabled}
                    />
                  </div>
                  <AnimatePresence>
                    {telegramSuffixEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <textarea
                          value={telegramSuffix}
                          onChange={(e) => setTelegramSuffix(e.target.value)}
                          placeholder="חתימה ייחודית לערוצי טלגרם..."
                          rows={2}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white backdrop-blur-sm placeholder:text-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Per-group suffix overrides */}
                {destinationIds.length > 0 && (
                  <div className={`${glassInner} p-4`}>
                    <button
                      type="button"
                      onClick={() => setPerGroupSuffixOpen(!perGroupSuffixOpen)}
                      className="flex w-full items-center justify-between"
                    >
                      <span className="text-sm font-medium text-white/70">
                        חתימה מותאמת לקבוצה ספציפית
                      </span>
                      {perGroupSuffixOpen ? (
                        <ChevronUp className="h-4 w-4 text-white/30" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-white/30" />
                      )}
                    </button>

                    <AnimatePresence>
                      {perGroupSuffixOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 space-y-3">
                            {perGroupSuffixes.map((ps) => {
                              const dest = destinations.find(
                                (d) => d.id === ps.destination_id
                              );
                              if (!dest) return null;
                              return (
                                <div
                                  key={ps.destination_id}
                                  className="space-y-2 border-b border-white/5 pb-3 last:border-0"
                                >
                                  <p className="text-xs font-medium text-white/50 truncate">
                                    {dest.display_name ||
                                      dest.platform_dest_id}
                                  </p>
                                  <select
                                    value={ps.mode}
                                    onChange={(e) =>
                                      updatePerGroupSuffix(
                                        ps.destination_id,
                                        "mode",
                                        e.target.value
                                      )
                                    }
                                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/40 [&>option]:bg-slate-900 [&>option]:text-white"
                                  >
                                    <option value="default">ברירת מחדל</option>
                                    <option value="custom">
                                      מותאם אישית
                                    </option>
                                    <option value="none">ללא חתימה</option>
                                    <option value="telegram">
                                      חתימת טלגרם
                                    </option>
                                  </select>
                                  {ps.mode === "custom" && (
                                    <Input
                                      value={ps.custom_text}
                                      onChange={(e) =>
                                        updatePerGroupSuffix(
                                          ps.destination_id,
                                          "custom_text",
                                          e.target.value
                                        )
                                      }
                                      placeholder="חתימה מותאמת..."
                                      className="bg-white/5 border-white/10 text-white placeholder:text-white/20 text-sm"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </GlassSection>

            {/* ─── Bot Conflict ─── */}
            <GlassSection>
              <h3 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                {"\uD83E\uDD16"} התנגשות בוטים
              </h3>
              <p className="text-xs text-white/30 mb-4">
                מה יקרה כשהודעת הפצה נשלחת לקבוצה שבה פועל בוט נוסף?
              </p>

              <div className="space-y-2">
                {(
                  [
                    {
                      value: "run_both" as BotConflictMode,
                      label: "שניהם פועלים",
                      desc: "גם הפצה וגם בוט פועלים במקביל",
                    },
                    {
                      value: "run_distribution_only" as BotConflictMode,
                      label: "תפוצה בלבד",
                      desc: "רק הפצה תפעל, הבוט יושבת",
                    },
                    {
                      value: "run_bot_only" as BotConflictMode,
                      label: "בוט בלבד",
                      desc: "רק הבוט יפעל, ההפצה תושבת",
                    },
                  ] as const
                ).map(({ value, label, desc }) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-all duration-200 ${
                      botConflictMode === value
                        ? "border-violet-500/60 bg-violet-500/10 shadow-sm shadow-violet-500/10"
                        : "border-white/10 hover:border-white/20 hover:bg-white/5"
                    }`}
                  >
                    <input
                      type="radio"
                      name="bot_conflict_mode"
                      value={value}
                      checked={botConflictMode === value}
                      onChange={() => setBotConflictMode(value)}
                      className="h-4 w-4 border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/40"
                    />
                    <div>
                      <span className="text-sm font-medium text-white">
                        {label}
                      </span>
                      <p className="text-xs text-white/30">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </GlassSection>

            {/* ─── Submit + Nav ─── */}
            <div className="flex justify-between items-center">
              <MagneticButton>
                <Button
                  onClick={handleSubmit}
                  disabled={loading || !name.trim()}
                  className="bg-gradient-to-r from-violet-600 to-blue-600 shadow-lg shadow-violet-500/25 border-0 text-white px-8 py-3 text-base"
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4 ml-2" />
                      צור כלל הפצה
                    </>
                  )}
                </Button>
              </MagneticButton>
              <Button
                variant="ghost"
                onClick={() => goToStep(3)}
                className="text-white/50 hover:text-white hover:bg-white/5"
              >
                <ChevronRight className="h-4 w-4 ml-1" />
                הקודם
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
