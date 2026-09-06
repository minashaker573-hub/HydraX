/**
 * HYDRAX Mobile — wire format -> app types.
 *
 * Hand-written rather than a schema library: the contract is a dozen objects
 * that this repository owns on both ends, and a validation dependency would be
 * larger than the code it replaced.
 *
 * The rule applied throughout: be strict about structure, tolerant about
 * values. A missing `devices` array is a broken response and raises
 * `ApiError('parse')`. A null `rssi`, an absent `average` or an irrigation
 * state this build has never seen are all things a real controller can
 * legitimately produce, so they pass through as null / raw token and the UI
 * shows them honestly instead of inventing a substitute.
 */

import { ApiError } from './errors';
import type {
  AlertSnapshot,
  DeviceDetail,
  DeviceSnapshot,
  EventSnapshot,
  SystemSnapshot,
  TelemetryHistory,
  TelemetrySample,
  TelemetryZone,
  ZoneConfig,
  ZoneSnapshot,
} from './types';

type Json = Record<string, unknown>;

function fail(what: string): never {
  throw new ApiError('parse', `unexpected response shape: ${what}`);
}

function asObject(value: unknown, what: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(what);
  return value as Json;
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) fail(what);
  return value;
}

/** Arrays that are optional in practice: absent is treated as empty. */
function optArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, what: string): string {
  if (typeof value !== 'string') fail(what);
  return value;
}

