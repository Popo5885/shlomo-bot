import type { Knex } from 'knex';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Local Docker (see docker-compose.yml): postgres / postgres @ 127.0.0.1:5433 / app
 * Use 127.0.0.1 instead of localhost to avoid Windows resolving localhost to IPv6 unexpectedly.
 */
function developmentConnection(): Knex.Config['connection'] {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    return url;
  }
  return {
    host: process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? 5433),
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'postgres',
    database: process.env.PGDATABASE ?? 'app',
  };
}

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: developmentConnection(),
    pool: { min: 2, max: 10 },
    migrations: {
      directory: './src/db/migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './src/db/seeds',
    },
  },
  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    },
    pool: { min: 2, max: 20 },
    migrations: {
      directory: './src/db/migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './src/db/seeds',
    },
  },
};

export default config;
