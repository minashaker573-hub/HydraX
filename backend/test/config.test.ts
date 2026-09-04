/**
 * Configuration loading — the rules that decide whether the server is allowed
 * to start at all. These are security-relevant defaults, so they are asserted
 * rather than assumed.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ConfigError, loadConfig } from '../src/config.ts';

const DEFAULTS = {
  dashboardDir: '/tmp/dash',
  websiteDir: '/tmp/site',
  adminDir: '/tmp/admin',
};

// loadConfig only validates that a database URL string is present — it never
// opens a connection — so a fake one here keeps this file fast and
// network-independent while still exercising the real validation path.
const FAKE_DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

function load(env: Record<string, string | undefined>) {
  return loadConfig({ HYDRAX_DATABASE_URL: FAKE_DATABASE_URL, ...env } as NodeJS.ProcessEnv, DEFAULTS);
}

describe('secret requirements', () => {
  test('refuses to start with no device key', () => {
    assert.throws(
      () => load({ HYDRAX_ADMIN_KEY: 'admin' }),
      (error: unknown) =>
        error instanceof ConfigError && /HYDRAX_DEVICE_KEY is not set/.test(error.message),
    );
  });

  test('refuses to start with no admin key', () => {
    // Without this, threshold changes and alert resolution would be open to
    // anyone who can reach the port.
    assert.throws(
      () => load({ HYDRAX_DEVICE_KEY: 'device' }),
      (error: unknown) =>
        error instanceof ConfigError && /HYDRAX_ADMIN_KEY is not set/.test(error.message),
    );
  });

  test('refuses to reuse one secret for both roles', () => {
    // The device key is flashed into every controller in the field; reusing it
    // as the operator key would make extracting it from one board enough to
    // rewrite thresholds for the whole farm.
    assert.throws(
      () => load({ HYDRAX_DEVICE_KEY: 'same', HYDRAX_ADMIN_KEY: 'same' }),
      (error: unknown) =>
        error instanceof ConfigError && /must differ from HYDRAX_DEVICE_KEY/.test(error.message),
    );
  });

  test('accepts two distinct secrets', () => {
    const config = load({ HYDRAX_DEVICE_KEY: 'device', HYDRAX_ADMIN_KEY: 'admin' });
    assert.equal(config.deviceKey, 'device');
    assert.equal(config.adminKey, 'admin');
  });

  test('insecure mode disables both, and only when asked explicitly', () => {
    const config = load({ HYDRAX_ALLOW_INSECURE: 'true' });
    assert.equal(config.deviceKey, null);
    assert.equal(config.adminKey, null);

    // Anything other than the exact string must not unlock it.
    assert.throws(() => load({ HYDRAX_ALLOW_INSECURE: '1' }), ConfigError);
    assert.throws(() => load({ HYDRAX_ALLOW_INSECURE: 'yes' }), ConfigError);
    assert.throws(() => load({ HYDRAX_ALLOW_INSECURE: 'TRUE' }), ConfigError);
  });

  test('whitespace-only secrets count as unset', () => {
    assert.throws(
      () => load({ HYDRAX_DEVICE_KEY: '   ', HYDRAX_ADMIN_KEY: 'admin' }),
      ConfigError,
    );
  });
});

describe('database configuration', () => {
  test('refuses to start with no database url', () => {
    assert.throws(
      () => load({ HYDRAX_DEVICE_KEY: 'device', HYDRAX_ADMIN_KEY: 'admin', HYDRAX_DATABASE_URL: undefined }),
      (error: unknown) =>
        error instanceof ConfigError && /HYDRAX_DATABASE_URL is not set/.test(error.message),
    );
  });

  test('accepts a Postgres connection string', () => {
    const config = load({ HYDRAX_DEVICE_KEY: 'device', HYDRAX_ADMIN_KEY: 'admin' });
    assert.equal(config.databaseUrl, FAKE_DATABASE_URL);
  });
});

describe('numeric settings', () => {
  const base = { HYDRAX_DEVICE_KEY: 'device', HYDRAX_ADMIN_KEY: 'admin' };

  test('applies documented defaults', () => {
    const config = load(base);
    assert.equal(config.port, 8080);
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.offlineTimeoutMs, 60_000);
    assert.equal(config.retentionDays, 30);
    assert.equal(config.requestRateMax, 10);
  });

  test('rejects a non-numeric or negative value rather than silently defaulting', () => {
    assert.throws(() => load({ ...base, HYDRAX_PORT: 'eight thousand' }), ConfigError);
    assert.throws(() => load({ ...base, HYDRAX_RETENTION_DAYS: '-1' }), ConfigError);
  });

  test('retention of 0 is honoured as "never prune"', () => {
    assert.equal(load({ ...base, HYDRAX_RETENTION_DAYS: '0' }).retentionDays, 0);
  });
});
