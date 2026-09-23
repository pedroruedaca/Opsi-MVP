import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  return url;
}

// Reuse one client across hot reloads in development.
const globalForDb = globalThis as unknown as { opsiSql?: ReturnType<typeof postgres> };
const client = globalForDb.opsiSql ?? postgres(databaseUrl(), { max: 5, prepare: false });
if (process.env.NODE_ENV !== 'production') globalForDb.opsiSql = client;

export const db = drizzle(client, { schema });
export { schema };
