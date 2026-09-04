/**
 * Server-level reliability: what happens when the database is genuinely
 * unreachable, not just slow. Simulated the deterministic, realistic way —
 * a real `pg.Pool` that has already had `.end()` called on it — rather than
 * with a mock: every query against it rejects exactly the way a query
 * against an unreachable Supabase instance would, "Cannot use a pool after
 * calling end", with no network flakiness to make the test itself flaky.
 *
 * These exist because of a real production crash (commit dfbfedc: an
 * unhandled 'error' event on an idle pool connection took the whole server
 * down) and this follow-up audit's central question: what *else* happens
 * when the database is not there.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.ts';
import { createPool } from '../src/db/index.ts';
import { Repository } from '../src/db/repository.ts';
import { testConfig, TEST_ADMIN_KEY } from './helpers.ts';
import type { AppDeps } from '../src/deps.ts';

const TEST_DATABASE_URL = process.env.HYDRAX_TEST_DATABASE_URL ?? process.env.HYDRAX_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error('HYDRAX_TEST_DATABASE_URL (or HYDRAX_DATABASE_URL) is not set. See docs/TESTING.md.');
}

const servers: Server[] = [];
after(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

/** A server backed by a pool that is already dead — every query rejects. */
async function unreachableDbHarness(): Promise<{ baseUrl: string }> {
  const pool = createPool(TEST_DATABASE_URL!);
  await pool.end(); // dead on arrival, deliberately

  const repo = new Repository(pool);
  const deps: AppDeps = { repo, config: testConfig(), now: () => Date.now() };
  const server = createServer(createApp(deps));
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}` };
}

describe('when the database is unreachable', () => {
  test('/health/live still reports ok — it never touches the database', async () => {
    const h = await unreachableDbHarness();
    const response = await fetch(`${h.baseUrl}/health/live`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.status, 'ok');
  });

  test('/health reports a controlled 503, not a crash or a generic 500', async () => {
    const h = await unreachableDbHarness();
    const response = await fetch(`${h.baseUrl}/health`);
    assert.equal(response.status, 503);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.status, 'error');
    assert.equal(body.database, 'unreachable');
  });

  test('/health response does not leak connection details or stack traces', async () => {
    const h = await unreachableDbHarness();
    const text = await (await fetch(`${h.baseUrl}/health`)).text();
    assert.ok(!text.includes('postgresql://'), 'must not echo the connection string');
    assert.ok(!/\.ts:\d+/.test(text), 'must not include a stack trace / file:line');
  });

  test('a DB-dependent route fails safely (500, no leak) instead of hanging or crashing', async () => {
    const h = await unreachableDbHarness();
    const response = await fetch(`${h.baseUrl}/api/v1/devices`);
    assert.equal(response.status, 500);
    const text = await response.text();
    assert.ok(!text.includes('postgresql://'));
    assert.ok(!/\.ts:\d+/.test(text));

    // The server itself must still be usable — one broken request must not
    // take the process (or this connection) down with it.
    const stillUp = await fetch(`${h.baseUrl}/health/live`);
    assert.equal(stillUp.status, 200);
  });

  test('the admin-authenticated path also fails safely rather than hanging', async () => {
    const h = await unreachableDbHarness();
    const response = await fetch(`${h.baseUrl}/api/v1/requests`, {
      headers: { 'X-Admin-Key': TEST_ADMIN_KEY },
    });
    assert.equal(response.status, 500);
  });
});
