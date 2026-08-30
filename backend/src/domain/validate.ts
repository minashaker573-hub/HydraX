/**
 * HYDRAX - ingestion validation.
 *
 * Everything arriving over the network is untrusted, including payloads from
 * our own firmware: a half-flashed board, a truncated POST or a stale device
 * on an old schema all show up here first. Nothing reaches the database until
 * it has been through this module.
 *
 * Validation is strict and collects ALL problems rather than failing on the
 * first, so a device author sees the whole list in one response.
 */

import {
  CONTROLLER_STATUSES,
  EVENT_TYPES,
  IRRIGATION_STATES,
  MAX_SENSORS,
  MAX_ZONES,
  type ControllerStatus,
  type EventPayload,
  type EventType,
  type IrrigationState,
  type TelemetryPayload,
  type ZoneReading,
} from './types.ts';
import {
  Errors,
  isRecord,
  oneOf,
  optionalPercent,
  requireBoolean,
  requireInteger,
  requireRecord,
  requireString,
  sanitizeText,
  type ValidationResult,
} from './validators.ts';

// Re-exported so existing importers of validate.ts keep working.
export type { ValidationResult };


const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const ZONE_KEY_PATTERN = /^zone_(\d+)$/;
const MAX_DETAIL_LENGTH = 200;

// ---------------------------------------------------------------------------
// telemetry
// ---------------------------------------------------------------------------

