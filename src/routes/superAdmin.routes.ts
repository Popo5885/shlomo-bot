/**
 * Super Admin API Routes
 *
 * All routes protected by superAdminAuth middleware.
 * Provides access to system logs, health metrics, and queue status.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { superAdminAuth } from '../middleware/superAdminAuth.js';
import { loginSuperAdmin } from '../services/admin/authService.js';
import {
  queryErrorLogs,
  getErrorLogById,
  resolveErrorLog,
  queryApiLogs,
  getHealthOverview,
  getQueueDetails,
  getWorkerDetails,
} from '../services/admin/logQueries.js';
import { NotFoundError } from '../utils/errors.js';

/** Safely extract a single string from Express query params */
function qs(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return undefined;
}

export const superAdminRouter = Router();

// ══════════════════════════════════════════════════════════════
//  Auth (no middleware — this IS the login)
// ══════════════════════════════════════════════════════════════

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfa_code: z.string().length(6).optional(),
});

superAdminRouter.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = loginSchema.parse(req.body);
      const result = await loginSuperAdmin(body.email, body.password, body.mfa_code);

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// ══════════════════════════════════════════════════════════════
//  All routes below require super admin authentication
// ══════════════════════════════════════════════════════════════
superAdminRouter.use(superAdminAuth);

// ── Error Logs ──

superAdminRouter.get(
  '/errors',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await queryErrorLogs({
        severity: qs(req.query.severity),
        workspace_id: qs(req.query.workspace_id),
        resolved: req.query.resolved !== undefined
          ? req.query.resolved === 'true'
          : undefined,
        source: qs(req.query.source),
        error_code: qs(req.query.error_code),
        from: qs(req.query.from),
        to: qs(req.query.to),
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

superAdminRouter.get(
  '/errors/:errorId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const error = await getErrorLogById(req.params.errorId as string);
      if (!error) throw new NotFoundError('Error log not found');

      res.json({ success: true, data: error });
    } catch (err) {
      next(err);
    }
  }
);

superAdminRouter.patch(
  '/errors/:errorId/resolve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await resolveErrorLog(req.params.errorId as string, req.superAdmin!.id);
      if (!updated) throw new NotFoundError('Error log not found');

      res.json({ success: true, message: 'Error marked as resolved' });
    } catch (err) {
      next(err);
    }
  }
);

// ── API Request Logs ──

superAdminRouter.get(
  '/api-logs',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await queryApiLogs({
        platform: qs(req.query.platform),
        workspace_id: qs(req.query.workspace_id),
        response_status: qs(req.query.response_status),
        is_rate_limited: req.query.is_rate_limited !== undefined
          ? req.query.is_rate_limited === 'true'
          : undefined,
        from: qs(req.query.from),
        to: qs(req.query.to),
        page: req.query.page ? Number(req.query.page) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

// ── Health & Queue Status ──

superAdminRouter.get(
  '/health/overview',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const overview = await getHealthOverview();
      res.json({ success: true, data: overview });
    } catch (err) {
      next(err);
    }
  }
);

superAdminRouter.get(
  '/health/queue',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const details = await getQueueDetails();
      res.json({ success: true, data: details });
    } catch (err) {
      next(err);
    }
  }
);

superAdminRouter.get(
  '/health/workers',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const details = await getWorkerDetails();
      res.json({ success: true, data: details });
    } catch (err) {
      next(err);
    }
  }
);

// ── Pending Members (Approval Flow) ──

superAdminRouter.get(
  '/pending-members',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

      const members = await db('workspace_members as m')
        .join('workspaces as w', 'w.id', 'm.workspace_id')
        .where('m.approval_status', 'pending')
        .select(
          'm.id', 'm.email', 'm.full_name', 'm.created_at',
          'w.id as workspace_id', 'w.name as workspace_name', 'w.slug as workspace_slug'
        )
        .orderBy('m.created_at', 'desc')
        .limit(limit)
        .offset((page - 1) * limit);

      res.json({ success: true, data: members });
    } catch (err) {
      next(err);
    }
  }
);

superAdminRouter.patch(
  '/members/:id/approve',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await db('workspace_members')
        .where({ id: req.params.id, approval_status: 'pending' })
        .update({ approval_status: 'approved', is_active: true });

      if (!updated) throw new NotFoundError('Pending member not found');

      res.json({ success: true, message: 'Member approved' });
    } catch (err) {
      next(err);
    }
  }
);

