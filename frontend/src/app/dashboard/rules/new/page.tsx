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
  Shield,
  Clock,
  Zap,
  Gauge,
  SlidersHorizontal,
  Hash,
  FileText,
  Image,
  BarChart3,
  Pencil,
  Ban,
  CheckCircle2,
  BellRing,
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
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
type SuffixOverride = "default" | "custom" | "none";

interface PerGroupSuffix {
  destination_id: string;
  mode: SuffixOverride;
  custom_text: string;
}

/* ═══════════════════════════════════════════════════════════
   Wizard step definitions
   ═══════════════════════════════════════════════════════════ */

const STEPS = [
  { num: 1, emoji: "🎯", label: "מקור ויעד" },
  { num: 2, emoji: "✍️", label: "חתימות" },
  { num: 3, emoji: "🤖", label: "התנגשות בוטים" },
  { num: 4, emoji: "✅", label: "אישורים ושמירה" },
];

const slide = {
  enter: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0, scale: 0.97 }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0, scale: 0.97 }),
};

const destTypeLabel: Record<string, string> = {
  WA_GROUP: "קבוצת WA",
  WA_CHANNEL: "ערוץ WA",
  TG_GROUP: "קבוצת TG",
  TG_CHANNEL: "ערוץ TG",
  TG_SUPERGROUP: "ערוץ TG",
};

/* ═══════════════════════════════════════════════════════════
   Glass helpers
   ═══════════════════════════════════════════════════════════ */

const glass = "bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl";
const glassInner = "bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl";

function isWhatsApp(p: string) {
  return p === "WHATSAPP_WEB" || p === "WHATSAPP_BUSINESS_API";
}
function getDestIcon(dest: Destination) {
  if (isWhatsApp(dest.platform)) {
    return dest.destination_type === "WA_CHANNEL"
      ? <Globe className="h-4 w-4 shrink-0 text-blue-400" />
      : <MessageSquare className="h-4 w-4 shrink-0 text-emerald-400" />;
  }
  return <Send className="h-4 w-4 shrink-0 text-blue-400" />;
}
function getDestColor(dest: Destination) {
  if (isWhatsApp(dest.platform)) return dest.destination_type === "WA_CHANNEL" ? "blue" : "emerald";
  return "blue";
}

