# HYDRAX — Testing

Two suites, both runnable with no hardware attached.

| Suite | Covers | Command |
| --- | --- | --- |
| Firmware core | Sensors, calibration, hysteresis, state machine, safety, Wi-Fi policy, telemetry serialization | `./hydrax_tests` |
| Backend | Validation, HTTP API, persistence, alert rules, routing | `npm test` |
| Dashboard | Module parsing, import resolution, entry points, innerHTML ban | `npm run check:dashboard` |

---

## Firmware core tests

50 tests / 1082 assertions. No framework and no PlatformIO required — the suite
is a single self-contained program.

```bash
cd firmware
g++ -std=c++17 -Wall -Wextra -I src -o hydrax_tests test/test_core/main.cpp src/core/*.cpp
./hydrax_tests
```

Under PlatformIO instead:

```bash
pio test -e native
```

This reports each test individually (50 test cases) via the custom runner in
`firmware/test/test_custom_runner.py`. It needs a host compiler on `PATH`;
the plain `g++` invocation above needs nothing else.

To see the controller's own log output while tests run:

```bash
HYDRAX_TEST_VERBOSE=1 ./hydrax_tests
```

### What makes this possible

`src/core/` contains no Arduino headers. Hardware sits behind `IAnalogSource`,
`IDigitalActuator`, `IWifiRadio` and `IClock`, and the tests inject simulated
implementations. Because the clock is injected, a **ten-minute irrigation
timeout is verified in microseconds of wall time**.

### Coverage

**Sensor layer** — calibration endpoints and clamping; valid readings;
out-of-range low and high; driver errors; fault latching after N failures;
recovery requiring N consecutive good readings; unusable calibration rejected;
median filter rejecting a single-sample spike; EMA smoothing a step change.

**Zone aggregation** — mean of two valid probes; an invalid probe excluded
rather than averaged in as zero; zero-valid-probe zones.

**Actuator safety** — every output off at startup; pump refuses to start with
all valves closed (deadhead guard); only one valve open at a time; closing the
active valve cuts the pump first; `stopAllIrrigation` clears everything.

**Irrigation decisions** — dry soil starts; wet soil does not; soil *between*
the thresholds does not start; a run continues through the band rather than
stopping at the start threshold; stops at the stop threshold; minimum runtime
prevents an instant stop; cooldown blocks an immediate restart; maximum runtime
triggers `TIMEOUT` and cuts the pump; a timeout locks the zone out.

**Zone independence** — zone 2 operates on its own; the driest zone is served
first; across a 400-tick sweep the two valves are never open simultaneously and
the pump never runs with zero valves open.

**Failure handling** — all probes invalid enters `SENSOR_ERROR` and stops the
pump; recovery returns to `IDLE`; one zone losing both probes stops that run
without latching the whole controller; a zone runs degraded on one probe;
a degraded zone cannot start a new run; valve failure latches `ACTUATOR_ERROR`
and forces a safe state; the latch survives conditions returning to normal and
needs an explicit clear; `requestSafeShutdown` cuts everything.

**Connectivity** — irrigation completes a full cycle with no network object
present at all; Wi-Fi connects; a disconnect is detected and retried;
backoff grows on repeated association failure and is capped.

**Offline buffering** — outbox FIFO order; oldest dropped when full; retry
policy retries transport failures/5xx/408/429 and discards 4xx so a poison
payload cannot block the queue head.

**Telemetry** — idle and active-irrigation payloads contain the expected
fields; invalid sensors are marked; an undersized buffer returns `-1` and
leaves an empty string rather than a half-written payload.

---

## Backend tests

65 tests. Runs a real HTTP server on a real socket with an in-memory database.

```bash
cd backend
npm install
npm test
npm run typecheck
npm run check:dashboard
```

### Coverage

