/**
 * HYDRAX - data access.
 *
 * All SQL lives here. Routes deal in domain objects and never build queries.
 *
 * Postgres, accessed through `pg`. Every method is async — the SQLite version
 * this was ported from was synchronous by nature of the driver, and every
 * caller (routes/*.ts, domain/alerts.ts, app.ts, server.ts) now `await`s
 * accordingly.
 *
 * A Repository is scoped to one Postgres schema (`'public'` in production; a
 * unique per-test schema in test/helpers.ts, all sharing one pool). Every
 * query goes through `#query`/`#transaction` below, which check out a
 * connection and `SET search_path` on it before running anything — never
 * `this.#query()` directly — because a shared pool can hand back a
 * different physical connection on every call, so search_path cannot be set
 * once and relied on afterward the way a single dedicated connection would
 * allow. Multi-statement writes use `#transaction` so a sample is still
 * either fully recorded or not recorded at all.
 */

import type { Db, DbClient } from './index.ts';
import { isUniqueViolation } from './index.ts';
import { log } from '../log.ts';
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
import type { SectionId } from '../domain/website-content.ts';
import type { QueryResult, QueryResultRow } from 'pg';

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

export interface WebsiteContentRow {
  section: string;
  status: 'draft' | 'published';
  data: unknown;
  updated_at: string;
  published_at: string | null;
}

export interface MediaRow {
  id: number;
  filename: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  alt_text: string;
  uploaded_at: string;
}

// node-postgres returns BIGINT/BIGSERIAL columns (telemetry.id and friends)
// as strings, to avoid silently losing precision above 2^53. This project's
// ids never approach that range, so every row-mapping helper below narrows
// them back to number at the boundary, once, rather than carrying `string |
// number` through the rest of the codebase.
function toRow<T extends { id: unknown }>(row: T): T & { id: number } {
  return { ...row, id: Number(row.id) };
}

export class Repository {
  readonly #pool: Db;
  readonly #schema: string;

  constructor(pool: Db, schema = 'public') {
    this.#pool = pool;
    this.#schema = schema;
  }

