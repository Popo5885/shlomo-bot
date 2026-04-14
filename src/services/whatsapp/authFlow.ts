/**
 * usePostgresAuthState — Baileys-compatible AuthenticationState
 * that persists credentials to the connected_accounts.auth_data column (encrypted).
 *
 * Includes a debounce/cache layer so frequent `saveCreds` calls from Baileys
 * don't hammer the DB — writes are batched within a configurable window.
 */

import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { proto } from '@whiskeysockets/baileys';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import { db } from '../../config/database.js';
import { encrypt, decrypt, isEncryptedPayload } from './encryption.js';
import { logger } from '../../utils/logger.js';

const DEBOUNCE_MS = 2000; // batch writes within 2 seconds

interface PersistedAuthState {
  creds: AuthenticationCreds;
  keys: Record<string, Record<string, unknown>>;
}

/**
 * Creates a Baileys AuthenticationState backed by PostgreSQL.
 * @param accountId - The connected_accounts.id UUID
 */
export async function usePostgresAuthState(
  accountId: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  // ── Load existing state or create fresh ──
  let authState = await loadAuthState(accountId);

  if (!authState) {
    authState = {
      creds: initAuthCreds(),
      keys: {},
    };
  }

  // ── Debounce timer for saveCreds ──
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSave = false;

  async function flushToDB(): Promise<void> {
    const payload = {
      creds: JSON.parse(JSON.stringify(authState!.creds, BufferJSON.replacer)),
      keys: JSON.parse(JSON.stringify(authState!.keys, BufferJSON.replacer)),
    };

    const encrypted = encrypt(payload);

    // Retry logic — handles "database is closed" / pool errors gracefully
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        await db('connected_accounts')
          .where({ id: accountId })
          .update({
            auth_data: JSON.stringify(encrypted),
            updated_at: db.fn.now(),
          });
        pendingSave = false;
        logger.debug(`Auth state saved for account ${accountId}`);
        return;
      } catch (err) {
        attempts++;
        const errMsg = (err as Error).message ?? '';
        if (attempts < maxAttempts && (errMsg.includes('database is closed') || errMsg.includes('Connection terminated') || errMsg.includes('ECONNRESET'))) {
          logger.warn(`Auth state save attempt ${attempts}/${maxAttempts} failed (${errMsg}), retrying in 2s...`);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          throw err;
        }
      }
    }
  }

  function scheduleSave(): void {
    if (saveTimer) return; // already scheduled
    pendingSave = true;
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      try {
        await flushToDB();
      } catch (err) {
        logger.error(`Failed to save auth state for ${accountId}`, err);
      }
    }, DEBOUNCE_MS);
  }

  // ── Build the AuthenticationState interface ──
  const state: AuthenticationState = {
    creds: authState.creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(
        type: T,
        ids: string[]
      ): Promise<Record<string, SignalDataTypeMap[T]>> => {
        const result: Record<string, SignalDataTypeMap[T]> = {};
        const bucket = authState!.keys[type];
        if (!bucket) return result;

        for (const id of ids) {
          const value = bucket[id];
          if (value) {
            let parsed = JSON.parse(JSON.stringify(value), BufferJSON.reviver);
            if (type === 'app-state-sync-key' && parsed) {
              parsed = proto.Message.AppStateSyncKeyData.fromObject(parsed);
            }
            result[id] = parsed;
          }
        }
        return result;
      },

      set: async (data: Record<string, Record<string, unknown | null>>): Promise<void> => {
        for (const [type, entries] of Object.entries(data)) {
          if (!authState!.keys[type]) {
            authState!.keys[type] = {};
          }
          for (const [id, value] of Object.entries(entries)) {
            if (value) {
              authState!.keys[type][id] = JSON.parse(
                JSON.stringify(value, BufferJSON.replacer)
              );
            } else {
              delete authState!.keys[type][id];
            }
          }
        }
        scheduleSave();
      },
    },
  };

  async function saveCreds(): Promise<void> {
    // Immediate flush (Baileys calls this on critical credential updates)
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await flushToDB();
  }

  return { state, saveCreds };
}

/**
 * Load and decrypt the auth state from the DB.
 */
async function loadAuthState(accountId: string): Promise<PersistedAuthState | null> {
  const row = await db('connected_accounts')
    .where({ id: accountId })
    .select('auth_data')
    .first();

  if (!row?.auth_data) return null;

  const raw = typeof row.auth_data === 'string' ? JSON.parse(row.auth_data) : row.auth_data;

  if (!isEncryptedPayload(raw)) {
    logger.warn(`Account ${accountId} has unencrypted auth_data — migrating`);
    return parseRawAuthState(raw);
  }

  const decrypted = decrypt<Record<string, unknown>>(raw);
  return parseRawAuthState(decrypted);
}

function parseRawAuthState(raw: Record<string, unknown>): PersistedAuthState {
  return {
    creds: JSON.parse(JSON.stringify(raw.creds ?? {}), BufferJSON.reviver),
    keys: JSON.parse(JSON.stringify(raw.keys ?? {}), BufferJSON.reviver),
  };
}