function optStr(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

/* ========================================================================= */
/* pieces                                                                    */
/* ========================================================================= */

export function parseZone(raw: unknown): ZoneSnapshot {
  const zone = asObject(raw, 'zone');
  const config = zone.config;
  const band =
    typeof config === 'object' && config !== null
      ? (() => {
          const start = optNum((config as Json).start_percent);
          const stop = optNum((config as Json).stop_percent);
          return start === null || stop === null ? null : { startPercent: start, stopPercent: stop };
        })()
      : null;

  return {
    zone: num(zone.zone, 0),
    sensor1: optNum(zone.sensor_1),
    sensor2: optNum(zone.sensor_2),
    sensor1Valid: bool(zone.sensor_1_valid),
    sensor2Valid: bool(zone.sensor_2_valid),
    average: optNum(zone.average),
    validSensors: num(zone.valid_sensors, 0),
    valveOpen: bool(zone.valve_open),
    irrigating: bool(zone.irrigating),
    band,
  };
}

export function parseAlert(raw: unknown): AlertSnapshot {
  const alert = asObject(raw, 'alert');
  return {
    id: num(alert.id, -1),
    deviceId: optStr(alert.device_id) ?? '',
    type: optStr(alert.type) ?? 'UNKNOWN',
    severity: optStr(alert.severity) ?? 'warning',
    message: optStr(alert.message) ?? '',
    raisedAt: optStr(alert.raised_at) ?? '',
    resolvedAt: optStr(alert.resolved_at),
    active: bool(alert.active),
  };
}

export function parseEvent(raw: unknown): EventSnapshot {
  const event = asObject(raw, 'event');
  return {
    id: num(event.id, -1),
    deviceId: optStr(event.device_id) ?? '',
    receivedAt: optStr(event.received_at) ?? '',
    deviceUptimeMs: optNum(event.device_uptime_ms),
    type: optStr(event.type) ?? 'UNKNOWN',
    zone: optNum(event.zone),
    moisture: optNum(event.moisture),
    durationMs: optNum(event.duration_ms),
    detail: optStr(event.detail),
  };
}

export function parseDevice(raw: unknown): DeviceSnapshot {
  const device = asObject(raw, 'device');
  const irrigation = device.irrigation;
  const wifi = device.wifi;

  return {
    deviceId: str(device.device_id, 'device.device_id'),
    firmware: optStr(device.firmware),
    online: bool(device.online),
    lastSeenAt: optStr(device.last_seen_at) ?? '',
    simulated: bool(device.simulated),
    irrigation:
      typeof irrigation === 'object' && irrigation !== null
        ? {
            state: optStr((irrigation as Json).state) ?? 'IDLE',
            activeZone: optNum((irrigation as Json).active_zone),
            runMs: num((irrigation as Json).run_ms, 0),
          }
        : null,
    controllerStatus: optStr(device.controller_status),
    pumpOn: bool(device.pump_on),
    wifi:
      typeof wifi === 'object' && wifi !== null
        ? { connected: bool((wifi as Json).connected), rssi: optNum((wifi as Json).rssi) }
        : null,
    zones: optArray(device.zones).map(parseZone),
    alerts: optArray(device.alerts).map(parseAlert),
    events: optArray(device.events).map(parseEvent),
  };
}

/* ========================================================================= */
/* responses                                                                 */
/* ========================================================================= */

/** GET /api/v1/dashboard */
export function parseSystemSnapshot(raw: unknown): SystemSnapshot {
  const body = asObject(raw, 'dashboard response');
  return {
    generatedAt: optStr(body.generated_at) ?? new Date().toISOString(),
    devices: asArray(body.devices, 'dashboard.devices').map(parseDevice),
  };
}

/** GET /api/v1/devices/:id */
export function parseDeviceDetail(raw: unknown): DeviceDetail {
  const body = asObject(raw, 'device response');
  const current = body.current;

  return {
    deviceId: str(body.device_id, 'device.device_id'),
    firmware: optStr(body.firmware),
    firstSeenAt: optStr(body.first_seen_at) ?? '',
    lastSeenAt: optStr(body.last_seen_at) ?? '',
    simulated: bool(body.simulated),
    online: bool(body.online),
    telemetryCount: num(body.telemetry_count, 0),
    current:
      typeof current === 'object' && current !== null
        ? (() => {
            const c = current as Json;
            return {
              receivedAt: optStr(c.received_at) ?? '',
              deviceUptimeMs: optNum(c.device_uptime_ms),
              deviceTime: optStr(c.device_time),
              irrigationState: optStr(c.irrigation_state) ?? 'IDLE',
              activeZone: optNum(c.active_zone),
              runMs: num(c.run_ms, 0),
              pumpOn: bool(c.pump_on),
              controllerStatus: optStr(c.controller_status) ?? 'OK',
              wifiConnected: bool(c.wifi_connected),
              rssi: optNum(c.rssi),
            };
          })()
        : null,
  };
}

function parseTelemetryZone(raw: unknown): TelemetryZone {
  const zone = asObject(raw, 'telemetry zone');
  return {
    zone: num(zone.zone, 0),
    sensor1: optNum(zone.sensor_1),
    sensor2: optNum(zone.sensor_2),
    average: optNum(zone.average),
    validSensors: num(zone.valid_sensors, 0),
    valveOpen: bool(zone.valve_open),
  };
}

function parseTelemetrySample(raw: unknown): TelemetrySample {
  const sample = asObject(raw, 'telemetry sample');
  return {
    id: num(sample.id, -1),
    receivedAt: optStr(sample.received_at) ?? '',
    deviceUptimeMs: optNum(sample.device_uptime_ms),
    irrigationState: optStr(sample.irrigation_state) ?? 'IDLE',
    activeZone: optNum(sample.active_zone),
    runMs: num(sample.run_ms, 0),
    pumpOn: bool(sample.pump_on),
    controllerStatus: optStr(sample.controller_status) ?? 'OK',
    simulated: bool(sample.simulated),
    zones: optArray(sample.zones).map(parseTelemetryZone),
  };
}

/**
 * GET /api/v1/devices/:id/telemetry
 *
 * The backend returns newest-first (it is a "latest N" query). Charts read
 * left-to-right in time, so the order is flipped once, here, rather than in
 * every consumer.
 */
export function parseTelemetryHistory(raw: unknown): TelemetryHistory {
  const body = asObject(raw, 'telemetry response');
  const samples = asArray(body.telemetry, 'telemetry.telemetry').map(parseTelemetrySample);
  samples.reverse();
  return { deviceId: optStr(body.device_id) ?? '', samples };
}

/** GET /api/v1/devices/:id/events */
export function parseEvents(raw: unknown): EventSnapshot[] {
  const body = asObject(raw, 'events response');
  return asArray(body.events, 'events.events').map(parseEvent);
}

/** GET /api/v1/alerts */
export function parseAlerts(raw: unknown): AlertSnapshot[] {
  const body = asObject(raw, 'alerts response');
  return asArray(body.alerts, 'alerts.alerts').map(parseAlert);
}

/** GET /api/v1/devices/:id/config */
export function parseZoneConfig(raw: unknown): ZoneConfig {
  const body = asObject(raw, 'config response');
  return {
    deviceId: optStr(body.device_id) ?? '',
    appliedByDevice: bool(body.applied_by_device),
    zones: optArray(body.zones).map((entry) => {
      const zone = asObject(entry, 'config zone');
      return {
        zone: num(zone.zone, 0),
        startPercent: num(zone.start_percent, 0),
        stopPercent: num(zone.stop_percent, 0),
        updatedAt: optStr(zone.updated_at) ?? '',
      };
    }),
  };
}
