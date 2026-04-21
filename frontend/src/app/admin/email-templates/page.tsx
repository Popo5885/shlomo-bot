"use client";

import { useEffect, useState } from "react";
import { Save, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const API = process.env.NEXT_PUBLIC_API_URL || "";
const ADMIN_KEY = "gp_admin_token";

function adminFetch(path: string, opts?: RequestInit) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem(ADMIN_KEY)}`,
      ...(opts?.headers ?? {}),
    },
  }).then((r) => r.json());
}

interface Template {
  id: string;
  name: string;
  label_he: string;
  subject: string;
  body_html: string;
  is_active: boolean;
  updated_at: string;
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = () => {
    setLoading(true);
    adminFetch("/api/admin/email-templates")
      .then((j) => { if (j.success) setTemplates(j.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTemplates(); }, []);

  const selectTemplate = (t: Template) => {
    setSelected(t);
    setEditSubject(t.subject);
    setEditBody(t.body_html);
    setPreview(false);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    const res = await adminFetch(`/api/admin/email-templates/${selected.name}`, {
      method: "PUT",
      body: JSON.stringify({ subject: editSubject, body_html: editBody }),
    });
    setSaving(false);
    if (res.success) {
      fetchTemplates();
      setSelected({ ...selected, subject: editSubject, body_html: editBody });
    }
  };

  const toggleActive = async (t: Template) => {
    await adminFetch(`/api/admin/email-templates/${t.name}`, {
      method: "PUT",
      body: JSON.stringify({ is_active: !t.is_active }),
    });
    fetchTemplates();
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-white">תבניות מיילים</h1>
        <p className="text-white/40 text-sm mt-1">עריכת נושא וגוף של כל תבנית</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Template list */}
        <div className="col-span-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>
          ) : (
            templates.map((t) => (
              <button
                key={t.id}
                onClick={() => selectTemplate(t)}
                className={`w-full text-right rounded-xl px-4 py-3 transition-colors ${
                  selected?.name === t.name
                    ? "bg-blue-600/30 border border-blue-500/50"
                    : "bg-white/5 border border-white/10 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white">{t.label_he}</span>
                  <Badge
                    className={`text-xs ${t.is_active ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}
                    onClick={(e) => { e.stopPropagation(); toggleActive(t); }}
                  >
                    {t.is_active ? "פעיל" : "כבוי"}
                  </Badge>
                </div>
                <p className="text-xs text-white/40 mt-1 truncate">{t.name}</p>
              </button>
            ))
          )}
        </div>

        {/* Editor */}
        <div className="col-span-9">
          {!selected ? (
            <div className="flex items-center justify-center h-64 rounded-xl border border-dashed border-white/20 text-white/30 text-sm">
              בחר תבנית לעריכה
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">{selected.label_he}</h2>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreview(!preview)}
                    className="border-white/20 text-white/70 hover:bg-white/10"
                  >
                    {preview ? <EyeOff className="h-4 w-4 ml-1" /> : <Eye className="h-4 w-4 ml-1" />}
                    {preview ? "סגור תצוגה" : "תצוגה מקדימה"}
                  </Button>
                  <Button size="sm" onClick={save} disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700 text-white">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Save className="h-4 w-4 ml-1" />}
                    שמור
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs text-white/50 mb-1 block">נושא (Subject)</label>
                <Input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="bg-white/5 border-white/20 text-white"
                  dir="rtl"
                />
              </div>

              {preview ? (
                <div>
                  <label className="text-xs text-white/50 mb-1 block">תצוגה מקדימה</label>
                  <div
                    className="rounded-lg border border-white/10 bg-white p-4 overflow-auto max-h-[500px]"
                    dangerouslySetInnerHTML={{ __html: editBody }}
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs text-white/50 mb-1 block">
                    גוף HTML — ניתן להשתמש בתגיות {`{{variableName}}`}
                  </label>
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="w-full min-h-[380px] rounded-lg bg-black/30 border border-white/20 text-white/90 text-sm font-mono p-4 focus:outline-none focus:border-blue-500 resize-y"
                    dir="ltr"
                    spellCheck={false}
                  />
                </div>
              )}

              <p className="text-xs text-white/30">
                עדכון אחרון: {new Date(selected.updated_at).toLocaleString("he-IL")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
