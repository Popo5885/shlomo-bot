/**
 * Super Admin Authentication Middleware
 *
 * Verifies JWT with role=super_admin and checks IP whitelist.
 * Attaches `req.superAdmin` to the request object.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { db } from '../config/database.js';
import { AuthError, ForbiddenError } from '../utils/errors.js';

interface SuperAdminPayload {
  sub: string;
  role: 'super_admin';
  email: string;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      superAdmin?: {
        id: string;
        email: string;
        full_name: string | null;
      };
    }
  }
}

export async function superAdminAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Extract token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthError('Missing or invalid Authorization header');
    }
    const token = authHeader.slice(7);

    // 2. Verify JWT
    let payload: SuperAdminPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as SuperAdminPayload;
    } catch {
      throw new AuthError('Invalid or expired token');
    }

    // 3. Check role
    if (payload.role !== 'super_admin') {
      throw new ForbiddenError('Access restricted to super admins');
    }

    // 4. Verify admin still exists in DB
    const admin = await db('super_admins')
      .where({ id: payload.sub })
      .select('id', 'email', 'full_name', 'ip_whitelist')
      .first();

    if (!admin) {
      throw new AuthError('Admin account not found');
    }

    // 5. Check IP whitelist
    const whitelist: string[] = admin.ip_whitelist ?? [];
    if (whitelist.length > 0) {
      const clientIp = req.ip ?? req.socket.remoteAddress ?? '';
      const normalizedIp = clientIp.replace('::ffff:', ''); // strip IPv6 prefix

      if (!whitelist.includes(normalizedIp) && !whitelist.includes(clientIp)) {
        throw new ForbiddenError(`IP ${normalizedIp} is not whitelisted`);
      }
    }

    // 6. Attach admin to request
    req.superAdmin = {
      id: admin.id,
      email: admin.email,
      full_name: admin.full_name,
    };

    next();
  } catch (err) {
    next(err);
  }
}
