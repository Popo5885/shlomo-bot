"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Download,
  ChevronRight,
  Loader2,
  Receipt,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  issued_at: string;
  pdf_url: string | null;
  has_file: boolean;
}

const statusColors: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  overdue: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
};

const statusLabels: Record<string, string> = {
  paid: "שולם ✓",
  pending: "ממתין לתשלום",
  overdue: "באיחור",
  cancelled: "בוטל",
};

export default function ReceiptsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Invoice[]>("/api/client/invoices")
      .then(setInvoices)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const API = process.env.NEXT_PUBLIC_API_URL || "";

  return (
    <div className="mx-auto max-w-3xl space-y-6" dir="rtl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/dashboard/settings" className="hover:text-foreground transition-colors">
          הגדרות
        </Link>
        <ChevronRight className="h-4 w-4 rotate-180" />
        <span className="text-foreground font-medium">קבלות וחשבוניות</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 shadow-xl shadow-violet-500/30">
          <Receipt className="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">קבלות וחשבוניות</h1>
          <p className="text-muted-foreground">הורד את כל מסמכי התשלום שלך</p>
        </div>
      </div>

      {/* Content */}
      <Card glass className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5 text-primary" />
            היסטוריית תשלומים
          </CardTitle>
          <CardDescription>
            כל החשבוניות שהועלו על ידי הנהלת המערכת עבור החשבון שלך
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
                <FileText className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <p className="text-base font-medium text-muted-foreground">
                אין קבלות להצגה עדיין
              </p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                הקבלות יופיעו כאן לאחר ביצוע תשלום
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="group flex items-center gap-4 rounded-xl border border-border/50 bg-background/30 p-4 transition-all hover:border-primary/30 hover:bg-primary/5"
                >
                  {/* Icon */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 group-hover:from-violet-500/30 group-hover:to-blue-500/30 transition-all">
                    <FileText className="h-5 w-5 text-violet-600" />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold">
                        #{inv.invoice_number}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs ${statusColors[inv.status] ?? ""}`}
                      >
                        {statusLabels[inv.status] ?? inv.status}
                      </Badge>
                    </div>
                    {inv.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {inv.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(inv.issued_at).toLocaleDateString("he-IL", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>

                  {/* Amount */}
                  <div className="text-left shrink-0">
                    <p className="text-base font-bold">
                      {inv.amount.toLocaleString("he-IL")}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        {inv.currency || "ILS"}
                      </span>
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {inv.pdf_url ? (
                      <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                          <ExternalLink className="h-3.5 w-3.5" />
                          פתח
                        </Button>
                      </a>
                    ) : null}
                    {inv.has_file ? (
                      <a
                        href={`${API}/api/client/invoices/${inv.id}/download`}
                        download
                      >
                        <Button
                          size="sm"
                          className="gap-1.5 text-xs bg-gradient-to-r from-violet-500 to-blue-600 shadow-sm shadow-violet-500/25 hover:shadow-violet-500/40 transition-all"
                        >
                          <Download className="h-3.5 w-3.5" />
                          הורד PDF
                        </Button>
                      </a>
                    ) : !inv.pdf_url ? (
                      <span className="text-xs text-muted-foreground/60 px-2">
                        אין קובץ
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer note */}
      <p className="text-center text-xs text-muted-foreground/50">
        לבעיות בחשבוניות, פנה לתמיכה דרך הצ&apos;ט
      </p>
    </div>
  );
}
