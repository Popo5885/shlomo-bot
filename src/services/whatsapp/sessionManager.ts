/**
 * WhatsApp Session Manager
 *
 * Manages in-memory WASocket instances keyed by connected_accounts.id.
 * Designed for microservice architecture: both the HTTP server and the Worker
 * create their own SessionManager instance with independent socket pools.
 *
 * The DB (connected_accounts) is the shared state between services.
 * Each process restores only the sessions it needs.
 */

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';

import { db } from '../../config/database.js';
import { usePostgresAuthState } from './authFlow.js';
import { attachMessageListener } from './messageListener.js';
import { logger } from '../../utils/logger.js';
import type { ConnectedAccount, ConnectionStatus } from '../../types/database.js';

/**
 * Pino-compatible logger wrapper for Baileys.
 * Baileys expects a pino-style logger with trace/debug/info/warn/error/fatal + child().
 * Our app uses Winston, so we bridge the interface here.
 */
function makeBaileysLogger(level: string = 'warn') {
  const levels: Record<string, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
  const threshold = levels[level] ?? 40;

  const noop = () => {};

  function makeLevel(lvl: number, winstonLevel: string) {
    if (lvl < threshold) return noop;
    return (obj: any, msg?: string) => {
      if (typeof obj === 'string') {
        (logger as any)[winstonLevel]?.({ class: 'baileys' }, obj);
      } else {
        (logger as any)[winstonLevel]?.({ ...obj, class: 'baileys' }, msg ?? '');
      }
    };
  }

  const pinoLogger: any = {
    level,
    trace: makeLevel(10, 'debug'),
    debug: makeLevel(20, 'debug'),
    info: makeLevel(30, 'info'),
    warn: makeLevel(40, 'warn'),
    error: makeLevel(50, 'error'),
    fatal: makeLevel(60, 'error'),
    child: () => pinoLogger,
  };

  return pinoLogger;
}

const baileysLogger = makeBaileysLogger('warn');

interface ManagedSession {
  socket: WASocket;
  accountId: string;
  workspaceId: string;
}

