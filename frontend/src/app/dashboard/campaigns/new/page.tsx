"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  ArrowRight,
  Loader2,
  Image as ImageIcon,
  Video,
  FileText,
  Music,
  Users,
  Plus,
  Trash2,
  Clock,
  Zap,
  ListOrdered,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Campaign, DelayPreset, Destination } from "@/types/api";
import Link from "next/link";

const mediaTypes = [
  { value: "image", label: "תמונה", icon: ImageIcon },
  { value: "video", label: "וידאו", icon: Video },
  { value: "document", label: "מסמך", icon: FileText },
  { value: "audio", label: "אודיו", icon: Music },
] as const;

const presets: { value: DelayPreset; label: string; desc: string }[] = [
  { value: "fast", label: "מהיר", desc: "3-5 שניות" },
  { value: "medium", label: "בינוני", desc: "30-60 שניות" },
  { value: "slow", label: "איטי", desc: "5-10 דקות" },
  { value: "custom", label: "מותאם אישית", desc: "הגדר ידנית" },
];

interface DripStep {
  message_text: string;
  media_type?: string;
  media_url?: string;
  delay_minutes: number;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [messageText, setMessageText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<string>("");
  const [appendSuffix, setAppendSuffix] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [delayPreset, setDelayPreset] = useState<DelayPreset>("medium");
  const [delayMin, setDelayMin] = useState(30);
  const [delayMax, setDelayMax] = useState(60);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);

