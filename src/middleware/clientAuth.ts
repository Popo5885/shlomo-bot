/**
 * Client Authentication Middleware
 *
 * Verifies JWT issued to workspace members and enforces tenant isolation.
 * Every DB query in client routes MUST filter by req.workspace.id.
 *
 * JWT payload: { sub: member.id, workspace_id, role_slug, iat, exp }
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { db } from '../config/database.js';
import { AuthError, ForbiddenError } from '../utils/errors.js';

interface ClientTokenPayload {
  sub: string;         // workspace_member.id
  workspace_id: string;
  role_slug: string;
  iat: number;
  exp: number;
}

interface WorkspaceMemberContext {
  id: string;
  email: string;
  full_name: string | null;
  is_owner: boolean;
  role_slug: string;
  permissions: {
    can_send_free: boolean;
    requires_approval: boolean;
    can_approve_messages: boolean;
    can_global_delete: boolean;
    can_manage_campaigns: boolean;
    can_manage_members: boolean;
    can_manage_destinations: boolean;
    can_view_analytics: boolean;
    can_manage_crm: boolean;
    can_manage_bot_settings: boolean;
  };
}

interface WorkspaceContext {
  id: string;
  name: string;
  slug: string;
  plan: string;
  plan_limits: Record<string, unknown>;
  is_active: boolean;
}

declare global {
  namespace Express {
    interface Request {
      member?: WorkspaceMemberContext;
      workspace?: WorkspaceContext;
    }
  }
}

/**
 * Main client auth middleware.
 * Attaches req.member and req.workspace to the request.
 */
export async function clientAuth(
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
    let payload: ClientTokenPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as ClientTokenPayload;
    } catch {
      throw new AuthError('Invalid or expired token');
    }

    // 3. Reject super_admin tokens (they should use /api/admin routes)
    if ((payload as any).role === 'super_admin') {
      throw new ForbiddenError('Use /api/admin routes for super admin access');
    }

    // 4. Load member + role + workspace in a single query
    const member = await db('workspace_members as m')
      .join('workspaces as w', 'w.id', 'm.workspace_id')
      .leftJoin('workspace_roles as r', 'r.id', 'm.role_id')
      .where('m.id', payload.sub)
      .where('m.workspace_id', payload.workspace_id)
      .where('m.is_active', true)
      .select(
        'm.id',
        'm.email',
        'm.full_name',
        'm.is_owner',
        'r.slug as role_slug',
        'r.can_send_free',
        'r.requires_approval',
        'r.can_approve_messages',
        'r.can_global_delete',
        'r.can_manage_campaigns',
        'r.can_manage_members',
        'r.can_manage_destinations',
        'r.can_view_analytics',
        'r.can_manage_crm',
        'r.can_manage_bot_settings',
        'w.id as workspace_id',
        'w.name as workspace_name',
        'w.slug as workspace_slug',
        'w.plan as workspace_plan',
        'w.plan_limits',
        'w.is_active as workspace_active'
      )
      .first();

    if (!member) {
      throw new AuthError('Member not found or deactivated');
    }

    if (!member.workspace_active) {
      throw new ForbiddenError('Workspace is suspended');
    }

    // 5. Attach context to request — all downstream handlers use this
    req.member = {
      id: member.id,
      email: member.email,
      full_name: member.full_name,
      is_owner: member.is_owner,
      role_slug: member.role_slug ?? 'viewer',
      permissions: {
        can_send_free: member.is_owner || member.can_send_free || false,
        requires_approval: member.is_owner ? false : (member.requires_approval ?? true),
        can_approve_messages: member.is_owner || member.can_approve_messages || false,
        can_global_delete: member.is_owner || member.can_global_delete || false,
        can_manage_campaigns: member.is_owner || member.can_manage_campaigns || false,
        can_manage_members: member.is_owner || member.can_manage_members || false,
        can_manage_destinations: member.is_owner || member.can_manage_destinations || false,
        can_view_analytics: member.is_owner || member.can_view_analytics || false,
        can_manage_crm: member.is_owner || member.can_manage_crm || false,
        can_manage_bot_settings: member.is_owner || member.can_manage_bot_settings || false,
      },
    };

    req.workspace = {
      id: member.workspace_id,
      name: member.workspace_name,
      slug: member.workspace_slug,
      plan: member.workspace_plan,
      plan_limits: member.plan_limits ?? {},
      is_active: member.workspace_active,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Permission check middleware factory.
 * Usage: router.post('/campaigns', requirePermission('can_manage_campaigns'), handler)
 */
export function requirePermission(
  permission: keyof WorkspaceMemberContext['permissions']
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.member) {
      next(new AuthError());
      return;
    }
    if (!req.member.permissions[permission]) {
      next(new ForbiddenError(`Missing permission: ${permission}`));
      return;
    }
    next();
  };
}
