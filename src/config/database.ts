import Knex from 'knex';
import { env } from './env.js';

export const db = Knex({
  client: 'pg',
  connection: {
    connectionString: env.DATABASE_URL,
    // Keep connections alive — prevents "database is closed" errors
    // when Baileys Signal Protocol key store tries to write after idle
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  },
  pool: {
    min: 2,
    max: 20,
    acquireTimeoutMillis: 60000,
    // Long idle timeout to prevent premature reaping while Baileys holds refs
    idleTimeoutMillis: 300000, // 5 minutes
    reapIntervalMillis: 30000,
    // Validate connection before handing it out from pool
    afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
      conn.query('SELECT 1', (err: Error | null) => {
        if (err) {
          // Connection is dead — let pool discard it and create a new one
          done(err, conn);
        } else {
          done(null, conn);
        }
      });
    },
  },
  migrations: {
    directory: './src/db/migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './src/db/seeds',
  },
});

// Periodically ping the pool to keep connections alive
// This prevents the "database is closed" error from idle connection reaping
setInterval(() => {
  db.raw('SELECT 1').catch(() => {
    // Silently handle — the pool will auto-reconnect
  });
}, 60000); // every 60 seconds
