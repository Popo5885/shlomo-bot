/**
 * Production migration runner (plain ESM — no TypeScript, no tsx).
 * Runs compiled JS migrations from dist/db/migrations/.
 * Called in Dockerfile.server before starting the API server.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Knex from 'knex';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'dist', 'db', 'migrations');

const db = Knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
  migrations: {
    directory: migrationsDir,
    extension: 'js',
    loadExtensions: ['.js'],
  },
});

console.log('Running database migrations...');
try {
  const [batch, migrations] = await db.migrate.latest();
  if (migrations.length === 0) {
    console.log('No new migrations to run.');
  } else {
    console.log(`Batch ${batch}: ${migrations.length} migration(s) applied`);
    migrations.forEach(m => console.log(`  v ${m}`));
  }
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
} finally {
  await db.destroy();
}
console.log('Done.');