  /**
   * Checks out a connection, pins it to this repository's schema, runs one
   * query, and releases it. See the file header for why this — not
   * `this.#query()` — is how every non-transactional query in this
   * class must be issued.
   */
  async #query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    const client = await this.#pool.connect();
    try {
      await client.query(`SET search_path TO "${this.#schema}"`);
      return await client.query<T>(sql, params);
    } finally {
      client.release();
    }
  }

  /**
   * Runs `fn` on a single checked-out, schema-pinned connection wrapped in
   * BEGIN/COMMIT, so a multi-statement write is atomic. Every statement
   * inside `fn` must use the `client` it is given.
   */
  async #transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query(`SET search_path TO "${this.#schema}"`);
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      // If the original failure was the connection itself dying mid-write,
      // ROLLBACK on that same connection fails too — and un-guarded, that
      // second error would replace the first in what gets thrown, hiding
      // the actual cause and confusing callers that inspect the error (e.g.
      // insertQuoteRequest's isUniqueViolation retry check). Postgres never
      // commits a transaction whose connection dropped regardless of
      // whether our own ROLLBACK call round-trips, so swallowing a failed
      // rollback here loses nothing real.
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        log.error('db', `rollback failed after ${(error as Error).message}: ${(rollbackError as Error).message}`);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // devices
  // -------------------------------------------------------------------------

  async #upsertDevice(
    client: DbClient,
    deviceId: string,
    firmware: string | null,
    uptimeMs: number,
    simulated: boolean,
    now: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO devices (device_id, firmware, first_seen_at, last_seen_at,
                            last_uptime_ms, simulated)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (device_id) DO UPDATE SET
         firmware       = COALESCE(EXCLUDED.firmware, devices.firmware),
         last_seen_at   = EXCLUDED.last_seen_at,
         last_uptime_ms = EXCLUDED.last_uptime_ms,
         simulated      = EXCLUDED.simulated`,
      [deviceId, firmware, now, now, uptimeMs, simulated ? 1 : 0],
    );
  }

  async getDevice(deviceId: string): Promise<DeviceRow | undefined> {
    const result = await this.#query<DeviceRow>('SELECT * FROM devices WHERE device_id = $1', [deviceId]);
    return result.rows[0];
  }

  async listDevices(): Promise<DeviceRow[]> {
    const result = await this.#query<DeviceRow>('SELECT * FROM devices ORDER BY device_id');
    return result.rows;
  }

  // -------------------------------------------------------------------------
  // telemetry
  // -------------------------------------------------------------------------

  /** Persists one sample and repoints the device's current state at it. */
  async insertTelemetry(payload: TelemetryPayload, receivedAt: string): Promise<number> {
    return this.#transaction(async (client) => {
      await this.#upsertDevice(client, payload.deviceId, payload.firmware, payload.uptimeMs, payload.simulated, receivedAt);

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO telemetry (device_id, received_at, device_uptime_ms, device_time,
                                irrigation_state, active_zone, run_ms, pump_on,
                                controller_status, wifi_connected, rssi, simulated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
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
        ],
      );
      const telemetryId = Number(inserted.rows[0]!.id);

      for (const zone of payload.zones) {
        await client.query(
          `INSERT INTO telemetry_zone (telemetry_id, zone, sensor_1, sensor_2,
                                       sensor_1_valid, sensor_2_valid, average,
                                       valid_sensors, valve_open)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            telemetryId,
            zone.zone,
            zone.sensor1,
            zone.sensor2,
            zone.sensor1Valid ? 1 : 0,
            zone.sensor2Valid ? 1 : 0,
            zone.average,
            zone.validSensors,
            zone.valveOpen ? 1 : 0,
          ],
        );
      }

      await client.query(
        `INSERT INTO device_state (device_id, telemetry_id, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (device_id) DO UPDATE SET
           telemetry_id = EXCLUDED.telemetry_id,
           updated_at   = EXCLUDED.updated_at`,
        [payload.deviceId, telemetryId, receivedAt],
      );

      return telemetryId;
    });
  }

  /** Latest sample for a device, read from current state rather than history. */
  async getCurrentTelemetry(deviceId: string): Promise<TelemetryRow | undefined> {
    const result = await this.#query<TelemetryRow & { id: string }>(
      `SELECT t.* FROM device_state s
       JOIN telemetry t ON t.id = s.telemetry_id
       WHERE s.device_id = $1`,
      [deviceId],
    );
    return result.rows[0] === undefined ? undefined : toRow(result.rows[0]);
  }

  async getZonesFor(telemetryId: number): Promise<ZoneRow[]> {
    const result = await this.#query<ZoneRow>(
      'SELECT * FROM telemetry_zone WHERE telemetry_id = $1 ORDER BY zone',
      [telemetryId],
    );
    return result.rows;
  }

  async listTelemetry(deviceId: string, limit: number): Promise<TelemetryRow[]> {
    const result = await this.#query<TelemetryRow & { id: string }>(
      `SELECT * FROM telemetry WHERE device_id = $1
       ORDER BY received_at DESC, id DESC LIMIT $2`,
      [deviceId, limit],
    );
    return result.rows.map(toRow);
  }

  async countTelemetry(deviceId: string): Promise<number> {
    const result = await this.#query<{ n: string }>(
      'SELECT COUNT(*) AS n FROM telemetry WHERE device_id = $1',
      [deviceId],
    );
    return Number(result.rows[0]!.n);
  }

  /** Deletes telemetry older than the cutoff. Returns rows removed. */
  async pruneTelemetryBefore(cutoffIso: string): Promise<number> {
    // device_state references the newest row per device, so a device that has
    // gone quiet keeps its last known state instead of vanishing from the
    // dashboard entirely.
    const result = await this.#query(
      `DELETE FROM telemetry
       WHERE received_at < $1
         AND id NOT IN (SELECT telemetry_id FROM device_state)`,
      [cutoffIso],
    );
    return result.rowCount ?? 0;
  }

  // -------------------------------------------------------------------------
  // events
  // -------------------------------------------------------------------------

  async insertEvent(payload: EventPayload, receivedAt: string): Promise<number> {
    return this.#transaction(async (client) => {
      await this.#upsertDevice(client, payload.deviceId, null, payload.uptimeMs, false, receivedAt);
      const result = await client.query<{ id: string }>(
        `INSERT INTO irrigation_events (device_id, received_at, device_uptime_ms,
                                        type, zone, moisture, duration_ms, detail)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          payload.deviceId,
          receivedAt,
          payload.uptimeMs,
          payload.type,
          payload.zone,
          payload.moisture,
          payload.durationMs,
          payload.detail,
        ],
      );
      return Number(result.rows[0]!.id);
    });
  }

  async listEvents(deviceId: string, limit: number): Promise<EventRow[]> {
    const result = await this.#query<EventRow & { id: string }>(
      `SELECT * FROM irrigation_events WHERE device_id = $1
       ORDER BY received_at DESC, id DESC LIMIT $2`,
      [deviceId, limit],
    );
    return result.rows.map(toRow);
  }

  async listRecentEvents(limit: number): Promise<EventRow[]> {
    const result = await this.#query<EventRow & { id: string }>(
      'SELECT * FROM irrigation_events ORDER BY received_at DESC, id DESC LIMIT $1',
      [limit],
    );
    return result.rows.map(toRow);
  }

  // -------------------------------------------------------------------------
  // alerts
  // -------------------------------------------------------------------------

  /**
   * Raises an alert unless an unresolved one of the same type already exists
   * for the device. Returns the alert id, or null when it was suppressed as a
   * duplicate.
   */
  async raiseAlert(
    deviceId: string,
    type: AlertType,
    severity: AlertSeverity,
    message: string,
    now: string,
  ): Promise<number | null> {
    const existing = await this.#query<{ id: string }>(
      'SELECT id FROM alerts WHERE device_id = $1 AND type = $2 AND active = 1',
      [deviceId, type],
    );
    if (existing.rows[0] !== undefined) return null;

    const result = await this.#query<{ id: string }>(
      `INSERT INTO alerts (device_id, type, severity, message, raised_at, active)
       VALUES ($1, $2, $3, $4, $5, 1)
       RETURNING id`,
      [deviceId, type, severity, message, now],
    );
    return Number(result.rows[0]!.id);
  }

  /** Clears any active alert of this type. Returns how many were cleared. */
  async resolveAlerts(deviceId: string, type: AlertType, now: string): Promise<number> {
    const result = await this.#query(
      `UPDATE alerts SET active = 0, resolved_at = $1
       WHERE device_id = $2 AND type = $3 AND active = 1`,
      [now, deviceId, type],
    );
    return result.rowCount ?? 0;
  }

  async resolveAlertById(id: number, now: string): Promise<boolean> {
    const result = await this.#query(
      'UPDATE alerts SET active = 0, resolved_at = $1 WHERE id = $2 AND active = 1',
      [now, id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listAlerts(activeOnly: boolean, limit: number): Promise<AlertRow[]> {
    const sql = activeOnly
      ? 'SELECT * FROM alerts WHERE active = 1 ORDER BY raised_at DESC, id DESC LIMIT $1'
      : 'SELECT * FROM alerts ORDER BY raised_at DESC, id DESC LIMIT $1';
    const result = await this.#query<AlertRow & { id: string }>(sql, [limit]);
    return result.rows.map(toRow);
  }

  async listAlertsForDevice(deviceId: string, activeOnly: boolean, limit: number): Promise<AlertRow[]> {
    const sql = activeOnly
      ? `SELECT * FROM alerts WHERE device_id = $1 AND active = 1
         ORDER BY raised_at DESC, id DESC LIMIT $2`
      : `SELECT * FROM alerts WHERE device_id = $1
         ORDER BY raised_at DESC, id DESC LIMIT $2`;
    const result = await this.#query<AlertRow & { id: string }>(sql, [deviceId, limit]);
    return result.rows.map(toRow);
  }

  // -------------------------------------------------------------------------
  // zone configuration
  // -------------------------------------------------------------------------

  async getZoneConfig(deviceId: string): Promise<ZoneConfigRow[]> {
    const result = await this.#query<ZoneConfigRow>(
      'SELECT * FROM zone_config WHERE device_id = $1 ORDER BY zone',
      [deviceId],
    );
    return result.rows;
  }

  async setZoneConfig(deviceId: string, zones: ZoneConfigInput[], now: string): Promise<void> {
    await this.#transaction(async (client) => {
      for (const zone of zones) {
        await client.query(
          `INSERT INTO zone_config (device_id, zone, start_percent, stop_percent, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (device_id, zone) DO UPDATE SET
             start_percent = EXCLUDED.start_percent,
             stop_percent  = EXCLUDED.stop_percent,
             updated_at    = EXCLUDED.updated_at`,
          [deviceId, zone.zone, zone.startPercent, zone.stopPercent, now],
        );
      }
    });
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
  async insertQuoteRequest(
    input: QuoteRequestInput,
    now: string,
    makeReference: () => string,
    maxAttempts = 8,
  ): Promise<QuoteRequest> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const reference = makeReference();
      try {
        const id = await this.#transaction(async (client) => {
          const inserted = await client.query<{ id: string }>(
            `INSERT INTO quote_requests
               (reference, created_at, updated_at, status,
                farm_size, farm_location, irrigation_type, zone_count,
                full_name, phone, email, notes)
             VALUES ($1, $2, $3, 'NEW', $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
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
            ],
          );
          const requestId = Number(inserted.rows[0]!.id);
          for (const capability of input.capabilities) {
            await client.query(
              'INSERT INTO quote_request_capabilities (request_id, capability) VALUES ($1, $2)',
              [requestId, capability],
            );
          }
          return requestId;
        });

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
        // Only a reference collision is worth retrying; anything else is a
        // real failure and must surface.
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error(`could not allocate a unique request reference in ${maxAttempts} attempts`);
  }

  /**
   * Capabilities in the domain's declared order, not alphabetical, so a
   * request reads the same however it was fetched — and so the UI always lists
   * the capability that actually ships today first.
   */
  async getCapabilitiesFor(requestId: number): Promise<Capability[]> {
    const result = await this.#query<{ capability: Capability }>(
      'SELECT capability FROM quote_request_capabilities WHERE request_id = $1',
      [requestId],
    );
    const stored = new Set(result.rows.map((row) => row.capability));
    return CAPABILITIES.filter((capability) => stored.has(capability));
  }

  async getQuoteRequestByReference(reference: string): Promise<QuoteRequest | undefined> {
    const result = await this.#query<QuoteRequestRow & { id: string }>(
      'SELECT * FROM quote_requests WHERE reference = $1',
      [reference],
    );
    if (result.rows[0] === undefined) return undefined;
    const row = toRow(result.rows[0]);
    return { ...row, capabilities: await this.getCapabilitiesFor(row.id) };
  }

  async listQuoteRequests(limit: number, status?: RequestStatus): Promise<QuoteRequest[]> {
    const result =
      status === undefined
        ? await this.#query<QuoteRequestRow & { id: string }>(
            'SELECT * FROM quote_requests ORDER BY created_at DESC, id DESC LIMIT $1',
            [limit],
          )
        : await this.#query<QuoteRequestRow & { id: string }>(
            'SELECT * FROM quote_requests WHERE status = $1 ORDER BY created_at DESC, id DESC LIMIT $2',
            [status, limit],
          );

    const rows = result.rows.map(toRow);
    return Promise.all(
      rows.map(async (row) => ({ ...row, capabilities: await this.getCapabilitiesFor(row.id) })),
    );
  }

  async countQuoteRequestsByStatus(): Promise<Record<string, number>> {
    const result = await this.#query<{ status: string; n: string }>(
      'SELECT status, COUNT(*) AS n FROM quote_requests GROUP BY status',
    );
    const out: Record<string, number> = {};
    for (const row of result.rows) out[row.status] = Number(row.n);
    return out;
  }

  async updateQuoteRequestStatus(reference: string, status: RequestStatus, now: string): Promise<boolean> {
    const result = await this.#query(
      'UPDATE quote_requests SET status = $1, updated_at = $2 WHERE reference = $3',
      [status, now, reference],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // -------------------------------------------------------------------------
  // website content (CMS)
  // -------------------------------------------------------------------------

  async getWebsiteContent(section: SectionId, status: 'draft' | 'published'): Promise<WebsiteContentRow | undefined> {
    const result = await this.#query<WebsiteContentRow>(
      'SELECT * FROM website_content WHERE section = $1 AND status = $2',
      [section, status],
    );
    return result.rows[0];
  }

  /** All sections at once, for a given status — the shape the public and
   *  admin content endpoints both serve from. */
  async listWebsiteContent(status: 'draft' | 'published'): Promise<WebsiteContentRow[]> {
    const result = await this.#query<WebsiteContentRow>(
      'SELECT * FROM website_content WHERE status = $1',
      [status],
    );
    return result.rows;
  }

  /** Writes (or overwrites) one section's draft. Never touches 'published'. */
  async saveWebsiteContentDraft(section: SectionId, data: unknown, now: string): Promise<void> {
    await this.#query(
      `INSERT INTO website_content (section, status, data, updated_at)
       VALUES ($1, 'draft', $2, $3)
       ON CONFLICT (section, status) DO UPDATE SET
         data       = EXCLUDED.data,
         updated_at = EXCLUDED.updated_at`,
      [section, JSON.stringify(data), now],
    );
  }

  /**
   * Copies a section's current draft into its published row. Returns false
   * if the section has no draft yet (nothing to publish) rather than
   * inventing an empty one.
   */
  async publishWebsiteContent(section: SectionId, now: string): Promise<boolean> {
    return this.#transaction(async (client) => {
      const draft = await client.query<{ data: unknown }>(
        'SELECT data FROM website_content WHERE section = $1 AND status = $2',
        [section, 'draft'],
      );
      if (draft.rows[0] === undefined) return false;

      await client.query(
        `INSERT INTO website_content (section, status, data, updated_at, published_at)
         VALUES ($1, 'published', $2, $3, $3)
         ON CONFLICT (section, status) DO UPDATE SET
           data         = EXCLUDED.data,
           updated_at   = EXCLUDED.updated_at,
           published_at = EXCLUDED.published_at`,
        [section, draft.rows[0].data, now],
      );
      return true;
    });
  }

  /**
   * Seeds a section with the real current website copy if — and only if — it
   * has never been touched: both draft and published are written, but each
   * independently, with ON CONFLICT DO NOTHING, so this is safe to call on
   * every boot without ever overwriting a real edit an admin already made.
   * See domain/website-content-seed.ts for what gets written.
   */
  async seedWebsiteContentIfMissing(section: SectionId, data: unknown, now: string): Promise<void> {
    const json = JSON.stringify(data);
    await this.#transaction(async (client) => {
      await client.query(
        `INSERT INTO website_content (section, status, data, updated_at)
         VALUES ($1, 'draft', $2, $3)
         ON CONFLICT (section, status) DO NOTHING`,
        [section, json, now],
      );
      await client.query(
        `INSERT INTO website_content (section, status, data, updated_at, published_at)
         VALUES ($1, 'published', $2, $3, $3)
         ON CONFLICT (section, status) DO NOTHING`,
        [section, json, now],
      );
    });
  }

  // -------------------------------------------------------------------------
  // website media
  // -------------------------------------------------------------------------

  async insertMedia(input: {
    filename: string;
    originalName: string;
    contentType: string;
    sizeBytes: number;
    altText: string;
  }, now: string): Promise<MediaRow> {
    const result = await this.#query<MediaRow & { id: string }>(
      `INSERT INTO website_media (filename, original_name, content_type, size_bytes, alt_text, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.filename, input.originalName, input.contentType, input.sizeBytes, input.altText, now],
    );
    return toRow(result.rows[0]!);
  }

  async listMedia(): Promise<MediaRow[]> {
    const result = await this.#query<MediaRow & { id: string }>(
      'SELECT * FROM website_media ORDER BY uploaded_at DESC, id DESC',
    );
    return result.rows.map(toRow);
  }

  async getMedia(id: number): Promise<MediaRow | undefined> {
    const result = await this.#query<MediaRow & { id: string }>('SELECT * FROM website_media WHERE id = $1', [id]);
    return result.rows[0] === undefined ? undefined : toRow(result.rows[0]);
  }

  async deleteMedia(id: number): Promise<boolean> {
    const result = await this.#query('DELETE FROM website_media WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * True if `url` appears anywhere in any section's content — draft or
   * published — so deleting the underlying file cannot silently break a live
   * or in-progress page. A plain substring search over the JSON text: cheap,
   * correct for this table's size, and does not need to know which fields in
   * which sections happen to hold image references.
   */
  async isMediaReferenced(url: string): Promise<boolean> {
    const result = await this.#query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM website_content WHERE data::text LIKE '%' || $1 || '%'`,
      [url],
    );
    return Number(result.rows[0]!.n) > 0;
  }
}
