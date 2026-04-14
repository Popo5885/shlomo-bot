/**
 * Client API Routes
 *
 * Endpoints for the tenant dashboard. All routes are protected by clientAuth
 * which enforces tenant isolation — every query filters by req.workspace.id.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { clientAuth, requirePermission } from '../middleware/clientAuth.js';
import { db } from '../config/database.js';
import { triggerCampaign, cancelCampaign } from '../services/triggers/campaignTrigger.js';
import { connectTelegramBot, disconnectTelegramBot, syncTelegramGroups } from '../services/telegram/telegramBot.js';
import { NotFoundError, AppError } from '../utils/errors.js';

export const clientRouter = Router();

// All client routes require authentication + tenant context
clientRouter.use(clientAuth);

// Helper: workspace-scoped query — EVERY query must use this
function wsQuery(req: Request, table: string) {
  return db(table).where(`${table}.workspace_id`, req.workspace!.id);
}

// ══════════════════════════════════════════════════════════════
//  CAMPAIGNS
// ══════════════════════════════════════════════════════════════

const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  message_text: z.string().optional(),
  media_url: z.string().url().optional(),
  media_type: z.enum(['image', 'video', 'document', 'audio']).optional(),
  append_suffix: z.string().optional(),
  scheduled_at: z.string().datetime().optional(),
  delay_preset: z.enum(['fast', 'medium', 'slow', 'custom']).default('medium'),
  delay_min_seconds: z.number().int().min(1).default(30),
  delay_max_seconds: z.number().int().min(1).default(60),
  requires_approval: z.boolean().default(false),
  target_destination_ids: z.array(z.string().uuid()).min(1),
});

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  message_text: z.string().optional(),
  media_url: z.string().url().nullable().optional(),
  media_type: z.enum(['image', 'video', 'document', 'audio']).nullable().optional(),
  append_suffix: z.string().nullable().optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
  delay_preset: z.enum(['fast', 'medium', 'slow', 'custom']).optional(),
  delay_min_seconds: z.number().int().min(1).optional(),
  delay_max_seconds: z.number().int().min(1).optional(),
});

// GET /campaigns — list all campaigns for this workspace
clientRouter.get(
  '/campaigns',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

      let query = wsQuery(req, 'campaigns').orderBy('created_at', 'desc');

      const status = req.query.status;
      if (typeof status === 'string') {
        query = query.where('status', status);
      }

      const campaigns = await query
        .select(
          'id', 'name', 'description', 'status',
          'message_text', 'media_type', 'scheduled_at',
          'delay_preset', 'total_targets', 'sent_count',
          'delivered_count', 'failed_count', 'success_rate',
          'created_at', 'updated_at'
        )
        .limit(limit)
        .offset((page - 1) * limit);

      res.json({ success: true, data: campaigns });
    } catch (err) {
      next(err);
    }
  }
);

// GET /campaigns/:id — single campaign detail
clientRouter.get(
  '/campaigns/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = await wsQuery(req, 'campaigns')
        .where('campaigns.id', req.params.id as string)
        .first();

      if (!campaign) throw new NotFoundError('Campaign not found');

      // Load targets
      const targets = await db('campaign_targets as ct')
        .join('destinations as d', 'd.id', 'ct.destination_id')
        .where('ct.campaign_id', campaign.id)
        .select('d.id', 'd.display_name', 'd.destination_type', 'd.platform_dest_id', 'ct.sort_order')
        .orderBy('ct.sort_order');

      res.json({ success: true, data: { ...campaign, targets } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /campaigns — create a new campaign
clientRouter.post(
  '/campaigns',
  requirePermission('can_manage_campaigns'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createCampaignSchema.parse(req.body);
      const { target_destination_ids, ...campaignData } = body;

      // Verify all destinations belong to this workspace
      const validDests = await db('destinations')
        .where('workspace_id', req.workspace!.id)
        .whereIn('id', target_destination_ids)
        .select('id');

      if (validDests.length !== target_destination_ids.length) {
        throw new AppError('One or more destination IDs are invalid', 400, 'INVALID_DESTINATIONS');
      }

      const [campaign] = await db('campaigns')
        .insert({
          ...campaignData,
          workspace_id: req.workspace!.id,
          status: campaignData.requires_approval ? 'pending_approval' : 'draft',
          total_targets: target_destination_ids.length,
          created_by: req.member!.id,
        })
        .returning('*');

      // Insert campaign targets
      const targetRows = target_destination_ids.map((destId, i) => ({
        campaign_id: campaign.id,
        destination_id: destId,
        sort_order: i,
      }));
      await db('campaign_targets').insert(targetRows);

      res.status(201).json({ success: true, data: campaign });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /campaigns/:id — update a draft campaign
clientRouter.patch(
  '/campaigns/:id',
  requirePermission('can_manage_campaigns'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateCampaignSchema.parse(req.body);

      const campaign = await wsQuery(req, 'campaigns')
        .where('campaigns.id', req.params.id as string)
        .first();

      if (!campaign) throw new NotFoundError('Campaign not found');

      if (!['draft', 'pending_approval'].includes(campaign.status)) {
        throw new AppError('Can only edit draft campaigns', 400, 'CAMPAIGN_NOT_EDITABLE');
      }

      await db('campaigns')
        .where({ id: campaign.id })
        .update({ ...body, updated_at: db.fn.now() });

      res.json({ success: true, message: 'Campaign updated' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /campaigns/:id/trigger — launch a campaign
clientRouter.post(
  '/campaigns/:id/trigger',
  requirePermission('can_manage_campaigns'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Verify campaign belongs to this workspace
      const campaign = await wsQuery(req, 'campaigns')
        .where('campaigns.id', req.params.id as string)
        .first();

      if (!campaign) throw new NotFoundError('Campaign not found');

      // Check if member needs approval
      if (req.member!.permissions.requires_approval && !campaign.approved_at) {
        throw new AppError(
          'Campaign requires approval before triggering',
          403,
          'CAMPAIGN_APPROVAL_REQUIRED'
        );
      }

      const count = await triggerCampaign(campaign.id);

      res.json({
        success: true,
        data: { messages_enqueued: count },
        message: `Campaign triggered: ${count} messages queued for delivery`,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /campaigns/:id/cancel — cancel a running campaign
clientRouter.post(
  '/campaigns/:id/cancel',
  requirePermission('can_manage_campaigns'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = await wsQuery(req, 'campaigns')
        .where('campaigns.id', req.params.id as string)
        .first();

      if (!campaign) throw new NotFoundError('Campaign not found');

      const cancelled = await cancelCampaign(campaign.id);

      res.json({
        success: true,
        data: { messages_cancelled: cancelled },
        message: `Campaign cancelled: ${cancelled} pending messages removed`,
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /campaigns/:id — delete a draft campaign
clientRouter.delete(
  '/campaigns/:id',
  requirePermission('can_manage_campaigns'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = await wsQuery(req, 'campaigns')
        .where('campaigns.id', req.params.id as string)
        .first();

      if (!campaign) throw new NotFoundError('Campaign not found');

      if (!['draft', 'pending_approval', 'cancelled'].includes(campaign.status)) {
        throw new AppError('Can only delete draft or cancelled campaigns', 400);
      }

      await db('campaign_targets').where('campaign_id', campaign.id).del();
      await db('campaigns').where('id', campaign.id).del();

      res.json({ success: true, message: 'Campaign deleted' });
    } catch (err) {
      next(err);
    }
  }
);

// GET /campaigns/:id/dispatches — get message dispatches for a campaign with error details
clientRouter.get(
  '/campaigns/:id/dispatches',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = await wsQuery(req, 'campaigns')
        .where('campaigns.id', req.params.id as string).first();
      if (!campaign) throw new NotFoundError('Campaign not found');

      const dispatches = await db('message_dispatches as md')
        .join('destinations as d', 'd.id', 'md.destination_id')
        .where('md.campaign_id', campaign.id)
        .select(
          'md.id', 'md.status', 'md.is_success', 'md.sent_at',
          'md.platform_error_code', 'md.failure_reason',
          'md.views_count', 'md.response_time_ms',
          'd.display_name as destination_name', 'd.destination_type'
        )
        .orderBy('md.sent_at', 'desc');

      res.json({ success: true, data: dispatches });
    } catch (err) { next(err); }
  }
);

// POST /campaigns/:id/resend-failed — resend all failed messages in a campaign
clientRouter.post(
  '/campaigns/:id/resend-failed',
  requirePermission('can_manage_campaigns'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = await wsQuery(req, 'campaigns')
        .where('campaigns.id', req.params.id as string).first();
      if (!campaign) throw new NotFoundError('Campaign not found');

      const failedItems = await db('message_queue')
        .where({ campaign_id: campaign.id, status: 'failed' })
        .select('*');

      if (failedItems.length === 0) {
        return res.json({ success: true, data: { resent: 0 }, message: 'No failed messages to resend' });
      }

      // Reset failed items back to pending and re-enqueue
      for (const item of failedItems) {
        await db('message_queue').where({ id: item.id }).update({
          status: 'pending',
          retry_count: 0,
          failure_reason_internal: null,
          failure_display_message: null,
        });
        const { enqueueMessage } = await import('../services/queue/queueService.js');
        await enqueueMessage(item.id, 2000);
      }

      res.json({ success: true, data: { resent: failedItems.length }, message: `${failedItems.length} messages re-queued` });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  DISTRIBUTION RULES
// ══════════════════════════════════════════════════════════════

const createRuleSchema = z.object({
  name: z.string().min(1).max(255),
  source_group_id: z.union([z.string().uuid(), z.literal('direct_bot')]),
  delay_mode: z.enum(['fixed', 'random', 'burst']).default('random'),
  delay_preset: z.enum(['fast', 'medium', 'slow', 'custom']).default('medium'),
  delay_min_seconds: z.number().int().min(1).default(30),
  delay_max_seconds: z.number().int().min(1).default(60),
  append_suffix: z.string().nullable().optional(),
  append_suffix_enabled: z.boolean().default(false),
  forward_media: z.boolean().default(true),
  forward_files: z.boolean().default(true),
  strip_sender_info: z.boolean().default(true),
  requires_approval: z.boolean().default(false),
  destination_ids: z.array(z.string().uuid()).min(1),
  bot_conflict_mode: z.enum(['run_both', 'run_distribution_only', 'run_bot_only']).default('run_both').optional(),
  top_banner: z.string().nullable().optional(),
  top_banner_enabled: z.boolean().default(false),
  telegram_suffix: z.string().nullable().optional(),
  telegram_suffix_enabled: z.boolean().default(false),
  authorized_senders_mode: z.enum(['all', 'specific']).default('all'),
  authorized_phone_numbers: z.array(z.string()).optional(),
  hash_strip_enabled: z.boolean().default(false),
  forward_polls: z.boolean().default(true),
});

const updateRuleSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  is_active: z.boolean().optional(),
  delay_mode: z.enum(['fixed', 'random', 'burst']).optional(),
  delay_preset: z.enum(['fast', 'medium', 'slow', 'custom']).optional(),
  delay_min_seconds: z.number().int().min(1).optional(),
  delay_max_seconds: z.number().int().min(1).optional(),
  append_suffix: z.string().nullable().optional(),
  append_suffix_enabled: z.boolean().optional(),
  forward_media: z.boolean().optional(),
  forward_files: z.boolean().optional(),
  strip_sender_info: z.boolean().optional(),
  requires_approval: z.boolean().optional(),
});

// GET /rules — list distribution rules
clientRouter.get(
  '/rules',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rules = await wsQuery(req, 'distribution_rules')
        .leftJoin('source_groups as sg', 'sg.id', 'distribution_rules.source_group_id')
        .select(
          'distribution_rules.id',
          'distribution_rules.name',
          'distribution_rules.is_active',
          'distribution_rules.delay_mode',
          'distribution_rules.delay_preset',
          'distribution_rules.total_dispatched',
          'distribution_rules.total_failed',
          'distribution_rules.created_at',
          'sg.display_name as source_group_name',
          'sg.platform_group_id as source_group_jid'
        )
        .orderBy('distribution_rules.created_at', 'desc');

      res.json({ success: true, data: rules });
    } catch (err) {
      next(err);
    }
  }
);

// GET /rules/:id — rule detail with destinations
clientRouter.get(
  '/rules/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rule = await wsQuery(req, 'distribution_rules')
        .where('distribution_rules.id', req.params.id as string)
        .first();

      if (!rule) throw new NotFoundError('Rule not found');

      const destinations = await db('rule_destinations as rd')
        .join('destinations as d', 'd.id', 'rd.destination_id')
        .where('rd.rule_id', rule.id)
        .select(
          'd.id', 'd.display_name', 'd.destination_type',
          'd.platform_dest_id', 'd.participant_count',
          'rd.sort_order', 'rd.is_active'
        )
        .orderBy('rd.sort_order');

      res.json({ success: true, data: { ...rule, destinations } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /rules — create a distribution rule
clientRouter.post(
  '/rules',
  requirePermission('can_manage_destinations'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createRuleSchema.parse(req.body);
      const { destination_ids, bot_conflict_mode, ...ruleData } = body;

      // Normalize phone numbers
      if (ruleData.authorized_phone_numbers) {
        ruleData.authorized_phone_numbers = ruleData.authorized_phone_numbers.map((p: string) => {
          let phone = p.replace(/[-\s()]/g, '');
          if (phone.startsWith('05')) phone = '972' + phone.slice(1);
          if (phone.startsWith('+')) phone = phone.slice(1);
          return phone;
        });
      }

      const isDirectBot = ruleData.source_group_id === 'direct_bot';

      // Verify source group belongs to workspace (skip for direct bot trigger)
      if (!isDirectBot) {
        const sourceGroup = await db('source_groups')
          .where({ id: ruleData.source_group_id, workspace_id: req.workspace!.id })
          .first();

        if (!sourceGroup) {
          throw new AppError('Source group not found', 400, 'INVALID_SOURCE_GROUP');
        }
      }

      // Verify destinations belong to workspace
      const validDests = await db('destinations')
        .where('workspace_id', req.workspace!.id)
        .whereIn('id', destination_ids)
        .select('id');

      if (validDests.length !== destination_ids.length) {
        throw new AppError('One or more destination IDs are invalid', 400, 'INVALID_DESTINATIONS');
      }

      const insertData: Record<string, unknown> = {
        ...ruleData,
        workspace_id: req.workspace!.id,
        created_by: req.member!.id,
      };
      // For direct bot trigger, set source_group_id to null instead of the sentinel string
      if (isDirectBot) {
        insertData.source_group_id = null;
      }

      const [rule] = await db('distribution_rules')
        .insert(insertData)
        .returning('*');

      // Link destinations
      const rdRows = destination_ids.map((destId, i) => ({
        rule_id: rule.id,
        destination_id: destId,
        sort_order: i,
        is_active: true,
      }));
      await db('rule_destinations').insert(rdRows);

      // Upsert bot_conflict_settings if bot_conflict_mode is provided
      if (bot_conflict_mode) {
        await db('bot_conflict_settings')
          .insert({
            workspace_id: req.workspace!.id,
            rule_id: rule.id,
            on_bot_conflict: bot_conflict_mode,
            updated_at: db.fn.now(),
          })
          .onConflict('workspace_id')
          .merge({
            rule_id: rule.id,
            on_bot_conflict: bot_conflict_mode,
            updated_at: db.fn.now(),
          });
      }

      res.status(201).json({ success: true, data: rule });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /rules/:id — update a rule
clientRouter.patch(
  '/rules/:id',
  requirePermission('can_manage_destinations'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateRuleSchema.parse(req.body);

      const rule = await wsQuery(req, 'distribution_rules')
        .where('distribution_rules.id', req.params.id as string)
        .first();

      if (!rule) throw new NotFoundError('Rule not found');

      await db('distribution_rules')
        .where({ id: rule.id })
        .update({ ...body, updated_at: db.fn.now() });

      res.json({ success: true, message: 'Rule updated' });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /rules/:id/destinations — replace rule destinations
clientRouter.put(
  '/rules/:id/destinations',
  requirePermission('can_manage_destinations'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        destination_ids: z.array(z.string().uuid()).min(1),
      });
      const { destination_ids } = schema.parse(req.body);

      const rule = await wsQuery(req, 'distribution_rules')
        .where('distribution_rules.id', req.params.id as string)
        .first();

      if (!rule) throw new NotFoundError('Rule not found');

      // Verify destinations
      const validDests = await db('destinations')
        .where('workspace_id', req.workspace!.id)
        .whereIn('id', destination_ids)
        .select('id');

      if (validDests.length !== destination_ids.length) {
        throw new AppError('One or more destination IDs are invalid', 400);
      }

      // Replace in a transaction
      await db.transaction(async (trx) => {
        await trx('rule_destinations').where('rule_id', rule.id).del();
        const rows = destination_ids.map((destId, i) => ({
          rule_id: rule.id,
          destination_id: destId,
          sort_order: i,
          is_active: true,
        }));
        await trx('rule_destinations').insert(rows);
      });

      res.json({ success: true, message: `${destination_ids.length} destinations set` });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /rules/:id — delete a rule
clientRouter.delete(
  '/rules/:id',
  requirePermission('can_manage_destinations'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rule = await wsQuery(req, 'distribution_rules')
        .where('distribution_rules.id', req.params.id as string)
        .first();

      if (!rule) throw new NotFoundError('Rule not found');

      await db('rule_destinations').where('rule_id', rule.id).del();
      await db('distribution_rules').where('id', rule.id).del();

      res.json({ success: true, message: 'Rule deleted' });
    } catch (err) {
      next(err);
    }
  }
);

// ══════════════════════════════════════════════════════════════
//  DESTINATIONS
// ══════════════════════════════════════════════════════════════

clientRouter.get(
  '/destinations',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let query = wsQuery(req, 'destinations')
        .select('id', 'display_name', 'destination_type', 'platform', 'platform_dest_id',
                'participant_count', 'is_active', 'tags', 'last_message_at', 'created_at')
        .orderBy('display_name');
      const allowedIds = (req as any).member?.allowed_destination_ids;
      if (allowedIds !== null && allowedIds !== undefined) {
        query = query.whereIn('destinations.id', allowedIds);
      }
      const destinations = await query;
      res.json({ success: true, data: destinations });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  WORKSPACE MEMBERS & PERMISSIONS
// ══════════════════════════════════════════════════════════════

clientRouter.get(
  '/members',
  requirePermission('can_manage_members'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const members = await wsQuery(req, 'workspace_members')
        .leftJoin('workspace_roles as wr', 'wr.id', 'workspace_members.role_id')
        .select('workspace_members.id', 'workspace_members.email', 'workspace_members.full_name',
                'workspace_members.is_owner', 'workspace_members.is_active',
                'workspace_members.allowed_destination_ids',
                'wr.slug as role_slug', 'workspace_members.last_login_at')
        .orderBy('workspace_members.created_at');
      res.json({ success: true, data: members });
    } catch (err) { next(err); }
  }
);

clientRouter.patch(
  '/members/:id/permissions',
  requirePermission('can_manage_members'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ allowed_destination_ids: z.array(z.string().uuid()).nullable() });
      const { allowed_destination_ids } = schema.parse(req.body);
      const member = await wsQuery(req, 'workspace_members').where('workspace_members.id', req.params.id as string).first();
      if (!member) throw new NotFoundError('Member not found');
      if (member.is_owner) throw new AppError('Cannot restrict owner permissions', 400, 'OWNER_UNRESTRICTED');
      await db('workspace_members').where({ id: member.id }).update({
        allowed_destination_ids: allowed_destination_ids
          ? db.raw('?::uuid[]', ['{' + allowed_destination_ids.join(',') + '}'])
          : null,
      });
      res.json({ success: true, message: 'Permissions updated' });
    } catch (err) { next(err); }
  }
);

// POST /members/invite — add a new member directly (approved)
const inviteMemberSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  role_slug: z.string().optional(),
});

clientRouter.post(
  '/members/invite',
  requirePermission('can_manage_members'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, full_name, role_slug } = inviteMemberSchema.parse(req.body);
      const wsId = req.workspace!.id;

      // Check if member already exists
      const existing = await db('workspace_members')
        .where({ workspace_id: wsId, email })
        .first();

      if (existing) {
        throw new AppError('Email already registered in this workspace', 409, 'MEMBER_EXISTS');
      }

      // Find role (default to 'viewer')
      const slug = role_slug ?? 'viewer';
      const role = await db('workspace_roles')
        .where({ workspace_id: wsId, slug })
        .first();

      // Generate a random temporary password
      const temp_password = crypto.randomBytes(6).toString('base64url'); // ~8 chars
      const password_hash = await bcrypt.hash(temp_password, 12);

      const [member] = await db('workspace_members')
        .insert({
          workspace_id: wsId,
          email,
          full_name,
          password_hash,
          role_id: role?.id ?? null,
          is_owner: false,
          is_active: true,
          approval_status: 'approved',
          invited_by: req.member!.id,
        })
        .returning('id');

      res.status(201).json({
        success: true,
        data: {
          member_id: member.id,
          temp_password,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ══════════════════════════════════════════════════════════════
//  DASHBOARD STATS (read-only)
// ══════════════════════════════════════════════════════════════

clientRouter.get(
  '/stats/overview',
  requirePermission('can_view_analytics'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wsId = req.workspace!.id;

      const [
        totalSentAllTime, sentToday, totalGroups,
        activeRules, connectedAccounts, queuePending,
        todayStats, rulesWithStats,
      ] = await Promise.all([
        db('message_dispatches').where({ workspace_id: wsId, is_success: true }).count('* as count').first(),
        db('message_dispatches').where({ workspace_id: wsId, is_success: true }).whereRaw('sent_at >= CURRENT_DATE').count('* as count').first(),
        db('destinations').where({ workspace_id: wsId }).count('* as count').first(),
        db('distribution_rules').where({ workspace_id: wsId, is_active: true }).count('* as count').first(),
        db('connected_accounts').where({ workspace_id: wsId, is_connected: true }).count('* as count').first(),
        db('message_queue').where({ workspace_id: wsId, status: 'pending' }).count('* as count').first(),
        db('dispatch_stats_daily').where({ workspace_id: wsId }).where('stat_date', db.raw('CURRENT_DATE'))
          .sum({ total_sent: 'total_sent', total_delivered: 'total_delivered', total_failed: 'total_failed' }).first(),
        db('distribution_rules as dr').where('dr.workspace_id', wsId)
          .leftJoin(db('message_dispatches').select('rule_id').where({ workspace_id: wsId, is_success: true })
            .count('* as messages_sent').groupBy('rule_id').as('md'), 'md.rule_id', 'dr.id')
          .leftJoin(db('rule_destinations').select('rule_id').count('* as target_count').groupBy('rule_id').as('rd'), 'rd.rule_id', 'dr.id')
          .select('dr.id', 'dr.name', 'dr.is_active', 'dr.delay_preset', 'dr.total_dispatched', 'dr.total_failed', 'dr.created_at',
                  db.raw('COALESCE(md.messages_sent, 0)::int as messages_sent'),
                  db.raw('COALESCE(rd.target_count, 0)::int as target_count'))
          .orderBy('dr.created_at', 'desc'),
      ]);

      res.json({
        success: true,
        data: {
          total_sent_all_time: Number(totalSentAllTime?.count ?? 0),
          sent_today: Number(sentToday?.count ?? 0),
          total_groups: Number(totalGroups?.count ?? 0),
          active_rules: Number(activeRules?.count ?? 0),
          connected_accounts: Number(connectedAccounts?.count ?? 0),
          queue_pending: Number(queuePending?.count ?? 0),
          today: {
            sent: Number(todayStats?.total_sent ?? 0),
            delivered: Number(todayStats?.total_delivered ?? 0),
            failed: Number(todayStats?.total_failed ?? 0),
          },
          rules: rulesWithStats,
        },
      });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  VIEWS & ANALYTICS
// ══════════════════════════════════════════════════════════════

clientRouter.get(
  '/stats/views',
  requirePermission('can_view_analytics'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wsId = req.workspace!.id;
      let query = db('message_dispatches as md').join('destinations as d', 'd.id', 'md.destination_id').where('md.workspace_id', wsId);
      if (req.query.campaign_id) query = query.where('md.campaign_id', req.query.campaign_id as string);
      if (req.query.rule_id) query = query.where('md.rule_id', req.query.rule_id as string);
      const views = await query
        .groupBy('d.id', 'd.display_name', 'd.destination_type', 'd.platform_dest_id')
        .select('d.id as destination_id', 'd.display_name', 'd.destination_type', 'd.platform_dest_id',
                db.raw('SUM(md.views_count)::int as total_views'), db.raw('COUNT(md.id)::int as total_messages'),
                db.raw('SUM(CASE WHEN md.is_success THEN 1 ELSE 0 END)::int as successful'))
        .orderBy('total_views', 'desc');
      const totalViews = views.reduce((sum: number, v: any) => sum + (v.total_views || 0), 0);
      res.json({ success: true, data: { total_views: totalViews, destinations: views } });
    } catch (err) { next(err); }
  }
);

clientRouter.get(
  '/stats/best-send-time',
  requirePermission('can_view_analytics'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wsId = req.workspace!.id;
      const hourlyStats = await db('message_dispatches').where({ workspace_id: wsId }).whereNotNull('sent_at')
        .groupByRaw('EXTRACT(HOUR FROM sent_at)')
        .select(db.raw('EXTRACT(HOUR FROM sent_at)::int as hour'), db.raw('COUNT(*)::int as total_sent'),
                db.raw('SUM(CASE WHEN is_success THEN 1 ELSE 0 END)::int as total_delivered'),
                db.raw('SUM(views_count)::int as total_views'),
                db.raw('ROUND(AVG(CASE WHEN is_success THEN 100.0 ELSE 0 END), 1) as success_rate'))
        .orderBy('hour');
      const qualified = hourlyStats.filter((h: any) => h.total_sent >= 5);
      const bestHour = qualified.length > 0
        ? qualified.reduce((best: any, h: any) => Number(h.success_rate) > Number(best.success_rate) ? h : best, qualified[0])
        : null;
      res.json({
        success: true,
        data: { hourly: hourlyStats, best_hour: bestHour ? Number(bestHour.hour) : null, best_success_rate: bestHour ? Number(bestHour.success_rate) : null },
      });
    } catch (err) { next(err); }
  }
);

clientRouter.get(
  '/stats/daily-trend',
  requirePermission('can_view_analytics'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wsId = req.workspace!.id;
      const trend = await db('dispatch_stats_daily').where({ workspace_id: wsId })
        .whereRaw("stat_date >= CURRENT_DATE - INTERVAL '30 days'")
        .groupBy('stat_date')
        .select('stat_date', db.raw('SUM(total_sent)::int as sent'), db.raw('SUM(total_delivered)::int as delivered'), db.raw('SUM(total_failed)::int as failed'))
        .orderBy('stat_date');
      res.json({ success: true, data: trend });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  BRANDING / CMS
// ══════════════════════════════════════════════════════════════

clientRouter.get(
  '/branding',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const texts = await db('system_texts').whereIn('category', ['branding', 'navigation', 'auth']).select('key', 'value');
      const map: Record<string, string> = {};
      for (const t of texts) map[t.key] = t.value;
      res.json({ success: true, data: map });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  TELEGRAM INTEGRATION
// ══════════════════════════════════════════════════════════════

// POST /connected-accounts/telegram — connect a Telegram bot
clientRouter.post(
  '/connected-accounts/telegram',
  requirePermission('can_manage_bot_settings'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ bot_token: z.string().min(20) });
      const { bot_token } = schema.parse(req.body);
      const result = await connectTelegramBot(req.workspace!.id, bot_token);
      res.status(201).json({ success: true, data: result, message: `Bot @${result.botUsername} connected!` });
    } catch (err) { next(err); }
  }
);

// POST /connected-accounts/telegram/:id/sync — manual group sync
clientRouter.post(
  '/connected-accounts/telegram/:id/sync',
  requirePermission('can_manage_bot_settings'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const account = await wsQuery(req, 'connected_accounts')
        .where({ 'connected_accounts.id': req.params.id as string, platform: 'TELEGRAM_BOT' }).first();
      if (!account) throw new NotFoundError('Telegram bot not found');
      const count = await syncTelegramGroups(account.id);
      res.json({ success: true, data: { synced: count } });
    } catch (err) { next(err); }
  }
);

// DELETE /connected-accounts/telegram/:id — disconnect a Telegram bot
clientRouter.delete(
  '/connected-accounts/telegram/:id',
  requirePermission('can_manage_bot_settings'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const account = await wsQuery(req, 'connected_accounts')
        .where({ 'connected_accounts.id': req.params.id as string, platform: 'TELEGRAM_BOT' }).first();
      if (!account) throw new NotFoundError('Telegram bot not found');
      await disconnectTelegramBot(account.id);
      res.json({ success: true, message: 'Bot disconnected' });
    } catch (err) { next(err); }
  }
);

// GET /connected-accounts — list all connected accounts for this workspace
clientRouter.get(
  '/connected-accounts',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accounts = await wsQuery(req, 'connected_accounts')
        .select(
          'connected_accounts.id',
          'connected_accounts.platform',
          'connected_accounts.display_name',
          'connected_accounts.account_identifier',
          'connected_accounts.is_connected',
          'connected_accounts.connection_status',
          'connected_accounts.last_seen_at',
          'connected_accounts.created_at'
        )
        .orderBy('connected_accounts.created_at', 'desc');
      res.json({ success: true, data: accounts });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  SHABBAT SETTINGS
// ══════════════════════════════════════════════════════════════

// GET /shabbat-settings
clientRouter.get(
  '/shabbat-settings',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let settings = await wsQuery(req, 'shabbat_settings').first();
      if (!settings) {
        settings = { is_enabled: false, city: 'jerusalem', custom_start_offset_min: 0, custom_end_offset_min: 0 };
      }
      res.json({ success: true, data: settings });
    } catch (err) { next(err); }
  }
);

// PATCH /shabbat-settings
clientRouter.patch(
  '/shabbat-settings',
  requirePermission('can_manage_bot_settings'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        is_enabled: z.boolean(),
        city: z.string().optional(),
        custom_start_offset_min: z.number().int().optional(),
        custom_end_offset_min: z.number().int().optional(),
      });
      const body = schema.parse(req.body);
      await db('shabbat_settings')
        .insert({ workspace_id: req.workspace!.id, ...body })
        .onConflict('workspace_id')
        .merge({ ...body, updated_at: db.fn.now() });
      res.json({ success: true, message: 'Shabbat settings updated' });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  CRM / LEADS
// ══════════════════════════════════════════════════════════════

// GET /leads — list leads/contacts with intent signals
clientRouter.get(
  '/leads',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wsId = req.workspace!.id;
      const leads = await db('contacts')
        .where({ workspace_id: wsId, is_lead: true })
        .select('id', 'phone_number', 'display_name', 'tags', 'detected_intent',
                'intent_confidence', 'source_group_jid', 'is_lead', 'custom_fields',
                'created_at', 'updated_at')
        .orderBy('created_at', 'desc')
        .limit(200);
      res.json({ success: true, data: leads });
    } catch (err) { next(err); }
  }
);

// POST /leads — create lead manually
clientRouter.post(
  '/leads',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        phone_number: z.string().min(5),
        display_name: z.string().optional(),
        tags: z.array(z.string()).optional(),
        notes: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const [lead] = await db('contacts').insert({
        workspace_id: req.workspace!.id,
        phone_number: body.phone_number,
        display_name: body.display_name,
        tags: body.tags ? JSON.stringify(body.tags) : null,
        is_lead: true,
        custom_fields: body.notes ? JSON.stringify({ notes: body.notes }) : null,
      }).returning('*');
      res.json({ success: true, data: lead });
    } catch (err) { next(err); }
  }
);

// DELETE /leads/:id
clientRouter.delete(
  '/leads/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lead = await db('contacts')
        .where({ id: req.params.id, workspace_id: req.workspace!.id })
        .first();
      if (!lead) throw new NotFoundError('Lead not found');
      await db('contacts').where({ id: lead.id }).del();
      res.json({ success: true, message: 'Lead deleted' });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  FEATURE REQUESTS
// ══════════════════════════════════════════════════════════════

// GET /feature-requests
clientRouter.get(
  '/feature-requests',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requests = await db('feature_requests')
        .where(function() {
          this.where('workspace_id', req.workspace!.id).orWhereNull('workspace_id');
        })
        .orderBy('created_at', 'desc')
        .limit(50);
      res.json({ success: true, data: requests });
    } catch (err) { next(err); }
  }
);

// POST /feature-requests
clientRouter.post(
  '/feature-requests',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        title: z.string().min(3).max(500),
        description: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const [request] = await db('feature_requests').insert({
        workspace_id: req.workspace!.id,
        requested_by: req.member!.id,
        title: body.title,
        description: body.description,
      }).returning('*');
      res.json({ success: true, data: request });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  INVOICES
// ══════════════════════════════════════════════════════════════

// GET /invoices
clientRouter.get(
  '/invoices',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoices = await wsQuery(req, 'invoices')
        .select('id', 'invoice_number', 'amount', 'currency', 'status', 'issued_at', 'pdf_url')
        .orderBy('issued_at', 'desc');
      res.json({ success: true, data: invoices });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════════
//  QUEUE MANAGEMENT
// ══════════════════════════════════════════════════════════════

// GET /queue/paused — list paused items awaiting number rotation
clientRouter.get(
  '/queue/paused',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await db('message_queue')
        .where({ workspace_id: req.workspace!.id, status: 'paused_awaiting_number' })
        .select('id', 'destination_id', 'paused_reason', 'created_at')
        .limit(100);
      res.json({ success: true, data: items });
    } catch (err) { next(err); }
  }
);

// POST /queue/resume-all — resume paused items with new account
clientRouter.post(
  '/queue/resume-all',
  requirePermission('can_manage_bot_settings'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ new_account_id: z.string().uuid() });
      const { new_account_id } = schema.parse(req.body);

      // Verify account belongs to workspace
      const account = await wsQuery(req, 'connected_accounts')
        .where('connected_accounts.id', new_account_id).first();
      if (!account) throw new NotFoundError('Account not found');

      const updated = await db('message_queue')
        .where({ workspace_id: req.workspace!.id, status: 'paused_awaiting_number' })
        .update({ status: 'pending', connected_account_id: new_account_id, paused_reason: null });

      // Re-enqueue all
      const items = await db('message_queue')
        .where({ workspace_id: req.workspace!.id, connected_account_id: new_account_id, status: 'pending' })
        .select('id');
      const { enqueueMessage } = await import('../services/queue/queueService.js');
      for (const item of items) {
        await enqueueMessage(item.id, 3000);
      }

      res.json({ success: true, data: { resumed: updated }, message: `${updated} messages resumed` });
    } catch (err) { next(err); }
  }
);