type QRListener = (dataUrl: string) => void;
type ConnectionListener = (status: ConnectionStatus, account: Partial<ConnectedAccount>) => void;

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private qrListeners = new Map<string, QRListener>();
  private connectionListeners = new Map<string, ConnectionListener>();

  /** Number of active sessions in memory */
  get activeCount(): number {
    return this.sessions.size;
  }

  /** Get a live socket for sending messages. Returns undefined if not connected. */
  getSocket(accountId: string): WASocket | undefined {
    return this.sessions.get(accountId)?.socket;
  }

  /** Register a one-shot listener for QR code updates (used by HTTP polling) */
  onQR(accountId: string, listener: QRListener): void {
    this.qrListeners.set(accountId, listener);
  }

  /** Register a listener for connection state changes */
  onConnection(accountId: string, listener: ConnectionListener): void {
    this.connectionListeners.set(accountId, listener);
  }

  /**
   * Restore all sessions that were previously connected.
   * Called once at process startup (both HTTP server and Worker).
   */
  async restoreAllSessions(): Promise<void> {
    const accounts = await db('connected_accounts')
      .where({ is_connected: true, platform: 'WHATSAPP_WEB' })
      .select('id', 'workspace_id');

    logger.info(`Restoring ${accounts.length} WhatsApp sessions...`);

    for (const account of accounts) {
      try {
        await this.createSession(account.id, account.workspace_id);
        logger.info(`Session restored: ${account.id}`);
      } catch (err) {
        logger.error(`Failed to restore session ${account.id}:`, err);
        await this.updateAccountStatus(account.id, 'disconnected');
      }
    }
  }

  /**
   * Create a new WhatsApp session (QR code flow).
   * Returns the accountId so the client can poll for the QR.
   */
  async startQRFlow(workspaceId: string, displayName?: string): Promise<string> {
    // Insert a new connected_account row
    const [account] = await db('connected_accounts')
      .insert({
        workspace_id: workspaceId,
        platform: 'WHATSAPP_WEB',
        display_name: displayName ?? null,
        connection_status: 'qr_pending',
        is_connected: false,
      })
      .returning('id');

    const accountId = account.id;
    await this.createSession(accountId, workspaceId);
    return accountId;
  }

  /**
   * Create a new WhatsApp session (Pairing Code flow).
   * Returns the 8-digit pairing code.
   */
  async startPairingFlow(
    workspaceId: string,
    phoneNumber: string,
    displayName?: string
  ): Promise<{ accountId: string; pairingCode: string }> {
    // Insert row
    const [account] = await db('connected_accounts')
      .insert({
        workspace_id: workspaceId,
        platform: 'WHATSAPP_WEB',
        display_name: displayName ?? null,
        account_identifier: phoneNumber,
        connection_status: 'qr_pending',
        is_connected: false,
      })
      .returning('id');

    const accountId = account.id;
    const socket = await this.createSession(accountId, workspaceId);

    // Request pairing code — Baileys needs the phone in international format without +
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const pairingCode = await socket.requestPairingCode(cleanPhone);

    return { accountId, pairingCode };
  }

  /**
   * Get the latest QR code data URL for polling.
   */
  async getQRDataUrl(accountId: string): Promise<string | null> {
    const row = await db('connected_accounts')
      .where({ id: accountId })
      .select('qr_code_data', 'connection_status')
      .first();

    if (!row) return null;
    if (row.connection_status === 'connected') return null; // already connected
    return row.qr_code_data ?? null;
  }

  /**
   * Sync all WhatsApp groups for a connected account into the destinations table.
   * Returns the number of groups synced.
   */
  async syncGroups(accountId: string): Promise<number> {
    const session = this.sessions.get(accountId);
    if (!session) throw new Error('Session not found or not connected');

    const groups = await session.socket.groupFetchAllParticipating();
    const groupEntries = Object.values(groups);

    logger.info(`Syncing ${groupEntries.length} WhatsApp groups for account ${accountId}`);

    let synced = 0;
    for (const group of groupEntries) {
      const jid = group.id; // e.g. "120363123456789@g.us"
      if (!jid.endsWith('@g.us') && !jid.endsWith('@newsletter')) continue;

      const destType = jid.endsWith('@newsletter') ? 'WA_CHANNEL' : 'WA_GROUP';

      await db('destinations')
        .insert({
          id: db.raw('gen_random_uuid()'),
          workspace_id: session.workspaceId,
          connected_account_id: accountId,
          platform: 'WHATSAPP_WEB',
          destination_type: destType,
          platform_dest_id: jid,
          display_name: group.subject || jid,
          participant_count: group.participants?.length ?? 0,
          is_active: true,
          metadata: JSON.stringify({
            owner: group.owner,
            creation: group.creation,
            desc: group.desc,
          }),
        })
        .onConflict(['workspace_id', 'connected_account_id', 'platform_dest_id'])
        .merge({
          display_name: group.subject || jid,
          participant_count: group.participants?.length ?? 0,
          connected_account_id: accountId,
          metadata: JSON.stringify({
            owner: group.owner,
            creation: group.creation,
            desc: group.desc,
          }),
          updated_at: db.fn.now(),
        });

      synced++;
    }

    logger.info(`Synced ${synced} groups for account ${accountId}`);
    return synced;
  }

  /**
   * Disconnect and cleanup a session.
   */
  async disconnect(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (session) {
      session.socket.end(undefined);
      this.sessions.delete(accountId);
    }
    this.qrListeners.delete(accountId);
    this.connectionListeners.delete(accountId);

    await this.updateAccountStatus(accountId, 'disconnected');
    await db('connected_accounts')
      .where({ id: accountId })
      .update({ is_connected: false, updated_at: db.fn.now() });
  }

  /**
   * Graceful shutdown — close all sockets.
   */
  async disconnectAll(): Promise<void> {
    logger.info(`Disconnecting all ${this.sessions.size} sessions...`);
    const promises = Array.from(this.sessions.keys()).map((id) => this.disconnect(id));
    await Promise.allSettled(promises);
  }

  // ══════════════════════════════════════════════════════════════
  //  PRIVATE
  // ══════════════════════════════════════════════════════════════

  private async createSession(accountId: string, workspaceId: string): Promise<WASocket> {
    // If session already exists, return it
    const existing = this.sessions.get(accountId);
    if (existing) return existing.socket;

    const { state, saveCreds } = await usePostgresAuthState(accountId);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      logger: baileysLogger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      getMessage: async () => undefined, // Save memory — don't store messages
    });

    const session: ManagedSession = { socket, accountId, workspaceId };
    this.sessions.set(accountId, session);

    // ── Handle connection updates ──
    socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      await this.handleConnectionUpdate(session, update);
    });

    // ── Handle credential updates ──
    socket.ev.on('creds.update', saveCreds);

    return socket;
  }

  private async handleConnectionUpdate(
    session: ManagedSession,
    update: Partial<ConnectionState>
  ): Promise<void> {
    const { accountId } = session;
    const { connection, lastDisconnect, qr } = update;

    // ── QR code received ──
    if (qr) {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { width: 300 });

        // Save to DB so polling endpoint can serve it
        await db('connected_accounts')
          .where({ id: accountId })
          .update({ qr_code_data: dataUrl, updated_at: db.fn.now() });

        // Notify in-process listener (if any)
        this.qrListeners.get(accountId)?.(dataUrl);
      } catch (err) {
        logger.error(`QR generation failed for ${accountId}:`, err);
      }
    }

    // ── Connected successfully ──
    if (connection === 'open') {
      const phoneNumber = session.socket.user?.id?.split(':')[0] ?? null;

      await db('connected_accounts')
        .where({ id: accountId })
        .update({
          is_connected: true,
          connection_status: 'connected',
          account_identifier: phoneNumber,
          last_seen_at: db.fn.now(),
          qr_code_data: null, // Clear temporary QR
          updated_at: db.fn.now(),
        });

      // Attach message listener for automatic distribution triggers
      attachMessageListener(session.socket, accountId, session.workspaceId);

      this.connectionListeners.get(accountId)?.('connected', {
        account_identifier: phoneNumber,
      });

      logger.info(`WhatsApp connected: ${accountId} (phone: ${phoneNumber})`);

      // Auto-sync groups after connection
      this.syncGroups(accountId).catch((err) =>
        logger.error(`Auto group sync failed for ${accountId}:`, err)
      );
    }

    // ── Disconnected ──
    if (connection === 'close') {
      const boom = (lastDisconnect?.error as Boom)?.output;
      const statusCode = boom?.statusCode ?? 500;
      const reason = statusCode;

      this.sessions.delete(accountId);

      if (reason === DisconnectReason.loggedOut || reason === 401) {
        // Logged out — don't reconnect, mark as disconnected
        await db('connected_accounts')
          .where({ id: accountId })
          .update({
            is_connected: false,
            connection_status: 'disconnected',
            auth_data: null, // Session is invalid
            updated_at: db.fn.now(),
          });

        this.connectionListeners.get(accountId)?.('disconnected', {});
        logger.warn(`WhatsApp logged out: ${accountId}`);
      } else if (reason === 405) {
        // Banned
        await this.updateAccountStatus(accountId, 'banned');
        await db('connected_accounts')
          .where({ id: accountId })
          .update({ is_connected: false, updated_at: db.fn.now() });

        this.connectionListeners.get(accountId)?.('banned', {});
        logger.error(`WhatsApp banned: ${accountId}`);
      } else if (reason === 429) {
        // Rate limited
        const until = new Date(Date.now() + 30 * 60 * 1000); // 30 min cooldown
        await db('connected_accounts')
          .where({ id: accountId })
          .update({
            connection_status: 'rate_limited',
            rate_limit_until: until,
            is_connected: false,
            updated_at: db.fn.now(),
          });

        this.connectionListeners.get(accountId)?.('rate_limited', {
          rate_limit_until: until,
        });
        logger.warn(`WhatsApp rate limited: ${accountId}, until ${until.toISOString()}`);

        // Schedule reconnect after cooldown
        setTimeout(() => {
          this.createSession(accountId, session.workspaceId).catch((err) =>
            logger.error(`Reconnect after rate limit failed for ${accountId}:`, err)
          );
        }, 30 * 60 * 1000);
      } else {
        // Transient error — auto reconnect
        logger.info(`WhatsApp disconnected (code ${reason}), reconnecting: ${accountId}`);
        await this.updateAccountStatus(accountId, 'disconnected');

        setTimeout(() => {
          this.createSession(accountId, session.workspaceId).catch((err) =>
            logger.error(`Reconnect failed for ${accountId}:`, err)
          );
        }, 3000);
      }
    }
  }

  private async updateAccountStatus(accountId: string, status: ConnectionStatus): Promise<void> {
    await db('connected_accounts')
      .where({ id: accountId })
      .update({ connection_status: status, updated_at: db.fn.now() });
  }
}

// Singleton instance — each process (HTTP server / Worker) creates its own
export const sessionManager = new SessionManager();
