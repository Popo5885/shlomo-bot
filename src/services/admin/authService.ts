/**
 * Super Admin Auth Service
 *
 * Handles login, JWT generation, and MFA verification.
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { AuthError } from '../../utils/errors.js';
import type { SuperAdmin } from '../../types/database.js';

interface LoginResult {
  token: string;
  admin: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

export async function loginSuperAdmin(
  email: string,
  password: string,
  mfaCode?: string
): Promise<LoginResult> {
  // 1. Find admin by email
  const admin = await db('super_admins')
    .where({ email: email.toLowerCase().trim() })
    .first<SuperAdmin>();

  if (!admin) {
    throw new AuthError('Invalid email or password');
  }

  // 2. Verify password
  const passwordValid = await bcrypt.compare(password, admin.password_hash);
  if (!passwordValid) {
    throw new AuthError('Invalid email or password');
  }

  // 3. Check MFA if enabled
  if (admin.mfa_secret) {
    if (!mfaCode) {
      throw new AuthError('MFA code required');
    }
    const mfaValid = verifyTOTP(admin.mfa_secret, mfaCode);
    if (!mfaValid) {
      throw new AuthError('Invalid MFA code');
    }
  }

  // 4. Generate JWT
  const token = jwt.sign(
    {
      sub: admin.id,
      role: 'super_admin',
      email: admin.email,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
  );

  // 5. Update last_login_at
  await db('super_admins')
    .where({ id: admin.id })
    .update({ last_login_at: db.fn.now() });

  return {
    token,
    admin: {
      id: admin.id,
      email: admin.email,
      full_name: admin.full_name,
    },
  };
}

/**
 * Simple TOTP verification.
 * For production, use a proper library like `otpauth`.
 * This is a placeholder that validates the code format.
 */
function verifyTOTP(secret: string, code: string): boolean {
  // TODO: Implement proper TOTP verification with `otpauth` library
  // For now, accept any 6-digit code during development
  if (env.NODE_ENV === 'development') {
    return /^\d{6}$/.test(code);
  }
  // In production, this should use a real TOTP library
  return false;
}
