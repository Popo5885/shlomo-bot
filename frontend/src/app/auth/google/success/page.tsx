"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/auth";
import { Loader2 } from "lucide-react";

function GoogleSuccessHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    const raw = searchParams.get("session");
    if (!raw) { router.push("/login?error=google_failed"); return; }

    try {
      const session = JSON.parse(decodeURIComponent(raw));
      setSession(session);

      const ws = session.workspace;
      if (ws?.status === "pending") router.push("/pending");
      else if (!ws?.contract_signed || ws?.contract_revoked_at) router.push("/sign-contract");
      else router.push("/dashboard");
    } catch {
      router.push("/login?error=google_failed");
    }
  }, [searchParams, setSession, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070b18]">
      <div className="text-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-400 mx-auto" />
        <p className="text-white/60 text-sm">מתחבר עם Google...</p>
      </div>
    </div>
  );
}

export default function GoogleSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#070b18]">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
      </div>
    }>
      <GoogleSuccessHandler />
    </Suspense>
  );
}
