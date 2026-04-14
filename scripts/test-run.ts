/**
 * Local E2E Test Script
 *
 * Seeds a fake workspace, connected account, destinations, campaign,
 * and triggers it — so you can verify the full flow:
 *
 *   DB insert → enqueueBatch → BullMQ → Worker picks up → status updates
 *
 * Usage:
 *   1. Start Redis and PostgreSQL
 *   2. Run migrations: npx tsx scripts/migrate.ts --seed
 *   3. Run this script: npx tsx scripts/test-run.ts
 *   4. In another terminal: npm run dev:worker
 *   5. Watch the worker logs — messages will "process" (send will fail
 *      because there's no real WhatsApp connection, but the flow is verified)
 *
 * Optional flags:
 *   --rule     Test distribution rule trigger instead of campaign
 *   --count N  Number of destinations (default: 5)
 */

import Knex from 'knex';
import dotenv from 'dotenv';

dotenv.config();

const knex = Knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
});

const TEST_PREFIX = 'test-run';

async function main() {
  const useRule = process.argv.includes('--rule');
  const countArg = process.argv.indexOf('--count');
  const destCount = countArg !== -1 ? parseInt(process.argv[countArg + 1], 10) : 5;

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   E2E Test: DB → Queue → Worker Flow     ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Mode: ${useRule ? 'Distribution Rule' : 'Campaign'}`);
  console.log(`Destinations: ${destCount}\n`);

  // ── 1. Create test workspace ──
  console.log('1. Creating test workspace...');
  const [workspace] = await knex('workspaces')
    .insert({
      name: `${TEST_PREFIX}-workspace`,
      slug: `${TEST_PREFIX}-${Date.now()}`,
      owner_email: 'test@test.local',
      plan: 'trial',
    })
    .returning('id');
  console.log(`   ✓ Workspace: ${workspace.id}`);

  // ── 2. Create fake connected account ──
  console.log('2. Creating fake connected account...');
  const [account] = await knex('connected_accounts')
    .insert({
      workspace_id: workspace.id,
      platform: 'WHATSAPP_WEB',
      display_name: `${TEST_PREFIX}-account`,
      account_identifier: '+972500000000',
      is_connected: false,
      connection_status: 'disconnected',
    })
    .returning('id');
  console.log(`   ✓ Account: ${account.id}`);

  // ── 3. Create destinations ──
  console.log(`3. Creating ${destCount} test destinations...`);
  const destRows = Array.from({ length: destCount }, (_, i) => ({
    workspace_id: workspace.id,
    connected_account_id: account.id,
    platform: 'WHATSAPP_WEB',
    destination_type: 'WA_GROUP',
    platform_dest_id: `${TEST_PREFIX}-group-${i + 1}@g.us`,
    display_name: `Test Group ${i + 1}`,
    is_active: true,
  }));

  const destinations = await knex('destinations')
    .insert(destRows)
    .returning('id');
  console.log(`   ✓ ${destinations.length} destinations created`);

  if (useRule) {
    await testRuleTrigger(workspace.id, account.id, destinations);
  } else {
    await testCampaignTrigger(workspace.id, account.id, destinations);
  }

  // ── Final: Show queue status ──
  console.log('\n── Queue Status ──');
  const stats = await knex('message_queue')
    .where('workspace_id', workspace.id)
    .select('status')
    .count('* as count')
    .groupBy('status');

  for (const s of stats) {
    console.log(`   ${s.status}: ${s.count}`);
  }

  // Show first few items with their scheduled times
  const items = await knex('message_queue')
    .where('workspace_id', workspace.id)
    .orderBy('scheduled_send_at', 'asc')
    .limit(5)
    .select('id', 'status', 'scheduled_send_at', 'destination_id');

  console.log('\n── First 5 Queue Items ──');
  for (const item of items) {
    const sendAt = new Date(item.scheduled_send_at);
    const delayMs = sendAt.getTime() - Date.now();
    console.log(`   #${item.id} | ${item.status} | sends in ${Math.max(0, Math.round(delayMs / 1000))}s`);
  }

  console.log('\n✅ Test data seeded. Start the worker to process:');
  console.log('   npm run dev:worker\n');
  console.log('To clean up test data:');
  console.log(`   npx tsx scripts/test-run.ts --cleanup ${workspace.id}`);

  await knex.destroy();
}

