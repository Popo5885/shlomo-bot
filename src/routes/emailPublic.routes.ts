/**
 * Email Public Routes — no authentication required
 *
 * GET  /api/email/unsubscribe/:token?email=xxx  — process unsubscribe
 * POST /api/email/resubscribe                   — remove from list
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  addUnsubscribe,
  removeUnsubscribe,
  verifyUnsubscribeToken,
} from '../services/email/emailService.js';

export const emailPublicRouter = Router();

emailPublicRouter.get(
  '/unsubscribe/:token',
  async (req: Request, res: Response, _next: NextFunction) => {
    const email = req.query.email as string | undefined;
    const token = req.params.token as string;

    if (!email || !verifyUnsubscribeToken(email, token)) {
      res.status(400).json({ success: false, error: 'Invalid unsubscribe link.' });
      return;
    }

    await addUnsubscribe(email);
    res.json({ success: true, message: 'unsubscribed' });
  }
);

emailPublicRouter.post(
  '/resubscribe',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, token } = z.object({
        email: z.string().email(),
        token: z.string(),
      }).parse(req.body);

      if (!verifyUnsubscribeToken(email, token)) {
        res.status(400).json({ success: false, error: 'Invalid token.' });
        return;
      }

      await removeUnsubscribe(email);
      res.json({ success: true, message: 'resubscribed' });
    } catch (err) { next(err); }
  }
);
