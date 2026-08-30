/**
 * HYDRAX - data access.
 *
 * All SQL lives here. Routes deal in domain objects and never build queries.
 */

import type { Db } from './index.ts';
import { CAPABILITIES } from '../domain/types.ts';
import type {
  AlertSeverity,
  AlertType,
  Capability,
  EventPayload,
  QuoteRequestInput,
  RequestStatus,
  TelemetryPayload,
} from '../domain/types.ts';
import type { ZoneConfigInput } from '../domain/validate.ts';

export interface DeviceRow {
  device_id: string;
  firmware: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_uptime_ms: number | null;
  simulated: number;
}

export interface TelemetryRow {
  id: number;
  device_id: string;
  received_at: string;
  device_uptime_ms: number;
  device_time: string | null;
  irrigation_state: string;
  active_zone: number | null;
  run_ms: number;
  pump_on: number;
  controller_status: string;
  wifi_connected: number;
  rssi: number | null;
  simulated: number;
}

export interface ZoneRow {
  telemetry_id: number;
  zone: number;
  sensor_1: number | null;
  sensor_2: number | null;
  sensor_1_valid: number;
  sensor_2_valid: number;
  average: number | null;
  valid_sensors: number;
  valve_open: number;
}

export interface EventRow {
  id: number;
  device_id: string;
  received_at: string;
  device_uptime_ms: number;
  type: string;
  zone: number | null;
  moisture: number | null;
  duration_ms: number | null;
  detail: string | null;
}

export interface AlertRow {
  id: number;
  device_id: string;
  type: string;
  severity: string;
  message: string;
  raised_at: string;
  resolved_at: string | null;
  active: number;
}

export interface ZoneConfigRow {
  device_id: string;
  zone: number;
  start_percent: number;
  stop_percent: number;
  updated_at: string;
}

export interface QuoteRequestRow {
  id: number;
  reference: string;
  created_at: string;
  updated_at: string;
  status: RequestStatus;
  farm_size: string;
  farm_location: string;
  irrigation_type: string;
  zone_count: number;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string | null;
}

/** A stored request together with the capabilities it asked for. */
export interface QuoteRequest extends QuoteRequestRow {
  capabilities: Capability[];
}

export class Repository {
  // Declared explicitly rather than as a constructor parameter property:
  // parameter properties are not erasable syntax, and this project runs
  // TypeScript directly under Node's type stripping with no build step.
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  private get db(): Db {
    return this.#db;
  }

  // -------------------------------------------------------------------------
  // devices
  // -------------------------------------------------------------------------

