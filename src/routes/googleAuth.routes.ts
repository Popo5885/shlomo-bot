/**
 * Google OAuth2 Login / Sign-up
 *
 * Flow:
 *  1. Frontend redirects to GET /api/auth/google  (or opens popup)
 *  2. Google redirects back to GET /api/auth/google/callback
 *  3. We upsert the workspace member, mint a JWT, redirect to /auth/google/success?token=...
 *  4. Frontend page reads the token from the URL and stores it in the auth store
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';

export const googleAuthRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3001').split(',')[0].trim();

function frontendUrl() { return FRONTEND_URL; }

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: `${API_BASE}/api/auth/google/callback`,
        scope: ['profile', 'email'],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(new Error('No email from Google'));

          const fullName = profile.displayName || profile.emails?.[0]?.value || 'משתמש';

          // Check if member exists
          let member = await db('workspace_members as m')
            .join('workspaces as w', 'w.id', 'm.workspace_id')
            .leftJoin('workspace_roles as r', 'r.id', 'm.role_id')
            .where('m.email', email)
            .where('m.is_active', true)
            .where('w.is_active', true)
            .select(
              'm.id', 'm.email', 'm.full_name', 'm.is_owner', 'm.workspace_id', 'm.approval_status',
              'r.slug as role_slug',
              'r.can_send_free', 'r.requires_approval', 'r.can_approve_messages',
              'r.can_global_delete', 'r.can_manage_campaigns', 'r.can_manage_members',
              'r.can_manage_destinations', 'r.can_view_analytics', 'r.can_manage_crm',
              'r.can_manage_bot_settings',
              'w.id as ws_id', 'w.name as ws_name', 'w.slug as ws_slug', 'w.plan as ws_plan',
              'w.plan_limits as ws_plan_limits', 'w.is_active as ws_active',
              'w.status as ws_status', 'w.contract_signed as ws_contract_signed',
              'w.contract_signed_at as ws_contract_signed_at',
              'w.contract_version as ws_contract_version',
              'w.contract_document_url as ws_contract_document_url',
              'w.contract_revoked_at as ws_contract_revoked_at',
            )
            .first();

          if (!member) {
            // No existing member — this is a new sign-up via Google
            // Create workspace + owner member (same as /signup but with google_id)
            const slug = email.split('@')[0].replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString(36);
            const businessName = fullName;

            await db.transaction(async (trx) => {
              const [workspace] = await trx('workspaces').insert({
                name: businessName,
                slug,
                plan: 'trial',
                owner_email: email,
                is_active: true,
                status: 'pending',
                contact_phone: '',
                contract_signed: false,
              }).returning('id');

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

              await trx('workspace_roles').insert([{ workspace_id: workspace.id, name: 'Viewer', slug: 'viewer' }]);

              await trx('workspace_members').insert({
                workspace_id: workspace.id,
                email,
                full_name: fullName,
                password_hash: null, // Google auth — no password
                role_id: ownerRole.id,
                is_owner: true,
                is_active: true,
                approval_status: 'approved',
                google_id: profile.id,
              });
            });

            // Reload after insert
            member = await db('workspace_members as m')
              .join('workspaces as w', 'w.id', 'm.workspace_id')
              .leftJoin('workspace_roles as r', 'r.id', 'm.role_id')
              .where('m.email', email)
              .where('m.is_active', true)
              .select(
                'm.id', 'm.email', 'm.full_name', 'm.is_owner', 'm.workspace_id', 'm.approval_status',
                'r.slug as role_slug',
                'r.can_send_free', 'r.requires_approval', 'r.can_approve_messages',
                'r.can_global_delete', 'r.can_manage_campaigns', 'r.can_manage_members',
                'r.can_manage_destinations', 'r.can_view_analytics', 'r.can_manage_crm',
                'r.can_manage_bot_settings',
                'w.id as ws_id', 'w.name as ws_name', 'w.slug as ws_slug', 'w.plan as ws_plan',
                'w.plan_limits as ws_plan_limits', 'w.is_active as ws_active',
                'w.status as ws_status', 'w.contract_signed as ws_contract_signed',
                'w.contract_signed_at as ws_contract_signed_at',
                'w.contract_version as ws_contract_version',
                'w.contract_document_url as ws_contract_document_url',
                'w.contract_revoked_at as ws_contract_revoked_at',
              )
              .first();
          } else {
            // Existing member — save google_id if not yet set
            await db('workspace_members').where({ id: member.id }).update({ google_id: profile.id, last_login_at: db.fn.now() });
          }

          if (!member) return done(new Error('Failed to load member after upsert'));
          return done(null, member);
        } catch (err) {
          logger.error('Google OAuth error:', err);
          return done(err as Error);
        }
      }
    )
  );
} else {
  logger.warn('Google OAuth not configured — GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing');
}

// GET /api/auth/google — redirect to Google
googleAuthRouter.get(
  '/google',
  passport.authenticate('google', { session: false, scope: ['profile', 'email'] })
);

// GET /api/auth/google/callback — Google redirects here
googleAuthRouter.get(
  '/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('google', { session: false }, (err: Error | null, member: Record<string, unknown> | false) => {
      if (err || !member) {
        logger.error('Google callback error:', err);
        return res.redirect(`${frontendUrl()}/login?error=google_failed`);
      }

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

      const sessionPayload = {
        token: jwt.sign(
          { sub: member.id, workspace_id: member.workspace_id, role_slug: member.role_slug ?? 'viewer' },
          env.JWT_SECRET,
          { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions
        ),
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
      };

      const encoded = encodeURIComponent(JSON.stringify(sessionPayload));
      return res.redirect(`${frontendUrl()}/auth/google/success?session=${encoded}`);
    })(req, res, next);
  }
);
