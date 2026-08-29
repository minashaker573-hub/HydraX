/**
 * Alert rules: raising, de-duplicating, auto-resolving and offline sweeping.
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';

import { sweepOfflineDevices } from '../src/domain/alerts.ts';
import {
  eventPayload,
  get,
  post,
  startHarness,
  telemetryPayload,
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

const T0 = Date.parse('2026-01-01T00:00:00.000Z');

describe('sensor alerts', () => {
  test('raises a critical alert when the controller reports SENSOR_ERROR', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload({ status: 'SENSOR_ERROR' }));

    const alerts = await get(h, '/api/v1/alerts');
    assert.equal(alerts.body.alerts.length, 1);
    assert.equal(alerts.body.alerts[0].type, 'SENSOR_ERROR');
    assert.equal(alerts.body.alerts[0].severity, 'critical');
    assert.equal(alerts.body.alerts[0].active, true);
  });

  test('does not duplicate an alert that is already open', async () => {
    const h = await harness();
    // A flapping probe would otherwise generate one row per telemetry sample.
    for (let i = 0; i < 5; i += 1) {
      await post(h, '/api/v1/telemetry', telemetryPayload({ status: 'SENSOR_ERROR' }));
    }
    const alerts = await get(h, '/api/v1/alerts');
    assert.equal(alerts.body.alerts.length, 1);
  });

  test('resolves the alert once the controller reports OK again', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload({ status: 'SENSOR_ERROR' }));
    await post(h, '/api/v1/telemetry', telemetryPayload({ status: 'OK' }));

    const active = await get(h, '/api/v1/alerts');
    assert.equal(active.body.alerts.length, 0, 'a cleared condition must not stay red');

    const all = await get(h, '/api/v1/alerts?active=false');
    assert.equal(all.body.alerts.length, 1);
    assert.equal(all.body.alerts[0].active, false);
    assert.ok(all.body.alerts[0].resolved_at);
  });

  test('a SENSOR_RECOVERED event clears a sensor alert', async () => {
    const h = await harness();
    await post(h, '/api/v1/events', eventPayload({ type: 'SENSOR_ERROR', detail: 'probe 3 dead' }));
    assert.equal((await get(h, '/api/v1/alerts')).body.alerts.length, 1);

    await post(h, '/api/v1/events', eventPayload({ type: 'SENSOR_RECOVERED' }));
    assert.equal((await get(h, '/api/v1/alerts')).body.alerts.length, 0);
  });
});

describe('actuator alerts', () => {
  test('raises on ACTUATOR_ERROR and clears on FAULT_CLEARED', async () => {
    const h = await harness();
    await post(h, '/api/v1/events', eventPayload({ type: 'ACTUATOR_ERROR', detail: 'valve stuck' }));

    let alerts = await get(h, '/api/v1/alerts');
    assert.equal(alerts.body.alerts[0].type, 'ACTUATOR_ERROR');
    assert.equal(alerts.body.alerts[0].severity, 'critical');

    await post(h, '/api/v1/events', eventPayload({ type: 'FAULT_CLEARED' }));
    alerts = await get(h, '/api/v1/alerts');
    assert.equal(alerts.body.alerts.length, 0);
  });
});

describe('timeout alerts', () => {
  test('raises on IRRIGATION_TIMEOUT', async () => {
    const h = await harness();
    await post(
      h,
      '/api/v1/events',
      eventPayload({ type: 'IRRIGATION_TIMEOUT', zone: 2, duration_ms: 600_000 }),
    );

    const alerts = await get(h, '/api/v1/alerts');
    assert.equal(alerts.body.alerts[0].type, 'IRRIGATION_TIMEOUT');
    assert.match(alerts.body.alerts[0].message, /zone 2/);
  });

  test('clears once a run completes normally', async () => {
    const h = await harness();
    await post(h, '/api/v1/events', eventPayload({ type: 'IRRIGATION_TIMEOUT', zone: 2 }));
    await post(h, '/api/v1/events', eventPayload({ type: 'IRRIGATION_STOPPED', zone: 2 }));

    assert.equal((await get(h, '/api/v1/alerts')).body.alerts.length, 0);
  });
});

describe('offline detection', () => {
  test('raises DEVICE_OFFLINE after the silence window', async () => {
    const h = await harness({ offlineTimeoutMs: 60_000 });
    await post(h, '/api/v1/telemetry', telemetryPayload());

    // Not yet overdue.
    assert.equal(sweepOfflineDevices(h.repo, 60_000, T0 + 30_000), 0);
    assert.equal((await get(h, '/api/v1/alerts')).body.alerts.length, 0);

    // Overdue.
    assert.equal(sweepOfflineDevices(h.repo, 60_000, T0 + 120_000), 1);
    const alerts = await get(h, '/api/v1/alerts');
    assert.equal(alerts.body.alerts[0].type, 'DEVICE_OFFLINE');
    assert.equal(alerts.body.alerts[0].severity, 'warning');
    // The message must not imply irrigation has stopped - it has not.
    assert.match(alerts.body.alerts[0].message, /keeps irrigating locally/);
  });

  test('does not re-raise on every sweep', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload());
    sweepOfflineDevices(h.repo, 60_000, T0 + 120_000);
    sweepOfflineDevices(h.repo, 60_000, T0 + 180_000);
    sweepOfflineDevices(h.repo, 60_000, T0 + 240_000);

    assert.equal((await get(h, '/api/v1/alerts')).body.alerts.length, 1);
  });

  test('clears automatically when the device reports again', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload());
    sweepOfflineDevices(h.repo, 60_000, T0 + 120_000);
    assert.equal((await get(h, '/api/v1/alerts')).body.alerts.length, 1);

    await post(h, '/api/v1/telemetry', telemetryPayload({ uptimeMs: 200_000 }));
    assert.equal((await get(h, '/api/v1/alerts')).body.alerts.length, 0);
  });
});

describe('manual resolution', () => {
  test('an operator can resolve an alert by id', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload({ status: 'SENSOR_ERROR' }));
    const id = (await get(h, '/api/v1/alerts')).body.alerts[0].id;

    const resolved = await post(h, `/api/v1/alerts/${id}/resolve`, {});
    assert.equal(resolved.status, 200);
    assert.equal((await get(h, '/api/v1/alerts')).body.alerts.length, 0);
  });

  test('resolving an unknown or already-resolved alert 404s', async () => {
    const h = await harness();
    assert.equal((await post(h, '/api/v1/alerts/999/resolve', {})).status, 404);
  });

  test('rejects a non-numeric alert id', async () => {
    const h = await harness();
    assert.equal((await post(h, '/api/v1/alerts/abc/resolve', {})).status, 400);
  });
});

describe('alert independence', () => {
  test('alerts are tracked per device', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload({ deviceId: 'FARM-A', status: 'SENSOR_ERROR' }));
    await post(h, '/api/v1/telemetry', telemetryPayload({ deviceId: 'FARM-B', status: 'OK' }));

    const alerts = await get(h, '/api/v1/alerts');
    assert.equal(alerts.body.alerts.length, 1);
    assert.equal(alerts.body.alerts[0].device_id, 'FARM-A');
  });

  test('a sensor alert and an actuator alert coexist', async () => {
    const h = await harness();
    await post(h, '/api/v1/telemetry', telemetryPayload({ status: 'SENSOR_ERROR' }));
    await post(h, '/api/v1/events', eventPayload({ type: 'ACTUATOR_ERROR' }));

    const types = (await get(h, '/api/v1/alerts')).body.alerts
      .map((a: any) => a.type)
      .sort();
    assert.deepEqual(types, ['ACTUATOR_ERROR', 'SENSOR_ERROR']);
  });
});
