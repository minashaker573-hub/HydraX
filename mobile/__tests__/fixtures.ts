/**
 * HYDRAX Mobile — test fixtures.
 *
 * These are real responses, captured from a running Phase 1 backend
 * (`GET http://127.0.0.1:8080/api/v1/...` with the mock device connected) and
 * trimmed for length. Nothing here was written by hand to match the parser —
 * that is the point: if the backend's shape changes, these tests fail.
 */

export const DASHBOARD_RESPONSE = {
  generated_at: '2026-09-05T20:05:55.825Z',
  devices: [
    {
      device_id: 'HYDRAX-SIM-1',
      firmware: '0.1.0-phase1-sim',
      online: true,
      last_seen_at: '2026-09-05T20:05:48.044Z',
      simulated: true,
      irrigation: { state: 'IRRIGATING', active_zone: 1, run_ms: 42000 },
      controller_status: 'OK',
      pump_on: true,
      wifi: { connected: true, rssi: -58 },
      zones: [
        {
          zone: 1,
          sensor_1: 13.8,
          sensor_2: 16.8,
          sensor_1_valid: true,
          sensor_2_valid: true,
          average: 15.3,
          valid_sensors: 2,
          valve_open: true,
          irrigating: true,
          config: null,
        },
        {
          zone: 2,
          sensor_1: 41.2,
          sensor_2: null,
          sensor_1_valid: true,
          sensor_2_valid: false,
          average: 41.2,
          valid_sensors: 1,
          valve_open: false,
          irrigating: false,
          config: { start_percent: 35, stop_percent: 60 },
        },
      ],
      alerts: [
        {
          id: 271,
          device_id: 'HYDRAX-SIM-1',
          type: 'SENSOR_ERROR',
          severity: 'critical',
          message: 'Sensor fault reported on zone 2: sensor 4 invalid',
          raised_at: '2026-09-05T20:00:50.632Z',
          resolved_at: null,
          active: true,
        },
      ],
      events: [
        {
          id: 1253,
          device_id: 'HYDRAX-SIM-1',
          received_at: '2026-09-05T20:05:40.988Z',
          device_uptime_ms: 40366231,
          type: 'IRRIGATION_STARTED',
          zone: 1,
          moisture: 15.3,
          duration_ms: 0,
          detail: 'hysteresis start',
        },
        {
          id: 1252,
          device_id: 'HYDRAX-SIM-1',
          received_at: '2026-09-05T20:04:31.963Z',
          device_uptime_ms: 40357206,
          type: 'SENSOR_ERROR',
          zone: 2,
          moisture: null,
          duration_ms: null,
          detail: 'sensor 4 invalid',
        },
      ],
    },
  ],
};

/** A backend that has never heard from a controller. */
export const EMPTY_DASHBOARD_RESPONSE = {
  generated_at: '2026-09-05T20:05:55.825Z',
  devices: [],
};

export const DEVICE_DETAIL_RESPONSE = {
  device_id: 'HYDRAX-SIM-1',
  firmware: '0.1.0-phase1-sim',
  first_seen_at: '2026-09-04T19:25:38.248Z',
  last_seen_at: '2026-09-05T20:05:48.044Z',
  simulated: true,
  online: true,
  telemetry_count: 19602,
  current: {
    received_at: '2026-09-05T20:05:48.044Z',
    device_uptime_ms: 40373279,
    device_time: null,
    irrigation_state: 'IRRIGATING',
    active_zone: 1,
    run_ms: 42000,
    pump_on: true,
    controller_status: 'OK',
    wifi_connected: true,
    rssi: -58,
    zones: [],
  },
};

export const TELEMETRY_RESPONSE = {
  device_id: 'HYDRAX-SIM-1',
  count: 3,
  telemetry: [
    {
      id: 19602,
      received_at: '2026-09-05T20:05:48.044Z',
      device_uptime_ms: 40373279,
      irrigation_state: 'IRRIGATING',
      active_zone: 1,
      run_ms: 42000,
      pump_on: true,
      controller_status: 'OK',
      simulated: true,
      zones: [
        { zone: 1, sensor_1: 13.8, sensor_2: 16.8, average: 15.3, valid_sensors: 2, valve_open: true },
        { zone: 2, sensor_1: 41.2, sensor_2: 41.2, average: 41.2, valid_sensors: 2, valve_open: false },
      ],
    },
    {
      id: 19601,
      received_at: '2026-09-05T20:05:47.042Z',
      device_uptime_ms: 40372277,
      irrigation_state: 'IDLE',
      active_zone: null,
      run_ms: 0,
      pump_on: false,
      controller_status: 'OK',
      simulated: true,
      zones: [
        { zone: 1, sensor_1: 14.1, sensor_2: 17.1, average: 15.6, valid_sensors: 2, valve_open: false },
        { zone: 2, sensor_1: 41.0, sensor_2: 41.4, average: 41.2, valid_sensors: 2, valve_open: false },
      ],
    },
    {
      id: 19600,
      received_at: '2026-09-05T20:05:46.040Z',
      device_uptime_ms: 40371275,
      irrigation_state: 'IDLE',
      active_zone: null,
      run_ms: 0,
      pump_on: false,
      controller_status: 'OK',
      simulated: true,
      zones: [
        { zone: 1, sensor_1: 14.4, sensor_2: 17.4, average: 15.9, valid_sensors: 2, valve_open: false },
        { zone: 2, sensor_1: 41.1, sensor_2: 41.3, average: 41.2, valid_sensors: 2, valve_open: false },
      ],
    },
  ],
};

export const ALERTS_RESPONSE = {
  alerts: [
    {
      id: 271,
      device_id: 'HYDRAX-SIM-1',
      type: 'DEVICE_OFFLINE',
      severity: 'warning',
      message:
        'No telemetry for 46383s. The controller keeps irrigating locally; only monitoring is affected.',
      raised_at: '2026-09-05T14:13:50.632Z',
      resolved_at: null,
      active: true,
    },
    {
      id: 270,
      device_id: 'HYDRAX-SIM-1',
      type: 'IRRIGATION_TIMEOUT',
      severity: 'critical',
      message:
        'Irrigation exceeded the maximum runtime on zone 2 and the pump was cut. Check for a closed valve, a burst line or an empty supply.',
      raised_at: '2026-09-05T01:20:31.963Z',
      resolved_at: '2026-09-05T01:20:40.988Z',
      active: false,
    },
  ],
};

export const EVENTS_RESPONSE = {
  device_id: 'HYDRAX-SIM-1',
  events: [
    {
      id: 1253,
      device_id: 'HYDRAX-SIM-1',
      received_at: '2026-09-05T20:05:40.988Z',
      device_uptime_ms: 40366231,
      type: 'IRRIGATION_STOPPED',
      zone: 1,
      moisture: 62.4,
      duration_ms: 45000,
      detail: 'hysteresis stop',
    },
  ],
};

/** Routes a stubbed fetch by path, the way the real backend does. */
export function fixtureFor(url: string): unknown {
  if (url.includes('/api/v1/dashboard')) return DASHBOARD_RESPONSE;
  if (url.includes('/telemetry')) return TELEMETRY_RESPONSE;
  if (url.includes('/events')) return EVENTS_RESPONSE;
  if (url.includes('/api/v1/alerts')) return ALERTS_RESPONSE;
  if (/\/api\/v1\/devices\/[^/]+$/.test(url)) return DEVICE_DETAIL_RESPONSE;
  throw new Error(`no fixture for ${url}`);
}
