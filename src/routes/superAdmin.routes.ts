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
import {
  sendApprovalEmail,
  sendRejectionEmail,
  sendReceiptEmail,
  sendAccountApprovedEmail,
} from '../services/email/emailService.js';

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
      // Load member + workspace before updating (for email)
      const member = await db('workspace_members as m')
        .join('workspaces as w', 'w.id', 'm.workspace_id')
        .where('m.id', req.params.id)
        .where('m.approval_status', 'pending')
        .select('m.email', 'm.full_name', 'w.name as workspace_name')
        .first();

      if (!member) throw new NotFoundError('Pending member not found');

      await db('workspace_members')
        .where({ id: req.params.id })
        .update({ approval_status: 'approved', is_active: true });

      // Also activate the workspace if this is an owner approval
      await db('workspace_members as m')
        .join('workspaces as w', 'w.id', 'm.workspace_id')
        .where('m.id', req.params.id)
        .where('m.is_owner', true)
        .update({ 'w.status': 'active' });

      // Send approval email (fire-and-forget)
      sendApprovalEmail({
        to: member.email,
        fullName: member.full_name || member.email,
        workspaceName: member.workspace_name,
      }).catch(() => {});

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
      // Load member before updating (for email)
      const member = await db('workspace_members')
        .where({ id: req.params.id, approval_status: 'pending' })
        .select('email', 'full_name')
        .first();

      if (!member) throw new NotFoundError('Pending member not found');

      await db('workspace_members')
        .where({ id: req.params.id })
        .update({ approval_status: 'rejected' });

      // Send rejection email (fire-and-forget)
      sendRejectionEmail({
        to: member.email,
        fullName: member.full_name || member.email,
        reason: (req.body as any)?.reason ?? undefined,
      }).catch(() => {});

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

// ══════════════════════════════════════════════════════════════
//  WORKSPACE CRM (GroupPulse)
// ══════════════════════════════════════════════════════════════

// GET /workspaces-crm — full CRM list with status filter + contract info
superAdminRouter.get(
  '/workspaces-crm',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Number(req.query.limit) || 25);

      let query = db('workspaces as w')
        .leftJoin(
          db('workspace_members').where({ is_owner: true }).select('workspace_id', 'email', 'full_name').as('owner'),
          'owner.workspace_id', 'w.id'
        )
        .select(
          'w.id', 'w.name', 'w.slug', 'w.plan', 'w.status', 'w.is_active',
          'w.contact_phone', 'w.created_at',
          'w.contract_signed', 'w.contract_signed_at', 'w.contract_version', 'w.contract_revoked_at',
          'owner.email as owner_email', 'owner.full_name as owner_name'
        )
        .orderBy('w.created_at', 'desc');

      if (req.query.status) query = query.where('w.status', req.query.status as string);
      if (req.query.search) {
        const s = `%${req.query.search}%`;
        query = query.where(function() {
          this.whereLike('w.name', s).orWhereLike('owner.email', s).orWhereLike('w.contact_phone', s);
        });
      }

      const total = await db('workspaces').count('* as count').first();
      const workspaces = await query.limit(limit).offset((page - 1) * limit);

      res.json({ success: true, data: workspaces, total: Number(total?.count ?? 0) });
    } catch (err) { next(err); }
  }
);

// GET /workspaces-crm/:id — single workspace detail
superAdminRouter.get(
  '/workspaces-crm/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspace = await db('workspaces as w')
        .leftJoin(
          db('workspace_members').where({ is_owner: true }).select('workspace_id', 'email', 'full_name', 'id as member_id').as('owner'),
          'owner.workspace_id', 'w.id'
        )
        .where('w.id', req.params.id as string)
        .select('w.*', 'owner.email as owner_email', 'owner.full_name as owner_name', 'owner.member_id')
        .first();

      if (!workspace) throw new NotFoundError('Workspace not found');

      const [connectedAccounts, invoices, members] = await Promise.all([
        db('connected_accounts').where({ workspace_id: workspace.id }).select('id', 'platform', 'display_name', 'is_connected', 'connection_status', 'connection_token'),
        db('invoices').where({ workspace_id: workspace.id }).select('id', 'invoice_number', 'amount', 'currency', 'status', 'description', 'issued_at').orderBy('issued_at', 'desc'),
        db('workspace_members').where({ workspace_id: workspace.id })
          .select('id', 'email', 'full_name', 'is_owner', 'is_active', 'email_notifications_enabled', 'approval_status')
          .orderBy('is_owner', 'desc'),
      ]);

      res.json({ success: true, data: { ...workspace, connected_accounts: connectedAccounts, invoices, members } });
    } catch (err) { next(err); }
  }
);

