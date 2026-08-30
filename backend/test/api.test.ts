/**
 * End-to-end HTTP tests against a real server on a real socket.
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  eventPayload,
  get,
  post,
  put,
  startHarness,
  telemetryPayload,
  TEST_ADMIN_KEY,
  TEST_KEY,
  type Harness,
} from './helpers.ts';

const harnesses: Harness[] = [];

async function harness(overrides = {}): Promise<Harness> {
  const instance = await startHarness(overrides);
  harnesses.push(instance);
  return instance;
}

after(async () => {
  await Promise.all(harnesses.map((instance) => instance.close()));
});

describe('health', () => {
  test('reports ok', async () => {
    const h = await harness();
    const response = await get(h, '/health');
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
  });
});

describe('authentication', () => {
  test('rejects telemetry with no device key', async () => {
    const h = await harness();
    const response = await post(h, '/api/v1/telemetry', telemetryPayload(), null);
    assert.equal(response.status, 401);
  });

  test('rejects telemetry with a wrong device key', async () => {
    const h = await harness();
    const response = await post(h, '/api/v1/telemetry', telemetryPayload(), 'wrong-key');
    assert.equal(response.status, 401);
  });

  test('rejects a key of a different length without leaking timing', async () => {
    const h = await harness();
    const response = await post(h, '/api/v1/telemetry', telemetryPayload(), 'x');
    assert.equal(response.status, 401);
  });

  test('accepts the correct device key', async () => {
    const h = await harness();
    const response = await post(h, '/api/v1/telemetry', telemetryPayload(), TEST_KEY);
    assert.equal(response.status, 202);
  });

  test('accepts unauthenticated ingestion only in explicit insecure mode', async () => {
    const h = await harness({ deviceKey: null });
    const response = await post(h, '/api/v1/telemetry', telemetryPayload(), null);
    assert.equal(response.status, 202);
  });
});

describe('telemetry ingestion', () => {
  test('persists a sample and registers the device', async () => {
    const h = await harness();
    const response = await post(h, '/api/v1/telemetry', telemetryPayload());
    assert.equal(response.status, 202);
    assert.equal(response.body.accepted, true);

    const device = await get(h, '/api/v1/devices/HYDRAX-TEST');
    assert.equal(device.status, 200);
    assert.equal(device.body.online, true);
    assert.equal(device.body.current.irrigation_state, 'IDLE');
    assert.equal(device.body.current.zones.length, 2);
    assert.equal(device.body.current.zones[0].average, 45);
  });

  test('rejects a malformed payload with 400 and a reason list', async () => {
    const h = await harness();
    const response = await post(h, '/api/v1/telemetry', { device_id: 'HYDRAX-TEST' });
    assert.equal(response.status, 400);
    assert.ok(Array.isArray(response.body.details));
    assert.ok(response.body.details.length > 0);
  });

  test('rejects a body that is not JSON', async () => {
    const h = await harness();
    const response = await post(h, '/api/v1/telemetry', 'this is not json');
    assert.equal(response.status, 400);
  });

  test('rejects an empty body', async () => {
    const h = await harness();
    const response = await post(h, '/api/v1/telemetry', '');
    assert.equal(response.status, 400);
  });

  test('rejects an oversized body with 413', async () => {
    const h = await harness();
    // Bigger than MAX_BODY_BYTES; must be refused rather than buffered.
    const huge = JSON.stringify({ device_id: 'X', pad: 'y'.repeat(100_000) });
    const response = await post(h, '/api/v1/telemetry', huge);
    assert.equal(response.status, 413);
  });

  test('keeps history while current state tracks the newest sample', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload({ zone1: 40, uptimeMs: 1000 }));
    await post(h, '/api/v1/telemetry', telemetryPayload({ zone1: 30, uptimeMs: 2000 }));
    await post(h, '/api/v1/telemetry', telemetryPayload({ zone1: 20, uptimeMs: 3000 }));

    const device = await get(h, '/api/v1/devices/HYDRAX-TEST');
    assert.equal(device.body.current.zones[0].average, 20, 'current state is the newest sample');
    assert.equal(device.body.telemetry_count, 3, 'history retains every sample');

    const history = await get(h, '/api/v1/devices/HYDRAX-TEST/telemetry?limit=10');
    assert.equal(history.body.telemetry.length, 3);
  });

  test('records simulated samples as simulated', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload({ simulated: true }));
    const dashboard = await get(h, '/api/v1/dashboard');
    assert.equal(dashboard.body.devices[0].simulated, true);
  });
});

describe('event ingestion', () => {
  test('persists an event', async () => {
    const h = await harness();
    const response = await post(h, '/api/v1/events', eventPayload());
    assert.equal(response.status, 202);

    const events = await get(h, '/api/v1/devices/HYDRAX-TEST/events');
    assert.equal(events.body.events.length, 1);
    assert.equal(events.body.events[0].type, 'IRRIGATION_STARTED');
    assert.equal(events.body.events[0].zone, 1);
  });

  test('rejects an unknown event type', async () => {
    const h = await harness();
    const response = await post(h, '/api/v1/events', eventPayload({ type: 'NOPE' }));
    assert.equal(response.status, 400);
  });
});

describe('device queries', () => {
  test('404s an unknown device', async () => {
    const h = await harness();
    assert.equal((await get(h, '/api/v1/devices/GHOST')).status, 404);
    assert.equal((await get(h, '/api/v1/devices/GHOST/events')).status, 404);
    assert.equal((await get(h, '/api/v1/devices/GHOST/telemetry')).status, 404);
  });

  test('lists registered devices', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload({ deviceId: 'HYDRAX-A' }));
    await post(h, '/api/v1/telemetry', telemetryPayload({ deviceId: 'HYDRAX-B' }));

    const list = await get(h, '/api/v1/devices');
    assert.equal(list.body.devices.length, 2);
    assert.deepEqual(
      list.body.devices.map((d: any) => d.device_id),
      ['HYDRAX-A', 'HYDRAX-B'],
    );
  });

  test('marks a device offline once it has gone quiet', async () => {
    const h = await harness({ offlineTimeoutMs: 60_000 });
    await post(h, '/api/v1/telemetry', telemetryPayload());

    let device = await get(h, '/api/v1/devices/HYDRAX-TEST');
    assert.equal(device.body.online, true);

    // Jump the clock past the offline window.
    h.setNow(Date.parse('2026-01-01T00:00:00.000Z') + 120_000);
    device = await get(h, '/api/v1/devices/HYDRAX-TEST');
    assert.equal(device.body.online, false);
  });
});

describe('zone configuration', () => {
  test('stores and returns thresholds, flagged as not device-applied', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload());

    const written = await put(h, '/api/v1/devices/HYDRAX-TEST/config', {
      zones: [
        { zone: 1, start_percent: 30, stop_percent: 55 },
        { zone: 2, start_percent: 35, stop_percent: 60 },
      ],
    });
    assert.equal(written.status, 200);
    // Phase 1 honesty: the firmware does not consume this yet.
    assert.equal(written.body.applied_by_device, false);

    const read = await get(h, '/api/v1/devices/HYDRAX-TEST/config');
    assert.equal(read.body.zones.length, 2);
    assert.equal(read.body.zones[0].start_percent, 30);
  });

  test('refuses a threshold change without an operator key', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload());

    const body = { zones: [{ zone: 1, start_percent: 10, stop_percent: 90 }] };
    // Anonymous and wrong-key callers must not be able to change when water flows.
    assert.equal((await put(h, '/api/v1/devices/HYDRAX-TEST/config', body, null)).status, 401);
    assert.equal((await put(h, '/api/v1/devices/HYDRAX-TEST/config', body, 'wrong')).status, 401);

    // Nothing was written.
    const read = await get(h, '/api/v1/devices/HYDRAX-TEST/config');
    assert.equal(read.body.zones.length, 0);

    assert.equal(
      (await put(h, '/api/v1/devices/HYDRAX-TEST/config', body, TEST_ADMIN_KEY)).status,
      200,
    );
  });

  test('the device key is not accepted for operator actions', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload());
    // A key extracted from a controller must not grant threshold control.
    const response = await put(
      h,
      '/api/v1/devices/HYDRAX-TEST/config',
      { zones: [{ zone: 1, start_percent: 10, stop_percent: 90 }] },
      TEST_KEY,
    );
    assert.equal(response.status, 401);
  });

  test('rejects a band that would short-cycle the pump', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload());
    const response = await put(h, '/api/v1/devices/HYDRAX-TEST/config', {
      zones: [{ zone: 1, start_percent: 50, stop_percent: 51 }],
    });
    assert.equal(response.status, 400);
  });
});

describe('routing', () => {
  test('405s a known path with the wrong method', async () => {
    const h = await harness();
    const response = await get(h, '/api/v1/telemetry');
    assert.equal(response.status, 405);
  });

  test('404s an unknown api path', async () => {
    const h = await harness();
    const response = await get(h, '/api/v1/nothing-here');
    assert.equal(response.status, 404);
  });

  test('serves the public website at the root', async () => {
    const h = await harness();
    const response = await fetch(`${h.baseUrl}/`);
    assert.equal(response.status, 200);
    assert.ok((response.headers.get('content-type') ?? '').startsWith('text/html'));
  });

  test('serves the dashboard under /dashboard', async () => {
    const h = await harness();
    const response = await fetch(`${h.baseUrl}/dashboard`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /HYDRAX/);
  });

  test('serves dashboard assets under the mount prefix', async () => {
    const h = await harness();
    const css = await fetch(`${h.baseUrl}/dashboard/styles.css`);
    assert.equal(css.status, 200);
    assert.ok((css.headers.get('content-type') ?? '').startsWith('text/css'));

    const js = await fetch(`${h.baseUrl}/dashboard/js/app.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') ?? '', /javascript/);
  });

  test('sets defensive headers on static responses', async () => {
    const h = await harness();
    const response = await fetch(`${h.baseUrl}/dashboard`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  });

  test('does not serve files outside the dashboard directory', async () => {
    const h = await harness();
    // Encoded traversal must not escape the served root.
    const response = await fetch(`${h.baseUrl}/..%2f..%2fbackend%2fpackage.json`);
    assert.equal(response.status, 404);
  });
});

describe('dashboard aggregate', () => {
  test('returns everything the UI renders in one call', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload({ zone1: 22, valve1: true, pump: true, state: 'IRRIGATING', activeZone: 1, runMs: 45_000 }));
    await post(h, '/api/v1/events', eventPayload());

    const response = await get(h, '/api/v1/dashboard');
    assert.equal(response.status, 200);

    const device = response.body.devices[0];
    assert.equal(device.device_id, 'HYDRAX-TEST');
    assert.equal(device.online, true);
    assert.equal(device.pump_on, true);
    assert.equal(device.irrigation.state, 'IRRIGATING');
    assert.equal(device.irrigation.active_zone, 1);
    assert.equal(device.zones.length, 2);
    assert.equal(device.zones[0].valve_open, true);
    assert.equal(device.zones[0].irrigating, true);
    assert.equal(device.zones[1].irrigating, false);
    assert.equal(device.events.length, 1);
  });

  test('is empty but well-formed before any device reports', async () => {
    const h = await harness();
    const response = await get(h, '/api/v1/dashboard');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.devices, []);
  });
});
