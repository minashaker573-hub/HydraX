/**
 * Validation is the trust boundary. These tests cover the malformed and
 * physically-impossible payloads, not just the happy path.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateEvent, validateTelemetry, validateZoneConfig } from '../src/domain/validate.ts';
import { telemetryPayload, eventPayload } from './helpers.ts';

/** Convenience: assert rejection and that a specific complaint was raised. */
function expectRejected(result: { ok: boolean; errors?: string[] }, fragment: string): void {
  assert.equal(result.ok, false, 'expected payload to be rejected');
  const errors = (result as { errors: string[] }).errors;
  assert.ok(
    errors.some((error) => error.includes(fragment)),
    `expected an error mentioning "${fragment}", got: ${errors.join(' | ')}`,
  );
}

describe('telemetry validation', () => {
  test('accepts a well-formed payload', () => {
    const result = validateTelemetry(telemetryPayload());
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.value.deviceId, 'HYDRAX-TEST');
    assert.equal(result.value.zones.length, 2);
    assert.equal(result.value.zones[0]!.zone, 1);
    assert.equal(result.value.zones[0]!.validSensors, 2);
    assert.equal(result.value.irrigationState, 'IDLE');
  });

  test('rejects a non-object body', () => {
    expectRejected(validateTelemetry('not json object'), 'body must be an object');
    expectRejected(validateTelemetry(null), 'body must be an object');
    expectRejected(validateTelemetry([1, 2, 3]), 'body must be an object');
  });

  test('rejects a missing or malformed device id', () => {
    const missing = telemetryPayload();
    delete missing.device_id;
    expectRejected(validateTelemetry(missing), 'device_id must be a string');

    expectRejected(
      validateTelemetry(telemetryPayload({ deviceId: 'bad id with spaces' })),
      'device_id may only contain',
    );
  });

  test('rejects an unknown irrigation state', () => {
    const payload = telemetryPayload();
    (payload.irrigation as Record<string, unknown>).state = 'MAKING_TEA';
    expectRejected(validateTelemetry(payload), 'irrigation.state must be one of');
  });

  test('rejects an unknown controller status', () => {
    const payload = telemetryPayload();
    (payload.controller as Record<string, unknown>).status = 'PROBABLY_FINE';
    expectRejected(validateTelemetry(payload), 'controller.status must be one of');
  });

  test('rejects out-of-range moisture', () => {
    const payload = telemetryPayload();
    (payload.soil as any).zone_1.average = 150;
    expectRejected(validateTelemetry(payload), 'must be between 0 and 100');

    const negative = telemetryPayload();
    (negative.soil as any).zone_1.sensor_1 = -5;
    expectRejected(validateTelemetry(negative), 'must be between 0 and 100');
  });

  test('rejects a non-integer uptime', () => {
    expectRejected(
      validateTelemetry({ ...telemetryPayload(), uptime_ms: 12.5 }),
      'uptime_ms must be an integer',
    );
    expectRejected(
      validateTelemetry({ ...telemetryPayload(), uptime_ms: -1 }),
      'uptime_ms must be between',
    );
  });

  test('rejects a pump running with every valve closed', () => {
    // Physically impossible and damaging. Recording it as fact would put a
    // lie in the history.
    const payload = telemetryPayload({ pump: true, valve1: false, valve2: false });
    expectRejected(validateTelemetry(payload), 'no zone valve is open');
  });

  test('rejects two valves open at once', () => {
    const payload = telemetryPayload({ pump: true, valve1: true, valve2: true });
    expectRejected(validateTelemetry(payload), 'more than one zone valve');
  });

  test('rejects an active zone that does not exist in soil', () => {
    const payload = telemetryPayload({ activeZone: 5, valve1: true });
    expectRejected(validateTelemetry(payload), 'does not appear in soil');
  });

  test('rejects a missing valve entry for a reported zone', () => {
    const payload = telemetryPayload();
    delete (payload.actuators as Record<string, unknown>).zone_2_valve;
    expectRejected(validateTelemetry(payload), 'actuators.zone_2_valve is required');
  });

  test('rejects a malformed zone key', () => {
    const payload = telemetryPayload();
    (payload.soil as any).zone_abc = { sensor_1: 1, sensor_2: 1, average: 1, valid_sensors: 2 };
    expectRejected(validateTelemetry(payload), 'not a valid zone key');
  });

  test('collects every problem rather than stopping at the first', () => {
    const result = validateTelemetry({ device_id: 'X' });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.errors.length > 3, 'expected several errors, got ' + result.errors.length);
  });

  test('attributes sensor validity to the right zone', () => {
    const result = validateTelemetry(telemetryPayload({ invalidSensors: [3] }));
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const zone1 = result.value.zones.find((z) => z.zone === 1)!;
    const zone2 = result.value.zones.find((z) => z.zone === 2)!;
    assert.equal(zone1.sensor1Valid, true);
    assert.equal(zone1.sensor2Valid, true);
    assert.equal(zone2.sensor1Valid, false, 'sensor 3 belongs to zone 2 slot 1');
    assert.equal(zone2.sensor2Valid, true);
    assert.equal(zone2.validSensors, 1);
  });

  test('normalizes a device timestamp and rejects nonsense', () => {
    const ok = validateTelemetry({
      ...telemetryPayload(),
      device_time: '2026-03-04T05:06:07Z',
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.value.deviceTime, '2026-03-04T05:06:07.000Z');

    expectRejected(
      validateTelemetry({ ...telemetryPayload(), device_time: 'last tuesday' }),
      'device_time must be an ISO-8601',
    );
  });
});

describe('event validation', () => {
  test('accepts a well-formed event', () => {
    const result = validateEvent(eventPayload());
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.type, 'IRRIGATION_STARTED');
  });

  test('maps the firmware sentinel -1 to no zone', () => {
    const result = validateEvent(eventPayload({ zone: -1, type: 'CONTROLLER_STARTED' }));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.zone, null);
  });

  test('rejects an unknown event type', () => {
    expectRejected(validateEvent(eventPayload({ type: 'SOMETHING_ELSE' })), 'type must be one of');
  });

  test('strips control characters from free text', () => {
    // Built from character codes so the literal stays plain ASCII.
    const nasty = ['line', String.fromCharCode(0), 'one', String.fromCharCode(31), 'two'].join('');
    const result = validateEvent(eventPayload({ detail: nasty }));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.detail, 'line one two');
  });

  test('rejects an over-long detail string', () => {
    expectRejected(validateEvent(eventPayload({ detail: 'x'.repeat(500) })), 'at most 200');
  });
});

describe('zone configuration validation', () => {
  test('accepts a valid hysteresis band', () => {
    const result = validateZoneConfig({
      zones: [{ zone: 1, start_percent: 30, stop_percent: 55 }],
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value[0]!.startPercent, 30);
  });

  test('rejects an inverted band', () => {
    expectRejected(
      validateZoneConfig({ zones: [{ zone: 1, start_percent: 60, stop_percent: 40 }] }),
      'must exceed start_percent',
    );
  });

  test('rejects a band too narrow to prevent short-cycling', () => {
    expectRejected(
      validateZoneConfig({ zones: [{ zone: 1, start_percent: 40, stop_percent: 42 }] }),
      'must exceed start_percent',
    );
  });

  test('rejects duplicate zones', () => {
    expectRejected(
      validateZoneConfig({
        zones: [
          { zone: 1, start_percent: 30, stop_percent: 55 },
          { zone: 1, start_percent: 31, stop_percent: 56 },
        ],
      }),
      'is duplicated',
    );
  });
});
