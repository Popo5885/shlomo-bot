/**
 * Email Admin Routes
 *
 * Requires super-admin auth.
 * Handles: template CRUD, newsletter dispatch, email log, unsubscribe mgmt,
 *          per-member notification toggle.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { superAdminAuth } from '../middleware/superAdminAuth.js';
import { db } from '../config/database.js';
import { sendNewsletterEmail, addUnsubscribe, removeUnsubscribe } from '../services/email/emailService.js';
import { NotFoundError, AppError } from '../utils/errors.js';

export const emailAdminRouter = Router();
emailAdminRouter.use(superAdminAuth);

// ══════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ══════════════════════════════════════════════════════════════

emailAdminRouter.get(
  '/email-templates',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const templates = await db('email_templates').orderBy('name');
      res.json({ success: true, data: templates });
    } catch (err) { next(err); }
  }
);

emailAdminRouter.get(
  '/email-templates/:name',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tmpl = await db('email_templates').where({ name: req.params.name }).first();
      if (!tmpl) throw new NotFoundError('Template not found');
      res.json({ success: true, data: tmpl });
    } catch (err) { next(err); }
  }
);

const templateUpdateSchema = z.object({
  subject:    z.string().min(1).max(998).optional(),
  body_html:  z.string().min(1).optional(),
  is_active:  z.boolean().optional(),
});

emailAdminRouter.put(
  '/email-templates/:name',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = templateUpdateSchema.parse(req.body);
      const [updated] = await db('email_templates')
        .where({ name: req.params.name })
        .update({ ...body, updated_at: db.fn.now() })
        .returning('*');
      if (!updated) throw new NotFoundError('Template not found');
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  NEWSLETTER SEND
// ══════════════════════════════════════════════════════════════

const newsletterSchema = z.object({
  subject:      z.string().min(1).max(998),
  content:      z.string().min(1),
  workspace_ids: z.array(z.string().uuid()).optional(), // undefined = all active
});

emailAdminRouter.post(
  '/newsletter',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = newsletterSchema.parse(req.body);

      // Build recipient list
      let query = db('workspace_members')
        .join('workspaces', 'workspaces.id', 'workspace_members.workspace_id')
        .where('workspace_members.is_active', true)
        .where('workspaces.status', 'active')
        .where('workspace_members.email_notifications_enabled', true)
        .whereNotNull('workspace_members.email')
        .select('workspace_members.email', 'workspace_members.workspace_id');

      if (body.workspace_ids?.length) {
        query = query.whereIn('workspace_members.workspace_id', body.workspace_ids);
      }

      const members = await query;

      // Fire-and-forget all sends (don't await individually to avoid timeout)
      let sent = 0;
      const promises = members.map(async (m: { email: string; workspace_id: string }) => {
        await sendNewsletterEmail({
          to: m.email,
          subject: body.subject,
          content: body.content,
          workspaceId: m.workspace_id,
        });
        sent++;
      });

      // Wait but don't crash the response if one fails
      await Promise.allSettled(promises);

      res.json({ success: true, data: { total: members.length, sent } });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  EMAIL LOG
// ══════════════════════════════════════════════════════════════

emailAdminRouter.get(
  '/email-log',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page  = Math.max(1, Number(req.query.page)  || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = (page - 1) * limit;

      let query = db('email_log').orderBy('sent_at', 'desc');

      if (req.query.status)        query = query.where('status', req.query.status as string);
      if (req.query.template_name) query = query.where('template_name', req.query.template_name as string);
      if (req.query.to_email)      query = query.whereILike('to_email', `%${req.query.to_email}%`);

      const [{ count }] = await query.clone().count('* as count');
      const rows = await query.limit(limit).offset(offset);

      res.json({ success: true, data: rows, total: Number(count), page, limit });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  UNSUBSCRIBE MANAGEMENT
// ══════════════════════════════════════════════════════════════

emailAdminRouter.get(
  '/email-unsubscribes',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page  = Math.max(1, Number(req.query.page)  || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const offset = (page - 1) * limit;

      const [{ count }] = await db('email_unsubscribes').count('* as count');
      const rows = await db('email_unsubscribes').orderBy('created_at', 'desc').limit(limit).offset(offset);

      res.json({ success: true, data: rows, total: Number(count), page, limit });
    } catch (err) { next(err); }
  }
);

emailAdminRouter.delete(
  '/email-unsubscribes/:email',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await removeUnsubscribe(decodeURIComponent(req.params.email as string));
      res.json({ success: true });
    } catch (err) { next(err); }
  }
);

// Manually add an email to the unsubscribe list
emailAdminRouter.post(
  '/email-unsubscribes',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      await addUnsubscribe(email);
      res.json({ success: true });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  PER-MEMBER NOTIFICATION TOGGLE
// ══════════════════════════════════════════════════════════════

emailAdminRouter.patch(
  '/members/:id/toggle-notifications',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
      const [member] = await db('workspace_members')
        .where({ id: req.params.id })
        .update({ email_notifications_enabled: enabled })
        .returning('id, email, email_notifications_enabled');
      if (!member) throw new NotFoundError('Member not found');
      res.json({ success: true, data: member });
    } catch (err) { next(err); }
  }
);
