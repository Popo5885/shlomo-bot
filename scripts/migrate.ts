/**
 * Run database migrations.
 * Usage: npx tsx scripts/migrate.ts
 *
 * Can also be used as a Railway deploy command or one-off task.
 */

import Knex from 'knex';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const knex = Knex({
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './src/db/migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './src/db/seeds',
    },
  });

  console.log('Running migrations...');
  const [batch, migrations] = await knex.migrate.latest();
  console.log(`Batch ${batch}: ${migrations.length} migrations applied`);
  for (const m of migrations) {
    console.log(`  ✓ ${m}`);
  }

  if (process.argv.includes('--seed')) {
    console.log('\nRunning seeds...');
    await knex.seed.run();
    console.log('Seeds completed.');
  }

  await knex.destroy();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