  // Destinations from API
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destLoading, setDestLoading] = useState(true);

  // Drip sequence
  const [dripEnabled, setDripEnabled] = useState(false);
  const [dripSteps, setDripSteps] = useState<DripStep[]>([
    { message_text: "", delay_minutes: 60 },
  ]);

  useEffect(() => {
    api
      .get<Destination[]>("/api/client/destinations")
      .then(setDestinations)
      .catch(() => {})
      .finally(() => setDestLoading(false));
  }, []);

  const toggleTarget = (id: string) => {
    setTargetIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const addDripStep = () => {
    setDripSteps((prev) => [
      ...prev,
      { message_text: "", delay_minutes: 60 },
    ]);
  };

  const removeDripStep = (index: number) => {
    setDripSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const updateDripStep = (index: number, updates: Partial<DripStep>) => {
    setDripSteps((prev) =>
      prev.map((step, i) => (i === index ? { ...step, ...updates } : step))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        name,
        message_text: messageText || undefined,
        delay_preset: delayPreset,
        requires_approval: requiresApproval,
        target_destination_ids: targetIds,
      };
      if (description) body.description = description;
      if (mediaUrl) body.media_url = mediaUrl;
      if (mediaType) body.media_type = mediaType;
      if (appendSuffix) body.append_suffix = appendSuffix;
      if (scheduledAt) body.scheduled_at = new Date(scheduledAt).toISOString();
      if (delayPreset === "custom") {
        body.delay_min_seconds = delayMin;
        body.delay_max_seconds = delayMax;
      }
      if (dripEnabled && dripSteps.length > 0) {
        body.drip_steps = dripSteps;
      }

      const campaign = await api.post<Campaign>("/api/client/campaigns", body);
      router.push(`/dashboard/campaigns/${campaign.id}`);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/campaigns">
          <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 backdrop-blur border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all">
            <ArrowRight className="h-5 w-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">קמפיין חדש</h1>
          <p className="text-sm text-gray-400 mt-1">
            הגדר וצור קמפיין להפצת הודעות
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">פרטי קמפיין</h2>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              שם הקמפיין *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='לדוגמה: "ניוזלטר שבועי"'
              required
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">תיאור</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="תיאור קצר של הקמפיין"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              טקסט ההודעה
            </label>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="הקלד את ההודעה שלך כאן..."
              rows={4}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              סיומת קבועה
            </label>
            <input
              value={appendSuffix}
              onChange={(e) => setAppendSuffix(e.target.value)}
              placeholder='לדוגמה: "נשלח דרך הבוט"'
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>
        </div>

        {/* Media */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">
            מדיה (אופציונלי)
          </h2>
          <div className="grid grid-cols-4 gap-2">
            {mediaTypes.map((mt) => (
              <button
                key={mt.value}
                type="button"
                onClick={() =>
                  setMediaType(mediaType === mt.value ? "" : mt.value)
                }
                className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-xs font-medium transition-all duration-200 ${
                  mediaType === mt.value
                    ? "border-blue-500 bg-blue-500/10 text-blue-400"
                    : "border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-300"
                }`}
              >
                <mt.icon className="h-5 w-5" />
                {mt.label}
              </button>
            ))}
          </div>
          {mediaType && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                כתובת מדיה
              </label>
              <input
                type="url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                dir="ltr"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Scheduling */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">
              תזמון ומהירות שליחה
            </h2>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              תזמון שליחה (אופציונלי)
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">
              מהירות שליחה
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {presets.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setDelayPreset(p.value)}
                  className={`flex flex-col rounded-xl border-2 p-3 text-right transition-all duration-200 ${
                    delayPreset === p.value
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  <span
                    className={`text-sm font-semibold ${
                      delayPreset === p.value ? "text-blue-400" : "text-white"
                    }`}
                  >
                    {p.label}
                  </span>
                  <span className="text-xs text-gray-400">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {delayPreset === "custom" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  השהייה מינימלית (שניות)
                </label>
                <input
                  type="number"
                  value={delayMin}
                  onChange={(e) => setDelayMin(Number(e.target.value))}
                  min={1}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">
                  השהייה מקסימלית (שניות)
                </label>
                <input
                  type="number"
                  value={delayMax}
                  onChange={(e) => setDelayMax(Number(e.target.value))}
                  min={1}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
            </div>
          )}

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 text-blue-500 accent-blue-500"
            />
            <span className="text-sm font-medium text-gray-300">
              בקש אישור לפני שליחה
            </span>
          </label>
        </div>

        {/* Target Groups */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">קבוצות יעד *</h2>
          </div>
          <p className="text-sm text-gray-400">
            בחר את הקבוצות שיקבלו את ההודעות
          </p>

          {destLoading ? (
            <div className="text-center py-4 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              טוען קבוצות...
            </div>
          ) : destinations.length === 0 ? (
            <div className="text-center py-4 text-gray-500 text-sm">
              לא נמצאו קבוצות יעד. הוסף קבוצות בעמוד הערוצים.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {destinations.map((dest) => (
                <label
                  key={dest.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    targetIds.includes(dest.id)
                      ? "border-blue-500/50 bg-blue-500/10"
                      : "border-white/5 hover:border-white/10 hover:bg-white/5"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={targetIds.includes(dest.id)}
                    onChange={() => toggleTarget(dest.id)}
                    className="h-4 w-4 rounded border-white/20 text-blue-500 accent-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {dest.display_name || dest.platform_dest_id}
                    </p>
                    <p className="text-xs text-gray-500">
                      {dest.participant_count
                        ? `${dest.participant_count} משתתפים`
                        : dest.destination_type}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {targetIds.length > 0 && (
            <p className="text-sm text-blue-400">
              נבחרו {targetIds.length} קבוצות
            </p>
          )}
        </div>

        {/* Drip Sequence */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListOrdered className="h-5 w-5 text-violet-400" />
              <h2 className="text-lg font-semibold text-white">
                רצף הודעות (Drip)
              </h2>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-gray-400">
                {dripEnabled ? "פעיל" : "כבוי"}
              </span>
              <button
                type="button"
                onClick={() => setDripEnabled(!dripEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  dripEnabled ? "bg-violet-500" : "bg-white/10"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    dripEnabled ? "translate-x-1" : "translate-x-6"
                  }`}
                />
              </button>
            </label>
          </div>

          {dripEnabled && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">
                הגדר רצף הודעות שיישלחו אוטומטית בזה אחר זה
              </p>

              {dripSteps.map((step, index) => (
                <div
                  key={index}
                  className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-violet-400">
                      שלב {index + 1}
                    </span>
                    {dripSteps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDripStep(index)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <textarea
                    value={step.message_text}
                    onChange={(e) =>
                      updateDripStep(index, { message_text: e.target.value })
                    }
                    placeholder={`הודעה לשלב ${index + 1}...`}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500/50 transition-colors resize-none"
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">
                        סוג מדיה (אופציונלי)
                      </label>
                      <select
                        value={step.media_type || ""}
                        onChange={(e) =>
                          updateDripStep(index, {
                            media_type: e.target.value || undefined,
                          })
                        }
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-violet-500/50 transition-colors"
                      >
                        <option value="">ללא</option>
                        <option value="image">תמונה</option>
                        <option value="video">וידאו</option>
                        <option value="document">מסמך</option>
                        <option value="audio">אודיו</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">
                        השהייה אחרי שלב קודם (דקות)
                      </label>
                      <input
                        type="number"
                        value={step.delay_minutes}
                        onChange={(e) =>
                          updateDripStep(index, {
                            delay_minutes: Number(e.target.value),
                          })
                        }
                        min={1}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-violet-500/50 transition-colors"
                      />
                    </div>
                  </div>

                  {step.media_type && (
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">
                        כתובת מדיה
                      </label>
                      <input
                        type="url"
                        value={step.media_url || ""}
                        onChange={(e) =>
                          updateDripStep(index, { media_url: e.target.value })
                        }
                        placeholder="https://example.com/media.png"
                        dir="ltr"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500/50 transition-colors"
                      />
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addDripStep}
                className="flex items-center gap-2 w-full justify-center py-2.5 border-2 border-dashed border-white/10 rounded-xl text-gray-400 hover:text-violet-400 hover:border-violet-500/30 transition-all"
              >
                <Plus className="h-4 w-4" />
                הוסף שלב
              </button>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-700 text-white rounded-xl font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            צור קמפיין
          </button>
          <Link href="/dashboard/campaigns">
            <button
              type="button"
              className="px-6 py-2.5 bg-white/5 border border-white/10 text-gray-300 rounded-xl font-medium hover:bg-white/10 transition-all"
            >
              ביטול
            </button>
          </Link>
        </div>
      </form>
    </div>
  );
}
