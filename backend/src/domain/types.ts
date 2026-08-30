/**
 * HYDRAX - shared domain vocabulary.
 *
 * These string sets mirror the firmware enums exactly (see
 * firmware/src/core/irrigation_controller.h). Anything outside them is
 * rejected at ingestion rather than being written to the database.
 */

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
export type IrrigationState = (typeof IRRIGATION_STATES)[number];

export const CONTROLLER_STATUSES = ['OK', 'DEGRADED', 'SENSOR_ERROR', 'ACTUATOR_ERROR'] as const;
export type ControllerStatus = (typeof CONTROLLER_STATUSES)[number];

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
export type EventType = (typeof EVENT_TYPES)[number];

export const ALERT_TYPES = [
  'SENSOR_ERROR',
  'IRRIGATION_TIMEOUT',
  'ACTUATOR_ERROR',
  'DEVICE_OFFLINE',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export type AlertSeverity = 'warning' | 'critical';

/** Upper bound on zones accepted from a device, to bound payload size. */
export const MAX_ZONES = 8;
/** Upper bound on sensors accepted from a device. */
export const MAX_SENSORS = 32;

export interface ZoneReading {
  zone: number; // 1-based
  sensor1: number | null;
  sensor2: number | null;
  sensor1Valid: boolean;
  sensor2Valid: boolean;
  average: number | null;
  validSensors: number;
  valveOpen: boolean;
}

export interface TelemetryPayload {
  deviceId: string;
  firmware: string | null;
  uptimeMs: number;
  deviceTime: string | null;
  simulated: boolean;
  zones: ZoneReading[];
  pumpOn: boolean;
  irrigationState: IrrigationState;
  activeZone: number | null;
  runMs: number;
  controllerStatus: ControllerStatus;
  wifiConnected: boolean;
  rssi: number | null;
}

export interface EventPayload {
  deviceId: string;
  uptimeMs: number;
  type: EventType;
  zone: number | null;
  moisture: number | null;
  durationMs: number | null;
  detail: string | null;
}

/* ===========================================================================
   Customer quote requests
   ---------------------------------------------------------------------------
   These describe what a prospective customer ASKED FOR. A requested capability
   is an expression of interest, not a statement that the capability ships
   today — pump, water-network and safety monitoring all still need hardware
   that does not exist yet.
   =========================================================================== */

export const IRRIGATION_TYPES = ['DRIP', 'SPRINKLER', 'OTHER'] as const;
export type IrrigationType = (typeof IRRIGATION_TYPES)[number];

export const CAPABILITIES = [
  'SMART_IRRIGATION',
  'PUMP_MONITORING',
  'WATER_NETWORK_MONITORING',
  'SAFETY_MONITORING',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const REQUEST_STATUSES = ['NEW', 'CONTACTED', 'QUOTED', 'CLOSED'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Upper bound on zones accepted on a request form. */
export const MAX_REQUEST_ZONES = 64;

export interface QuoteRequestInput {
  // farm
  farmSize: string;
  farmLocation: string;
  irrigationType: IrrigationType;
  zoneCount: number;
  // requirements
  capabilities: Capability[];
  // customer
  fullName: string;
  phone: string;
  email: string | null;
  notes: string | null;
}
