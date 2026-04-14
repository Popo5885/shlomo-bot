/**
 * WhatsApp Auth Routes
 *
 * Endpoints for connecting WhatsApp accounts via QR code or pairing code.
 * These routes are called by the client dashboard.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { sessionManager } from '../services/whatsapp/sessionManager.js';
import { db } from '../config/database.js';
import { AppError, NotFoundError } from '../utils/errors.js';

export const whatsappAuthRouter = Router();

// ── Validation Schemas ──

const qrConnectSchema = z.object({
  workspace_id: z.string().uuid(),
  display_name: z.string().max(255).optional(),
});

const pairConnectSchema = z.object({
  workspace_id: z.string().uuid(),
  phone_number: z.string().min(7).max(20),
  display_name: z.string().max(255).optional(),
});

// ── POST /api/wa/connect/qr ──
// Start a QR code auth flow. Returns the accountId for polling.
whatsappAuthRouter.post(
  '/connect/qr',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = qrConnectSchema.parse(req.body);

      // Verify workspace exists
      const workspace = await db('workspaces')
        .where({ id: body.workspace_id, is_active: true })
        .first();

      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      const accountId = await sessionManager.startQRFlow(
        body.workspace_id,
        body.display_name
      );

      res.status(201).json({
        success: true,
        data: { account_id: accountId },
        message: 'QR flow started. Poll GET /api/wa/connect/qr/:accountId for the QR code.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/wa/connect/qr/:accountId ──
// Poll for the current QR code data URL.
whatsappAuthRouter.get(
  '/connect/qr/:accountId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = req.params.accountId as string;

      const account = await db('connected_accounts')
        .where({ id: accountId })
        .select('qr_code_data', 'connection_status', 'account_identifier')
        .first();

      if (!account) {
        throw new NotFoundError('Account not found');
      }

      // Already connected — return success state
      if (account.connection_status === 'connected') {
        res.json({
          success: true,
          data: {
            status: 'connected',
            phone_number: account.account_identifier,
            qr_code: null,
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          status: account.connection_status,
          phone_number: null,
          qr_code: account.qr_code_data, // base64 data URL or null
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/wa/connect/pair ──
// Start a pairing code flow. Returns the 8-digit code.
whatsappAuthRouter.post(
  '/connect/pair',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = pairConnectSchema.parse(req.body);

      const workspace = await db('workspaces')
        .where({ id: body.workspace_id, is_active: true })
        .first();

      if (!workspace) {
        throw new NotFoundError('Workspace not found');
      }

      const { accountId, pairingCode } = await sessionManager.startPairingFlow(
        body.workspace_id,
        body.phone_number,
        body.display_name
      );

      res.status(201).json({
        success: true,
        data: {
          account_id: accountId,
          pairing_code: pairingCode,
        },
        message: 'Enter this code in WhatsApp > Linked Devices > Link with phone number.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/wa/disconnect/:accountId ──
// Disconnect a WhatsApp session.
whatsappAuthRouter.post(
  '/disconnect/:accountId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = req.params.accountId as string;

      const account = await db('connected_accounts')
        .where({ id: accountId })
        .first();

      if (!account) {
        throw new NotFoundError('Account not found');
      }

      await sessionManager.disconnect(accountId);

      res.json({
        success: true,
        message: 'WhatsApp session disconnected.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/wa/status/:accountId ──
// Get the connection status of a specific account.
whatsappAuthRouter.get(
  '/status/:accountId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = req.params.accountId as string;

      const account = await db('connected_accounts')
        .where({ id: accountId })
        .select(
          'id',
          'workspace_id',
          'platform',
          'display_name',
          'account_identifier',
          'is_connected',
          'connection_status',
          'last_seen_at',
          'rate_limit_until',
          'created_at'
        )
        .first();

      if (!account) {
        throw new NotFoundError('Account not found');
      }

      res.json({ success: true, data: account });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/wa/sync-groups/:accountId ──
// Sync WhatsApp groups for a connected account into destinations.
whatsappAuthRouter.post(
  '/sync-groups/:accountId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = req.params.accountId as string;

      const account = await db('connected_accounts')
        .where({ id: accountId })
        .first();

      if (!account) {
        throw new NotFoundError('Account not found');
      }

      if (!account.is_connected) {
        throw new AppError('Account is not connected', 400, 'NOT_CONNECTED');
      }

      const synced = await sessionManager.syncGroups(accountId);

      res.json({
        success: true,
        data: { synced },
        message: `Synced ${synced} groups.`,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/wa/accounts/:accountId ──
// Delete a WhatsApp account entirely (disconnect + remove from DB).
whatsappAuthRouter.delete(
  '/accounts/:accountId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = req.params.accountId as string;

      const account = await db('connected_accounts')
        .where({ id: accountId })
        .first();

      if (!account) {
        throw new NotFoundError('Account not found');
      }

      // Disconnect if active
      await sessionManager.disconnect(accountId);

      // Remove from DB
      await db('connected_accounts').where({ id: accountId }).delete();

      res.json({
        success: true,
        message: 'WhatsApp account removed.',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/wa/sessions/:workspaceId ──
// List all WhatsApp sessions for a workspace.
whatsappAuthRouter.get(
  '/sessions/:workspaceId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.params.workspaceId as string;

      const accounts = await db('connected_accounts')
        .where({ workspace_id: workspaceId, platform: 'WHATSAPP_WEB' })
        .select(
          'id',
          'display_name',
          'account_identifier',
          'is_connected',
          'connection_status',
          'last_seen_at',
          'rate_limit_until',
          'created_at'
        )
        .orderBy('created_at', 'desc');

      res.json({ success: true, data: accounts });
    } catch (err) {
      next(err);
    }
  }
);
