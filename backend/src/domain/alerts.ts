/**
 * HYDRAX - alert rules.
 *
 * Phase 1 alerting is deliberately mechanical: alerts are derived from what
 * the device actually reported, never predicted. Anything cleverer belongs to
 * the later predictive-maintenance phase.
 *
 * Every alert is de-duplicated by (device, type) so a probe that flaps once a
 * second produces one open alert, not thousands.
 */

import type { Repository } from '../db/repository.ts';
import type { EventPayload, TelemetryPayload } from './types.ts';
import { log } from '../log.ts';

/** A device silent for longer than this is reported offline. */
export function isOnline(lastSeenAt: string, offlineTimeoutMs: number, nowMs: number): boolean {
  const seen = Date.parse(lastSeenAt);
  if (Number.isNaN(seen)) return false;
  return nowMs - seen < offlineTimeoutMs;
}

/**
 * Reconciles alerts against a freshly received telemetry sample.
 *
 * Reconciles rather than only raises: a condition that has cleared must close
 * its alert, otherwise the dashboard fills with stale red that operators learn
 * to ignore.
 */
export async function applyTelemetryAlerts(
  repo: Repository,
  payload: TelemetryPayload,
  now: string,
): Promise<void> {
  const { deviceId, controllerStatus } = payload;

  // Hearing from the device at all means it is not offline.
  await repo.resolveAlerts(deviceId, 'DEVICE_OFFLINE', now);

  if (controllerStatus === 'SENSOR_ERROR') {
    const id = await repo.raiseAlert(
      deviceId,
      'SENSOR_ERROR',
      'critical',
      'Controller reports SENSOR_ERROR: no usable soil moisture data, irrigation is held off',
      now,
    );
    if (id !== null) log.warn('alerts', `${deviceId}: sensor error raised`);
  } else {
    await repo.resolveAlerts(deviceId, 'SENSOR_ERROR', now);
  }

  if (controllerStatus === 'ACTUATOR_ERROR') {
    const id = await repo.raiseAlert(
      deviceId,
      'ACTUATOR_ERROR',
      'critical',
      'Controller reports ACTUATOR_ERROR: pump or valve did not respond, irrigation is latched off',
      now,
    );
    if (id !== null) log.error('alerts', `${deviceId}: actuator error raised`);
  } else {
    await repo.resolveAlerts(deviceId, 'ACTUATOR_ERROR', now);
  }
}

/** Reconciles alerts against a controller event. */
export async function applyEventAlerts(repo: Repository, payload: EventPayload, now: string): Promise<void> {
  const { deviceId, type, zone } = payload;
  const where = zone === null ? '' : ` on zone ${zone}`;

  switch (type) {
    case 'IRRIGATION_TIMEOUT':
      await repo.raiseAlert(
        deviceId,
        'IRRIGATION_TIMEOUT',
        'critical',
        `Irrigation exceeded the maximum runtime${where} and the pump was cut. ` +
          'Check for a closed valve, a burst line or an empty supply.',
        now,
      );
      log.error('alerts', `${deviceId}: irrigation timeout${where}`);
      break;

    case 'IRRIGATION_STOPPED':
      // A run that completed normally shows the previous timeout is no longer
      // the current condition.
      await repo.resolveAlerts(deviceId, 'IRRIGATION_TIMEOUT', now);
      break;

    case 'SENSOR_ERROR':
      await repo.raiseAlert(
        deviceId,
        'SENSOR_ERROR',
        'critical',
        `Sensor fault reported${where}: ${payload.detail ?? 'no detail'}`,
        now,
      );
      break;

    case 'SENSOR_RECOVERED':
      await repo.resolveAlerts(deviceId, 'SENSOR_ERROR', now);
      break;

    case 'ACTUATOR_ERROR':
      await repo.raiseAlert(
        deviceId,
        'ACTUATOR_ERROR',
        'critical',
        `Actuator fault reported${where}: ${payload.detail ?? 'no detail'}`,
        now,
      );
      break;

    case 'FAULT_CLEARED':
      await repo.resolveAlerts(deviceId, 'ACTUATOR_ERROR', now);
      break;

    default:
      break;
  }
}

/**
 * Raises DEVICE_OFFLINE for every device that has gone quiet.
 * Returns the number of alerts newly raised.
 */
export async function sweepOfflineDevices(
  repo: Repository,
  offlineTimeoutMs: number,
  nowMs: number,
): Promise<number> {
  const now = new Date(nowMs).toISOString();
  let raised = 0;

  for (const device of await repo.listDevices()) {
    if (isOnline(device.last_seen_at, offlineTimeoutMs, nowMs)) continue;

    const silentForS = Math.round((nowMs - Date.parse(device.last_seen_at)) / 1000);
    const id = await repo.raiseAlert(
      device.device_id,
      'DEVICE_OFFLINE',
      'warning',
      `No telemetry for ${silentForS}s. The controller keeps irrigating locally; ` +
        'only monitoring is affected.',
      now,
    );
    if (id !== null) {
      raised += 1;
      log.warn('alerts', `${device.device_id}: offline (silent ${silentForS}s)`);
    }
  }
  return raised;
}
