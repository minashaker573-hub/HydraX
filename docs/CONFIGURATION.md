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
| `native` | Host build of `src/core` for the test suite |

---

## Backend

All environment variables. `src/config.ts` is the only module that reads
`process.env`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HYDRAX_DEVICE_KEY` | *(none)* | Shared secret for ingestion. **Required.** |
| `HYDRAX_ALLOW_INSECURE` | `false` | Set `true` to run without a device key. Local development only. |
| `HYDRAX_HOST` | `0.0.0.0` | Bind address |
| `HYDRAX_PORT` | `8080` | Port |
| `HYDRAX_DB_PATH` | `backend/data/hydrax.db` | SQLite file |
| `HYDRAX_DASHBOARD_DIR` | `dashboard/` | Static files served |
| `HYDRAX_OFFLINE_TIMEOUT_MS` | `60000` | Silence before a device is offline |
| `HYDRAX_OFFLINE_SWEEP_MS` | `15000` | Offline check interval |
| `HYDRAX_RETENTION_DAYS` | `30` | Telemetry retention; `0` disables pruning |
| `HYDRAX_LOG_LEVEL` | `INFO` | `ERROR`, `WARN`, `INFO`, `DEBUG` |

### The device key is mandatory by design

The server **refuses to start** without `HYDRAX_DEVICE_KEY`:

```
[ERROR][config] HYDRAX_DEVICE_KEY is not set. Set it to a shared secret that
matches the firmware, or set HYDRAX_ALLOW_INSECURE=true to accept
unauthenticated telemetry (local development only).
```

There is no default secret to forget to change, and disabling authentication
requires saying so explicitly. When insecure mode is on, the server logs a
warning on every start.

### Example `.env`

Not read automatically — export these, or use your process manager. **Do not
commit it**; `.env` is git-ignored.

```bash
HYDRAX_DEVICE_KEY=a-long-random-string
HYDRAX_PORT=8080
HYDRAX_RETENTION_DAYS=30
```

---

## Zone thresholds via the API

```bash
curl -X PUT http://localhost:8080/api/v1/devices/HYDRAX-001/config \
  -H 'Content-Type: application/json' \
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
