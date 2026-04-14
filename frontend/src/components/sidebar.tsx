"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Send,
  GitBranch,
  Settings,
  LogOut,
  Sparkles,
  BarChart3,
  Radio,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth";

const navItems = [
  { label: "לוח בקרה", href: "/dashboard", icon: LayoutDashboard },
  { label: "ערוצים", href: "/dashboard/channels", icon: Radio },
  { label: "קמפיינים", href: "/dashboard/campaigns", icon: Send },
  { label: "כללי הפצה", href: "/dashboard/rules", icon: GitBranch },
  { label: "לידים", href: "/dashboard/crm", icon: Users },
  { label: "תובנות", href: "/dashboard/insights", icon: BarChart3 },
  { label: "הגדרות", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, member, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <aside className="flex h-full w-64 flex-col border-l border-white/5 bg-sidebar-bg text-sidebar-foreground">
      {/* Workspace header */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 font-bold text-white text-sm shadow-lg shadow-blue-500/30">
          {workspace?.name?.charAt(0)?.toUpperCase() || "W"}
          <Sparkles className="absolute -left-1 -top-1 h-3.5 w-3.5 text-yellow-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {workspace?.name || "שליחת תפוצה לקבוצות"}
          </p>
          <p className="truncate text-xs text-sidebar-foreground/50">
            {member?.email || ""}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-blue-600/90 to-blue-700/90 text-white shadow-lg shadow-blue-600/20"
                  : "text-sidebar-foreground/60 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-transform duration-200",
                  !isActive && "group-hover:scale-110"
                )}
              />
              {item.label}
              {isActive && (
                <div className="mr-auto h-1.5 w-1.5 rounded-full bg-white shadow-sm shadow-white/50" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-white/10 px-3 py-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/50 transition-all duration-200 hover:bg-red-500/10 hover:text-red-400"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          התנתק
        </button>
      </div>

      {/* Legal links */}
      <div className="border-t border-white/10 px-5 py-3 flex items-center justify-center gap-3 text-[10px] text-sidebar-foreground/30">
        <Link href="/privacy" className="hover:text-sidebar-foreground/60 transition-colors">פרטיות</Link>
        <span>·</span>
        <Link href="/terms" className="hover:text-sidebar-foreground/60 transition-colors">תנאים</Link>
        <span>·</span>
        <Link href="/accessibility" className="hover:text-sidebar-foreground/60 transition-colors">נגישות</Link>
      </div>
    </aside>
  );
}
