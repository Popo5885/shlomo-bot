import crypto from 'node:crypto';
import { env } from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

interface EncryptedPayload {
  iv: string;   // hex
  tag: string;  // hex
  data: string; // hex
}

function getKey(): Buffer {
  return Buffer.from(env.AUTH_DATA_ENCRYPTION_KEY, 'hex');
}

/**
 * Encrypt any JSON-serializable value with AES-256-GCM.
 * Returns an object safe to store in a JSONB column.
 */
export function encrypt(plaintext: unknown): EncryptedPayload {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const json = JSON.stringify(plaintext);
  const encrypted = Buffer.concat([
    cipher.update(json, 'utf8'),
    cipher.final(),
  ]);

  return {
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    data: encrypted.toString('hex'),
  };
}

/**
 * Decrypt an EncryptedPayload back to its original value.
 */
export function decrypt<T = unknown>(payload: EncryptedPayload): T {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(payload.iv, 'hex'),
    { authTagLength: AUTH_TAG_LENGTH }
  );

  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'hex')),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8')) as T;
}

/**
 * Check whether a value looks like an encrypted payload (vs. plaintext JSONB).
 */
export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.iv === 'string' &&
    typeof obj.tag === 'string' &&
    typeof obj.data === 'string'
  );
}
