"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Upload, Download, CheckCircle, XCircle, Loader2, FileText, Link, ShieldX, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = process.env.NEXT_PUBLIC_API_URL || "";
const ADMIN_KEY = "gp_admin_token";

function adminFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${localStorage.getItem(ADMIN_KEY)}`, ...(opts.headers || {}) },
  });
}

export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ws, setWs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [invoiceForm, setInvoiceForm] = useState({ invoice_number: "", amount: "", description: "" });
  const [uploading, setUploading] = useState(false);
  const [contractUrl, setContractUrl] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  const fetchWs = () => {
    setLoading(true);
    adminFetch(`/api/admin/workspaces-crm/${id}`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setWs(json.data); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchWs(); }, [id]);

  const msg = (type: "ok" | "err", text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 3000);
  };

  const setStatus = async (status: string) => {
    const r = await adminFetch(`/api/admin/workspaces-crm/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const j = await r.json();
    if (j.success) { msg("ok", `סטטוס עודכן ל-${status}`); fetchWs(); }
    else msg("err", j.message);
  };

  const assignContract = async () => {
    const r = await adminFetch(`/api/admin/workspaces-crm/${id}/contract`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", contract_document_url: contractUrl || undefined }),
    });
    const j = await r.json();
    if (j.success) { msg("ok", "חוזה הוקצה, הלקוח צריך לחתום מחדש"); fetchWs(); setContractUrl(""); }
    else msg("err", j.message);
  };

  const revokeContract = async () => {
    const r = await adminFetch(`/api/admin/workspaces-crm/${id}/contract`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke", revoke_reason: revokeReason }),
    });
    const j = await r.json();
    if (j.success) { msg("ok", "חוזה בוטל — הלקוח נעול עד חתימה חדשה"); fetchWs(); setRevokeReason(""); }
    else msg("err", j.message);
  };

  const uploadInvoice = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !invoiceForm.invoice_number || !invoiceForm.amount) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("pdf", file);
    fd.append("invoice_number", invoiceForm.invoice_number);
    fd.append("amount", invoiceForm.amount);
    fd.append("description", invoiceForm.description);
    const r = await adminFetch(`/api/admin/invoices/${id}`, { method: "POST", body: fd });
    const j = await r.json();
    setUploading(false);
    if (j.success) { msg("ok", "חשבונית הועלתה"); fetchWs(); setInvoiceForm({ invoice_number: "", amount: "", description: "" }); if (fileRef.current) fileRef.current.value = ""; }
    else msg("err", j.message);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-white/30" /></div>;
  if (!ws) return <div className="text-white/40 text-center py-20">לא נמצא</div>;

  return (
    <div className="space-y-6 max-w-3xl" dir="rtl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-white/40 hover:text-white">
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-white">{ws.name}</h1>
          <p className="text-white/40 text-xs">{ws.owner_email} · {ws.contact_phone}</p>
        </div>
        <span className={`mr-auto rounded-full px-2.5 py-0.5 text-xs border ${
          ws.status === "active" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
          : ws.status === "suspended" ? "bg-red-500/20 text-red-300 border-red-500/30"
          : "bg-amber-500/20 text-amber-300 border-amber-500/30"
        }`}>{ws.status}</span>
      </div>

      {actionMsg && (
        <div className={`rounded-xl border px-4 py-2 text-sm ${actionMsg.type === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
          {actionMsg.text}
        </div>
      )}

      {/* Status management */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h2 className="font-semibold text-white text-sm">ניהול סטטוס</h2>
        <div className="flex gap-2 flex-wrap">
          {ws.status !== "active" && <Button size="sm" onClick={() => setStatus("active")} className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30">אשר / הפעל</Button>}
          {ws.status !== "pending" && <Button size="sm" onClick={() => setStatus("pending")} className="bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30">החזר להמתנה</Button>}
          {ws.status !== "suspended" && <Button size="sm" onClick={() => setStatus("suspended")} className="bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/10">השעה</Button>}
        </div>
      </section>

      {/* Contract management */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white text-sm">ניהול חוזה</h2>
          {ws.contract_signed && !ws.contract_revoked_at ? (
            <span className="flex items-center gap-1 text-xs text-emerald-300"><CheckCircle className="h-3.5 w-3.5" /> חתום {ws.contract_signed_at ? `(${new Date(ws.contract_signed_at).toLocaleDateString("he-IL")})` : ""}</span>
          ) : ws.contract_revoked_at ? (
            <span className="flex items-center gap-1 text-xs text-red-300"><XCircle className="h-3.5 w-3.5" /> בוטל</span>
          ) : (
            <span className="text-xs text-white/40">לא נחתם</span>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-white/50">הקצה קישור חוזה (URL)</label>
          <div className="flex gap-2">
            <Input value={contractUrl} onChange={(e) => setContractUrl(e.target.value)} placeholder="https://... (השאר ריק לחוזה ברירת מחדל)" className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm" />
            <Button size="sm" onClick={assignContract} className="shrink-0 border-blue-500/30 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30">
              <Link className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {(ws.contract_signed || ws.contract_revoked_at === null) && (
          <div className="space-y-2 border-t border-white/10 pt-3">
            <label className="text-xs text-red-300/70">בטל חוזה (הלקוח יינעל עד חתימה)</label>
            <div className="flex gap-2">
              <Input value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="סיבת הביטול..." className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm" />
              <Button size="sm" onClick={revokeContract} className="shrink-0 border-red-500/30 bg-red-500/20 text-red-300 hover:bg-red-500/10">
                <ShieldX className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Upload invoice */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="font-semibold text-white text-sm">העלאת חשבונית PDF</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><label className="text-xs text-white/50">מספר חשבונית</label><Input value={invoiceForm.invoice_number} onChange={(e) => setInvoiceForm((f) => ({ ...f, invoice_number: e.target.value }))} placeholder="INV-001" className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm" /></div>
          <div className="space-y-1"><label className="text-xs text-white/50">סכום (₪)</label><Input type="number" value={invoiceForm.amount} onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))} placeholder="299" className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm" /></div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-white/50">תיאור (אופציונלי)</label>
          <Input value={invoiceForm.description} onChange={(e) => setInvoiceForm((f) => ({ ...f, description: e.target.value }))} placeholder="תשלום חודש מרץ 2026" className="border-white/10 bg-white/5 text-white placeholder:text-white/30 text-sm" />
        </div>
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" accept="application/pdf" className="text-sm text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-xs file:text-white" />
          <Button size="sm" onClick={uploadInvoice} disabled={uploading} className="bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:bg-blue-500/30">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4" /> העלה</>}
          </Button>
        </div>
      </section>

      {/* Invoices list */}
      {ws.invoices?.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h2 className="font-semibold text-white text-sm">חשבוניות</h2>
          {ws.invoices.map((inv: any) => (
            <div key={inv.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-white/40" />
                <div>
                  <p className="text-sm text-white">{inv.invoice_number}</p>
                  <p className="text-xs text-white/40">{inv.description || ""} · {inv.amount} {inv.currency}</p>
                </div>
              </div>
              <a href={`${API}/api/admin/invoices/${inv.id}/download`} target="_blank" className="flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200">
                <Download className="h-3.5 w-3.5" /> הורד
              </a>
            </div>
          ))}
        </section>
      )}

      {/* Members & notification toggle */}
      {ws.members?.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h2 className="font-semibold text-white text-sm">חברים והתראות מייל</h2>
          {ws.members.map((m: any) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
              <div>
                <p className="text-sm text-white">{m.full_name || m.email}</p>
                <p className="text-xs text-white/40">{m.email} {m.is_owner ? "· בעלים" : ""}</p>
              </div>
              <button
                title={m.email_notifications_enabled ? "כבה התראות מייל" : "הפעל התראות מייל"}
                onClick={async () => {
                  await adminFetch(`/api/admin/members/${m.id}/toggle-notifications`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ enabled: !m.email_notifications_enabled }),
                  });
                  fetchWs();
                }}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  m.email_notifications_enabled
                    ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30"
                    : "bg-white/5 border-white/20 text-white/40 hover:bg-white/10"
                }`}
              >
                {m.email_notifications_enabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                {m.email_notifications_enabled ? "פעיל" : "כבוי"}
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Connected accounts */}
      {ws.connected_accounts?.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h2 className="font-semibold text-white text-sm">חשבונות מחוברים</h2>
          {ws.connected_accounts.map((acc: any) => (
            <div key={acc.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
              <div>
                <p className="text-sm text-white">{acc.display_name || acc.platform}</p>
                <p className={`text-xs ${acc.is_connected ? "text-emerald-400" : "text-white/40"}`}>{acc.connection_status}</p>
              </div>
              {acc.connection_token && (
                <button
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/connect/${acc.connection_token}`); }}
                  className="flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
                >
                  <Link className="h-3.5 w-3.5" /> העתק קישור לקוח
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