// PATCH /workspaces-crm/:id/status — activate / suspend / set pending
superAdminRouter.patch(
  '/workspaces-crm/:id/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ status: z.enum(['pending', 'active', 'suspended']) });
      const { status } = schema.parse(req.body);
      const updated = await db('workspaces').where({ id: req.params.id as string }).update({ status, updated_at: db.fn.now() });
      if (!updated) throw new NotFoundError('Workspace not found');

      // Notify owner when workspace transitions to active
      if (status === 'active') {
        const owner = await db('workspace_members')
          .where({ workspace_id: req.params.id as string, is_owner: true })
          .select('email', 'full_name')
          .first();
        if (owner) {
          sendAccountApprovedEmail({ to: owner.email, fullName: owner.full_name, workspaceId: req.params.id as string }).catch(() => {});
        }
      }

      res.json({ success: true, message: `Workspace status set to ${status}` });
    } catch (err) { next(err); }
  }
);

// PATCH /workspaces-crm/:id/contract — assign a contract URL or revoke
superAdminRouter.patch(
  '/workspaces-crm/:id/contract',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        action: z.enum(['assign', 'revoke']),
        contract_document_url: z.string().url().optional(),
        contract_version: z.string().optional(),
        revoke_reason: z.string().optional(),
      });
      const body = schema.parse(req.body);

      if (body.action === 'assign') {
        await db('workspaces').where({ id: req.params.id as string }).update({
          contract_document_url: body.contract_document_url ?? null,
          contract_version: body.contract_version ?? null,
          contract_revoked_at: null,
          contract_revoked_reason: null,
          updated_at: db.fn.now(),
        });
        res.json({ success: true, message: 'Contract assigned. User must re-sign.' });
      } else {
        // Revoke: immediately lock the user out until they re-sign
        await db('workspaces').where({ id: req.params.id as string }).update({
          contract_signed: false,
          contract_revoked_at: db.fn.now(),
          contract_revoked_reason: body.revoke_reason ?? 'Revoked by admin',
          updated_at: db.fn.now(),
        });
        res.json({ success: true, message: 'Contract revoked. User is locked out until re-signing.' });
      }
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  INVOICE MANAGEMENT (Admin uploads PDFs)
// ══════════════════════════════════════════════════════════════

import multer from 'multer';
import path from 'path';
import fs from 'fs';

const invoiceUploadDir = path.resolve('data/invoices');
if (!fs.existsSync(invoiceUploadDir)) fs.mkdirSync(invoiceUploadDir, { recursive: true });

const invoiceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, invoiceUploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});
const invoiceUpload = multer({ storage: invoiceStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  cb(null, file.mimetype === 'application/pdf');
}});

