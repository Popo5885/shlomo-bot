/**
 * Client Login Route
 *
 * Public (unauthenticated) endpoint for workspace members to log in.
 * Returns a JWT + member context + workspace context for the frontend.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { db } from '../config/database.js';
import { AuthError, AppError } from '../utils/errors.js';
import {
  sendWelcomeEmail,
  sendOwnerNewSignupNotification,
  sendPasswordResetEmail,
  sendPendingApprovalEmail,
} from '../services/email/emailService.js';

export const clientLoginRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  workspace_slug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  full_name: z.string().min(1),
});

const signupSchema = z.object({
  full_name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().min(7).max(20),
  password: z.string().min(6),
});

// POST /api/client/signup — create a brand-new workspace (self-service onboarding)
clientLoginRouter.post(
  '/signup',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { business_name, full_name, email, phone, password } = signupSchema.parse(req.body);

      // Check if email is already used across any workspace
      const existing = await db('workspace_members').where({ email }).first();
      if (existing) {
        throw new AppError('כתובת האימייל כבר רשומה במערכת', 409, 'EMAIL_EXISTS');
      }

      const slug = business_name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 40) + '-' + Date.now().toString(36);

      await db.transaction(async (trx) => {
        // Create workspace with status='pending'
        const [workspace] = await trx('workspaces').insert({
          name: business_name,
          slug,
          plan: 'trial',
          owner_email: email,       // ← required NOT NULL column
          is_active: true,
          status: 'pending',
          contact_phone: phone,
          contract_signed: false,
        }).returning('id');

        // Create default roles for the workspace
        const [ownerRole] = await trx('workspace_roles').insert({
          workspace_id: workspace.id,
          name: 'Owner',
          slug: 'owner',
          can_send_free: true,
          requires_approval: false,
          can_approve_messages: true,
          can_global_delete: true,
          can_manage_campaigns: true,
          can_manage_members: true,
          can_manage_destinations: true,
          can_view_analytics: true,
          can_manage_crm: true,
          can_manage_bot_settings: true,
        }).returning('id');

        await trx('workspace_roles').insert([
          { workspace_id: workspace.id, name: 'Viewer', slug: 'viewer' },
        ]);

        const password_hash = await bcrypt.hash(password, 12);

        // Create owner member (active so they can log in and see pending screen)
        await trx('workspace_members').insert({
          workspace_id: workspace.id,
          email,
          full_name,
          password_hash,
          role_id: ownerRole.id,
          is_owner: true,
          is_active: true,
          approval_status: 'approved',
        });
      });

      // Send emails (fire-and-forget — don't block the response)
      sendWelcomeEmail({ to: email, fullName: full_name, businessName: business_name }).catch(() => {});
      sendOwnerNewSignupNotification({ fullName: full_name, businessName: business_name, email, phone }).catch(() => {});
      sendPendingApprovalEmail({ to: email, fullName: full_name }).catch(() => {});

      res.status(201).json({
        success: true,
        message: 'החשבון נוצר בהצלחה. ממתין לאישור מנהל.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/client/register — request to join a workspace
clientLoginRouter.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { workspace_slug, email, password, full_name } = registerSchema.parse(req.body);

      // Find workspace by slug
      const workspace = await db('workspaces')
        .where({ slug: workspace_slug, is_active: true })
        .first();

      if (!workspace) {
        throw new AppError('Workspace not found', 404, 'WORKSPACE_NOT_FOUND');
      }

      // Check if member already exists in this workspace
      const existing = await db('workspace_members')
        .where({ workspace_id: workspace.id, email })
        .first();

      if (existing) {
        throw new AppError('Email already registered in this workspace', 409, 'MEMBER_EXISTS');
      }

      // Find the default 'viewer' role for this workspace
      const viewerRole = await db('workspace_roles')
        .where({ workspace_id: workspace.id, slug: 'viewer' })
        .first();

      // Hash password
      const password_hash = await bcrypt.hash(password, 12);

      // Create member with pending approval
      await db('workspace_members').insert({
        workspace_id: workspace.id,
        email,
        full_name,
        password_hash,
        role_id: viewerRole?.id ?? null,
        is_owner: false,
        is_active: false,
        approval_status: 'pending',
      });

      res.status(201).json({
        success: true,
        message: 'הבקשה נשלחה, ממתין לאישור מנהל',
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/client/login — authenticate a workspace member
clientLoginRouter.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      // Find member + workspace + role in a single query
      const member = await db('workspace_members as m')
        .join('workspaces as w', 'w.id', 'm.workspace_id')
        .leftJoin('workspace_roles as r', 'r.id', 'm.role_id')
        .where('m.email', email)
        .where('m.is_active', true)
        .where('w.is_active', true)
        .select(
          'm.id',
          'm.email',
          'm.full_name',
          'm.password_hash',
          'm.is_owner',
          'm.workspace_id',
          'm.approval_status',
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
          'w.id as ws_id',
          'w.name as ws_name',
          'w.slug as ws_slug',
          'w.plan as ws_plan',
          'w.plan_limits as ws_plan_limits',
          'w.is_active as ws_active',
          'w.status as ws_status',
          'w.contract_signed as ws_contract_signed',
          'w.contract_signed_at as ws_contract_signed_at',
          'w.contract_version as ws_contract_version',
          'w.contract_document_url as ws_contract_document_url',
          'w.contract_revoked_at as ws_contract_revoked_at'
        )
        .first();

      if (!member) {
        // Check if the member exists but is pending approval
        const pendingMember = await db('workspace_members as m')
          .join('workspaces as w', 'w.id', 'm.workspace_id')
          .where('m.email', email)
          .where('m.approval_status', 'pending')
          .where('w.is_active', true)
          .first();

        if (pendingMember) {
          throw new AuthError('החשבון ממתין לאישור מנהל');
        }

        // Check if this email exists at all (even in an inactive workspace)
        const anyMember = await db('workspace_members').where({ email }).first();
        if (!anyMember) {
          // Return a distinct code so the frontend can offer a "register" CTA
          res.status(401).json({ success: false, message: 'החשבון לא נמצא במערכת', code: 'ACCOUNT_NOT_FOUND' });
          return;
        }

        throw new AuthError('Invalid email or password');
      }

      // Check approval status
      if (member.approval_status === 'pending') {
        throw new AuthError('החשבון ממתין לאישור מנהל');
      }

      // Verify password
      if (!member.password_hash) {
        throw new AuthError('Account has no password set — contact your workspace admin');
      }

      const passwordValid = await bcrypt.compare(password, member.password_hash);
      if (!passwordValid) {
        throw new AuthError('Invalid email or password');
      }

      // Update last_login_at
      await db('workspace_members')
        .where('id', member.id)
        .update({ last_login_at: db.fn.now() });

      // Build JWT
      const token = jwt.sign(
        {
          sub: member.id,
          workspace_id: member.workspace_id,
          role_slug: member.role_slug ?? 'viewer',
        },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
      );

      // Build permissions (owner bypasses all)
      const permissions = {
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
      };

      res.json({
        success: true,
        data: {
          token,
          member: {
            id: member.id,
            email: member.email,
            full_name: member.full_name,
            is_owner: member.is_owner,
            role_slug: member.role_slug ?? 'viewer',
            permissions,
          },
          workspace: {
            id: member.ws_id,
            name: member.ws_name,
            slug: member.ws_slug,
            plan: member.ws_plan,
            plan_limits: member.ws_plan_limits ?? {},
            is_active: member.ws_active,
            status: member.ws_status ?? 'active',
            contract_signed: member.ws_contract_signed ?? false,
            contract_signed_at: member.ws_contract_signed_at ?? null,
            contract_version: member.ws_contract_version ?? null,
            contract_document_url: member.ws_contract_document_url ?? null,
            contract_revoked_at: member.ws_contract_revoked_at ?? null,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/client/forgot-password — send password reset email
clientLoginRouter.post(
  '/forgot-password',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);

      const member = await db('workspace_members').where({ email: email.toLowerCase() }).first();

      // Always return 200 to prevent email enumeration
      if (!member) {
        res.json({ success: true, message: 'אם הכתובת קיימת, נשלח אליה קישור לאיפוס סיסמה.' });
        return;
      }

      const resetToken = jwt.sign(
        { sub: member.id, purpose: 'password_reset' },
        env.JWT_SECRET,
        { expiresIn: '15m' } as jwt.SignOptions
      );

      sendPasswordResetEmail({ to: email, fullName: member.full_name, resetToken }).catch(() => {});

      res.json({ success: true, message: 'אם הכתובת קיימת, נשלח אליה קישור לאיפוס סיסמה.' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/client/reset-password — verify JWT token and set new password
clientLoginRouter.post(
  '/reset-password',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, password } = z.object({
        token: z.string().min(1),
        password: z.string().min(6),
      }).parse(req.body);

      let payload: { sub: string; purpose: string };
      try {
        payload = jwt.verify(token, env.JWT_SECRET) as typeof payload;
      } catch {
        throw new AppError('הקישור אינו תקין או שפג תוקפו', 400, 'INVALID_TOKEN');
      }

      if (payload.purpose !== 'password_reset') {
        throw new AppError('טוקן לא תקין', 400, 'INVALID_TOKEN');
      }

      const password_hash = await bcrypt.hash(password, 12);
      const updated = await db('workspace_members')
        .where({ id: payload.sub })
        .update({ password_hash });

      if (!updated) {
        throw new AppError('המשתמש לא נמצא', 404, 'NOT_FOUND');
      }

      res.json({ success: true, message: 'הסיסמה עודכנה בהצלחה.' });
    } catch (err) {
      next(err);
    }
  }
);
