"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function UnsubscribePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const email = searchParams.get("email") ?? "";

  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [resubStatus, setResubStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    if (!token || !email) { setStatus("error"); return; }
    fetch(`${API}/api/email/unsubscribe/${token}?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((j) => setStatus(j.success ? "done" : "error"))
      .catch(() => setStatus("error"));
  }, [token, email]);

  const resubscribe = async () => {
    setResubStatus("loading");
    try {
      const res = await fetch(`${API}/api/email/resubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      }).then((r) => r.json());
      setResubStatus(res.success ? "done" : "error");
    } catch {
      setResubStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center px-4" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-violet-600 px-8 py-8 text-center">
          <h1 className="text-2xl font-bold text-white">GroupPulse</h1>
          <p className="text-white/70 text-sm mt-1">פלטפורמת הפצת הודעות חכמה</p>
        </div>

        {/* Body */}
        <div className="px-8 py-10 text-center">
          {status === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-gray-500">מעבד את בקשת ההסרה...</p>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-800 mb-2">קישור לא תקין</h2>
              <p className="text-gray-500 text-sm">הקישור שבו השתמשת אינו תקין או שפג תוקפו.</p>
            </>
          )}

          {status === "done" && resubStatus !== "done" && (
            <>
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-800 mb-2">הוסרת בהצלחה</h2>
              <p className="text-gray-500 text-sm mb-2">
                הכתובת <strong>{email}</strong> הוסרה מרשימת התפוצה שלנו.
              </p>
              <p className="text-gray-400 text-xs mb-6">לא תקבל יותר מיילים שיווקיים מ-GroupPulse.</p>

              {resubStatus === "idle" && (
                <button
                  onClick={resubscribe}
                  className="inline-flex items-center gap-2 text-sm text-indigo-500 hover:text-indigo-700 underline underline-offset-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  הרשמה מחדש לרשימת התפוצה
                </button>
              )}
              {resubStatus === "loading" && (
                <p className="text-sm text-gray-400 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> מעבד...
                </p>
              )}
              {resubStatus === "error" && (
                <p className="text-sm text-red-400">אירעה שגיאה. נסה שנית.</p>
              )}
            </>
          )}

          {resubStatus === "done" && (
            <>
              <CheckCircle className="h-12 w-12 text-blue-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-800 mb-2">נרשמת מחדש!</h2>
              <p className="text-gray-500 text-sm">הכתובת <strong>{email}</strong> נוספה בחזרה לרשימת התפוצה.</p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-8 py-5 text-center">
          <p className="text-xs text-gray-400">
            שלמה פופוביץ — שירותי אוטומציה לעסקים
          </p>
          <p className="text-xs text-gray-300 mt-1">© {new Date().getFullYear()} כל הזכויות שמורות</p>
          <Link href="/login" className="text-xs text-indigo-400 hover:text-indigo-600 mt-2 inline-block">
            כניסה למערכת
          </Link>
        </div>
      </div>
    </div>
  );
}