export function validateTelemetry(input: unknown): ValidationResult<TelemetryPayload> {
  const errors = new Errors();
  const root = requireRecord(input, 'body', errors);
  if (!errors.ok) return { ok: false, errors: errors.list };

  const deviceId = requireString(root.device_id, 'device_id', errors, 64);
  if (deviceId !== null && !DEVICE_ID_PATTERN.test(deviceId)) {
    errors.add('device_id may only contain letters, digits, dot, underscore, colon or hyphen');
  }

  const firmwareRaw = root.firmware;
  const firmware =
    firmwareRaw === undefined || firmwareRaw === null
      ? null
      : requireString(firmwareRaw, 'firmware', errors, 64);

  const uptimeMs = requireInteger(root.uptime_ms, 'uptime_ms', errors, 0, Number.MAX_SAFE_INTEGER);

  let deviceTime: string | null = null;
  if (root.device_time !== null && root.device_time !== undefined) {
    const raw = requireString(root.device_time, 'device_time', errors, 40);
    if (raw !== null) {
      if (Number.isNaN(Date.parse(raw))) {
        errors.add('device_time must be an ISO-8601 timestamp or null');
      } else {
        deviceTime = new Date(raw).toISOString();
      }
    }
  }

  const simulated =
    root.simulated === undefined ? false : requireBoolean(root.simulated, 'simulated', errors);

  // --- per-sensor validity, needed to attribute a fault to a probe ---------
  const sensorValidity = new Map<string, boolean>();
  if (!Array.isArray(root.sensors)) {
    errors.add('sensors must be an array');
  } else if (root.sensors.length > MAX_SENSORS) {
    errors.add(`sensors must contain at most ${MAX_SENSORS} entries`);
  } else {
    root.sensors.forEach((entry, index) => {
      const sensor = requireRecord(entry, `sensors[${index}]`, errors);
      const zone = requireInteger(sensor.zone, `sensors[${index}].zone`, errors, 1, MAX_ZONES);
      const id = requireInteger(sensor.id, `sensors[${index}].id`, errors, 1, MAX_SENSORS);
      const valid = requireBoolean(sensor.valid, `sensors[${index}].valid`, errors);
      sensorValidity.set(`${zone}:${id}`, valid);
    });
  }

  // --- soil ---------------------------------------------------------------
  const soil = requireRecord(root.soil, 'soil', errors);
  const actuators = requireRecord(root.actuators, 'actuators', errors);
  const zones: ZoneReading[] = [];

  const zoneKeys = Object.keys(soil);
  if (zoneKeys.length === 0) errors.add('soil must contain at least one zone');
  if (zoneKeys.length > MAX_ZONES) errors.add(`soil must contain at most ${MAX_ZONES} zones`);

  for (const key of zoneKeys) {
    const match = ZONE_KEY_PATTERN.exec(key);
    if (match === null) {
      errors.add(`soil.${key} is not a valid zone key (expected zone_N)`);
      continue;
    }
    const zone = Number(match[1]);
    if (!Number.isInteger(zone) || zone < 1 || zone > MAX_ZONES) {
      errors.add(`soil.${key}: zone number must be between 1 and ${MAX_ZONES}`);
      continue;
    }

    const body = requireRecord(soil[key], `soil.${key}`, errors);
    const sensor1 = optionalPercent(body.sensor_1, `soil.${key}.sensor_1`, errors);
    const sensor2 = optionalPercent(body.sensor_2, `soil.${key}.sensor_2`, errors);
    const average = optionalPercent(body.average, `soil.${key}.average`, errors);
    const validSensors = requireInteger(
      body.valid_sensors,
      `soil.${key}.valid_sensors`,
      errors,
      0,
      2,
    );

    const valveKey = `zone_${zone}_valve`;
    if (!(valveKey in actuators)) {
      errors.add(`actuators.${valveKey} is required for zone ${zone}`);
    }
    const valveOpen = requireBoolean(actuators[valveKey], `actuators.${valveKey}`, errors);

    // Sensor ids are global and 1-based: zone 1 owns 1 and 2, zone 2 owns 3
    // and 4, and so on.
    const firstId = (zone - 1) * 2 + 1;
    zones.push({
      zone,
      sensor1,
      sensor2,
      sensor1Valid: sensorValidity.get(`${zone}:${firstId}`) ?? false,
      sensor2Valid: sensorValidity.get(`${zone}:${firstId + 1}`) ?? false,
      average,
      validSensors,
      valveOpen,
    });
  }
  zones.sort((a, b) => a.zone - b.zone);

  const pumpOn = requireBoolean(actuators.pump, 'actuators.pump', errors);

  // --- irrigation ---------------------------------------------------------
  const irrigation = requireRecord(root.irrigation, 'irrigation', errors);
  const irrigationState: IrrigationState = oneOf(
    irrigation.state,
    IRRIGATION_STATES,
    'irrigation.state',
    errors,
  );

  let activeZone: number | null = null;
  const rawActive = irrigation.active_zone;
  if (rawActive !== null && rawActive !== undefined && rawActive !== -1) {
    activeZone = requireInteger(rawActive, 'irrigation.active_zone', errors, 1, MAX_ZONES);
    if (!zones.some((z) => z.zone === activeZone)) {
      errors.add(`irrigation.active_zone ${activeZone} does not appear in soil`);
    }
  }

  const runMs =
    irrigation.run_ms === undefined
      ? 0
      : requireInteger(irrigation.run_ms, 'irrigation.run_ms', errors, 0, Number.MAX_SAFE_INTEGER);

  // --- controller / network -----------------------------------------------
  const controller = requireRecord(root.controller, 'controller', errors);
  const controllerStatus: ControllerStatus = oneOf(
    controller.status,
    CONTROLLER_STATUSES,
    'controller.status',
    errors,
  );

  let wifiConnected = false;
  let rssi: number | null = null;
  if (root.network !== undefined) {
    const network = requireRecord(root.network, 'network', errors);
    wifiConnected = requireBoolean(network.wifi_connected, 'network.wifi_connected', errors);
    if (network.rssi !== undefined && network.rssi !== null) {
      rssi = requireInteger(network.rssi, 'network.rssi', errors, -200, 50);
    }
  }

  // --- cross-field consistency --------------------------------------------
  // A payload claiming the pump runs with no valve open describes a physically
  // impossible (and damaging) state. Something is wrong; do not record it as
  // fact.
  if (pumpOn && zones.length > 0 && !zones.some((z) => z.valveOpen)) {
    errors.add('actuators.pump is true but no zone valve is open');
  }
  if (zones.filter((z) => z.valveOpen).length > 1) {
    errors.add('more than one zone valve reported open');
  }

  if (!errors.ok) return { ok: false, errors: errors.list };

  return {
    ok: true,
    value: {
      deviceId: deviceId!,
      firmware,
      uptimeMs,
      deviceTime,
      simulated,
      zones,
      pumpOn,
      irrigationState,
      activeZone,
      runMs,
      controllerStatus,
      wifiConnected,
      rssi,
    },
  };
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

export function validateEvent(input: unknown): ValidationResult<EventPayload> {
  const errors = new Errors();
  const root = requireRecord(input, 'body', errors);
  if (!errors.ok) return { ok: false, errors: errors.list };

  const deviceId = requireString(root.device_id, 'device_id', errors, 64);
  if (deviceId !== null && !DEVICE_ID_PATTERN.test(deviceId)) {
    errors.add('device_id may only contain letters, digits, dot, underscore, colon or hyphen');
  }

  const uptimeMs = requireInteger(root.uptime_ms, 'uptime_ms', errors, 0, Number.MAX_SAFE_INTEGER);
  const type: EventType = oneOf(root.type, EVENT_TYPES, 'type', errors);

  // The firmware sends -1 for "not zone specific".
  let zone: number | null = null;
  if (root.zone !== null && root.zone !== undefined && root.zone !== -1) {
    zone = requireInteger(root.zone, 'zone', errors, 1, MAX_ZONES);
  }

  const moisture =
    root.moisture === undefined ? null : optionalPercent(root.moisture, 'moisture', errors);

  const durationMs =
    root.duration_ms === undefined || root.duration_ms === null
      ? null
      : requireInteger(root.duration_ms, 'duration_ms', errors, 0, Number.MAX_SAFE_INTEGER);

  let detail: string | null = null;
  if (root.detail !== undefined && root.detail !== null) {
    const raw = requireString(root.detail, 'detail', errors, MAX_DETAIL_LENGTH);
    if (raw !== null) detail = sanitizeText(raw);
  }

  if (!errors.ok) return { ok: false, errors: errors.list };

  return {
    ok: true,
    value: { deviceId: deviceId!, uptimeMs, type, zone, moisture, durationMs, detail },
  };
}

// ---------------------------------------------------------------------------
// zone configuration
// ---------------------------------------------------------------------------

export interface ZoneConfigInput {
  zone: number;
  startPercent: number;
  stopPercent: number;
}

/** Minimum hysteresis band the backend will accept, mirroring the firmware. */
export const MIN_HYSTERESIS_BAND = 5;

export function validateZoneConfig(input: unknown): ValidationResult<ZoneConfigInput[]> {
  const errors = new Errors();
  const root = requireRecord(input, 'body', errors);
  if (!errors.ok) return { ok: false, errors: errors.list };

  if (!Array.isArray(root.zones)) {
    return { ok: false, errors: ['zones must be an array'] };
  }
  if (root.zones.length === 0 || root.zones.length > MAX_ZONES) {
    errors.add(`zones must contain between 1 and ${MAX_ZONES} entries`);
  }

  const out: ZoneConfigInput[] = [];
  const seen = new Set<number>();

  root.zones.forEach((entry, index) => {
    const body = requireRecord(entry, `zones[${index}]`, errors);
    const zone = requireInteger(body.zone, `zones[${index}].zone`, errors, 1, MAX_ZONES);
    if (seen.has(zone)) errors.add(`zones[${index}].zone ${zone} is duplicated`);
    seen.add(zone);

    const startPercent = optionalPercent(
      body.start_percent,
      `zones[${index}].start_percent`,
      errors,
    );
    const stopPercent = optionalPercent(body.stop_percent, `zones[${index}].stop_percent`, errors);

    if (startPercent === null || stopPercent === null) {
      errors.add(`zones[${index}] requires both start_percent and stop_percent`);
      return;
    }

    // Rejecting a bad band here is the difference between a config typo and a
    // pump that short-cycles itself to death in the field.
    if (stopPercent - startPercent < MIN_HYSTERESIS_BAND) {
      errors.add(
        `zones[${index}]: stop_percent must exceed start_percent by at least ` +
          `${MIN_HYSTERESIS_BAND} (got ${startPercent} -> ${stopPercent})`,
      );
      return;
    }

    out.push({ zone, startPercent, stopPercent });
  });

  if (!errors.ok) return { ok: false, errors: errors.list };
  return { ok: true, value: out };
}
