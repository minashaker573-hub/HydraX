# HYDRAX — Configuration

Every tunable lives in exactly one place per component. Nothing is scattered
across the codebase, and no control logic hard-codes a pin, threshold or delay.

---

## Firmware

### `firmware/src/config/hydrax_config.h`

The single source of truth for the device. Non-secret only — it is committed.

| Group | Constants |
| --- | --- |
| Identity | `kDeviceId`, `kFirmwareVersion` |
| Topology | `kZoneCount`, `kSensorsPerZone`, `kSensorCount` |
| Pins | `kSensorAdcPin[]`, `kPumpPin`, `kZoneValvePin[]` |
| Driver polarity | `kPumpActiveLow`, `kValveActiveLow` |
| Acquisition | `kAdcResolutionBits`, `kSamplesPerReading`, `kSampleSpacingMs`, `kMoistureEmaAlpha` |
| Validity | `kRawValidMin`, `kRawValidMax`, `kSensorFaultThreshold`, `kSensorRecoveryThreshold` |
| Calibration | `kSensorCalibration[]`, `kMinCalibrationSpan` |
| Thresholds | `kZoneThresholds[]`, `kMinHysteresisBand` |
| Timing/safety | `kMinIrrigationMs`, `kMaxIrrigationMs`, `kZoneCooldownMs`, `kTimeoutLockoutMs`, `kValveSettleMs`, `kPumpSpindownMs` |
| Cadence | `kSensorIntervalMs`, `kControlIntervalMs` |
| Network | `kTelemetryIntervalMs`, `kWifiRetryBaseMs`, `kWifiRetryMaxMs`, `kHttpTimeoutMs`, `kTelemetryQueueCapacity` |

`kDeviceId` can also be set at build time:

```ini
build_flags = -D HYDRAX_DEVICE_ID=\"HYDRAX-NORTH-FIELD\"
```

### `firmware/src/config/secrets.h` — **never committed**

```bash
cp firmware/src/config/secrets.example.h firmware/src/config/secrets.h
```

| Constant | Meaning |
| --- | --- |
| `kWifiSsid` / `kWifiPassword` | Wi-Fi credentials |
| `kBackendBaseUrl` | e.g. `http://192.168.1.50:8080`, no trailing slash |
| `kDeviceKey` | Must match the backend's `HYDRAX_DEVICE_KEY` |

The file is git-ignored, and the build fails with a clear message if it is
missing rather than compiling with placeholder credentials.

### Build environments

| Environment | Purpose |
| --- | --- |
| `esp32dev` | Normal device build |
| `esp32dev_sim` | Same logic, simulated sensors (`-D HYDRAX_SIMULATE`) |
| `esp32dev_bench` | Real logic, compressed safety timings (`-D HYDRAX_BENCH_TIMING`). **Never deploy.** |
| `esp32dev_commission` | Interactive serial console for hardware bring-up |
| `native` | Host build of `src/core` for the test suite |

---

## Backend

