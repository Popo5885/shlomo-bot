/**
 * Telegram Bot Lifecycle Manager
 *
 * Manages Grammy bot instances per connected_account.
 * Handles bot token validation, group auto-sync, and graceful shutdown.
 */

import { Bot } from 'grammy';
import { db } from '../../config/database.js';
import { encrypt } from '../whatsapp/encryption.js';
import { logger } from '../../utils/logger.js';

// In-memory store: accountId → Bot instance
const activeBots = new Map<string, Bot>();

/**
 * Connect a new Telegram bot using its token.
 * Validates the token via getMe(), stores in DB, and starts listening.
 */
export async function connectTelegramBot(
  workspaceId: string,
  botToken: string,
): Promise<{ accountId: string; botUsername: string }> {
  // Validate the token
  const bot = new Bot(botToken);
  const me = await bot.api.getMe();

  // Store in connected_accounts
  const encryptedToken = encrypt(botToken);

  const [account] = await db('connected_accounts')
    .insert({
      workspace_id: workspaceId,
      platform: 'TELEGRAM_BOT',
      display_name: me.first_name + (me.last_name ? ` ${me.last_name}` : ''),
      account_identifier: `@${me.username}`,
      bot_token: encryptedToken,
      is_connected: true,
      connection_status: 'connected',
      metadata: { bot_id: me.id, username: me.username, can_join_groups: me.can_join_groups },
    })
    .returning('*');

  // Start auto-sync listener
  startBotListener(account.id, workspaceId, bot);

  return { accountId: account.id, botUsername: me.username || '' };
}

/**
 * Start a bot's event listener for auto-syncing groups.
 */
function startBotListener(accountId: string, workspaceId: string, bot: Bot): void {
  // Auto-sync: when bot is added to a group, save it as a destination
  bot.on('my_chat_member', async (ctx) => {
    const chat = ctx.myChatMember.chat;
    const newStatus = ctx.myChatMember.new_chat_member.status;

    // Bot was added to a group/supergroup/channel
    if (['member', 'administrator'].includes(newStatus) && chat.type !== 'private') {
      const destType =
        chat.type === 'channel' ? 'TG_CHANNEL' :
        chat.type === 'supergroup' ? 'TG_SUPERGROUP' : 'TG_GROUP';

      await db('destinations')
        .insert({
          workspace_id: workspaceId,
          connected_account_id: accountId,
          platform: 'TELEGRAM_BOT',
          destination_type: destType,
          platform_dest_id: String(chat.id),
          display_name: chat.title || `Telegram ${chat.type}`,
          is_active: true,
        })
        .onConflict(['workspace_id', 'connected_account_id', 'platform_dest_id'])
        .merge(['display_name', 'destination_type', 'is_active']);

      logger.info(`Telegram: auto-synced ${destType} "${chat.title}" (${chat.id}) for workspace ${workspaceId}`);
    }

    // Bot was removed from a group
    if (['left', 'kicked'].includes(newStatus)) {
      await db('destinations')
        .where({
          connected_account_id: accountId,
          platform_dest_id: String(chat.id),
        })
        .update({ is_active: false });

      logger.info(`Telegram: bot removed from "${chat.title}" (${chat.id})`);
    }
  });

  // Start polling (non-blocking)
  bot.start({ onStart: () => { logger.info(`Telegram bot ${accountId} started polling`); } })
    .catch((err) => logger.error(`Telegram bot ${accountId} polling error:`, err));

  activeBots.set(accountId, bot);
}

/**
 * Manually sync all groups the bot is currently in.
 */
export async function syncTelegramGroups(accountId: string): Promise<number> {
  // Grammy doesn't have a built-in "get all chats" method.
  // We rely on the my_chat_member event for auto-sync.
  // This is a placeholder for manual re-sync.
  logger.info(`Manual sync triggered for Telegram account ${accountId}`);
  return 0;
}

/**
 * Disconnect a Telegram bot and stop polling.
 */
export async function disconnectTelegramBot(accountId: string): Promise<void> {
  const bot = activeBots.get(accountId);
  if (bot) {
    await bot.stop();
    activeBots.delete(accountId);
  }

  await db('connected_accounts')
    .where({ id: accountId })
    .update({ is_connected: false, connection_status: 'disconnected' });

  logger.info(`Telegram bot ${accountId} disconnected`);
}

/**
 * Restore all previously connected Telegram bots on startup.
 */
export async function restoreAllTelegramBots(): Promise<void> {
  const accounts = await db('connected_accounts')
    .where({ platform: 'TELEGRAM_BOT', is_connected: true })
    .whereNotNull('bot_token')
    .select('id', 'workspace_id', 'bot_token');

  for (const account of accounts) {
    try {
      const { decrypt } = await import('../whatsapp/encryption.js');
      const token = decrypt<string>(account.bot_token);
      const bot = new Bot(token);
      startBotListener(account.id, account.workspace_id, bot);
      logger.info(`Restored Telegram bot ${account.id}`);
    } catch (err) {
      logger.error(`Failed to restore Telegram bot ${account.id}:`, err);
    }
  }
}

/**
 * Get a bot instance by account ID.
 */
export function getTelegramBot(accountId: string): Bot | undefined {
  return activeBots.get(accountId);
}