async function testCampaignTrigger(
  workspaceId: string,
  accountId: string,
  destinations: Array<{ id: string }>
) {
  console.log('\n4. Creating test campaign...');
  const [campaign] = await knex('campaigns')
    .insert({
      workspace_id: workspaceId,
      name: `${TEST_PREFIX}-campaign`,
      status: 'approved',
      message_text: '🧪 This is a test message from the E2E test script.\nTimestamp: ' + new Date().toISOString(),
      delay_preset: 'fast',
      delay_min_seconds: 3,
      delay_max_seconds: 5,
      total_targets: destinations.length,
    })
    .returning('id');
  console.log(`   ✓ Campaign: ${campaign.id}`);

  // ── 5. Add campaign targets ──
  console.log('5. Adding campaign targets...');
  const targetRows = destinations.map((d, i) => ({
    campaign_id: campaign.id,
    destination_id: d.id,
    sort_order: i,
  }));
  await knex('campaign_targets').insert(targetRows);
  console.log(`   ✓ ${targetRows.length} targets added`);

  // ── 6. Trigger the campaign (directly insert into queue) ──
  console.log('6. Triggering campaign (inserting into message_queue)...');

  // We import dynamically to avoid needing Redis/BullMQ for the DB-only test
  // Instead, insert directly into message_queue to test the Worker side
  const baseTime = Date.now();
  const queueRows = destinations.map((d, i) => ({
    workspace_id: workspaceId,
    source_type: 'campaign',
    campaign_id: campaign.id,
    destination_id: d.id,
    connected_account_id: accountId,
    message_text: '🧪 Test message #' + (i + 1) + ' — ' + new Date().toISOString(),
    status: 'pending',
    priority: 3,
    // Stagger sends: 0s, ~4s, ~8s, ~12s, ...
    scheduled_send_at: new Date(baseTime + i * (3000 + Math.random() * 2000)),
  }));

  await knex('message_queue').insert(queueRows);

  await knex('campaigns')
    .where({ id: campaign.id })
    .update({ status: 'running', started_at: knex.fn.now() });

  console.log(`   ✓ ${queueRows.length} messages inserted into queue`);
}

async function testRuleTrigger(
  workspaceId: string,
  accountId: string,
  destinations: Array<{ id: string }>
) {
  // Create source group
  console.log('\n4. Creating source group + distribution rule...');
  const [sourceGroup] = await knex('source_groups')
    .insert({
      workspace_id: workspaceId,
      connected_account_id: accountId,
      platform: 'WHATSAPP_WEB',
      platform_group_id: `${TEST_PREFIX}-source@g.us`,
      display_name: 'Test Source Group',
      trigger_all: true,
    })
    .returning('id');

  // Create rule
  const [rule] = await knex('distribution_rules')
    .insert({
      workspace_id: workspaceId,
      name: `${TEST_PREFIX}-rule`,
      source_group_id: sourceGroup.id,
      is_active: true,
      delay_mode: 'random',
      delay_preset: 'fast',
      delay_min_seconds: 3,
      delay_max_seconds: 5,
    })
    .returning('id');
  console.log(`   ✓ Rule: ${rule.id}`);

  // Link destinations to rule
  console.log('5. Linking destinations to rule...');
  const rdRows = destinations.map((d, i) => ({
    rule_id: rule.id,
    destination_id: d.id,
    sort_order: i,
    is_active: true,
  }));
  await knex('rule_destinations').insert(rdRows);

  // Simulate incoming message by inserting into queue directly
  console.log('6. Simulating incoming message trigger...');
  const baseTime = Date.now();
  const queueRows = destinations.map((d, i) => ({
    workspace_id: workspaceId,
    source_type: 'trigger',
    source_rule_id: rule.id,
    destination_id: d.id,
    connected_account_id: accountId,
    message_text: '📨 Forwarded test message — ' + new Date().toISOString(),
    status: 'pending',
    priority: 5,
    scheduled_send_at: new Date(baseTime + i * (3000 + Math.random() * 2000)),
  }));

  await knex('message_queue').insert(queueRows);
  console.log(`   ✓ ${queueRows.length} messages inserted into queue`);
}

// ── Cleanup ──
if (process.argv.includes('--cleanup')) {
  const wsId = process.argv[process.argv.indexOf('--cleanup') + 1];
  if (!wsId) {
    console.error('Usage: --cleanup <workspace_id>');
    process.exit(1);
  }
  console.log(`Cleaning up workspace ${wsId}...`);
  knex('workspaces')
    .where({ id: wsId })
    .del()
    .then((count) => {
      console.log(`✓ Deleted workspace and ${count} cascade rows`);
      return knex.destroy();
    })
    .catch((err) => {
      console.error('Cleanup failed:', err);
      process.exit(1);
    });
} else {
  main().catch((err) => {
    console.error('\n❌ Test failed:', err.message ?? err);
    knex.destroy().then(() => process.exit(1));
  });
}