All environment variables. `src/config.ts` is the only module that reads
`process.env`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HYDRAX_DEVICE_KEY` | *(none)* | Shared secret controllers present in `X-Device-Key`. **Required.** |
| `HYDRAX_ADMIN_KEY` | *(none)* | Operator secret for `X-Admin-Key`: threshold changes, alert resolution, quote requests. **Required, and must differ from the device key.** |
| `HYDRAX_ALLOW_INSECURE` | `false` | Set `true` to run without a device key. Local development only. |
| `HYDRAX_HOST` | `0.0.0.0` | Bind address |
| `HYDRAX_PORT` | `8080` | Port |
| `HYDRAX_DB_PATH` | `backend/data/hydrax.db` | SQLite file |
| `HYDRAX_DASHBOARD_DIR` | `dashboard/` | Dashboard, mounted at `/dashboard` |
| `HYDRAX_WEBSITE_DIR` | `website/` | Public website, mounted at `/` |
| `HYDRAX_ADMIN_DIR` | `admin/` | Operator console, mounted at `/admin` |
| `HYDRAX_REQUEST_RATE_MAX` | `10` | Public quote submissions allowed per source per window |
| `HYDRAX_REQUEST_RATE_WINDOW_MS` | `3600000` | Rate limit window for quote submissions |
| `HYDRAX_OFFLINE_TIMEOUT_MS` | `60000` | Silence before a device is offline |
| `HYDRAX_OFFLINE_SWEEP_MS` | `15000` | Offline check interval |
| `HYDRAX_RETENTION_DAYS` | `30` | Telemetry retention; `0` disables pruning |
| `HYDRAX_LOG_LEVEL` | `INFO` | `ERROR`, `WARN`, `INFO`, `DEBUG` |

### Two keys, two roles

The **device key** is flashed into firmware on every controller in the field. The
**operator key** is not. Keeping them separate means rotating the operator
credential does not require reflashing hardware, and extracting a key from one
board does not grant the ability to rewrite thresholds for the whole farm. The
server refuses to start if they are set to the same value.

| Role | Header | Guards |
| --- | --- | --- |
| Device | `X-Device-Key` | `POST /api/v1/telemetry`, `POST /api/v1/events` |
| Operator | `X-Admin-Key` | `PUT /api/v1/devices/:id/config`, `POST /api/v1/alerts/:id/resolve`, all `/api/v1/requests` reads and updates |

Neither affects the control path: the firmware never calls an operator endpoint,
and irrigation continues whether or not any of these checks pass.

### Secrets are mandatory by design

The server **refuses to start** without both keys, and refuses to start if they
are identical:

```
[ERROR][config] HYDRAX_DEVICE_KEY is not set. Set it to a shared secret that
matches the firmware, or set HYDRAX_ALLOW_INSECURE=true to accept
unauthenticated telemetry (local development only).
```

There is no default secret to forget to change, and disabling authentication
requires saying so explicitly — `HYDRAX_ALLOW_INSECURE` must be exactly the
string `true`, so a stray `1` or `yes` does not silently open the server. When
insecure mode is on, the server logs a warning on every start.

These rules are covered by `backend/test/config.test.ts`.

### Example `.env`

A template is committed at `backend/.env.example`; copy it to `backend/.env` and
fill it in. It is not read automatically — export the values, or point your
process manager at the file. **Do not commit `.env`**; it is git-ignored.

```bash
HYDRAX_DEVICE_KEY=a-long-random-string
HYDRAX_ADMIN_KEY=a-different-long-random-string
HYDRAX_PORT=8080
HYDRAX_RETENTION_DAYS=30
```

---

## Zone thresholds via the API

```bash
curl -X PUT http://localhost:8080/api/v1/devices/HYDRAX-001/config \
  -H 'Content-Type: application/json' \
  -H "X-Admin-Key: $HYDRAX_ADMIN_KEY" \
  -d '{"zones":[{"zone":1,"start_percent":30,"stop_percent":55},
                {"zone":2,"start_percent":35,"stop_percent":60}]}'
```

> **Phase 1 scope.** These values are stored, served and shown on the dashboard
> gauge, but the firmware still runs on its compiled-in thresholds. Every
> response says `"applied_by_device": false`.
>
> This is deliberate. Having the controller fetch its thresholds would put the
> backend in the path of a safety-relevant decision, which contradicts the
> local-first requirement. Phase 2 can add a device-side config pull with local
> caching and validation, so a missing or malformed response still cannot stop
> the farm being watered.

The backend applies the same minimum 5-point hysteresis band as the firmware, so
a configuration that would short-cycle the pump is rejected with 400 at both
layers.

---

## Secrets checklist

- `firmware/src/config/secrets.h` — git-ignored
- `.env` / `.env.*` — git-ignored (`.env.example` allowed)
- `backend/data/` and `*.db` — git-ignored
- No credential appears in any committed file; `secrets.example.h` contains
  placeholders only.