  upsertDevice(
    deviceId: string,
    firmware: string | null,
    uptimeMs: number,
    simulated: boolean,
    now: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO devices (device_id, firmware, first_seen_at, last_seen_at,
                              last_uptime_ms, simulated)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET
           firmware       = COALESCE(excluded.firmware, devices.firmware),
           last_seen_at   = excluded.last_seen_at,
           last_uptime_ms = excluded.last_uptime_ms,
           simulated      = excluded.simulated`,
      )
      .run(deviceId, firmware, now, now, uptimeMs, simulated ? 1 : 0);
  }

  getDevice(deviceId: string): DeviceRow | undefined {
    return this.db.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId) as
      | DeviceRow
      | undefined;
  }

  listDevices(): DeviceRow[] {
    return this.db
      .prepare('SELECT * FROM devices ORDER BY device_id')
      .all() as unknown as DeviceRow[];
  }

  // -------------------------------------------------------------------------
  // telemetry
  // -------------------------------------------------------------------------

  /** Persists one sample and repoints the device's current state at it. */
  insertTelemetry(payload: TelemetryPayload, receivedAt: string): number {
    const insertTelemetry = this.db.prepare(
      `INSERT INTO telemetry (device_id, received_at, device_uptime_ms, device_time,
                              irrigation_state, active_zone, run_ms, pump_on,
                              controller_status, wifi_connected, rssi, simulated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertZone = this.db.prepare(
      `INSERT INTO telemetry_zone (telemetry_id, zone, sensor_1, sensor_2,
                                   sensor_1_valid, sensor_2_valid, average,
                                   valid_sensors, valve_open)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const upsertState = this.db.prepare(
      `INSERT INTO device_state (device_id, telemetry_id, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         telemetry_id = excluded.telemetry_id,
         updated_at   = excluded.updated_at`,
    );

    // One transaction: a sample is either fully recorded with its zones, or
    // not recorded at all. A partially written sample would show the dashboard
    // a device with no zone data.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.upsertDevice(
        payload.deviceId,
        payload.firmware,
        payload.uptimeMs,
        payload.simulated,
        receivedAt,
      );

      const result = insertTelemetry.run(
        payload.deviceId,
        receivedAt,
        payload.uptimeMs,
        payload.deviceTime,
        payload.irrigationState,
        payload.activeZone,
        payload.runMs,
        payload.pumpOn ? 1 : 0,
        payload.controllerStatus,
        payload.wifiConnected ? 1 : 0,
        payload.rssi,
        payload.simulated ? 1 : 0,
      );
      const telemetryId = Number(result.lastInsertRowid);

      for (const zone of payload.zones) {
        insertZone.run(
          telemetryId,
          zone.zone,
          zone.sensor1,
          zone.sensor2,
          zone.sensor1Valid ? 1 : 0,
          zone.sensor2Valid ? 1 : 0,
          zone.average,
          zone.validSensors,
          zone.valveOpen ? 1 : 0,
        );
      }

      upsertState.run(payload.deviceId, telemetryId, receivedAt);
      this.db.exec('COMMIT');
      return telemetryId;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Latest sample for a device, read from current state rather than history. */
  getCurrentTelemetry(deviceId: string): TelemetryRow | undefined {
    return this.db
      .prepare(
        `SELECT t.* FROM device_state s
         JOIN telemetry t ON t.id = s.telemetry_id
         WHERE s.device_id = ?`,
      )
      .get(deviceId) as TelemetryRow | undefined;
  }

  getZonesFor(telemetryId: number): ZoneRow[] {
    return this.db
      .prepare('SELECT * FROM telemetry_zone WHERE telemetry_id = ? ORDER BY zone')
      .all(telemetryId) as unknown as ZoneRow[];
  }

  listTelemetry(deviceId: string, limit: number): TelemetryRow[] {
    return this.db
      .prepare(
        `SELECT * FROM telemetry WHERE device_id = ?
         ORDER BY received_at DESC, id DESC LIMIT ?`,
      )
      .all(deviceId, limit) as unknown as TelemetryRow[];
  }

  countTelemetry(deviceId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM telemetry WHERE device_id = ?')
      .get(deviceId) as { n: number };
    return row.n;
  }

  /** Deletes telemetry older than the cutoff. Returns rows removed. */
  pruneTelemetryBefore(cutoffIso: string): number {
    // device_state references the newest row per device, so a device that has
    // gone quiet keeps its last known state instead of vanishing from the
    // dashboard entirely.
    const result = this.db
      .prepare(
        `DELETE FROM telemetry
         WHERE received_at < ?
           AND id NOT IN (SELECT telemetry_id FROM device_state)`,
      )
      .run(cutoffIso);
    return Number(result.changes);
  }

  // -------------------------------------------------------------------------
  // events
  // -------------------------------------------------------------------------

  insertEvent(payload: EventPayload, receivedAt: string): number {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.upsertDevice(payload.deviceId, null, payload.uptimeMs, false, receivedAt);
      const result = this.db
        .prepare(
          `INSERT INTO irrigation_events (device_id, received_at, device_uptime_ms,
                                          type, zone, moisture, duration_ms, detail)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          payload.deviceId,
          receivedAt,
          payload.uptimeMs,
          payload.type,
          payload.zone,
          payload.moisture,
          payload.durationMs,
          payload.detail,
        );
      this.db.exec('COMMIT');
      return Number(result.lastInsertRowid);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  listEvents(deviceId: string, limit: number): EventRow[] {
    return this.db
      .prepare(
        `SELECT * FROM irrigation_events WHERE device_id = ?
         ORDER BY received_at DESC, id DESC LIMIT ?`,
      )
      .all(deviceId, limit) as unknown as EventRow[];
  }

  listRecentEvents(limit: number): EventRow[] {
    return this.db
      .prepare('SELECT * FROM irrigation_events ORDER BY received_at DESC, id DESC LIMIT ?')
      .all(limit) as unknown as EventRow[];
  }

  // -------------------------------------------------------------------------
  // alerts
  // -------------------------------------------------------------------------

  /**
   * Raises an alert unless an unresolved one of the same type already exists
   * for the device. Returns the alert id, or null when it was suppressed as a
   * duplicate.
   */
  raiseAlert(
    deviceId: string,
    type: AlertType,
    severity: AlertSeverity,
    message: string,
    now: string,
  ): number | null {
    const existing = this.db
      .prepare('SELECT id FROM alerts WHERE device_id = ? AND type = ? AND active = 1')
      .get(deviceId, type) as { id: number } | undefined;
    if (existing !== undefined) return null;

    const result = this.db
      .prepare(
        `INSERT INTO alerts (device_id, type, severity, message, raised_at, active)
         VALUES (?, ?, ?, ?, ?, 1)`,
      )
      .run(deviceId, type, severity, message, now);
    return Number(result.lastInsertRowid);
  }

  /** Clears any active alert of this type. Returns how many were cleared. */
  resolveAlerts(deviceId: string, type: AlertType, now: string): number {
    const result = this.db
      .prepare(
        `UPDATE alerts SET active = 0, resolved_at = ?
         WHERE device_id = ? AND type = ? AND active = 1`,
      )
      .run(now, deviceId, type);
    return Number(result.changes);
  }

  resolveAlertById(id: number, now: string): boolean {
    const result = this.db
      .prepare('UPDATE alerts SET active = 0, resolved_at = ? WHERE id = ? AND active = 1')
      .run(now, id);
    return Number(result.changes) > 0;
  }

  listAlerts(activeOnly: boolean, limit: number): AlertRow[] {
    const sql = activeOnly
      ? 'SELECT * FROM alerts WHERE active = 1 ORDER BY raised_at DESC, id DESC LIMIT ?'
      : 'SELECT * FROM alerts ORDER BY raised_at DESC, id DESC LIMIT ?';
    return this.db.prepare(sql).all(limit) as unknown as AlertRow[];
  }

  listAlertsForDevice(deviceId: string, activeOnly: boolean, limit: number): AlertRow[] {
    const sql = activeOnly
      ? `SELECT * FROM alerts WHERE device_id = ? AND active = 1
         ORDER BY raised_at DESC, id DESC LIMIT ?`
      : `SELECT * FROM alerts WHERE device_id = ?
         ORDER BY raised_at DESC, id DESC LIMIT ?`;
    return this.db.prepare(sql).all(deviceId, limit) as unknown as AlertRow[];
  }

  // -------------------------------------------------------------------------
  // zone configuration
  // -------------------------------------------------------------------------

  getZoneConfig(deviceId: string): ZoneConfigRow[] {
    return this.db
      .prepare('SELECT * FROM zone_config WHERE device_id = ? ORDER BY zone')
      .all(deviceId) as unknown as ZoneConfigRow[];
  }

  setZoneConfig(deviceId: string, zones: ZoneConfigInput[], now: string): void {
    const stmt = this.db.prepare(
      `INSERT INTO zone_config (device_id, zone, start_percent, stop_percent, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id, zone) DO UPDATE SET
         start_percent = excluded.start_percent,
         stop_percent  = excluded.stop_percent,
         updated_at    = excluded.updated_at`,
    );
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const zone of zones) {
        stmt.run(deviceId, zone.zone, zone.startPercent, zone.stopPercent, now);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // --- quote requests ------------------------------------------------------

  /**
   * Inserts a request and its capabilities in one transaction, allocating a
   * unique customer-facing reference.
   *
   * The reference is generated rather than derived from the row id so it does
   * not leak how many requests exist, and retried on collision because a
   * UNIQUE constraint is the only trustworthy uniqueness check.
   */
  insertQuoteRequest(
    input: QuoteRequestInput,
    now: string,
    makeReference: () => string,
    maxAttempts = 8,
  ): QuoteRequest {
    const insertRequest = this.db.prepare(
      `INSERT INTO quote_requests
         (reference, created_at, updated_at, status,
          farm_size, farm_location, irrigation_type, zone_count,
          full_name, phone, email, notes)
       VALUES (?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertCapability = this.db.prepare(
      'INSERT INTO quote_request_capabilities (request_id, capability) VALUES (?, ?)',
    );

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const reference = makeReference();
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = insertRequest.run(
          reference,
          now,
          now,
          input.farmSize,
          input.farmLocation,
          input.irrigationType,
          input.zoneCount,
          input.fullName,
          input.phone,
          input.email,
          input.notes,
        );
        const id = Number(result.lastInsertRowid);
        for (const capability of input.capabilities) {
          insertCapability.run(id, capability);
        }
        this.db.exec('COMMIT');

        return {
          id,
          reference,
          created_at: now,
          updated_at: now,
          status: 'NEW',
          farm_size: input.farmSize,
          farm_location: input.farmLocation,
          irrigation_type: input.irrigationType,
          zone_count: input.zoneCount,
          full_name: input.fullName,
          phone: input.phone,
          email: input.email,
          notes: input.notes,
          capabilities: input.capabilities,
        };
      } catch (error) {
        this.db.exec('ROLLBACK');
        // Only a reference collision is worth retrying; anything else is a
        // real failure and must surface.
        const message = error instanceof Error ? error.message : String(error);
        if (!/UNIQUE constraint failed: quote_requests.reference/.test(message)) {
          throw error;
        }
      }
    }
    throw new Error(`could not allocate a unique request reference in ${maxAttempts} attempts`);
  }

  /**
   * Capabilities in the domain's declared order, not alphabetical, so a
   * request reads the same however it was fetched — and so the UI always lists
   * the capability that actually ships today first.
   */
  getCapabilitiesFor(requestId: number): Capability[] {
    const stored = new Set(
      (
        this.db
          .prepare('SELECT capability FROM quote_request_capabilities WHERE request_id = ?')
          .all(requestId) as unknown as { capability: Capability }[]
      ).map((row) => row.capability),
    );
    return CAPABILITIES.filter((capability) => stored.has(capability));
  }

  getQuoteRequestByReference(reference: string): QuoteRequest | undefined {
    const row = this.db
      .prepare('SELECT * FROM quote_requests WHERE reference = ?')
      .get(reference) as unknown as QuoteRequestRow | undefined;
    if (row === undefined) return undefined;
    return { ...row, capabilities: this.getCapabilitiesFor(row.id) };
  }

  listQuoteRequests(limit: number, status?: RequestStatus): QuoteRequest[] {
    const rows = (
      status === undefined
        ? this.db
            .prepare('SELECT * FROM quote_requests ORDER BY created_at DESC, id DESC LIMIT ?')
            .all(limit)
        : this.db
            .prepare(
              'SELECT * FROM quote_requests WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ?',
            )
            .all(status, limit)
    ) as unknown as QuoteRequestRow[];

    return rows.map((row) => ({ ...row, capabilities: this.getCapabilitiesFor(row.id) }));
  }

  countQuoteRequestsByStatus(): Record<string, number> {
    const rows = this.db
      .prepare('SELECT status, COUNT(*) AS n FROM quote_requests GROUP BY status')
      .all() as unknown as { status: string; n: number }[];
    const out: Record<string, number> = {};
    for (const row of rows) out[row.status] = row.n;
    return out;
  }

  updateQuoteRequestStatus(reference: string, status: RequestStatus, now: string): boolean {
    const result = this.db
      .prepare('UPDATE quote_requests SET status = ?, updated_at = ? WHERE reference = ?')
      .run(status, now, reference);
    return Number(result.changes) > 0;
  }
}