**Validation** — non-object bodies; missing/malformed device ids; unknown
irrigation states and controller statuses; out-of-range moisture; non-integer
uptime; **a pump reported running with every valve closed**; two valves open at
once; an active zone absent from `soil`; missing valve entries; malformed zone
keys; all errors collected rather than only the first; sensor validity
attributed to the correct zone slot; timestamp normalization; control
characters stripped from free text; over-long detail rejected; inverted,
too-narrow and duplicate zone configurations.

**API** — health; auth accepted, rejected, missing, and wrong-length keys;
explicit insecure mode; persistence and device registration; 400 with a reason
list; non-JSON and empty bodies; **413 on an oversized body**; history retained
while current state tracks the newest sample; simulated flag preserved; event
ingestion; 404s for unknown devices; device listing; offline transition via an
injected clock; zone config round-trip flagged `applied_by_device: false`; 405
vs 404 routing; dashboard served for non-API paths; **path traversal rejected**;
the aggregate dashboard payload.

**Alerts** — raised on `SENSOR_ERROR`; not duplicated while already open;
auto-resolved when the condition clears; `SENSOR_RECOVERED` clears;
`ACTUATOR_ERROR`/`FAULT_CLEARED` pair; `IRRIGATION_TIMEOUT` raised and cleared
by a normal stop; `DEVICE_OFFLINE` raised only after the window, not re-raised
on every sweep, cleared when the device reports again, and worded so it does not
imply irrigation stopped; manual resolution by id; per-device isolation;
different alert types coexisting.

---

## Manual end-to-end check

With no hardware:

```bash
# terminal 1
cd backend && HYDRAX_DEVICE_KEY=demo npm start

# terminal 2
cd backend && npm run mock-device -- --key demo --interval 1000
```

Open <http://localhost:8080>. Over one ~2.5 minute scripted cycle you should
see a normal irrigation run on zone 1, a probe fault and recovery on zone 2, and
a runtime timeout — with the corresponding alerts appearing and clearing on
their own.

The mock device is a **fixture, not a second controller**: it replays a fixed
script and contains no thresholds, hysteresis or irrigation decisions. The real
logic exists once, in the firmware, and is covered by the firmware suite.

---

## Known gaps

Verified honestly — these are **not** covered by automated tests:

1. **On-target firmware execution.** The ESP32-specific files
   (`hal/esp32_*`, `net/telemetry_client.cpp`, `main.cpp`) now **compile** —
   `pio run -e esp32dev` passes, see docs/HARDWARE_BRINGUP.md. They have never
   been **run**: that needs a board.
2. **Real ADC behaviour.** Probe noise, temperature drift and supply ripple can
   only be characterized against physical sensors.
3. **Real HTTP uplink.** `TelemetryClient`'s FreeRTOS task and `HTTPClient`
   usage are untested; the *policies* it depends on (outbox semantics, retry
   classification, Wi-Fi backoff) are tested as pure logic.
4. **Actual hydraulics.** Valve travel time, pump priming and pressure
   behaviour need a bench rig. `kValveSettleMs` and `kPumpSpindownMs` are
   starting values.
5. **Dashboard read endpoints are unauthenticated.** Phase 1 assumes a trusted
   LAN. Do not expose the backend to the Internet as-is.
6. **Dashboard verified against the mock device only.** Its checks cover parsing,
   imports and safe rendering, not visual regression, and no real sensor data
   has ever flowed through the UI.
7. **No concurrency/load testing.** SQLite in WAL mode with a handful of devices
   is comfortable, but this has not been measured.
8. **Backend runs over plain HTTP.** TLS termination is left to a reverse proxy.

---

## Adding tests

**Firmware** — add a function in `firmware/test/test_core/main.cpp` and register
it with `runTest(...)` in `main()`. Use the `Rig` fixture for controller
scenarios; `rig.setZonePercent(zone, percent)` and `rig.run(ms)` drive it.

**Backend** — add a `*.test.ts` file under `backend/test/`. `startHarness()`
gives a live server plus an injectable clock; `telemetryPayload()` and
`eventPayload()` build valid payloads you can then break in one specific way.
