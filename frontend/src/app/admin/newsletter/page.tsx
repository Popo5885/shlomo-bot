"use client";

import { useEffect, useState } from "react";
import { Send, Users, Loader2, CheckCircle } from "lucide-react";
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

interface Workspace {
  id: string;
  name: string;
  status: string;
  owner_email: string | null;
}

export default function NewsletterPage() {
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendToAll, setSendToAll] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ total: number; sent: number } | null>(null);
  const [loadingWs, setLoadingWs] = useState(true);

  useEffect(() => {
    adminFetch("/api/admin/workspaces-crm?status=active&limit=200")
      .then((j) => { if (j.success) setWorkspaces(j.data); })
      .finally(() => setLoadingWs(false));
  }, []);

  const toggleWs = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const send = async () => {
    if (!subject.trim() || !content.trim()) return;
    setSending(true);
    setResult(null);
    const body: Record<string, unknown> = { subject, content };
    if (!sendToAll && selected.size > 0) body.workspace_ids = [...selected];
    const res = await adminFetch("/api/admin/newsletter", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setSending(false);
    if (res.success) setResult(res.data);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-white">שליחת ניוזלטר</h1>
        <p className="text-white/40 text-sm mt-1">כתיבה ושליחה לכל המשתמשים או לקבוצה נבחרת</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Compose */}
        <div className="col-span-8 space-y-4 rounded-xl border border-white/10 bg-white/5 p-6">
          <div>
            <label className="text-xs text-white/50 mb-1 block">נושא</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="כותרת הניוזלטר..."
              className="bg-white/5 border-white/20 text-white"
              dir="rtl"
            />
          </div>

          <div>
            <label className="text-xs text-white/50 mb-1 block">תוכן (HTML מותר)</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="כתוב את תוכן הניוזלטר כאן..."
              className="w-full min-h-[300px] rounded-lg bg-black/30 border border-white/20 text-white/90 text-sm p-4 focus:outline-none focus:border-blue-500 resize-y"
              dir="rtl"
            />
          </div>

          {result && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4">
              <CheckCircle className="h-5 w-5 text-emerald-400" />
              <p className="text-emerald-300 text-sm">
                נשלח בהצלחה! {result.sent} מתוך {result.total} נמענים קיבלו את הניוזלטר.
              </p>
            </div>
          )}

          <Button
            onClick={send}
            disabled={sending || !subject.trim() || !content.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3"
          >
            {sending ? (
              <><Loader2 className="h-4 w-4 animate-spin ml-2" />שולח...</>
            ) : (
              <><Send className="h-4 w-4 ml-2" />שלח ניוזלטר</>
            )}
          </Button>
        </div>

        {/* Recipients */}
        <div className="col-span-4 rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-white/50" />
            <h2 className="text-sm font-semibold text-white">נמענים</h2>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => setSendToAll(true)}
              className={`w-full text-right rounded-lg px-4 py-2.5 text-sm transition-colors ${
                sendToAll ? "bg-blue-600/30 border border-blue-500/50 text-white" : "bg-white/5 border border-white/10 text-white/50 hover:text-white"
              }`}
            >
              כל המשתמשים הפעילים
            </button>
            <button
              onClick={() => setSendToAll(false)}
              className={`w-full text-right rounded-lg px-4 py-2.5 text-sm transition-colors ${
                !sendToAll ? "bg-blue-600/30 border border-blue-500/50 text-white" : "bg-white/5 border border-white/10 text-white/50 hover:text-white"
              }`}
            >
              בחר לקוחות ספציפיים
            </button>
          </div>

          {!sendToAll && (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {loadingWs ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
              ) : (
                workspaces.map((w) => (
                  <label key={w.id} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(w.id)}
                      onChange={() => toggleWs(w.id)}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{w.name}</p>
                      <p className="text-xs text-white/40 truncate">{w.owner_email}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          )}

          {!sendToAll && selected.size > 0 && (
            <p className="text-xs text-white/40">{selected.size} לקוחות נבחרו</p>
          )}
        </div>
      </div>
    </div>
  );
}
