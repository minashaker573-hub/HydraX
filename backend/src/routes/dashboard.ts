/**
 * HYDRAX - aggregated dashboard view.
 *
 * One request returns everything the Phase 1 dashboard renders, so the UI does
 * not have to fan out and stitch several endpoints together on a polling
 * interval.
 */

import { isOnline } from '../domain/alerts.ts';
import { nowIso, type AppDeps } from '../deps.ts';
import { readLimit, sendJson } from '../http/respond.ts';
import { serializeAlert } from './alerts.ts';
import type { Router } from '../http/router.ts';

const DEFAULT_EVENT_LIMIT = 15;
const MAX_EVENT_LIMIT = 100;

export function registerDashboardRoutes(router: Router, deps: AppDeps): void {
  router.get('/api/v1/dashboard', async (ctx) => {
    const nowMs = deps.now();
    const eventLimit = readLimit(ctx.url, 'events', DEFAULT_EVENT_LIMIT, MAX_EVENT_LIMIT);

    const deviceRows = await deps.repo.listDevices();
    const devices = await Promise.all(deviceRows.map(async (device) => {
      const current = await deps.repo.getCurrentTelemetry(device.device_id);
      const zoneRows = current === undefined ? [] : await deps.repo.getZonesFor(current.id);
      const zoneConfigRows = await deps.repo.getZoneConfig(device.device_id);
      const configByZone = new Map(zoneConfigRows.map((row) => [row.zone, row]));

      return {
        device_id: device.device_id,
        firmware: device.firmware,
        online: isOnline(device.last_seen_at, deps.config.offlineTimeoutMs, nowMs),
        last_seen_at: device.last_seen_at,
        // Surfaced so the UI can label synthetic readings explicitly rather
        // than presenting them as field data.
        simulated: current === undefined ? device.simulated === 1 : current.simulated === 1,
        irrigation:
          current === undefined
            ? null
            : {
                state: current.irrigation_state,
                active_zone: current.active_zone,
                run_ms: current.run_ms,
              },
        controller_status: current?.controller_status ?? null,
        pump_on: current === undefined ? false : current.pump_on === 1,
        wifi:
          current === undefined
            ? null
            : { connected: current.wifi_connected === 1, rssi: current.rssi },
        zones: zoneRows.map((zone) => {
          const config = configByZone.get(zone.zone);
          return {
            zone: zone.zone,
            sensor_1: zone.sensor_1,
            sensor_2: zone.sensor_2,
            sensor_1_valid: zone.sensor_1_valid === 1,
            sensor_2_valid: zone.sensor_2_valid === 1,
            average: zone.average,
            valid_sensors: zone.valid_sensors,
            valve_open: zone.valve_open === 1,
            irrigating:
              current !== undefined &&
              current.pump_on === 1 &&
              current.active_zone === zone.zone,
            config:
              config === undefined
                ? null
                : { start_percent: config.start_percent, stop_percent: config.stop_percent },
          };
        }),
        alerts: (await deps.repo.listAlertsForDevice(device.device_id, true, 20)).map(serializeAlert),
        events: await deps.repo.listEvents(device.device_id, eventLimit),
      };
    }));

    sendJson(ctx.res, 200, { generated_at: nowIso(deps), devices });
  });
}
