/**
 * HYDRAX Mobile — the API layer.
 *
 * Parsing is tested against responses captured from the running Phase 1
 * backend, so a change to the wire contract breaks a test here rather than a
 * screen in the field. The malformed cases matter as much as the happy path:
 * a controller mid-fault sends nulls, and the app must render them as unknown
 * rather than as zero.
 */

import { getJson } from '../src/api/client';
import { resolveApiBaseUrl } from '../src/api/config';
import { ApiError, errorMessageKey, isConnectivityError } from '../src/api/errors';
import {
  parseAlerts,
  parseDeviceDetail,
  parseSystemSnapshot,
  parseTelemetryHistory,
  parseZoneConfig,
} from '../src/api/parse';
import {
  ALERTS_RESPONSE,
  DASHBOARD_RESPONSE,
  DEVICE_DETAIL_RESPONSE,
  EMPTY_DASHBOARD_RESPONSE,
  TELEMETRY_RESPONSE,
} from './fixtures';
import { jsonResponse } from './helpers';

describe('base URL resolution', () => {
  it('prefers an explicit EXPO_PUBLIC_API_BASE_URL', () => {
    const resolved = resolveApiBaseUrl({
      envUrl: 'https://hydrax.example/',
      hostUri: '192.168.1.20:8081',
    });
    expect(resolved).toEqual({ url: 'https://hydrax.example', source: 'env' });
  });

  it('derives the backend from the Expo dev server host', () => {
    expect(resolveApiBaseUrl({ hostUri: '192.168.1.20:8081' })).toEqual({
      url: 'http://192.168.1.20:8080',
      source: 'dev-server',
    });
  });

  it('strips a scheme and path from the dev server host', () => {
    expect(resolveApiBaseUrl({ hostUri: 'http://10.0.0.5:8081/_expo' }).url).toBe(
      'http://10.0.0.5:8080',
    );
  });

  it('keeps an IPv6 literal intact', () => {
    expect(resolveApiBaseUrl({ hostUri: '[fe80::1]:8081' }).url).toBe('http://[fe80::1]:8080');
  });

  it('falls back to localhost when nothing else is known', () => {
    expect(resolveApiBaseUrl({}).source).toBe('fallback');
  });
});

describe('dashboard parsing', () => {
  const snapshot = parseSystemSnapshot(DASHBOARD_RESPONSE);
  const device = snapshot.devices[0]!;

  it('maps the device envelope', () => {
    expect(device.deviceId).toBe('HYDRAX-SIM-1');
    expect(device.firmware).toBe('0.1.0-phase1-sim');
    expect(device.online).toBe(true);
    expect(device.simulated).toBe(true);
    expect(device.pumpOn).toBe(true);
    expect(device.controllerStatus).toBe('OK');
    expect(device.wifi).toEqual({ connected: true, rssi: -58 });
    expect(device.irrigation).toEqual({ state: 'IRRIGATING', activeZone: 1, runMs: 42000 });
  });

  it('keeps a null threshold band null instead of inventing one', () => {
    expect(device.zones[0]!.band).toBeNull();
    expect(device.zones[1]!.band).toEqual({ startPercent: 35, stopPercent: 60 });
  });

  it('preserves per-probe validity and a null reading', () => {
    const zone = device.zones[1]!;
    expect(zone.sensor2).toBeNull();
    expect(zone.sensor2Valid).toBe(false);
    expect(zone.validSensors).toBe(1);
  });

  it('carries alert ids and severity through unchanged', () => {
    expect(device.alerts[0]).toMatchObject({ id: 271, severity: 'critical', active: true });
  });

  it('accepts a backend with no devices', () => {
    expect(parseSystemSnapshot(EMPTY_DASHBOARD_RESPONSE).devices).toEqual([]);
  });

  it('rejects a response with no devices array', () => {
    expect(() => parseSystemSnapshot({ generated_at: 'x' })).toThrow(ApiError);
  });

  it('rejects a non-object response', () => {
    expect(() => parseSystemSnapshot('nope')).toThrow(ApiError);
  });

  it('survives a zone with every optional field missing', () => {
    const parsed = parseSystemSnapshot({
      generated_at: 'now',
      devices: [{ device_id: 'X', zones: [{ zone: 1 }] }],
    });
    const zone = parsed.devices[0]!.zones[0]!;
    expect(zone.average).toBeNull();
    expect(zone.validSensors).toBe(0);
    expect(zone.valveOpen).toBe(false);
    expect(parsed.devices[0]!.irrigation).toBeNull();
  });

  it('passes an unknown irrigation state through as its raw token', () => {
    const parsed = parseSystemSnapshot({
      generated_at: 'now',
      devices: [
        { device_id: 'X', zones: [], irrigation: { state: 'FLUSHING', active_zone: null, run_ms: 0 } },
      ],
    });
    expect(parsed.devices[0]!.irrigation?.state).toBe('FLUSHING');
  });
});

