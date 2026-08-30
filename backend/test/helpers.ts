/**
 * Shared test scaffolding: an in-memory backend and a valid telemetry builder.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from '../src/app.ts';
import { openDatabase } from '../src/db/index.ts';
import { Repository } from '../src/db/repository.ts';
import { setLogSilent } from '../src/log.ts';
import type { Config } from '../src/config.ts';
import type { AppDeps } from '../src/deps.ts';

setLogSilent(true);

export const TEST_KEY = 'test-device-key';
export const TEST_ADMIN_KEY = 'test-admin-key';

export interface Harness {
  readonly repo: Repository;
  readonly deps: AppDeps;
  readonly baseUrl: string;
  /** Overrides the clock the app sees, in epoch milliseconds. */
  setNow(ms: number): void;
  close(): Promise<void>;
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    host: '127.0.0.1',
    port: 0,
    dbPath: ':memory:',
    deviceKey: TEST_KEY,
    adminKey: TEST_ADMIN_KEY,
    offlineTimeoutMs: 60_000,
    offlineSweepIntervalMs: 15_000,
    retentionDays: 30,
    dashboardDir: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dashboard'),
    websiteDir: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'website'),
    ...overrides,
  };
}

export async function startHarness(configOverrides: Partial<Config> = {}): Promise<Harness> {
  const db = openDatabase(':memory:');
  const repo = new Repository(db);
  const config = testConfig(configOverrides);

  let nowMs = Date.parse('2026-01-01T00:00:00.000Z');
  const deps: AppDeps = { repo, config, now: () => nowMs };

  const server: Server = createServer(createApp(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    repo,
    deps,
    baseUrl: `http://127.0.0.1:${port}`,
    setNow: (ms: number) => {
      nowMs = ms;
    },
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      db.close();
    },
  };
}

export interface TelemetryOverrides {
  deviceId?: string;
  zone1?: number;
  zone2?: number;
  pump?: boolean;
  valve1?: boolean;
  valve2?: boolean;
  state?: string;
  activeZone?: number | null;
  runMs?: number;
  status?: string;
  simulated?: boolean;
  invalidSensors?: number[];
  uptimeMs?: number;
}

/** Builds a payload in exactly the shape the firmware emits. */
export function telemetryPayload(overrides: TelemetryOverrides = {}): Record<string, unknown> {
  const zone1 = overrides.zone1 ?? 45;
  const zone2 = overrides.zone2 ?? 60;
  const invalid = new Set(overrides.invalidSensors ?? []);

  const sensors = [1, 2, 3, 4].map((id) => {
    const zone = id <= 2 ? 1 : 2;
    const percent = zone === 1 ? zone1 : zone2;
    const valid = !invalid.has(id);
    return {
      id,
      zone,
      raw: valid ? Math.round(3000 - (percent / 100) * 1700) : -1,
      percent: valid ? percent : 0,
      valid,
      status: valid ? 'OK' : 'DRIVER_ERROR',
    };
  });

  const zoneBlock = (zone: number, value: number): Record<string, unknown> => {
    const inZone = sensors.filter((s) => s.zone === zone);
    const valid = inZone.filter((s) => s.valid);
    return {
      sensor_1: inZone[0]!.percent,
      sensor_2: inZone[1]!.percent,
      average: valid.length === 0 ? 0 : value,
      valid_sensors: valid.length,
    };
  };

  return {
    device_id: overrides.deviceId ?? 'HYDRAX-TEST',
    firmware: '0.1.0-phase1',
    uptime_ms: overrides.uptimeMs ?? 120_000,
    device_time: null,
    simulated: overrides.simulated ?? false,
    soil: { zone_1: zoneBlock(1, zone1), zone_2: zoneBlock(2, zone2) },
    actuators: {
      pump: overrides.pump ?? false,
      zone_1_valve: overrides.valve1 ?? false,
      zone_2_valve: overrides.valve2 ?? false,
    },
    irrigation: {
      state: overrides.state ?? 'IDLE',
      run_ms: overrides.runMs ?? 0,
      active_zone: overrides.activeZone ?? null,
    },
    controller: { status: overrides.status ?? 'OK' },
    network: { wifi_connected: true, rssi: -55 },
    sensors,
  };
}

export function eventPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    device_id: 'HYDRAX-TEST',
    uptime_ms: 120_000,
    type: 'IRRIGATION_STARTED',
    zone: 1,
    moisture: 32.5,
    duration_ms: 0,
    detail: 'hysteresis start',
    ...overrides,
  };
}

export interface ApiResponse {
  status: number;
  body: any;
}

export async function post(
  harness: Harness,
  path: string,
  body: unknown,
  key: string | null = TEST_KEY,
): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key !== null) headers['X-Device-Key'] = key;

  const response = await fetch(`${harness.baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}

export async function put(
  harness: Harness,
  path: string,
  body: unknown,
  adminKey: string | null = TEST_ADMIN_KEY,
): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminKey !== null) headers['X-Admin-Key'] = adminKey;

  const response = await fetch(`${harness.baseUrl}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}

export async function get(harness: Harness, path: string): Promise<ApiResponse> {
  const response = await fetch(`${harness.baseUrl}${path}`);
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}

/** POST as an operator (X-Admin-Key) rather than as a device. */
export async function adminPost(
  harness: Harness,
  path: string,
  body: unknown,
  adminKey: string | null = TEST_ADMIN_KEY,
): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (adminKey !== null) headers['X-Admin-Key'] = adminKey;

  const response = await fetch(`${harness.baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}
