"use client";

import { useEffect, useRef, useCallback } from "react";

const IDLE_MS = 30 * 60 * 1000; // 30 minutes
const WARN_MS = 25 * 60 * 1000; // warn at 25 minutes

interface UseIdleTimerOptions {
  onWarn: () => void;
  onLogout: () => void;
}

export function useIdleTimer({ onWarn, onLogout }: UseIdleTimerOptions) {
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warned = useRef(false);

  const reset = useCallback(() => {
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    warned.current = false;

    warnTimer.current = setTimeout(() => {
      warned.current = true;
      onWarn();
    }, WARN_MS);

    logoutTimer.current = setTimeout(() => {
      onLogout();
    }, IDLE_MS);
  }, [onWarn, onLogout]);

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    const handler = () => {
      if (warned.current) return; // once warning shown, don't reset until user confirms
      reset();
    };

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    reset(); // start the timer

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (warnTimer.current) clearTimeout(warnTimer.current);
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
    };
  }, [reset]);

  const extend = useCallback(() => {
    reset();
  }, [reset]);

  return { extend };
}