describe('other endpoints', () => {
  it('parses device detail', () => {
    const detail = parseDeviceDetail(DEVICE_DETAIL_RESPONSE);
    expect(detail.telemetryCount).toBe(19602);
    expect(detail.current?.rssi).toBe(-58);
    expect(detail.current?.deviceTime).toBeNull();
  });

  it('reverses telemetry into oldest-first order for charting', () => {
    const history = parseTelemetryHistory(TELEMETRY_RESPONSE);
    expect(history.samples).toHaveLength(3);
    expect(history.samples[0]!.id).toBe(19600);
    expect(history.samples[2]!.id).toBe(19602);
  });

  it('parses alerts including resolved ones', () => {
    const alerts = parseAlerts(ALERTS_RESPONSE);
    expect(alerts).toHaveLength(2);
    expect(alerts[1]!.active).toBe(false);
    expect(alerts[1]!.resolvedAt).toBe('2026-09-05T01:20:40.988Z');
  });

  it('reports that Phase 1 zone config is not applied by the device', () => {
    const config = parseZoneConfig({
      device_id: 'HYDRAX-SIM-1',
      applied_by_device: false,
      zones: [],
    });
    expect(config.appliedByDevice).toBe(false);
    expect(config.zones).toEqual([]);
  });
});

describe('client error handling', () => {
  const parseAny = (raw: unknown) => raw;

  it('never sends credentials', async () => {
    const fetchMock = jest.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({ ok: true }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await getJson('/api/v1/dashboard', parseAny, { baseUrl: 'http://test' });

    const init = fetchMock.mock.calls[0]![1];
    const headers = init.headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).toEqual(['accept']);
    expect(JSON.stringify(init)).not.toMatch(/key/i);
  });

  it('turns a dead network into a network error', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    await expect(getJson('/x', parseAny, { baseUrl: 'http://test' })).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('turns a 401 into an unauthorized error', async () => {
    global.fetch = jest.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch;
    await expect(getJson('/x', parseAny, { baseUrl: 'http://test' })).rejects.toMatchObject({
      kind: 'unauthorized',
      status: 401,
    });
  });

  it('turns a 500 into a server error', async () => {
    global.fetch = jest.fn(async () => jsonResponse({}, 500)) as unknown as typeof fetch;
    await expect(getJson('/x', parseAny, { baseUrl: 'http://test' })).rejects.toMatchObject({
      kind: 'server',
    });
  });

  it('turns a non-JSON body into a parse error', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    })) as unknown as typeof fetch;

    await expect(getJson('/x', parseAny, { baseUrl: 'http://test' })).rejects.toMatchObject({
      kind: 'parse',
    });
  });

  it('times out rather than hanging', async () => {
    global.fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;

    await expect(
      getJson('/x', parseAny, { baseUrl: 'http://test', timeoutMs: 10 }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('maps every failure to a user-facing message key, never a raw one', () => {
    expect(errorMessageKey(new ApiError('timeout', 'boom'))).toBe('error.timeout');
    expect(errorMessageKey(new ApiError('unauthorized', 'boom'))).toBe('error.unauthorized');
    expect(errorMessageKey(new ApiError('parse', 'boom'))).toBe('error.parse');
    expect(errorMessageKey(new ApiError('server', 'boom'))).toBe('error.server');
    expect(errorMessageKey(new Error('some internal detail'))).toBe('error.network');
  });

  it('distinguishes "could not reach" from "was refused"', () => {
    expect(isConnectivityError(new ApiError('network', ''))).toBe(true);
    expect(isConnectivityError(new ApiError('timeout', ''))).toBe(true);
    expect(isConnectivityError(new ApiError('server', ''))).toBe(false);
  });
});
