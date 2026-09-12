/**
 * HYDRAX - the backend as a Vercel Function (src/vercel.ts).
 *
 * The handler is served here by a plain Node HTTP server, exactly as Vercel
 * invokes it: a (req, res) function receiving the original request path. The
 * backend behind it is the real app on an isolated test schema.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createApp } from '../src/app.ts';
import { sweepOffline, type Runtime } from '../src/bootstrap.ts';
import { ConfigError } from '../src/config.ts';
import { createVercelHandler, CRON_PATH, type VercelHandler } from '../src/vercel.ts';
import type { AppDeps } from '../src/deps.ts';
import { get, post, startHarness, telemetryPayload } from './helpers.ts';

type Harness = Awaited<ReturnType<typeof startHarness>>;

const T0 = Date.parse('2026-01-01T00:00:00.000Z');

function runtimeFor(h: Harness): Runtime {
  return { deps: h.deps, db: null as unknown as Runtime['db'], app: createApp(h.deps) };
}

async function serve(handler: VercelHandler): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

async function call(base: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, body: body as Record<string, unknown> & { alerts?: { type: string }[] } };
}

test('every request reaches the real backend app with its original path', async () => {
  const h = await startHarness();
  const fn = await serve(createVercelHandler({ boot: async () => runtimeFor(h), env: {} }));
  try {
    const live = await call(fn.url, '/health/live');
    assert.equal(live.status, 200);
    assert.equal(live.body.status, 'ok');

    const content = await call(fn.url, '/api/v1/website-content');
    assert.equal(content.status, 200);
    assert.ok(content.body.sections && typeof content.body.sections === 'object');

    assert.equal((await call(fn.url, '/api/v1/no-such-route')).status, 404);
  } finally {
    await fn.close();
    await h.close();
  }
});

test('the original path carried by a vercel.json rewrite is restored before routing', async () => {
  const h = await startHarness();
  const fn = await serve(createVercelHandler({ boot: async () => runtimeFor(h), env: {} }));
  try {
    // Exactly what the rewrites produce: /api?__hydrax_path=<original path>.
    const content = await call(fn.url, '/api?__hydrax_path=/api/v1/website-content');
    assert.equal(content.status, 200);
    assert.ok(content.body.sections && typeof content.body.sections === 'object');

    const live = await call(fn.url, '/api?__hydrax_path=/health/live');
    assert.equal(live.body.status, 'ok');

    // Other query parameters survive the restoration.
    const alerts = await call(fn.url, '/api?__hydrax_path=/api/v1/alerts&active=false&limit=1');
    assert.equal(alerts.status, 200);
    assert.ok(Array.isArray(alerts.body.alerts));

    // A request that already has its original path is unaffected.
    assert.equal((await call(fn.url, '/health/live')).status, 200);

    // Not a plain absolute path: ignored, so it cannot route anywhere new.
    assert.equal((await call(fn.url, '/api?__hydrax_path=//evil.example/health/live')).status, 404);
  } finally {
    await fn.close();
    await h.close();
  }
});

test('a failed startup answers 503 without leaking detail, and is retried on the next request', async () => {
  const h = await startHarness();
  let attempts = 0;
  const boot = async (): Promise<Runtime> => {
    attempts += 1;
    if (attempts === 1) throw new ConfigError('HYDRAX_DATABASE_URL secret-detail-that-must-not-leak');
    return runtimeFor(h);
  };
  const fn = await serve(createVercelHandler({ boot, env: {} }));
  try {
    const first = await call(fn.url, '/health/live');
    assert.equal(first.status, 503);
    assert.equal(first.body.error, 'service unavailable');
    // A misconfigured deployment explains itself — by variable NAME only.
    assert.equal(first.body.reason, 'configuration');
    assert.deepEqual(first.body.missing, ['HYDRAX_DATABASE_URL', 'HYDRAX_DEVICE_KEY', 'HYDRAX_ADMIN_KEY']);
    assert.ok(!JSON.stringify(first.body).includes('secret-detail-that-must-not-leak'));

    const second = await call(fn.url, '/health/live');
    assert.equal(second.status, 200, 'a transient startup failure must not wedge the instance');
    assert.equal(attempts, 2);

    await call(fn.url, '/health/live');
    assert.equal(attempts, 2, 'a successful startup is reused, not repeated per request');
  } finally {
    await fn.close();
    await h.close();
  }
});

test('a database failure at startup reports only its code and a hint — never host, user or message', async () => {
  const dbError = Object.assign(
    new Error('password authentication failed for user "postgres.abcdefgh" at aws-0-eu-central-1.pooler.supabase.com'),
    { code: '28P01' },
  );
  const env = { HYDRAX_DATABASE_URL: 'postgresql://postgres.abcdefgh:hunter2@aws-0-eu-central-1.pooler.supabase.com:5432/postgres', HYDRAX_DEVICE_KEY: 'd', HYDRAX_ADMIN_KEY: 'a' };
  const fn = await serve(createVercelHandler({ boot: async () => { throw dbError; }, env }));
  try {
    const res = await call(fn.url, '/api/v1/website-content');
    assert.equal(res.status, 503);
    assert.equal(res.body.reason, 'database');
    assert.equal(res.body.code, '28P01');
    assert.match(String(res.body.hint), /username or password/);
    const text = JSON.stringify(res.body);
    for (const secret of ['hunter2', 'postgres.abcdefgh', 'pooler.supabase.com', 'password authentication failed']) {
      assert.ok(!text.includes(secret), `the response must not contain "${secret}"`);
    }
  } finally {
    await fn.close();
  }

  // A timeout without a code still gets a useful category, and nothing else.
  const timeout = await serve(createVercelHandler({
    boot: async () => { throw new Error('Connection terminated due to connection timeout at db.internal:6543'); },
    env,
  }));
  try {
    const res = await call(timeout.url, '/health');
    assert.equal(res.body.code, 'TIMEOUT');
    assert.ok(!JSON.stringify(res.body).includes('db.internal'));
  } finally {
    await timeout.close();
  }
});

test('the maintenance cron fails closed without CRON_SECRET and refuses a wrong or missing secret', async () => {
  const h = await startHarness();
  const unconfigured = await serve(createVercelHandler({ boot: async () => runtimeFor(h), env: {} }));
  const configured = await serve(createVercelHandler({ boot: async () => runtimeFor(h), env: { CRON_SECRET: 'the-real-secret' } }));
  try {
    assert.equal((await call(unconfigured.url, CRON_PATH)).status, 503);
    assert.equal((await call(unconfigured.url, CRON_PATH, { headers: { Authorization: 'Bearer ' } })).status, 503);

    assert.equal((await call(configured.url, CRON_PATH)).status, 401);
    assert.equal((await call(configured.url, CRON_PATH, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await call(configured.url, CRON_PATH, { headers: { Authorization: 'the-real-secret' } })).status, 401);
  } finally {
    await unconfigured.close();
    await configured.close();
    await h.close();
  }
});

test('the maintenance cron, with the secret, raises alerts for devices that went silent', async () => {
  const h = await startHarness({ offlineTimeoutMs: 60_000 });
  const fn = await serve(createVercelHandler({ boot: async () => runtimeFor(h), env: { CRON_SECRET: 's3cret' } }));
  try {
    assert.equal((await post(h, '/api/v1/telemetry', telemetryPayload())).status, 202);
    h.setNow(T0 + 120_000);

    const cron = await call(fn.url, CRON_PATH, { headers: { Authorization: 'Bearer s3cret' } });
    assert.equal(cron.status, 200);
    assert.equal(cron.body.ok, true);

    const alerts = await get(h, '/api/v1/alerts');
    assert.ok(alerts.body.alerts.some((a: { type: string }) => a.type === 'DEVICE_OFFLINE'));
  } finally {
    await fn.close();
    await h.close();
  }
});

test('reading alerts sweeps first, so a silent device shows up without waiting for the cron', async () => {
  const h = await startHarness({ offlineTimeoutMs: 60_000 });
  const fn = await serve(createVercelHandler({ boot: async () => runtimeFor(h), env: {} }));
  try {
    await post(h, '/api/v1/telemetry', telemetryPayload());
    h.setNow(T0 + 120_000);

    const alerts = await call(fn.url, '/api/v1/alerts');
    assert.equal(alerts.status, 200);
    assert.ok(
      (alerts.body.alerts ?? []).some((a) => a.type === 'DEVICE_OFFLINE'),
      'the read itself must reflect the device going offline',
    );
  } finally {
    await fn.close();
    await h.close();
  }
});

test('the sweep on read runs at most once per sweep interval, and only for dashboard and alerts', async () => {
  const h = await startHarness();
  let sweeps = 0;
  const countingSweep = async (deps: AppDeps) => {
    sweeps += 1;
    await sweepOffline(deps);
  };
  const fn = await serve(createVercelHandler({ boot: async () => runtimeFor(h), env: {}, sweep: countingSweep }));
  try {
    h.setNow(T0);
    await call(fn.url, '/api/v1/dashboard');
    await call(fn.url, '/api/v1/alerts');
    await call(fn.url, '/api/v1/dashboard');
    assert.equal(sweeps, 1, 'three reads inside one interval sweep once');

    await call(fn.url, '/api/v1/website-content');
    await call(fn.url, '/health/live');
    assert.equal(sweeps, 1, 'other routes never sweep');

    h.setNow(T0 + 15_000);
    await call(fn.url, '/api/v1/alerts');
    assert.equal(sweeps, 2, 'the next interval sweeps again');
  } finally {
    await fn.close();
    await h.close();
  }
});

test('a failing sweep does not fail the read it was meant to freshen', async () => {
  const h = await startHarness();
  const brokenSweep = async () => {
    throw new Error('database blip');
  };
  const fn = await serve(createVercelHandler({ boot: async () => runtimeFor(h), env: {}, sweep: brokenSweep }));
  try {
    const alerts = await call(fn.url, '/api/v1/alerts');
    assert.equal(alerts.status, 200);
    assert.ok(Array.isArray(alerts.body.alerts));
  } finally {
    await fn.close();
    await h.close();
  }
});
