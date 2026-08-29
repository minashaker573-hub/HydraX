/**
 * HYDRAX - database bootstrap.
 *
 * Uses Node's built-in SQLite (`node:sqlite`). SQLite is the right fit for a
 * single-farm Phase 1 deployment: no server to run, no driver to install, and
 * the whole dataset is one file that can be copied off the box.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { log } from '../log.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

export type Db = DatabaseSync;

export function openDatabase(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  const schema = readFileSync(join(HERE, 'schema.sql'), 'utf8');
  db.exec(schema);

  log.info('db', `Database ready at ${dbPath}`);
  return db;
}
