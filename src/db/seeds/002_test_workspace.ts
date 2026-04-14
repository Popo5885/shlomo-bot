import type { Knex } from 'knex';
import bcrypt from 'bcrypt';

/**
 * Seeds a test workspace + owner member for local development.
 *
 * Login credentials:
 *   Email:    aknvpupuch@gmail.com
 *   Password: Popo5885
 */
export async function seed(knex: Knex): Promise<void> {
  // Only seed if no workspaces exist
  const existing = await knex('workspaces').first();
  if (existing) return;

  // 1. Create workspace
  const [workspace] = await knex('workspaces')
    .insert({
      name: 'Demo Workspace',
      slug: 'demo',
      owner_email: 'aknvpupuch@gmail.com',
      plan: 'pro',
      plan_limits: JSON.stringify({
        max_connected_accounts: 5,
        max_campaigns: 50,
        max_rules: 20,
        max_messages_per_day: 10000,
      }),
      is_active: true,
    })
    .returning('*');

  // 2. Create an "owner" role with all permissions
  const [ownerRole] = await knex('workspace_roles')
    .insert({
      workspace_id: workspace.id,
      name: 'Owner',
      slug: 'owner',
      can_send_free: true,
      requires_approval: false,
      can_approve_messages: true,
      can_global_delete: true,
      can_manage_campaigns: true,
      can_manage_members: true,
      can_manage_destinations: true,
      can_view_analytics: true,
      can_manage_crm: true,
      can_manage_bot_settings: true,
    })
    .returning('*');

  // 3. Create workspace owner member
  const passwordHash = await bcrypt.hash('Popo5885', 12);

  await knex('workspace_members').insert({
    workspace_id: workspace.id,
    email: 'aknvpupuch@gmail.com',
    full_name: 'Admin',
    password_hash: passwordHash,
    role_id: ownerRole.id,
    is_owner: true,
    is_active: true,
  });

  console.log('  Seeded test workspace:');
  console.log(`    Workspace ID: ${workspace.id}`);
  console.log('    Login: aknvpupuch@gmail.com / Popo5885');
}
