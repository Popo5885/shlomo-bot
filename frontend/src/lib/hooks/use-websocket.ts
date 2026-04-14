"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuthStore } from "@/lib/auth";
import type { ConnectionStatus, WsEvent } from "@/types/api";

interface UseWebSocketReturn {
  qrCode: string | null;
  connectionStatus: ConnectionStatus | null;
  phoneNumber: string | null;
  isConnected: boolean;
  error: string | null;
}

const PING_INTERVAL = 25_000;
const MAX_RECONNECT_DELAY = 30_000;

export function useWebSocket(
  accountId: string | null
): UseWebSocketReturn {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!accountId || !mountedRef.current) return;

    const token = useAuthStore.getState().token;
    if (!token) return;

    cleanup();

    const apiBase = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    const wsBase = apiBase.replace(/^http/, "ws");
    const wsUrl = `${wsBase}/ws?token=${encodeURIComponent(token)}&accountId=${encodeURIComponent(accountId)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setError(null);
      retriesRef.current = 0;

      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
        }
      }, PING_INTERVAL);
    };

    ws.onmessage = (evt) => {
      if (!mountedRef.current) return;
      try {
        const msg: WsEvent = JSON.parse(evt.data);

        switch (msg.event) {
          case "qr":
            setQrCode(msg.data);
            setConnectionStatus("qr_pending");
            break;
          case "connection":
            setConnectionStatus(msg.data.status);
            setPhoneNumber(msg.data.phone_number);
            if (msg.data.status === "connected") {
              setQrCode(null);
            }
            break;
          case "error":
            setError(msg.data.message);
            break;
          case "pong":
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      if (pingRef.current) {
        clearInterval(pingRef.current);
        pingRef.current = null;
      }

      // Exponential backoff reconnect
      const delay = Math.min(
        1000 * Math.pow(2, retriesRef.current),
        MAX_RECONNECT_DELAY
      );
      retriesRef.current += 1;

      reconnectRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connect();
        }
      }, delay);
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setError("WebSocket connection error");
    };
  }, [accountId, cleanup]);

  useEffect(() => {
    mountedRef.current = true;

    if (accountId) {
      // Reset state for new account
      setQrCode(null);
      setConnectionStatus(null);
      setPhoneNumber(null);
      setError(null);
      retriesRef.current = 0;
      connect();
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [accountId, connect, cleanup]);

  return { qrCode, connectionStatus, phoneNumber, isConnected, error };
}
