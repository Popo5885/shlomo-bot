import type { Knex } from 'knex';
import bcrypt from 'bcrypt';

export async function seed(knex: Knex): Promise<void> {
  // Only seed if no super_admin exists
  const existing = await knex('super_admins').first();
  if (existing) return;

  const passwordHash = await bcrypt.hash('changeme123!', 12);

  await knex('super_admins').insert({
    email: 'admin@platform.local',
    password_hash: passwordHash,
    full_name: 'Super Admin',
    ip_whitelist: '{}', // empty = allow all
  });

  // Seed platform_api_status
  await knex('platform_api_status').insert([
    { platform: 'WHATSAPP_WEB', is_operational: true },
    { platform: 'WHATSAPP_BUSINESS_API', is_operational: true },
    { platform: 'TELEGRAM_BOT', is_operational: true },
    { platform: 'TELEGRAM_USERBOT', is_operational: true },
  ]);
}
