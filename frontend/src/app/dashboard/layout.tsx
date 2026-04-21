"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { FloatingChat } from "@/components/floating-chat";
import { useIdleTimer } from "@/lib/hooks/useIdleTimer";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { token, workspace, logout } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);
  const [showIdleWarning, setShowIdleWarning] = useState(false);

  const handleLogout = useCallback(() => {
    logout();
    router.push("/login");
  }, [logout, router]);

  const { extend } = useIdleTimer({
    onWarn: () => setShowIdleWarning(true),
    onLogout: handleLogout,
  });

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    if (!token) {
      router.push("/login");
      return;
    }

    if (!workspace) return;

    // Guard 1: workspace is pending admin approval
    if (workspace.status === "pending") {
      router.push("/pending");
      return;
    }

    // Guard 2: workspace is suspended
    if (workspace.status === "suspended") {
      router.push("/suspended");
      return;
    }

    // Guard 3: contract not signed (or was revoked)
    if (!workspace.contract_signed || workspace.contract_revoked_at) {
      router.push("/sign-contract");
      return;
    }
  }, [hydrated, token, workspace, router]);

  if (!hydrated || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // While redirecting, show spinner
  if (
    workspace &&
    (workspace.status !== "active" ||
      !workspace.contract_signed ||
      workspace.contract_revoked_at)
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {showIdleWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f172a] p-8 shadow-2xl text-center space-y-4" dir="rtl">
            <div className="text-4xl">⏱️</div>
            <h2 className="text-xl font-bold text-white">זמן חוסר פעילות</h2>
            <p className="text-sm text-white/60">
              תנותק אוטומטית בעוד 5 דקות עקב חוסר פעילות.<br />
              רוצה להמשיך?
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <Button
                onClick={() => { setShowIdleWarning(false); extend(); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                כן, המשך
              </Button>
              <Button variant="outline" onClick={handleLogout} className="border-white/20 text-white hover:bg-white/10">
                התנתק
              </Button>
            </div>
          </div>
        </div>
      )}
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-muted/30 p-6 lg:p-8">
        {children}
      </main>
      <FloatingChat />
      {/* WhatsApp support button */}
      <a
        href="https://wa.me/972542466340"
        target="_blank"
        rel="noopener noreferrer"
        title="שלח לנו הודעה בוואטסאפ"
        className="fixed bottom-6 left-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-4 focus:ring-green-400/40"
        style={{ backgroundColor: '#25D366' }}
      >
        <svg viewBox="0 0 32 32" fill="white" className="h-7 w-7">
          <path d="M16.004 2C8.28 2 2.008 8.272 2.008 16c0 2.476.648 4.8 1.776 6.82L2 30l7.348-1.924A13.94 13.94 0 0 0 16.004 30C23.728 30 30 23.728 30 16S23.728 2 16.004 2zm0 25.52a11.5 11.5 0 0 1-5.868-1.604l-.42-.248-4.36 1.144 1.164-4.252-.272-.436A11.49 11.49 0 0 1 4.52 16c0-6.336 5.152-11.488 11.484-11.488 6.336 0 11.488 5.152 11.488 11.488S22.34 27.52 16.004 27.52zm6.296-8.6c-.344-.172-2.04-1.004-2.356-1.12-.316-.112-.544-.168-.772.172-.228.34-.884 1.12-1.084 1.352-.2.228-.4.256-.744.084-.344-.172-1.452-.536-2.768-1.708-1.02-.912-1.712-2.04-1.912-2.384-.2-.344-.02-.528.152-.7.156-.156.344-.404.516-.608.172-.2.228-.344.344-.572.112-.228.056-.428-.028-.6-.084-.172-.772-1.864-1.056-2.552-.28-.672-.56-.58-.772-.592-.2-.008-.428-.012-.656-.012-.228 0-.6.084-.916.428-.316.344-1.208 1.18-1.208 2.876 0 1.696 1.236 3.332 1.408 3.56.172.228 2.432 3.712 5.892 5.204.824.356 1.468.568 1.968.728.828.264 1.58.228 2.176.136.664-.1 2.04-.836 2.328-1.64.284-.8.284-1.488.2-1.636-.08-.148-.308-.228-.652-.4z"/>
        </svg>
      </a>
    </div>
  );
}