superAdminRouter.patch(
  '/members/:id/reject',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await db('workspace_members')
        .where({ id: req.params.id, approval_status: 'pending' })
        .update({ approval_status: 'rejected' });

      if (!updated) throw new NotFoundError('Pending member not found');

      res.json({ success: true, message: 'Member rejected' });
    } catch (err) {
      next(err);
    }
  }
);

// ── Workspaces Management ──

superAdminRouter.get(
  '/workspaces',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

      let query = db('workspaces').orderBy('created_at', 'desc');

      if (req.query.plan) {
        query = query.where('plan', req.query.plan);
      }
      if (req.query.is_active !== undefined) {
        query = query.where('is_active', req.query.is_active === 'true');
      }

      const workspaces = await query.limit(limit).offset((page - 1) * limit);
      res.json({ success: true, data: workspaces });
    } catch (err) {
      next(err);
    }
  }
);

superAdminRouter.patch(
  '/workspaces/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const allowedFields = ['is_active', 'plan', 'plan_limits'];
      const updates: Record<string, unknown> = {};

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ success: false, error: 'No valid fields to update' });
        return;
      }

      updates.updated_at = db.fn.now();
      const updated = await db('workspaces').where({ id: req.params.id }).update(updates);

      if (!updated) throw new NotFoundError('Workspace not found');
      res.json({ success: true, message: 'Workspace updated' });
    } catch (err) {
      next(err);
    }
  }
);

// ── Platform Status ──

superAdminRouter.get(
  '/platform-status',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const statuses = await db('platform_api_status').select('*');
      res.json({ success: true, data: statuses });
    } catch (err) {
      next(err);
    }
  }
);

// ══════════════════════════════════════════════════════════════
//  SYSTEM TEXTS / CMS
// ══════════════════════════════════════════════════════════════

// GET /system-texts — list all CMS texts
superAdminRouter.get(
  '/system-texts',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const texts = await db('system_texts').select('*').orderBy('category').orderBy('key');
      res.json({ success: true, data: texts });
    } catch (err) { next(err); }
  }
);

// PATCH /system-texts/:key — update a CMS text
superAdminRouter.patch(
  '/system-texts/:key',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ value: z.string() });
      const { value } = schema.parse(req.body);
      const key = req.params.key as string;

      const updated = await db('system_texts')
        .where({ key })
        .update({ value, updated_at: db.fn.now() });

      if (!updated) throw new NotFoundError(`System text "${key}" not found`);

      res.json({ success: true, message: `Updated "${key}"` });
    } catch (err) { next(err); }
  }
);

// POST /system-texts — create a new CMS text
superAdminRouter.post(
  '/system-texts',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        key: z.string().min(1).max(100),
        value: z.string(),
        category: z.string().min(1).max(50).default('general'),
        description: z.string().max(255).optional(),
      });
      const body = schema.parse(req.body);
      const [text] = await db('system_texts').insert(body).returning('*');
      res.status(201).json({ success: true, data: text });
    } catch (err) { next(err); }
  }
);

// DELETE /system-texts/:key — delete a CMS text
superAdminRouter.delete(
  '/system-texts/:key',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await db('system_texts').where({ key: req.params.key as string }).del();
      if (!deleted) throw new NotFoundError(`System text not found`);
      res.json({ success: true, message: 'Deleted' });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  FEATURE REQUESTS (AI Builder Admin)
// ══════════════════════════════════════════════════════════════

superAdminRouter.get(
  '/feature-requests',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

      const requests = await db('feature_requests as fr')
        .leftJoin('workspace_members as wm', 'wm.id', 'fr.requested_by')
        .leftJoin('workspaces as w', 'w.id', 'fr.workspace_id')
        .select(
          'fr.id', 'fr.title', 'fr.description', 'fr.status',
          'fr.admin_note', 'fr.created_at', 'fr.updated_at',
          'wm.email as requested_by_email', 'wm.full_name as requested_by_name',
          'w.name as workspace_name'
        )
        .orderBy('fr.created_at', 'desc')
        .limit(limit)
        .offset((page - 1) * limit);

      res.json({ success: true, data: requests });
    } catch (err) { next(err); }
  }
);

superAdminRouter.patch(
  '/feature-requests/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        status: z.enum(['pending', 'approved', 'rejected', 'completed']),
        admin_note: z.string().optional(),
      });
      const body = schema.parse(req.body);

      const updated = await db('feature_requests')
        .where({ id: req.params.id })
        .update({ ...body, updated_at: db.fn.now() });

      if (!updated) throw new NotFoundError('Feature request not found');
      res.json({ success: true, message: 'Feature request updated' });
    } catch (err) { next(err); }
  }
);

// Import db for inline queries
import { db } from '../config/database.js';
