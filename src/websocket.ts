/**
 * WebSocket Server for Real-Time Updates
 *
 * Replaces HTTP polling for QR codes and connection status.
 * Uses the native `ws` library (lightweight, no socket.io overhead).
 *
 * Protocol:
 *   Client connects:  ws://host/ws?token=JWT&accountId=UUID
 *   Server emits:     { event: "qr", data: "base64-data-url" }
 *                     { event: "connection", data: { status, phone_number } }
 *                     { event: "error", data: { message } }
 */

import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { Server as HTTPServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { sessionManager } from './services/whatsapp/sessionManager.js';
import { logger } from './utils/logger.js';

interface WSClient {
  ws: WebSocket;
  accountId: string;
  workspaceId: string;
}

// Active WebSocket clients keyed by accountId (multiple clients can watch same account)
const clients = new Map<string, Set<WSClient>>();

/**
 * Attach the WebSocket server to an existing HTTP server.
 * Call this after Express app.listen().
 */
export function attachWebSocket(server: HTTPServer): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
  });

  wss.on('connection', (ws, req) => {
    handleConnection(ws, req.url ?? '').catch((err) => {
      logger.error('WebSocket connection error:', err);
      sendMessage(ws, 'error', { message: 'Connection failed' });
      ws.close(4000, 'Auth failed');
    });
  });

  // Wire into SessionManager events
  registerSessionManagerHooks();

  logger.info('WebSocket server attached at /ws');
  return wss;
}

async function handleConnection(ws: WebSocket, url: string): Promise<void> {
  // Parse query params from URL: /ws?token=xxx&accountId=yyy
  const params = new URL(url, 'http://localhost').searchParams;
  const token = params.get('token');
  const accountId = params.get('accountId');

  if (!token || !accountId) {
    sendMessage(ws, 'error', { message: 'Missing token or accountId' });
    ws.close(4001, 'Missing params');
    return;
  }

  // Verify JWT (accept both client and admin tokens)
  let payload: { sub: string; workspace_id?: string };
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as any;
  } catch {
    sendMessage(ws, 'error', { message: 'Invalid token' });
    ws.close(4003, 'Invalid token');
    return;
  }

  const workspaceId = payload.workspace_id ?? '';

  // Register this client
  const client: WSClient = { ws, accountId, workspaceId };
  if (!clients.has(accountId)) {
    clients.set(accountId, new Set());
  }
  clients.get(accountId)!.add(client);

  logger.debug(`WS client connected for account ${accountId}`);

  // Send current status immediately
  const currentQR = await sessionManager.getQRDataUrl(accountId);
  if (currentQR) {
    sendMessage(ws, 'qr', currentQR);
  }

  // Handle disconnect
  ws.on('close', () => {
    const set = clients.get(accountId);
    if (set) {
      set.delete(client);
      if (set.size === 0) clients.delete(accountId);
    }
    logger.debug(`WS client disconnected for account ${accountId}`);
  });

  // Handle incoming messages (ping/pong keepalive)
  ws.on('message', (data: RawData) => {
    const text = data.toString();
    if (text === 'ping') {
      ws.send(JSON.stringify({ event: 'pong' }));
    }
  });
}

/**
 * Register hooks on SessionManager so QR codes and connection updates
 * are pushed to all connected WebSocket clients in real-time.
 */
function registerSessionManagerHooks(): void {
  // Override the QR and connection listeners to also push via WebSocket.
  // SessionManager already has the qrListeners and connectionListeners maps.
  // We'll hook into them from the outside by watching for new sessions.

  // Patch: intercept restoreAllSessions and startQRFlow to register WS hooks
  const originalStartQR = sessionManager.startQRFlow.bind(sessionManager);
  sessionManager.startQRFlow = async (workspaceId: string, displayName?: string) => {
    const accountId = await originalStartQR(workspaceId, displayName);
    registerAccountHooks(accountId);
    return accountId;
  };

  const originalStartPair = sessionManager.startPairingFlow.bind(sessionManager);
  sessionManager.startPairingFlow = async (workspaceId: string, phoneNumber: string, displayName?: string) => {
    const result = await originalStartPair(workspaceId, phoneNumber, displayName);
    registerAccountHooks(result.accountId);
    return result;
  };
}

function registerAccountHooks(accountId: string): void {
  // Push QR codes to WebSocket clients
  sessionManager.onQR(accountId, (dataUrl: string) => {
    broadcast(accountId, 'qr', dataUrl);
  });

  // Push connection status to WebSocket clients
  sessionManager.onConnection(accountId, (status, account) => {
    broadcast(accountId, 'connection', {
      status,
      phone_number: account.account_identifier ?? null,
      rate_limit_until: account.rate_limit_until ?? null,
    });
  });
}

// ── Helpers ──

function sendMessage(ws: WebSocket, event: string, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

function broadcast(accountId: string, event: string, data: unknown): void {
  const set = clients.get(accountId);
  if (!set || set.size === 0) return;

  const payload = JSON.stringify({ event, data });
  for (const client of set) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}
