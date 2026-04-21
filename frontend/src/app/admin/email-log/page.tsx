"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, ChevronRight, ChevronLeft, Loader2, CheckCircle, XCircle, MinusCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = process.env.NEXT_PUBLIC_API_URL || "";
const ADMIN_KEY = "gp_admin_token";

function adminFetch(path: string) {
  return fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem(ADMIN_KEY)}` },
  }).then((r) => r.json());
}

interface EmailLogEntry {
  id: string;
  to_email: string;
  subject: string;
  template_name: string | null;
  status: "sent" | "failed" | "skipped";
  error_msg: string | null;
  sent_at: string;
}

const STATUS_CONFIG = {
  sent:    { label: "נשלח",    icon: CheckCircle,  cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  failed:  { label: "נכשל",    icon: XCircle,      cls: "bg-red-500/20 text-red-300 border-red-500/30" },
  skipped: { label: "דולג",    icon: MinusCircle,  cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
};

export default function EmailLogPage() {
  const [rows, setRows] = useState<EmailLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterEmail, setFilterEmail] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const LIMIT = 50;

  const fetchLog = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (filterEmail)  params.set("to_email", filterEmail);
    if (filterStatus) params.set("status", filterStatus);
    adminFetch(`/api/admin/email-log?${params}`)
      .then((j) => { if (j.success) { setRows(j.data); setTotal(j.total); } })
      .finally(() => setLoading(false));
  }, [page, filterEmail, filterStatus]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">היסטוריית מיילים</h1>
          <p className="text-white/40 text-sm mt-1">{total.toLocaleString()} רשומות</p>
        </div>
        <Mail className="h-6 w-6 text-white/30" />
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="חפש לפי אימייל..."
          value={filterEmail}
          onChange={(e) => { setFilterEmail(e.target.value); setPage(1); }}
          className="bg-white/5 border-white/20 text-white max-w-64"
          dir="rtl"
        />
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="rounded-lg bg-white/5 border border-white/20 text-white px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
        >
          <option value="">כל הסטטוסים</option>
          <option value="sent">נשלח</option>
          <option value="failed">נכשל</option>
          <option value="skipped">דולג</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="text-right px-4 py-3 text-white/50 font-medium">נמען</th>
              <th className="text-right px-4 py-3 text-white/50 font-medium">נושא</th>
              <th className="text-right px-4 py-3 text-white/50 font-medium">תבנית</th>
              <th className="text-right px-4 py-3 text-white/50 font-medium">סטטוס</th>
              <th className="text-right px-4 py-3 text-white/50 font-medium">תאריך</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-white/40 mx-auto" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-white/30 text-sm">אין רשומות</td>
              </tr>
            ) : (
              rows.map((row) => {
                const cfg = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.failed;
                const Icon = cfg.icon;
                return (
                  <tr key={row.id} className="border-b border-white/5 hover:bg-white/3">
                    <td className="px-4 py-3 text-white/80">{row.to_email}</td>
                    <td className="px-4 py-3 text-white/60 max-w-xs truncate">{row.subject}</td>
                    <td className="px-4 py-3 text-white/40 text-xs">{row.template_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${cfg.cls}`}>
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                      {row.error_msg && (
                        <p className="text-xs text-red-400 mt-1 max-w-xs truncate" title={row.error_msg}>
                          {row.error_msg}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">
                      {new Date(row.sent_at).toLocaleString("he-IL")}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="border-white/20 text-white/70 hover:bg-white/10">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-white/50">{page} / {pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
            className="border-white/20 text-white/70 hover:bg-white/10">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
