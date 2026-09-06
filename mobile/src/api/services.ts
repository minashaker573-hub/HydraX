/**
 * HYDRAX Mobile — one function per backend endpoint the app uses.
 *
 * Every endpoint here already exists in the Phase 1 backend; the mobile app
 * added none and changed none. Grouped by the concern each serves so a screen
 * imports an intention ("fetch the system snapshot") rather than a URL.
 *
 * Endpoints deliberately NOT used:
 *   PUT  /api/v1/devices/:id/config      operator-only (X-Admin-Key)
 *   POST /api/v1/alerts/:id/resolve      operator-only (X-Admin-Key)
 *   GET  /api/v1/requests                customer personal data, operator-only
 * The app holds no operator key, so it cannot and must not call these.
 */

import { getJson, type RequestOptions } from './client';
import {
  parseAlerts,
  parseDeviceDetail,
  parseEvents,
  parseSystemSnapshot,
  parseTelemetryHistory,
  parseZoneConfig,
} from './parse';
import type {
  AlertSnapshot,
  DeviceDetail,
  EventSnapshot,
  SystemSnapshot,
  TelemetryHistory,
  ZoneConfig,
} from './types';

/* --------------------------------------------------------------- system --- */

/**
 * The aggregate view: devices, zones, alerts and recent events in one request.
 * This is what the Home, Zones and Alerts screens are built on, and the only
 * call made on the polling interval.
 */
export function fetchSystemSnapshot(
  eventLimit = 20,
  options?: RequestOptions,
): Promise<SystemSnapshot> {
  return getJson(`/api/v1/dashboard?events=${eventLimit}`, parseSystemSnapshot, options);
}

/* --------------------------------------------------------------- device --- */

/** Identity and link detail the aggregate view omits (uptime, sample count). */
export function fetchDeviceDetail(deviceId: string, options?: RequestOptions): Promise<DeviceDetail> {
  return getJson(`/api/v1/devices/${encodeURIComponent(deviceId)}`, parseDeviceDetail, options);
}

/**
 * The backend's advisory threshold bands.
 *
 * Phase 1 answers `applied_by_device: false` — the controller uses its
 * compiled-in thresholds. The app carries that flag into the UI rather than
 * presenting these numbers as what the hardware is actually doing.
 */
export function fetchZoneConfig(deviceId: string, options?: RequestOptions): Promise<ZoneConfig> {
  return getJson(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/config`,
    parseZoneConfig,
    options,
  );
}

/* -------------------------------------------------------------- history --- */

/** Recorded telemetry, oldest first after parsing. Source for the charts. */
export function fetchTelemetryHistory(
  deviceId: string,
  limit = 180,
  options?: RequestOptions,
): Promise<TelemetryHistory> {
  return getJson(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/telemetry?limit=${limit}`,
    parseTelemetryHistory,
    options,
  );
}

/** Controller events, newest first, as the backend returns them. */
export function fetchDeviceEvents(
  deviceId: string,
  limit = 100,
  options?: RequestOptions,
): Promise<EventSnapshot[]> {
  return getJson(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/events?limit=${limit}`,
    parseEvents,
    options,
  );
}

/* --------------------------------------------------------------- alerts --- */

/**
 * `activeOnly: false` includes resolved alerts, which is what the history
 * filter on the Alerts screen shows. Ids are the backend's own, so an alert
 * keeps its identity across refreshes and a genuinely new one is detectable.
 */
export function fetchAlerts(
  activeOnly: boolean,
  limit = 100,
  options?: RequestOptions,
): Promise<AlertSnapshot[]> {
  return getJson(
    `/api/v1/alerts?active=${activeOnly ? 'true' : 'false'}&limit=${limit}`,
    parseAlerts,
    options,
  );
}
