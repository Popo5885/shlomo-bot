/**
 * WhatsApp Message Sender
 *
 * Thin wrapper around Baileys sendMessage, used by the Queue Worker.
 * Handles text, media, and forwarded messages.
 */

import type { WASocket } from '@whiskeysockets/baileys';
import { logger } from '../../utils/logger.js';
import { WhatsAppError } from '../../utils/errors.js';

export interface SendResult {
  platformMsgId: string;
  responseTimeMs: number;
}

interface SendTextOptions {
  jid: string;
  text: string;
  suffix?: string | null;
  linkPreview?: boolean;
}

interface SendMediaOptions {
  jid: string;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'document' | 'audio';
  caption?: string | null;
  suffix?: string | null;
}

/**
 * Send a text message to a WhatsApp JID.
 */
export async function sendText(socket: WASocket, opts: SendTextOptions): Promise<SendResult> {
  const fullText = opts.suffix ? `${opts.text}\n${opts.suffix}` : opts.text;

  const start = Date.now();
  const msgContent: any = { text: fullText };
  if (opts.linkPreview === false) {
    msgContent.linkPreview = null; // Baileys way to disable link previews
  }
  const result = await socket.sendMessage(opts.jid, msgContent);
  const responseTimeMs = Date.now() - start;

  if (!result?.key?.id) {
    throw new WhatsAppError('Send returned no message ID', 'WA_SEND_FAILED');
  }

  return {
    platformMsgId: result.key.id,
    responseTimeMs,
  };
}

/**
 * Send a media message (image, video, document, audio).
 */
export async function sendMedia(socket: WASocket, opts: SendMediaOptions): Promise<SendResult> {
  const caption = opts.suffix
    ? [opts.caption, opts.suffix].filter(Boolean).join('\n')
    : opts.caption ?? undefined;

  const content: Record<string, unknown> = {};

  switch (opts.mediaType) {
    case 'image':
      content.image = { url: opts.mediaUrl };
      if (caption) content.caption = caption;
      break;
    case 'video':
      content.video = { url: opts.mediaUrl };
      if (caption) content.caption = caption;
      break;
    case 'document':
      content.document = { url: opts.mediaUrl };
      if (caption) content.caption = caption;
      content.mimetype = 'application/octet-stream';
      break;
    case 'audio':
      content.audio = { url: opts.mediaUrl };
      content.mimetype = 'audio/mp4';
      break;
    default:
      throw new WhatsAppError(`Unsupported media type: ${opts.mediaType}`, 'WA_INVALID_MEDIA');
  }

  const start = Date.now();
  const result = await socket.sendMessage(opts.jid, content as any);
  const responseTimeMs = Date.now() - start;

  if (!result?.key?.id) {
    throw new WhatsAppError('Media send returned no message ID', 'WA_SEND_FAILED');
  }

  return {
    platformMsgId: result.key.id,
    responseTimeMs,
  };
}

/**
 * Send a poll message to a WhatsApp JID.
 */
export async function sendPoll(socket: WASocket, opts: {
  jid: string;
  pollName: string;
  pollOptions: string[];
  selectableCount?: number;
}): Promise<SendResult> {
  const start = Date.now();
  const result = await socket.sendMessage(opts.jid, {
    poll: {
      name: opts.pollName,
      values: opts.pollOptions,
      selectableCount: opts.selectableCount ?? 1,
    },
  } as any);
  const responseTimeMs = Date.now() - start;

  if (!result?.key?.id) {
    throw new WhatsAppError('Poll send returned no message ID', 'WA_SEND_FAILED');
  }

  return {
    platformMsgId: result.key.id,
    responseTimeMs,
  };
}

/**
 * Send a text or media message based on the queue item fields.
 */
export async function sendQueueMessage(
  socket: WASocket,
  opts: {
    jid: string;
    messageText: string | null;
    mediaUrl: string | null;
    mediaType: string | null;
    appendSuffix: string | null;
    pollData?: { name: string; options: string[]; selectableCount: number } | null;
    linkPreview?: boolean;
  }
): Promise<SendResult> {
  // Poll message
  if (opts.pollData) {
    return sendPoll(socket, {
      jid: opts.jid,
      pollName: opts.pollData.name,
      pollOptions: opts.pollData.options,
      selectableCount: opts.pollData.selectableCount,
    });
  }

  // Media message
  if (opts.mediaUrl && opts.mediaType) {
    return sendMedia(socket, {
      jid: opts.jid,
      mediaUrl: opts.mediaUrl,
      mediaType: opts.mediaType as 'image' | 'video' | 'document' | 'audio',
      caption: opts.messageText,
      suffix: opts.appendSuffix,
    });
  }

  // Text message
  if (opts.messageText) {
    return sendText(socket, {
      jid: opts.jid,
      text: opts.messageText,
      suffix: opts.appendSuffix,
      linkPreview: opts.linkPreview,
    });
  }

  throw new WhatsAppError('Queue item has no text or media to send', 'WA_EMPTY_MESSAGE');
}
