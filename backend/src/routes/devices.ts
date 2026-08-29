/**
 * HYDRAX - device query endpoints.
 */

import { isOnline } from '../domain/alerts.ts';
import { validateZoneConfig } from '../domain/validate.ts';
import { nowIso, type AppDeps } from '../deps.ts';
import {
  BodyParseError,
  BodyTooLargeError,
  readJsonBody,
  readLimit,
  sendError,
  sendJson,
} from '../http/respond.ts';
import type { Router } from '../http/router.ts';

const MAX_PAGE = 500;

export function registerDeviceRoutes(router: Router, deps: AppDeps): void {
  router.get('/api/v1/devices', (ctx) => {
    const nowMs = deps.now();
    const devices = deps.repo.listDevices().map((device) => ({
      device_id: device.device_id,
      firmware: device.firmware,
      first_seen_at: device.first_seen_at,
      last_seen_at: device.last_seen_at,
      simulated: device.simulated === 1,
      online: isOnline(device.last_seen_at, deps.config.offlineTimeoutMs, nowMs),
    }));
    sendJson(ctx.res, 200, { devices });
  });

  router.get('/api/v1/devices/:deviceId', (ctx) => {
    const deviceId = ctx.params.deviceId!;
    const device = deps.repo.getDevice(deviceId);
    if (device === undefined) {
      sendError(ctx.res, 404, `unknown device "${deviceId}"`);
      return;
    }

    const current = deps.repo.getCurrentTelemetry(deviceId);
    const zones = current === undefined ? [] : deps.repo.getZonesFor(current.id);

    sendJson(ctx.res, 200, {
      device_id: device.device_id,
      firmware: device.firmware,
      first_seen_at: device.first_seen_at,
      last_seen_at: device.last_seen_at,
      simulated: device.simulated === 1,
      online: isOnline(device.last_seen_at, deps.config.offlineTimeoutMs, deps.now()),
      telemetry_count: deps.repo.countTelemetry(deviceId),
      current:
        current === undefined
          ? null
          : {
              received_at: current.received_at,
              device_uptime_ms: current.device_uptime_ms,
              device_time: current.device_time,
              irrigation_state: current.irrigation_state,
              active_zone: current.active_zone,
              run_ms: current.run_ms,
              pump_on: current.pump_on === 1,
              controller_status: current.controller_status,
              wifi_connected: current.wifi_connected === 1,
              rssi: current.rssi,
              zones: zones.map((zone) => ({
                zone: zone.zone,
                sensor_1: zone.sensor_1,
                sensor_2: zone.sensor_2,
                sensor_1_valid: zone.sensor_1_valid === 1,
                sensor_2_valid: zone.sensor_2_valid === 1,
                average: zone.average,
                valid_sensors: zone.valid_sensors,
                valve_open: zone.valve_open === 1,
              })),
            },
    });
  });

  router.get('/api/v1/devices/:deviceId/telemetry', (ctx) => {
    const deviceId = ctx.params.deviceId!;
    if (deps.repo.getDevice(deviceId) === undefined) {
      sendError(ctx.res, 404, `unknown device "${deviceId}"`);
      return;
    }
    const limit = readLimit(ctx.url, 'limit', 50, MAX_PAGE);
    const rows = deps.repo.listTelemetry(deviceId, limit);

    sendJson(ctx.res, 200, {
      device_id: deviceId,
      count: rows.length,
      telemetry: rows.map((row) => ({
        id: row.id,
        received_at: row.received_at,
        device_uptime_ms: row.device_uptime_ms,
        irrigation_state: row.irrigation_state,
        active_zone: row.active_zone,
        run_ms: row.run_ms,
        pump_on: row.pump_on === 1,
        controller_status: row.controller_status,
        simulated: row.simulated === 1,
        zones: deps.repo.getZonesFor(row.id).map((zone) => ({
          zone: zone.zone,
          sensor_1: zone.sensor_1,
          sensor_2: zone.sensor_2,
          average: zone.average,
          valid_sensors: zone.valid_sensors,
          valve_open: zone.valve_open === 1,
        })),
      })),
    });
  });

  router.get('/api/v1/devices/:deviceId/events', (ctx) => {
    const deviceId = ctx.params.deviceId!;
    if (deps.repo.getDevice(deviceId) === undefined) {
      sendError(ctx.res, 404, `unknown device "${deviceId}"`);
      return;
    }
    const limit = readLimit(ctx.url, 'limit', 50, MAX_PAGE);
    sendJson(ctx.res, 200, {
      device_id: deviceId,
      events: deps.repo.listEvents(deviceId, limit),
    });
  });

  // --- zone configuration ---------------------------------------------------
  // PHASE 1: stored and served, but not yet consumed by the firmware, which
  // runs on compiled-in thresholds. Documented in docs/CONFIGURATION.md.
  router.get('/api/v1/devices/:deviceId/config', (ctx) => {
    const deviceId = ctx.params.deviceId!;
    if (deps.repo.getDevice(deviceId) === undefined) {
      sendError(ctx.res, 404, `unknown device "${deviceId}"`);
      return;
    }
    sendJson(ctx.res, 200, {
      device_id: deviceId,
      applied_by_device: false,
      note: 'Phase 1: the controller uses its compiled-in thresholds. These values are advisory.',
      zones: deps.repo.getZoneConfig(deviceId).map((row) => ({
        zone: row.zone,
        start_percent: row.start_percent,
        stop_percent: row.stop_percent,
        updated_at: row.updated_at,
      })),
    });
  });

  router.put('/api/v1/devices/:deviceId/config', async (ctx) => {
    const deviceId = ctx.params.deviceId!;
    if (deps.repo.getDevice(deviceId) === undefined) {
      sendError(ctx.res, 404, `unknown device "${deviceId}"`);
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(ctx.req);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        sendError(ctx.res, 413, error.message);
        return;
      }
      if (error instanceof BodyParseError) {
        sendError(ctx.res, 400, error.message);
        return;
      }
      throw error;
    }

    const result = validateZoneConfig(body);
    if (!result.ok) {
      sendError(ctx.res, 400, 'invalid zone configuration', result.errors);
      return;
    }

    deps.repo.setZoneConfig(deviceId, result.value, nowIso(deps));
    sendJson(ctx.res, 200, {
      device_id: deviceId,
      applied_by_device: false,
      zones: deps.repo.getZoneConfig(deviceId).map((row) => ({
        zone: row.zone,
        start_percent: row.start_percent,
        stop_percent: row.stop_percent,
        updated_at: row.updated_at,
      })),
    });
  });
}
