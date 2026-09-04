/**
 * HYDRAX - database bootstrap.
 *
 * Postgres (Supabase-hosted), through `pg`. Connections go through the
 * "Session pooler" (not "Transaction pooler" or "Direct connection") — see
 * docs/CONFIGURATION.md — because session mode gives each pooled connection
 * full protocol support: prepared statements and per-connection `SET`, both
 * of which schema-scoped queries below depend on.
 *
 * A hosted free-tier Postgres instance has a small absolute connection
 * ceiling — well under what one pool per caller would use if every caller
 * opened its own. Production only ever needs one pool for the process's
 * whole lifetime; the test suite is the case that matters here, since it can
 * open many `Repository` instances (see test/helpers.ts, which shares one
 * pool across every harness in a file rather than one pool each).
 */

import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { log } from '../log.ts';

const { Pool } = pg;
const HERE = dirname(fileURLToPath(import.meta.url));

export type Db = pg.Pool;
export type DbClient = pg.PoolClient;

function isLocal(connectionString: string): boolean {
  return /^(localhost|127\.0\.0\.1)/.test(new URL(connectionString).hostname);
}

/** Opens a connection pool. Kept small: see the file header. */
export function createPool(connectionString: string): Db {
  return new Pool({
    connectionString,
    ssl: isLocal(connectionString) ? undefined : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10_000,
  });
}

/**
 * Creates `schema` if needed and applies schema.sql into it, idempotently
 * (every statement is `IF NOT EXISTS` / `ON CONFLICT`) — the same "no
 * separate migration step, safe to run on every boot" design the SQLite
 * version used.
 */
export async function provisionSchema(pool: Db, schema: string): Promise<void> {
  if (schema !== 'public') {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  }
  const schemaSql = readFileSync(join(HERE, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(schemaSql);
  } finally {
    client.release();
  }
  log.info('db', `Database ready (schema "${schema}")`);
}

/** Convenience for production: one pool, one schema, ready to use. */
export async function openDatabase(connectionString: string, schema = 'public'): Promise<Db> {
  const pool = createPool(connectionString);
  await provisionSchema(pool, schema);
  return pool;
}

export async function closeDatabase(pool: Db): Promise<void> {
  await pool.end();
}

/** Test-only: drops an isolated schema and everything in it. */
export async function dropSchema(pool: Db, schema: string): Promise<void> {
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
}

/** Postgres error code for a UNIQUE constraint violation. */
export const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}
