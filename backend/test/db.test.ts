/**
 * Connection pool resilience.
 *
 * `pg.Pool` emits 'error' on the pool itself when a connection sitting idle
 * in it is dropped by the server or the network — routine over a real
 * network, and not the same as a query failing (a query's own error rejects
 * that query's promise; an idle connection has no caller to reject to).
 * Node's default for an unhandled 'error' event is to crash the process.
 * This took a running HYDRAX server down once, on a connection nothing was
 * actively using — see the `pool.on('error', ...)` handler in
 * src/db/index.ts. This test is here so that handler cannot regress silently.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createPool } from '../src/db/index.ts';

const TEST_DATABASE_URL = process.env.HYDRAX_TEST_DATABASE_URL ?? process.env.HYDRAX_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error('HYDRAX_TEST_DATABASE_URL (or HYDRAX_DATABASE_URL) is not set. See docs/TESTING.md.');
}

describe('connection pool resilience', () => {
  test('an idle-connection error does not crash the process, and the pool stays usable', async () => {
    const pool = createPool(TEST_DATABASE_URL!);
    try {
      // Simulates exactly what pg does when a pooled connection is dropped
      // server-side. If createPool() had no 'error' listener, this line
      // would throw synchronously (Node's unhandled-'error'-event behavior)
      // and, outside a test, take the whole process down with it.
      assert.doesNotThrow(() => pool.emit('error', new Error('simulated idle-connection drop')));

      // The pool must still work afterward — this is routine, not fatal.
      const result = await pool.query('SELECT 1 AS ok');
      assert.equal(result.rows[0]!.ok, 1);
    } finally {
      await pool.end();
    }
  });
});
