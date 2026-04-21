"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Users, Settings, Bot, LogOut, LayoutDashboard, MessageSquare, Mail, Send, FileText } from "lucide-react";

const ADMIN_KEY = "gp_admin_token";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(ADMIN_KEY);
    if (!token) { router.push("/admin/login"); return; }
    setReady(true);
  }, [router]);

  if (!ready) return (
    <div className="flex min-h-screen items-center justify-center bg-[#070b18]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
    </div>
  );

  const nav = [
    { href: "/admin", label: "סקירה", icon: LayoutDashboard },
    { href: "/admin/workspaces", label: "לקוחות CRM", icon: Users },
    { href: "/admin/newsletter", label: "ניוזלטר", icon: Send },
    { href: "/admin/email-templates", label: "תבניות מייל", icon: FileText },
    { href: "/admin/email-log", label: "לוג מיילים", icon: Mail },
    { href: "/admin/ai", label: "AI Assistant", icon: Bot },
    { href: "/admin/settings", label: "הגדרות", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-[#070b18] text-white" dir="rtl">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-l border-white/10 bg-white/3 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-violet-600">
            <MessageSquare className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-sm">GroupPulse Admin</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                (href === "/admin" ? pathname === href : pathname.startsWith(href))
                  ? "bg-white/10 text-white font-medium"
                  : "text-white/50 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <button
          onClick={() => { localStorage.removeItem(ADMIN_KEY); router.push("/admin/login"); }}
          className="flex items-center gap-2 px-4 py-4 text-sm text-white/30 hover:text-white/60 border-t border-white/10"
        >
          <LogOut className="h-4 w-4" /> התנתק
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
