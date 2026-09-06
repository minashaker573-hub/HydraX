/**
 * HYDRAX Mobile — the app's view of the backend contract.
 *
 * These are the shapes the UI is written against. They are deliberately NOT
 * the wire shapes: the backend speaks snake_case and 0/1 integers, and
 * everything crosses `src/api/parse.ts` before a screen sees it. That single
 * translation layer is what lets the simulated device be replaced by a real
 * ESP32 later without a UI change — and what makes a backend field rename a
 * one-file edit rather than a search across every screen.
 *
 * Enum-ish fields are typed as a known union widened with `string`. A future
 * firmware that reports a state this build has never heard of must render as
 * that raw token, not crash or silently become "IDLE".
 */

/** Known irrigation states (firmware/src/core/irrigation_controller.h). */
export const IRRIGATION_STATES = [
  'IDLE',
  'CHECKING_SOIL',
  'IRRIGATION_REQUIRED',
  'STARTING',
  'IRRIGATING',
  'STOPPING',
  'SENSOR_ERROR',
  'ACTUATOR_ERROR',
  'TIMEOUT',
] as const;
export type IrrigationState = (typeof IRRIGATION_STATES)[number] | (string & {});

export const CONTROLLER_STATUSES = ['OK', 'DEGRADED', 'SENSOR_ERROR', 'ACTUATOR_ERROR'] as const;
export type ControllerStatus = (typeof CONTROLLER_STATUSES)[number] | (string & {});

export const EVENT_TYPES = [
  'CONTROLLER_STARTED',
  'ZONE_ACTIVATED',
  'IRRIGATION_STARTED',
  'IRRIGATION_STOPPED',
  'IRRIGATION_TIMEOUT',
  'SENSOR_ERROR',
  'SENSOR_RECOVERED',
  'ACTUATOR_ERROR',
  'FAULT_CLEARED',
  'SAFE_SHUTDOWN',
] as const;
export type EventType = (typeof EVENT_TYPES)[number] | (string & {});

export const ALERT_TYPES = [
  'SENSOR_ERROR',
  'IRRIGATION_TIMEOUT',
  'ACTUATOR_ERROR',
  'DEVICE_OFFLINE',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number] | (string & {});

export type AlertSeverity = 'warning' | 'critical' | (string & {});

/**
 * The backend's advisory threshold band for a zone.
 *
 * PHASE 1 TRUTH: the controller runs on thresholds compiled into its firmware
 * and never reads this. `GET /api/v1/devices/:id/config` says so itself
 * (`applied_by_device: false`). The app labels it advisory wherever it appears.
 */
export interface ZoneBand {
  readonly startPercent: number;
  readonly stopPercent: number;
}

export interface ZoneSnapshot {
  readonly zone: number;
  readonly sensor1: number | null;
  readonly sensor2: number | null;
  readonly sensor1Valid: boolean;
  readonly sensor2Valid: boolean;
  readonly average: number | null;
  readonly validSensors: number;
  readonly valveOpen: boolean;
  readonly irrigating: boolean;
  /** null when the backend holds no advisory band for this zone. */
  readonly band: ZoneBand | null;
}

export interface AlertSnapshot {
  readonly id: number;
  readonly deviceId: string;
  readonly type: AlertType;
  readonly severity: AlertSeverity;
  readonly message: string;
  readonly raisedAt: string;
  readonly resolvedAt: string | null;
  readonly active: boolean;
}

export interface EventSnapshot {
  readonly id: number;
  readonly deviceId: string;
  readonly receivedAt: string;
  readonly deviceUptimeMs: number | null;
  readonly type: EventType;
  readonly zone: number | null;
  readonly moisture: number | null;
  readonly durationMs: number | null;
  readonly detail: string | null;
}

export interface IrrigationSnapshot {
  readonly state: IrrigationState;
  readonly activeZone: number | null;
  readonly runMs: number;
}

export interface WifiSnapshot {
  readonly connected: boolean;
  readonly rssi: number | null;
}

/** One controller, as returned by GET /api/v1/dashboard. */
export interface DeviceSnapshot {
  readonly deviceId: string;
  readonly firmware: string | null;
  readonly online: boolean;
  readonly lastSeenAt: string;
  /** True when the readings are produced by the software mock, not hardware. */
  readonly simulated: boolean;
  /** null until the device has sent its first telemetry sample. */
  readonly irrigation: IrrigationSnapshot | null;
  readonly controllerStatus: ControllerStatus | null;
  readonly pumpOn: boolean;
  readonly wifi: WifiSnapshot | null;
  readonly zones: readonly ZoneSnapshot[];
  readonly alerts: readonly AlertSnapshot[];
  readonly events: readonly EventSnapshot[];
}

export interface SystemSnapshot {
  readonly generatedAt: string;
  readonly devices: readonly DeviceSnapshot[];
}

/** Extra identity/link detail from GET /api/v1/devices/:id. */
export interface DeviceDetail {
  readonly deviceId: string;
  readonly firmware: string | null;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly simulated: boolean;
  readonly online: boolean;
  readonly telemetryCount: number;
  readonly current: {
    readonly receivedAt: string;
    readonly deviceUptimeMs: number | null;
    readonly deviceTime: string | null;
    readonly irrigationState: IrrigationState;
    readonly activeZone: number | null;
    readonly runMs: number;
    readonly pumpOn: boolean;
    readonly controllerStatus: ControllerStatus;
    readonly wifiConnected: boolean;
    readonly rssi: number | null;
  } | null;
}

export interface TelemetryZone {
  readonly zone: number;
  readonly sensor1: number | null;
  readonly sensor2: number | null;
  readonly average: number | null;
  readonly validSensors: number;
  readonly valveOpen: boolean;
}

/** One historical sample from GET /api/v1/devices/:id/telemetry. */
export interface TelemetrySample {
  readonly id: number;
  readonly receivedAt: string;
  readonly deviceUptimeMs: number | null;
  readonly irrigationState: IrrigationState;
  readonly activeZone: number | null;
  readonly runMs: number;
  readonly pumpOn: boolean;
  readonly controllerStatus: ControllerStatus;
  readonly simulated: boolean;
  readonly zones: readonly TelemetryZone[];
}

export interface TelemetryHistory {
  readonly deviceId: string;
  /** Oldest first. The backend returns newest first; parsing reverses it. */
  readonly samples: readonly TelemetrySample[];
}

export interface ZoneConfigEntry {
  readonly zone: number;
  readonly startPercent: number;
  readonly stopPercent: number;
  readonly updatedAt: string;
}

export interface ZoneConfig {
  readonly deviceId: string;
  /** Phase 1 backend always reports false. Surfaced, never assumed. */
  readonly appliedByDevice: boolean;
  readonly zones: readonly ZoneConfigEntry[];
}
