/**
 * Telegram Message Sender
 *
 * Sends text and media messages to Telegram groups/channels
 * via the Grammy bot API.
 */

import { getTelegramBot } from './telegramBot.js';
import { logger } from '../../utils/logger.js';

interface TelegramSendOptions {
  accountId: string;
  chatId: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'document' | 'audio';
}

interface SendResult {
  success: boolean;
  platformMsgId?: string;
  error?: string;
}

/**
 * Send a message to a Telegram chat via the bot.
 */
export async function sendTelegramMessage(opts: TelegramSendOptions): Promise<SendResult> {
  const bot = getTelegramBot(opts.accountId);
  if (!bot) {
    return { success: false, error: 'Bot not connected' };
  }

  try {
    let result: { message_id: number };

    if (opts.mediaUrl && opts.mediaType) {
      // Send media message
      switch (opts.mediaType) {
        case 'image':
          result = await bot.api.sendPhoto(opts.chatId, opts.mediaUrl, {
            caption: opts.text,
          });
          break;
        case 'video':
          result = await bot.api.sendVideo(opts.chatId, opts.mediaUrl, {
            caption: opts.text,
          });
          break;
        case 'document':
          result = await bot.api.sendDocument(opts.chatId, opts.mediaUrl, {
            caption: opts.text,
          });
          break;
        case 'audio':
          result = await bot.api.sendAudio(opts.chatId, opts.mediaUrl, {
            caption: opts.text,
          });
          break;
        default:
          result = await bot.api.sendMessage(opts.chatId, opts.text || '');
      }
    } else if (opts.text) {
      result = await bot.api.sendMessage(opts.chatId, opts.text);
    } else {
      return { success: false, error: 'No content to send' };
    }

    return {
      success: true,
      platformMsgId: String(result.message_id),
    };
  } catch (err) {
    const errorMsg = (err as Error).message;
    logger.error(`Telegram send error to ${opts.chatId}: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}
