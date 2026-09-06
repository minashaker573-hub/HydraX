-- HYDRAX / SmartFarm Guardian - Phase 1 schema (PostgreSQL / Supabase).
--
-- Four concepts, as scoped: Device, Telemetry, IrrigationEvent, Alert.
--
-- Historical telemetry is kept separate from current device state:
-- `telemetry` (+ `telemetry_zone`) is an append-only history, while
-- `device_state` is a single row per device pointing at its latest sample, so
-- the dashboard never scans history to answer "what is happening now".
--
-- All timestamps are ISO-8601 UTC strings assigned by the SERVER on receipt.
-- The device contributes `device_uptime_ms` (monotonic since boot) and, when
-- NTP has actually synced, `device_time`. The server clock is the timeline;
-- see docs/TELEMETRY.md.
--
-- Booleans are stored as INTEGER (0/1), not native BOOLEAN, deliberately: the
-- application code above this schema was written for SQLite's integer
-- semantics, and keeping the same encoding here made the SQLite -> Postgres
-- migration a schema/driver change, not a rewrite of every comparison in
-- routes/*.ts and repository.ts. See docs/CONFIGURATION.md.
--
-- Every statement is idempotent (IF NOT EXISTS / ON CONFLICT), applied on
-- every server boot rather than through a separate migration step — the same
-- design the SQLite version used.

CREATE TABLE IF NOT EXISTS devices (
    device_id      TEXT PRIMARY KEY,
    firmware       TEXT,
    first_seen_at  TEXT NOT NULL,
    last_seen_at   TEXT NOT NULL,
    last_uptime_ms INTEGER,
    simulated      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS telemetry (
    id                BIGSERIAL PRIMARY KEY,
    device_id         TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    received_at       TEXT NOT NULL,
    device_uptime_ms  INTEGER NOT NULL,
    device_time       TEXT,
    irrigation_state  TEXT NOT NULL,
    active_zone       INTEGER,
    run_ms            INTEGER NOT NULL DEFAULT 0,
    pump_on           INTEGER NOT NULL,
    controller_status TEXT NOT NULL,
    wifi_connected    INTEGER NOT NULL,
    rssi              INTEGER,
    simulated         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_telemetry_device_time
    ON telemetry (device_id, received_at DESC);

CREATE TABLE IF NOT EXISTS telemetry_zone (
    telemetry_id   BIGINT NOT NULL REFERENCES telemetry(id) ON DELETE CASCADE,
    zone           INTEGER NOT NULL,
    sensor_1       REAL,
    sensor_2       REAL,
    sensor_1_valid INTEGER NOT NULL DEFAULT 0,
    sensor_2_valid INTEGER NOT NULL DEFAULT 0,
    average        REAL,
    valid_sensors  INTEGER NOT NULL DEFAULT 0,
    valve_open     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (telemetry_id, zone)
);

-- Current state: one row per device, pointing at its most recent sample.
CREATE TABLE IF NOT EXISTS device_state (
    device_id    TEXT PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE,
    telemetry_id BIGINT NOT NULL REFERENCES telemetry(id) ON DELETE CASCADE,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS irrigation_events (
    id               BIGSERIAL PRIMARY KEY,
    device_id        TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    received_at      TEXT NOT NULL,
    device_uptime_ms INTEGER NOT NULL,
    type             TEXT NOT NULL,
    zone             INTEGER,
    moisture         REAL,
    duration_ms      INTEGER,
    detail           TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_device_time
    ON irrigation_events (device_id, received_at DESC);

CREATE TABLE IF NOT EXISTS alerts (
    id          BIGSERIAL PRIMARY KEY,
    device_id   TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    severity    TEXT NOT NULL,
    message     TEXT NOT NULL,
    raised_at   TEXT NOT NULL,
    resolved_at TEXT,
    active      INTEGER NOT NULL DEFAULT 1
);

-- At most one active alert per (device, type): a flapping sensor must not
-- produce thousands of duplicate rows. Postgres supports partial unique
-- indexes with the identical syntax SQLite used here.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_active_unique
    ON alerts (device_id, type) WHERE active = 1;

-- Zone thresholds held server-side.
-- PHASE 1 SCOPE: these are stored and served, but the firmware still runs on
-- its compiled-in defaults. Device-side config pull is deliberately deferred
-- so that irrigation never depends on a reachable backend.
CREATE TABLE IF NOT EXISTS zone_config (
    device_id     TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    zone          INTEGER NOT NULL,
    start_percent REAL NOT NULL,
    stop_percent  REAL NOT NULL,
    updated_at    TEXT NOT NULL,
    PRIMARY KEY (device_id, zone)
);

-- ---------------------------------------------------------------------------
-- Customer quote requests
-- ---------------------------------------------------------------------------
-- Submitted from the public website. This is the only table fed by an
-- unauthenticated endpoint, and the only one holding personal data, so it is
-- read back exclusively through operator-authenticated routes.
--
-- `reference` is the customer-facing identifier (HYX-XXXXXX). It is UNIQUE and
-- generated with a collision retry, so it can be quoted over the phone.
CREATE TABLE IF NOT EXISTS quote_requests (
    id              BIGSERIAL PRIMARY KEY,
    reference       TEXT NOT NULL UNIQUE,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'NEW',

    -- farm
    farm_size       TEXT NOT NULL,
    farm_location   TEXT NOT NULL,
    irrigation_type TEXT NOT NULL,
    zone_count      INTEGER NOT NULL,

    -- customer
    full_name       TEXT NOT NULL,
    phone           TEXT NOT NULL,
    email           TEXT,
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_requests_created
    ON quote_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_status
    ON quote_requests (status, created_at DESC);

-- Requested capabilities, normalized rather than stored as a blob so they can
-- be counted and filtered. A row here means the customer expressed interest —
-- not that the capability ships today.
CREATE TABLE IF NOT EXISTS quote_request_capabilities (
    request_id BIGINT NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
    capability TEXT NOT NULL,
    PRIMARY KEY (request_id, capability)
);

-- ---------------------------------------------------------------------------
-- Public website content management (CMS)
-- ---------------------------------------------------------------------------
-- One row per (section, status): exactly two rows per section, 'draft' and
-- 'published', never more — this is the entire versioning model. Editing a
-- section writes its 'draft' row; publishing copies that row's `data` into
-- the 'published' row. The public site only ever reads 'published' rows; the
-- admin console reads both, so it can show "draft differs from published".
--
-- `data` is JSONB, but that does not mean arbitrary shape is accepted: every
-- write goes through a fixed per-section validator in
-- backend/src/domain/website-content.ts before it reaches this table. The
-- column is JSONB rather than one column per field because the *shape* is
-- owned by that TypeScript module, not by a migration — adding a field to a
-- section's content is a code change to the validator, not a schema change
-- here.
CREATE TABLE IF NOT EXISTS website_content (
    section      TEXT NOT NULL,
    status       TEXT NOT NULL CHECK (status IN ('draft', 'published')),
    data         JSONB NOT NULL,
    updated_at   TEXT NOT NULL,
    published_at TEXT,
    PRIMARY KEY (section, status)
);

-- Uploaded website images. The file itself lives on disk under
-- website/assets/uploads/ (served by the same static file route that already
-- serves the rest of website/assets/ — no new serving code needed); this row
-- is only the metadata the admin media library and the reference-before-
-- delete check (routes/media.ts) need.
CREATE TABLE IF NOT EXISTS website_media (
    id            BIGSERIAL PRIMARY KEY,
    filename      TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    content_type  TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    alt_text      TEXT NOT NULL DEFAULT '',
    uploaded_at   TEXT NOT NULL
);