// POST /invoices/:workspaceId — upload a PDF invoice for a workspace
superAdminRouter.post(
  '/invoices/:workspaceId',
  invoiceUpload.single('pdf'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspace = await db('workspaces').where({ id: req.params.workspaceId as string }).first();
      if (!workspace) throw new NotFoundError('Workspace not found');
      if (!req.file) throw new AppError('No PDF file uploaded', 400, 'NO_FILE');

      const schema = z.object({
        invoice_number: z.string().min(1),
        amount: z.string().transform(Number),
        currency: z.string().length(3).default('ILS'),
        description: z.string().optional(),
      });
      const body = schema.parse(req.body);

      const [invoice] = await db('invoices').insert({
        workspace_id: workspace.id,
        invoice_number: body.invoice_number,
        amount: body.amount,
        currency: body.currency,
        description: body.description,
        file_path: req.file.path,
        uploaded_by: req.superAdmin!.email,
        status: 'paid',
      }).returning('*');

      // Send receipt email to workspace owner
      const owner = await db('workspace_members')
        .where({ workspace_id: workspace.id, is_owner: true })
        .whereNotNull('email')
        .first('email', 'full_name');
      if (owner?.email) {
        const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:3001').split(',')[0].trim();
        const downloadUrl = `${baseUrl.replace('3001', '3000')}/api/admin/invoices/${invoice.id}/download`;
        sendReceiptEmail({
          to: owner.email,
          invoiceNumber: invoice.invoice_number,
          description: invoice.description || 'שירותי GroupPulse',
          amount: invoice.amount,
          currency: invoice.currency,
          issuedAt: invoice.issued_at || new Date().toISOString(),
          downloadUrl,
          workspaceId: workspace.id,
        }).catch(() => {}); // fire-and-forget
      }

      res.status(201).json({ success: true, data: invoice });
    } catch (err) { next(err); }
  }
);

// GET /invoices/:id/download — serve the PDF
superAdminRouter.get(
  '/invoices/:id/download',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoice = await db('invoices').where({ id: req.params.id as string }).first();
      if (!invoice) throw new NotFoundError('Invoice not found');
      if (!invoice.file_path || !fs.existsSync(invoice.file_path)) throw new AppError('File not found', 404, 'FILE_MISSING');
      res.download(path.resolve(invoice.file_path), `invoice-${invoice.invoice_number}.pdf`);
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  ADMIN SETTINGS (contract template, site config)
// ══════════════════════════════════════════════════════════════

superAdminRouter.get(
  '/settings',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db('admin_settings').select('key', 'value', 'updated_at');
      const settings: Record<string, string> = {};
      for (const r of rows) settings[r.key] = r.value;
      res.json({ success: true, data: settings });
    } catch (err) { next(err); }
  }
);

superAdminRouter.patch(
  '/settings',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.record(z.string());
      const updates = schema.parse(req.body);

      for (const [key, value] of Object.entries(updates)) {
        await db('admin_settings')
          .insert({ key, value, updated_at: db.fn.now() })
          .onConflict('key')
          .merge({ value, updated_at: db.fn.now() });
      }

      res.json({ success: true, message: 'Settings updated' });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  ADMIN AI ASSISTANT (Claude API)
// ══════════════════════════════════════════════════════════════

superAdminRouter.post(
  '/ai/chat',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ message: z.string().min(1).max(2000) });
      const { message } = schema.parse(req.body);

      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const systemPrompt = `אתה עוזר אדמין חכם של פלטפורמת GroupPulse - SaaS לניהול קבוצות WhatsApp.
יש לך גישה לנתוני מסד הנתונים הבאים:

טבלאות עיקריות:
- workspaces (id, name, slug, plan, status, is_active, contact_phone, created_at, contract_signed, contract_signed_at)
- workspace_members (id, workspace_id, email, full_name, is_owner, is_active, approval_status, created_at, last_login_at)
- connected_accounts (id, workspace_id, platform, display_name, is_connected, connection_status, created_at)
- invoices (id, workspace_id, invoice_number, amount, currency, status, issued_at, description)
- message_dispatches (id, workspace_id, is_success, sent_at, views_count)
- distribution_rules (id, workspace_id, name, is_active, total_dispatched, total_failed)

ענה בעברית, בצורה ברורה ותמציתית.
אם שואלים על נתונים ספציפיים, ענה שאתה יכול לעזור לנסח שאילתות SQL לבירור.
אם מבקשים לנסח הודעה (ברכה, מעקב), צור אותה בסגנון מקצועי וחם.`;

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      res.json({ success: true, data: { reply: text } });
    } catch (err) { next(err); }
  }
);

// Import db for inline queries
import { db } from '../config/database.js';
import { AppError } from '../utils/errors.js';
