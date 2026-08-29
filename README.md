# HYDRAX — SmartFarm Guardian

Phase 1: **Core Smart Irrigation**.

An ESP32 measures soil moisture across two irrigation zones, decides locally
whether to water, drives a pump and the correct zone valve, and reports what it
did to a backend and dashboard.

> **The controller is autonomous.** Irrigation and safety run entirely on the
> ESP32. The backend and dashboard are for monitoring, logging and history. If
> Wi-Fi, the network or the server disappears, the farm keeps being watered
> correctly — only visibility is lost.

---

## What Phase 1 does

```
soil moisture sensors (4)
        │
        ▼
      ESP32 ──────── local irrigation decision (hysteresis + state machine)
        │                     │
        │                     ▼
        │            pump + zone valve
        ▼
    telemetry ──► backend (SQLite) ──► dashboard
```

- 4 capacitive soil probes, 2 per zone
- 2 zones, 2 solenoid valves, 1 × 12 V pump
- Hysteresis-based irrigation with minimum/maximum runtime and per-zone cooldown
- Explicit state machine, fail-safe on sensor, actuator and timeout faults
- Telemetry buffered while offline and flushed on reconnect
- Backend ingestion, persistence, alerting, and a seven-section monitoring dashboard
  (Overview, Smart Irrigation, Pump Health, Water Network, Safety Center,
  Alerts & Events, Device)

Explicitly **not** in this phase: predictive maintenance, failure prediction,
leak localization, mobile app, multi-farm SaaS. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#what-phase-1-deliberately-excludes).

---

## Repository layout

```
firmware/          ESP32 firmware (C++17, PlatformIO / Arduino)
  src/config/      centralized pins, calibration, thresholds, timings
  src/core/        pure logic — no Arduino headers, host-testable
  src/hal/         hardware interfaces + ESP32 and simulated implementations
  src/net/         Wi-Fi uplink (background task, never blocks control)
  test/test_core/  self-contained host test suite
backend/           Node 24 + TypeScript, zero runtime dependencies
  src/             HTTP API, SQLite persistence, validation, alert rules
  test/            HTTP and domain tests
  tools/           mock device fixture
dashboard/         static HTML/CSS/JS monitoring UI (no build step, ES modules)
docs/              architecture, state machine, telemetry, hardware, testing
```

---

## Quick start

### 1. Backend + dashboard

Requires **Node 24+** (uses built-in TypeScript execution and `node:sqlite`).

```bash
cd backend
npm install
```

Set a shared secret that the firmware will also use, then start the server:

```bash
HYDRAX_DEVICE_KEY=choose-a-secret npm start
```

Open <http://localhost:8080>. On Windows PowerShell:

```powershell
$env:HYDRAX_DEVICE_KEY = "choose-a-secret"; npm start
```

> The server refuses to start without `HYDRAX_DEVICE_KEY`. For local
> experimentation only, set `HYDRAX_ALLOW_INSECURE=true` instead to accept
> unauthenticated telemetry.

### 2. See it working without hardware

In a second terminal:

```bash
cd backend
npm run mock-device -- --key choose-a-secret
```

This is a **fixture**, not a second controller: it replays a scripted scenario
(normal cycle → probe fault → recovery → runtime timeout) so the ingestion
path, alert rules and dashboard can be exercised with no board attached. Every
value it sends is tagged `simulated: true`, and the dashboard labels it as
simulated.

### 3. Firmware

```bash
cd firmware
cp src/config/secrets.example.h src/config/secrets.h   # then edit it
pio run -e esp32dev -t upload
pio device monitor
```

`secrets.h` is git-ignored. To run the real control logic on a board with no
probes wired, flash the simulation environment instead:

```bash
pio run -e esp32dev_sim -t upload
```

---

## Tests

```bash
# firmware core logic (no hardware, no PlatformIO needed)
cd firmware
g++ -std=c++17 -I src -o hydrax_tests test/test_core/main.cpp src/core/*.cpp
./hydrax_tests

# or under PlatformIO
pio test -e native

# backend + dashboard
cd backend
npm test
npm run typecheck
npm run check:dashboard
```

Full details, including what is and is not covered, in
[docs/TESTING.md](docs/TESTING.md).

---

## Documentation

| Document | Contents |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, data flow, design decisions, offline behaviour |
| [DASHBOARD.md](docs/DASHBOARD.md) | Dashboard sections, API/data mapping, demo mode, error states |
| [STATE_MACHINE.md](docs/STATE_MACHINE.md) | Irrigation states and the full transition table |
| [TELEMETRY.md](docs/TELEMETRY.md) | Payload schema, API endpoints, time handling |
| [CONFIGURATION.md](docs/CONFIGURATION.md) | Every tunable, firmware and backend |
| [HARDWARE.md](docs/HARDWARE.md) | Pin map, wiring notes, sensor calibration procedure |
| [TESTING.md](docs/TESTING.md) | How to run and extend the test suites |

---

## Safety notes

This system switches a 12 V pump and mains-adjacent supplies. Before connecting
real hardware, read
[docs/HARDWARE.md](docs/HARDWARE.md#safety-before-you-connect-anything). The
firmware fails safe — pump off, valves closed — on startup, on sensor loss, on
actuator faults and on runtime overrun, but firmware cannot compensate for
missing flyback diodes, an undersized supply, or a pump that can run dry.