/* ── Toggle ── */
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
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
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-300 ${value ? "translate-x-0.5" : "translate-x-[1.35rem]"}`} />
    </button>
  );
}

/* ── ToggleRow ── */
function ToggleRow({
  icon: Icon,
  label,
  desc,
  value,
  onChange,
  iconColor = "text-violet-400",
}: {
  icon: React.ElementType;
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
  iconColor?: string;
}) {
  return (
    <div className={`${glassInner} p-4 flex items-center justify-between gap-4`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5">
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="text-xs text-white/40 mt-0.5">{desc}</p>
        </div>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════ */

export default function NewRulePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── Data ── */
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loadingDests, setLoadingDests] = useState(true);

  /* ── Step 1: Source + Destinations ── */
  const [triggerType, setTriggerType] = useState<TriggerType>(null);
  const [sourceGroupId, setSourceGroupId] = useState("");
  const [destinationIds, setDestinationIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  /* ── Step 2: Suffixes ── */
  const [defaultSuffixEnabled, setDefaultSuffixEnabled] = useState(false);
  const [defaultSuffix, setDefaultSuffix] = useState("");
  const [topBannerEnabled, setTopBannerEnabled] = useState(false);
  const [topBanner, setTopBanner] = useState("");
  const [telegramSuffixEnabled, setTelegramSuffixEnabled] = useState(false);
  const [telegramSuffix, setTelegramSuffix] = useState("");
  const [hashStripEnabled, setHashStripEnabled] = useState(false);
  const [perGroupOpen, setPerGroupOpen] = useState(false);
  const [perGroupSuffixes, setPerGroupSuffixes] = useState<PerGroupSuffix[]>([]);

  /* ── Step 3: Bot Collisions ── */
  const [botConflictMode, setBotConflictMode] = useState<BotConflictMode>("run_both");

  /* ── Step 4: Approvals + Settings ── */
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [delayPreset, setDelayPreset] = useState<DelayPreset>("medium");
  const [delayMin, setDelayMin] = useState(5);
  const [delayMax, setDelayMax] = useState(15);
  const [forwardMedia, setForwardMedia] = useState(true);
  const [forwardFiles, setForwardFiles] = useState(true);
  const [forwardPolls, setForwardPolls] = useState(true);
  const [stripSenderInfo, setStripSenderInfo] = useState(true);
  const [allowAll, setAllowAll] = useState(false);
  const [phones, setPhones] = useState<string[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [sendersOpen, setSendersOpen] = useState(false);

  /* ── Load destinations ── */
  useEffect(() => {
    api.get<Destination[]>("/api/client/destinations")
      .then(setDestinations)
      .catch(() => {})
      .finally(() => setLoadingDests(false));
  }, []);

  /* ── Sync per-group suffixes when destinations change ── */
  useEffect(() => {
    if (destinationIds.length > 0) {
      setPerGroupSuffixes(prev => {
        const map = new Map(prev.map(p => [p.destination_id, p]));
        return destinationIds.map(id =>
          map.get(id) ?? { destination_id: id, mode: "default" as SuffixOverride, custom_text: "" }
        );
      });
    }
  }, [destinationIds]);

  /* ── Delay presets ── */
  useEffect(() => {
    if (delayPreset === "fast") { setDelayMin(1); setDelayMax(3); }
    else if (delayPreset === "medium") { setDelayMin(5); setDelayMax(15); }
    else if (delayPreset === "slow") { setDelayMin(15); setDelayMax(45); }
  }, [delayPreset]);

  /* ── Derived ── */
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return destinations;
    const q = searchQuery.toLowerCase();
    return destinations.filter(d =>
      (d.display_name || "").toLowerCase().includes(q) ||
      d.platform_dest_id.toLowerCase().includes(q)
    );
  }, [destinations, searchQuery]);

  const sourceGroups = useMemo(() =>
    destinations.filter(d => ["WA_GROUP", "TG_GROUP", "TG_SUPERGROUP", "TG_CHANNEL"].includes(d.destination_type)),
  [destinations]);

  const allSelected = filtered.length > 0 && filtered.every(d => destinationIds.includes(d.id));

  /* ── Navigation ── */
  const goTo = (next: number) => { setDir(next > step ? 1 : -1); setStep(next); };

  /* ── Validation ── */
  const canStep1 = destinationIds.length > 0 && triggerType !== null && (triggerType === "direct" || sourceGroupId.trim() !== "");
  const canStep4 = name.trim().length > 0;

  /* ── Helpers ── */
  const toggleSelectAll = () => {
    if (allSelected) {
      const ids = new Set(filtered.map(d => d.id));
      setDestinationIds(destinationIds.filter(id => !ids.has(id)));
    } else {
      setDestinationIds(Array.from(new Set([...destinationIds, ...filtered.map(d => d.id)])));
    }
  };

  const addPhone = () => {
    const p = newPhone.trim();
    if (p && !phones.includes(p)) { setPhones([...phones, p]); setNewPhone(""); }
  };

  /* ── Submit ── */
  const handleSubmit = async () => {
    if (!name.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        source_group_id: triggerType === "listen" ? sourceGroupId.trim() : "direct_bot",
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
        authorized_senders_mode: allowAll ? "all" : (phones.length > 0 ? "whitelist" : "all"),
      };
      if (description) body.description = description;
      if (defaultSuffixEnabled && defaultSuffix) body.append_suffix = defaultSuffix;
      if (topBannerEnabled && topBanner) body.top_banner = topBanner;
      if (telegramSuffixEnabled && telegramSuffix) body.telegram_suffix = telegramSuffix;
      if (!allowAll && phones.length > 0) body.authorized_senders = phones;
      const overrides = perGroupSuffixes.filter(p => p.mode !== "default");
      if (overrides.length > 0) body.per_group_suffix_overrides = overrides;

      const rule = await api.post<DistributionRule>("/api/client/rules", body);
      router.push(`/dashboard/rules/${rule.id}`);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("שגיאה לא צפויה");
    } finally {
      setLoading(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════ */

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/rules">
          <Button variant="ghost" size="icon" className="text-white/60 hover:text-white hover:bg-white/10">
            <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-l from-violet-400 to-blue-400 bg-clip-text text-transparent">
            אוטומציה חדשה
          </h1>
          <p className="text-sm text-white/40">הגדר כלל הפצה אוטומטי ב-4 שלבים פשוטים</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className={`${glass} border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300`}
        >
          {error}
        </motion.div>
      )}

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {STEPS.map((s, idx) => (
          <div key={s.num} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { if (s.num < step) goTo(s.num); }}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 ${
                step === s.num
                  ? "bg-gradient-to-r from-violet-500/20 to-blue-500/20 border border-violet-500/30 text-white shadow-lg shadow-violet-500/10"
                  : step > s.num
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 cursor-pointer hover:bg-emerald-500/15"
                    : "bg-white/5 border border-white/10 text-white/30 cursor-default"
              }`}
            >
              {step > s.num
                ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                : <span className="text-base leading-none">{s.emoji}</span>
              }
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden font-bold">{s.num}</span>
            </button>
            {idx < STEPS.length - 1 && <ChevronLeft className="h-3.5 w-3.5 text-white/15" />}
          </div>
        ))}
      </div>

      {/* Animated step content */}
      <AnimatePresence mode="wait" custom={dir}>

        {/* ══════════════════════════════════════════════════════
            STEP 1 — מקור ויעד
            ══════════════════════════════════════════════════════ */}
        {step === 1 && (
          <motion.div key="s1" custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }} className="space-y-4">

            {/* 1a: Trigger type */}
            <div className={`${glass} p-6 space-y-4`}>
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-xl">📡</span> מקור הטריגר
                </h2>
                <p className="text-sm text-white/40 mt-1">מאיפה תגיע ההודעה שתופץ?</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <TiltCard className="rounded-2xl" maxTilt={5}>
                  <motion.button
                    type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => setTriggerType("listen")}
                    className={`flex w-full flex-col items-center gap-3 rounded-2xl border-2 p-5 text-center transition-all duration-300 ${
                      triggerType === "listen"
                        ? "border-violet-500/60 bg-violet-500/10 shadow-lg shadow-violet-500/10"
                        : "border-white/10 hover:border-violet-500/30 hover:bg-violet-500/5"
                    }`}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20">
                      <Radio className="h-6 w-6 text-violet-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">📡 האזנה לקבוצת מקור</p>
                      <p className="mt-1 text-xs text-white/40">העתק הודעות מקבוצה ספציפית</p>
                    </div>
                    {triggerType === "listen" && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </motion.button>
                </TiltCard>

                <TiltCard className="rounded-2xl" maxTilt={5}>
                  <motion.button
                    type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => { setTriggerType("direct"); setSourceGroupId("direct_bot"); }}
                    className={`flex w-full flex-col items-center gap-3 rounded-2xl border-2 p-5 text-center transition-all duration-300 ${
                      triggerType === "direct"
                        ? "border-blue-500/60 bg-blue-500/10 shadow-lg shadow-blue-500/10"
                        : "border-white/10 hover:border-blue-500/30 hover:bg-blue-500/5"
                    }`}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
                      <Bot className="h-6 w-6 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">🤖 הודעה ישירה לבוט</p>
                      <p className="mt-1 text-xs text-white/40">שלח הודעה פרטית לבוט להפצה</p>
                    </div>
                    {triggerType === "direct" && (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </motion.button>
                </TiltCard>
              </div>

              {/* Source group select */}
              <AnimatePresence>
                {triggerType === "listen" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} className="overflow-hidden"
                  >
                    <div className={`mt-1 space-y-2 ${glassInner} p-4`}>
                      <label className="text-sm font-medium text-white/70">בחר קבוצת מקור</label>
                      {sourceGroups.length > 0 ? (
                        <select
                          value={sourceGroupId}
                          onChange={e => setSourceGroupId(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 [&>option]:bg-slate-900 [&>option]:text-white"
                        >
                          <option value="">-- בחר קבוצה --</option>
                          {sourceGroups.map(g => (
                            <option key={g.id} value={g.id}>
                              {g.display_name || g.platform_dest_id} ({destTypeLabel[g.destination_type] || g.destination_type})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          value={sourceGroupId}
                          onChange={e => setSourceGroupId(e.target.value)}
                          placeholder="הזן מזהה קבוצת מקור"
                          className="bg-white/5 border-white/10 text-white placeholder:text-white/30 font-mono text-sm"
                        />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 1b: Destination groups */}
            <div className={`${glass} p-6 space-y-4`}>
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-xl">🎯</span> קבוצות יעד
                </h2>
                <p className="text-sm text-white/40 mt-1">לאן יופצו ההודעות?</p>
              </div>

              {loadingDests ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
                </div>
              ) : destinations.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                      <Input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="חיפוש קבוצה..."
                        className="pr-9 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                      />
                    </div>
                    <button
                      type="button" onClick={toggleSelectAll}
                      className={`shrink-0 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                        allSelected
                          ? "bg-violet-500/20 border border-violet-500/30 text-violet-300"
                          : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      {allSelected ? "בטל הכל" : "בחר הכל"}
                    </button>
                  </div>

                  <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                    {filtered.map(dest => {
                      const sel = destinationIds.includes(dest.id);
                      const color = getDestColor(dest);
                      return (
                        <label
                          key={dest.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 transition-all duration-200 ${
                            sel
                              ? color === "emerald"
                                ? "bg-emerald-500/10 border border-emerald-500/20"
                                : "bg-blue-500/10 border border-blue-500/20"
                              : "border border-transparent hover:bg-white/5"
                          }`}
                        >
                          <input
                            type="checkbox" checked={sel}
                            onChange={e => {
                              if (e.target.checked) setDestinationIds([...destinationIds, dest.id]);
                              else setDestinationIds(destinationIds.filter(id => id !== dest.id));
                            }}
                            className="h-4 w-4 rounded border-white/20 bg-white/5 text-violet-500 focus:ring-violet-500/40"
                          />
                          {getDestIcon(dest)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                              {dest.display_name || dest.platform_dest_id}
                            </p>
                            {dest.participant_count != null && (
                              <p className="text-xs text-white/30">{dest.participant_count} משתתפים</p>
                            )}
                          </div>
                          <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            color === "emerald" ? "bg-emerald-500/15 text-emerald-300" : "bg-blue-500/15 text-blue-300"
                          }`}>
                            {destTypeLabel[dest.destination_type] || dest.destination_type}
                          </span>
                        </label>
                      );
                    })}
                    {filtered.length === 0 && (
                      <p className="py-6 text-center text-sm text-white/30">לא נמצאו תוצאות</p>
                    )}
                  </div>

                  {destinationIds.length > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
                      <p className="text-sm font-medium text-violet-300">נבחרו {destinationIds.length} קבוצות</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className={`${glassInner} p-8 text-center`}>
                  <Users className="mx-auto h-8 w-8 mb-3 text-white/20" />
                  <p className="text-sm text-white/50">אין קבוצות זמינות עדיין</p>
                  <p className="text-xs text-white/30 mt-1">חברו WhatsApp / Telegram כדי לסנכרן קבוצות</p>
                </div>
              )}
            </div>

            {/* Nav */}
            <div className="flex justify-start">
              <MagneticButton>
                <Button
                  onClick={() => goTo(2)} disabled={!canStep1}
                  className="bg-gradient-to-r from-violet-600 to-blue-600 shadow-lg shadow-violet-500/25 border-0 text-white"
                >
                  הבא — חתימות
                  <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>
              </MagneticButton>
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════
            STEP 2 — חתימות
            ══════════════════════════════════════════════════════ */}
        {step === 2 && (
          <motion.div key="s2" custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }} className="space-y-4">

            <div className={`${glass} p-6 space-y-5`}>
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-xl">✍️</span> חתימות אוטומטיות
                </h2>
                <p className="text-sm text-white/40 mt-1">טקסט שיצורף אוטומטית לכל הודעה מופצת</p>
              </div>

              {/* Default suffix */}
              <ToggleRow
                icon={Pencil} label="חתימה ברירת מחדל"
                desc="טקסט שיצורף בסוף כל הודעה"
                value={defaultSuffixEnabled} onChange={setDefaultSuffixEnabled}
              />
              <AnimatePresence>
                {defaultSuffixEnabled && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <textarea
                      value={defaultSuffix} onChange={e => setDefaultSuffix(e.target.value)}
                      rows={3} placeholder="לדוגמה: 📌 הצטרף לערוץ שלנו: t.me/mychannel"
                      className="mt-1 flex w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Top banner */}
              <ToggleRow
                icon={Layers} label="כותרת עליונה (Banner)"
                desc="טקסט שיופיע בתחילת כל הודעה"
                value={topBannerEnabled} onChange={setTopBannerEnabled}
              />
              <AnimatePresence>
                {topBannerEnabled && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <textarea
                      value={topBanner} onChange={e => setTopBanner(e.target.value)}
                      rows={2} placeholder="לדוגמה: 🔴 עדכון חשוב:"
                      className="mt-1 flex w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Telegram suffix */}
              <ToggleRow
                icon={Send} label="חתימה מיוחדת לטלגרם"
                desc="חתימה ייחודית לקבוצות Telegram בלבד"
                value={telegramSuffixEnabled} onChange={setTelegramSuffixEnabled}
                iconColor="text-blue-400"
              />
              <AnimatePresence>
                {telegramSuffixEnabled && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <textarea
                      value={telegramSuffix} onChange={e => setTelegramSuffix(e.target.value)}
                      rows={2} placeholder="חתימה לטלגרם בלבד..."
                      className="mt-1 flex w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Hash clean-send */}
              <ToggleRow
                icon={Hash} label='שליחה נקייה עם "#"'
                desc='כשהודעה מסתיימת ב-"#" — הסמל נמחק ותצוגת קישורים מושבתת'
                value={hashStripEnabled} onChange={setHashStripEnabled}
                iconColor="text-amber-400"
              />

              {/* Per-group suffixes (collapsible) */}
              {destinationIds.length > 1 && (
                <div className={`${glassInner} overflow-hidden`}>
                  <button
                    type="button"
                    onClick={() => setPerGroupOpen(v => !v)}
                    className="flex w-full items-center justify-between p-4"
                  >
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-4 w-4 text-violet-400" />
                      <div className="text-right">
                        <p className="text-sm font-medium text-white">חתימות לפי קבוצה</p>
                        <p className="text-xs text-white/40">התאמה אישית לכל קבוצת יעד</p>
                      </div>
                    </div>
                    {perGroupOpen ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
                  </button>
                  <AnimatePresence>
                    {perGroupOpen && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="border-t border-white/[0.06] p-4 space-y-3 max-h-64 overflow-y-auto">
                          {perGroupSuffixes.map(pgs => {
                            const dest = destinations.find(d => d.id === pgs.destination_id);
                            return (
                              <div key={pgs.destination_id} className="space-y-2">
                                <p className="text-xs text-white/60 font-medium">
                                  {dest?.display_name || dest?.platform_dest_id || pgs.destination_id.slice(0, 8)}
                                </p>
                                <select
                                  value={pgs.mode}
                                  onChange={e => setPerGroupSuffixes(prev =>
                                    prev.map(p => p.destination_id === pgs.destination_id
                                      ? { ...p, mode: e.target.value as SuffixOverride }
                                      : p
                                    )
                                  )}
                                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white [&>option]:bg-slate-900"
                                >
                                  <option value="default">ברירת מחדל</option>
                                  <option value="custom">חתימה מותאמת</option>
                                  <option value="none">ללא חתימה</option>
                                </select>
                                {pgs.mode === "custom" && (
                                  <Input
                                    value={pgs.custom_text}
                                    onChange={e => setPerGroupSuffixes(prev =>
                                      prev.map(p => p.destination_id === pgs.destination_id ? { ...p, custom_text: e.target.value } : p)
                                    )}
                                    placeholder="חתימה לקבוצה זו..."
                                    className="text-xs bg-white/5 border-white/10 text-white placeholder:text-white/30"
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

            {/* Nav */}
            <div className="flex justify-between">
              <MagneticButton>
                <Button onClick={() => goTo(3)} className="bg-gradient-to-r from-violet-600 to-blue-600 shadow-lg shadow-violet-500/25 border-0 text-white">
                  הבא — התנגשות בוטים
                  <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>
              </MagneticButton>
              <Button variant="ghost" onClick={() => goTo(1)} className="text-white/50 hover:text-white hover:bg-white/5">
                <ChevronRight className="h-4 w-4 ml-1" /> הקודם
              </Button>
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════
            STEP 3 — התנגשות בוטים
            ══════════════════════════════════════════════════════ */}
        {step === 3 && (
          <motion.div key="s3" custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }} className="space-y-4">

            <div className={`${glass} p-6 space-y-5`}>
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-xl">🤖</span> הגדרת התנגשות בוטים
                </h2>
                <p className="text-sm text-white/40 mt-1">
                  מה קורה כשבוט אחר פועל באותה קבוצת מקור?
                </p>
              </div>

              <div className="space-y-3">
                {(
                  [
                    {
                      value: "run_both" as BotConflictMode,
                      icon: CheckCircle2,
                      iconColor: "text-emerald-400",
                      bg: "from-emerald-500/20 to-teal-500/20",
                      label: "הפעל הכל",
                      desc: "גם ההפצה וגם הבוט יפעלו בו-זמנית. מתאים לרוב המקרים.",
                      recommended: true,
                    },
                    {
                      value: "run_distribution_only" as BotConflictMode,
                      icon: Ban,
                      iconColor: "text-amber-400",
                      bg: "from-amber-500/20 to-orange-500/20",
                      label: "הפצה בלבד — עצור בוטים אחרים",
                      desc: "ההפצה תרוץ, אבל בוטים אחרים בקבוצה יושתקו.",
                      recommended: false,
                    },
                    {
                      value: "run_bot_only" as BotConflictMode,
                      icon: Bot,
                      iconColor: "text-blue-400",
                      bg: "from-blue-500/20 to-cyan-500/20",
                      label: "בוט בלבד — עצור הפצה",
                      desc: "הבוט יפעל, אבל הפצת ההודעות תושהה בנוכחות בוט אחר.",
                      recommended: false,
                    },
                  ] as const
                ).map(opt => (
                  <motion.button
                    key={opt.value}
                    type="button"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setBotConflictMode(opt.value)}
                    className={`group relative w-full rounded-2xl border-2 p-5 text-right transition-all duration-300 ${
                      botConflictMode === opt.value
                        ? "border-violet-500/50 bg-gradient-to-br from-violet-500/10 to-blue-500/5 shadow-lg shadow-violet-500/10"
                        : "border-white/10 hover:border-white/20 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${opt.bg}`}>
                        <opt.icon className={`h-5 w-5 ${opt.iconColor}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-white">{opt.label}</p>
                          {opt.recommended && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                              מומלץ
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/40 mt-1">{opt.desc}</p>
                      </div>
                      <div className={`h-5 w-5 shrink-0 rounded-full border-2 transition-all ${
                        botConflictMode === opt.value
                          ? "border-violet-500 bg-violet-500"
                          : "border-white/20"
                      }`}>
                        {botConflictMode === opt.value && <Check className="h-full w-full p-0.5 text-white" />}
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>

              {/* Info box */}
              <div className={`${glassInner} p-4 flex items-start gap-3`}>
                <Shield className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
                <p className="text-xs text-blue-300/70">
                  הגדרה זו חלה על קבוצת המקור בלבד. קבוצות היעד אינן מושפעות ממנה.
                </p>
              </div>
            </div>

            {/* Nav */}
            <div className="flex justify-between">
              <MagneticButton>
                <Button onClick={() => goTo(4)} className="bg-gradient-to-r from-violet-600 to-blue-600 shadow-lg shadow-violet-500/25 border-0 text-white">
                  הבא — אישורים ושמירה
                  <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>
              </MagneticButton>
              <Button variant="ghost" onClick={() => goTo(2)} className="text-white/50 hover:text-white hover:bg-white/5">
                <ChevronRight className="h-4 w-4 ml-1" /> הקודם
              </Button>
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════
            STEP 4 — אישורים ושמירה
            ══════════════════════════════════════════════════════ */}
        {step === 4 && (
          <motion.div key="s4" custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }} className="space-y-4">

            {/* Name + Description */}
            <div className={`${glass} p-6 space-y-4`}>
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-xl">✅</span> שם וסיכום
                </h2>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">שם הכלל *</label>
                <Input
                  value={name} onChange={e => setName(e.target.value)}
                  placeholder='לדוגמה: "עדכוני בוקר ללקוחות"'
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white/70">תיאור (אופציונלי)</label>
                <textarea
                  value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="תיאור פנימי..." rows={2}
                  className="flex w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-sm backdrop-blur-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
              </div>
            </div>

            {/* Interactive Approval — highlighted */}
            <div className={`${glass} p-6 space-y-4 border-violet-500/20`}>
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <BellRing className="h-5 w-5 text-violet-400" />
                  אישור אינטראקטיבי
                </h2>
                <p className="text-sm text-white/40 mt-1">
                  הבוט ישלח לך כפתורי Approve / Cancel לפני כל הפצה
                </p>
              </div>

              <div className={`${glassInner} p-5 flex items-center justify-between gap-4 ${requiresApproval ? "border-violet-500/30 bg-violet-500/5" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${requiresApproval ? "from-violet-500/30 to-blue-500/20" : "from-white/5 to-white/5"}`}>
                    <BellRing className={`h-5 w-5 ${requiresApproval ? "text-violet-400" : "text-white/30"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">דורש אישור שלי לפני שליחה</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {requiresApproval
                        ? "✅ הבוט ישלח לך DM עם כפתורי אישור לפני כל הפצה"
                        : "כאשר מופעל — כל הודעה ממתינה לאישורך לפני שנשלחת"}
                    </p>
                  </div>
                </div>
                <Toggle value={requiresApproval} onChange={setRequiresApproval} />
              </div>
            </div>

            {/* Delay + Media */}
            <div className={`${glass} p-6 space-y-5`}>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-violet-400" />
                מנגנון השהיה
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    { value: "fast" as DelayPreset, label: "מהיר", icon: Zap, desc: "1-3 שנ׳" },
                    { value: "medium" as DelayPreset, label: "בינוני", icon: Gauge, desc: "5-15 שנ׳" },
                    { value: "slow" as DelayPreset, label: "איטי", icon: Shield, desc: "15-45 שנ׳" },
                    { value: "custom" as DelayPreset, label: "מותאם", icon: SlidersHorizontal, desc: "ידני" },
                  ] as const
                ).map(({ value, label, icon: Icon, desc }) => (
                  <motion.button
                    key={value} type="button"
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => setDelayPreset(value)}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition-all ${
                      delayPreset === value
                        ? "border-violet-500/60 bg-violet-500/10"
                        : "border-white/10 hover:border-white/20 hover:bg-white/5"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${delayPreset === value ? "text-violet-400" : "text-white/30"}`} />
                    <span className={`text-xs font-medium ${delayPreset === value ? "text-white" : "text-white/50"}`}>{label}</span>
                    <span className="text-[10px] text-white/30">{desc}</span>
                  </motion.button>
                ))}
              </div>
              <AnimatePresence>
                {delayPreset === "custom" && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="grid grid-cols-2 gap-4 mt-1">
                      <div className="space-y-1.5">
                        <label className="text-xs text-white/50">מינימום (שניות)</label>
                        <Input type="number" value={delayMin} onChange={e => setDelayMin(Number(e.target.value))} min={1} className="bg-white/5 border-white/10 text-white" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-white/50">מקסימום (שניות)</label>
                        <Input type="number" value={delayMax} onChange={e => setDelayMax(Number(e.target.value))} min={1} className="bg-white/5 border-white/10 text-white" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Media toggles */}
              <div className="space-y-2">
                <p className="text-xs text-white/50 font-medium">סוגי תוכן להעברה</p>
                {[
                  { label: "תמונות / וידאו", value: forwardMedia, onChange: setForwardMedia, icon: Image },
                  { label: "קבצים", value: forwardFiles, onChange: setForwardFiles, icon: FileText },
                  { label: "סקרים", value: forwardPolls, onChange: setForwardPolls, icon: BarChart3 },
                ].map(({ label, value, onChange, icon: Icon }) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-white/30" />
                      <span className="text-sm text-white/70">{label}</span>
                    </div>
                    <Toggle value={value} onChange={onChange} />
                  </div>
                ))}
              </div>
            </div>

            {/* Authorized senders (collapsed) */}
            <div className={`${glass} overflow-hidden`}>
              <button
                type="button"
                onClick={() => setSendersOpen(v => !v)}
                className="flex w-full items-center justify-between p-5"
              >
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-violet-400" />
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">מורשי שליחה</p>
                    <p className="text-xs text-white/40">
                      {allowAll ? "כולם מורשים" : phones.length > 0 ? `${phones.length} מספרים מורשים` : "לא הוגדרו — ברירת מחדל: כולם"}
                    </p>
                  </div>
                </div>
                {sendersOpen ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
              </button>
              <AnimatePresence>
                {sendersOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="border-t border-white/[0.06] p-5 space-y-3">
                      <div className={`${glassInner} p-4 flex items-center justify-between`}>
                        <p className="text-sm font-medium text-white">🔓 אפשר לכולם לשלוח</p>
                        <Toggle value={allowAll} onChange={setAllowAll} />
                      </div>
                      {!allowAll && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              value={newPhone} onChange={e => setNewPhone(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPhone(); } }}
                              placeholder="05X-XXXXXXX"
                              className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                            />
                            <Button type="button" onClick={addPhone} disabled={!newPhone.trim()} size="icon"
                              className="shrink-0 bg-gradient-to-r from-violet-600 to-blue-600 border-0 text-white h-10 w-10">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="space-y-1.5">
                            {phones.map((phone, idx) => (
                              <div key={phone} className={`${glassInner} flex items-center justify-between p-3`}>
                                <p className="text-sm font-mono text-white/80">{phone}</p>
                                <button type="button" onClick={() => setPhones(phones.filter((_, i) => i !== idx))}
                                  className="h-7 w-7 flex items-center justify-center rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Summary */}
            <div className={`${glassInner} p-4 space-y-2`}>
              <p className="text-xs text-white/40 font-medium mb-3">סיכום הגדרות</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 text-white/50">
                  <Check className="h-3 w-3 text-violet-400" />
                  {destinationIds.length} קבוצות יעד
                </div>
                <div className="flex items-center gap-2 text-white/50">
                  <Check className="h-3 w-3 text-violet-400" />
                  {triggerType === "listen" ? "האזנה לקבוצה" : "הודעה לבוט"}
                </div>
                <div className="flex items-center gap-2 text-white/50">
                  <Check className="h-3 w-3 text-violet-400" />
                  {delayPreset === "custom" ? `${delayMin}-${delayMax} שנ׳` : delayPreset}
                </div>
                <div className="flex items-center gap-2 text-white/50">
                  {requiresApproval
                    ? <><Check className="h-3 w-3 text-emerald-400" /> דורש אישור</>
                    : <><X className="h-3 w-3 text-white/20" /> ללא אישור</>
                  }
                </div>
                {(defaultSuffixEnabled || topBannerEnabled) && (
                  <div className="flex items-center gap-2 text-white/50">
                    <Check className="h-3 w-3 text-violet-400" />
                    חתימות מוגדרות
                  </div>
                )}
                {hashStripEnabled && (
                  <div className="flex items-center gap-2 text-white/50">
                    <Check className="h-3 w-3 text-amber-400" />
                    Clean-Send פעיל
                  </div>
                )}
              </div>
            </div>

            {/* Nav + Save */}
            <div className="flex justify-between gap-3">
              <MagneticButton>
                <Button
                  onClick={handleSubmit}
                  disabled={loading || !canStep4}
                  className="bg-gradient-to-r from-violet-600 to-blue-600 px-8 shadow-lg shadow-violet-500/25 border-0 text-white"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "✨ צור אוטומציה"}
                </Button>
              </MagneticButton>
              <Button variant="ghost" onClick={() => goTo(3)} className="text-white/50 hover:text-white hover:bg-white/5">
                <ChevronRight className="h-4 w-4 ml-1" /> הקודם
              </Button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
