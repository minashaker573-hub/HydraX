# HYDRAX — Hardware Validation & Fault-Injection Test Plan

> **Read this before anything else.** As of this writing, **no physical
> ESP32, sensor, valve or pump for this project has been connected to
> anything.** Every row in this document that requires a physical board is
> marked **NOT TESTED**. This is not a gap in how the document was written —
> it is the actual, current state of the project, consistent with
> [HARDWARE_BRINGUP.md](HARDWARE_BRINGUP.md) and every prior testing
> document in this repo.
>
> This document is therefore two things at once:
> 1. A **verification report** for everything that genuinely can be checked
>    today without a board — the firmware logic, the build, the backend/API
>    contract.
> 2. A **procedure and template** for someone with the physical hardware to
>    execute later and fill in real PASS/FAIL results, with real evidence.
>
> Nowhere in this document is a physical test result invented. Where no
> physical test has occurred, the status says so plainly.

---

## 1. Purpose

To separate, with no ambiguity, three different claims that are easy to
blur together in a competition setting:

1. **Implemented in firmware** — the logic exists in `firmware/src/core/`
   and compiles.
2. **Verified in simulation** — that logic has been exercised by the host
   test suite or an on-device simulation build (`esp32dev_sim`), with
   synthetic sensors and no real hardware.
3. **Physically verified** — the behavior has been observed on a real
   ESP32 driving real sensors, a real pump and real valves.

A feature satisfying (1) is not evidence of (3). This document exists so
that no claim about HYDRAX's hardware behavior gets made at a higher
confidence level than the evidence actually supports.

---

## 2. Current Hardware

**No hardware has been purchased, assembled, wired or bench-tested.**
Everything below is the *design* — the bill of materials and pin
assignment the firmware is written against — not a confirmed physical
build. This matches the status `HARDWARE_BRINGUP.md` has recorded since
Phase 1A began.

### Bill of materials (design-time; not physically confirmed)

| Qty | Item | Status |
| --- | --- | --- |
| 1 | ESP32 dev board (ESP32-WROOM, `esp32dev`, GPIO 34–39 broken out) | NOT YET AVAILABLE |
| 4 | Capacitive soil moisture sensor, v1.2/v2.0, 3.3 V | NOT YET AVAILABLE |
| 2 | 12 V solenoid valve (one per zone) | NOT YET AVAILABLE |
| 1 | 12 V DC pump | NOT YET AVAILABLE |
| 3 | MOSFET or opto-isolated relay channel (pump + 2 valves) | NOT YET AVAILABLE |
| 3 | Flyback diode (e.g. 1N4007) | NOT YET AVAILABLE |
| 1 | 12 V supply, rated above pump **stall** current | NOT YET AVAILABLE |
| 1 | Separate 5 V/3.3 V supply for the ESP32, common ground with the 12 V rail | NOT YET AVAILABLE |

There is no current-sensing, flow-sensing, pressure-sensing or
vibration-sensing hardware anywhere in the design. This matters later in
§13 and §14.

### Pin map (design-time; UNVERIFIED against any physical board)

Source of truth: `firmware/src/config/hydrax_config.h`.

| Signal | GPIO | Notes | Status |
| --- | --- | --- | --- |
| Sensor 1 (zone 1) | 36 (VP), ADC1_CH0 | | ⚠ UNVERIFIED |
| Sensor 2 (zone 1) | 39 (VN), ADC1_CH3 | | ⚠ UNVERIFIED |
| Sensor 3 (zone 2) | 34, ADC1_CH6 | | ⚠ UNVERIFIED |
| Sensor 4 (zone 2) | 35, ADC1_CH7 | | ⚠ UNVERIFIED |
| Pump | 26 | Active HIGH | ⚠ UNVERIFIED |
| Zone 1 valve | 25 | Active HIGH | ⚠ UNVERIFIED |
| Zone 2 valve | 27 | Active HIGH | ⚠ UNVERIFIED |

Static checks that **are** true regardless of hardware (code review, not a
physical test): no sensor pin is on ADC2 (which breaks under Wi-Fi), no
actuator is on an input-only pin, no strapping pin (0/2/5/12/15) is used,
no pin is assigned twice, and `Esp32DigitalActuator::begin()` writes the
de-energized level before and after `pinMode(OUTPUT)` so enabling an
output cannot emit a startup pulse. These are properties of the source
code, confirmed by reading it — not something a board was needed to check.

**Safety note:** this entire system is low-voltage DC (12 V pump/valve
rail, 3.3–5 V logic). Nothing in this project's design involves mains/AC
power, so no mains-related fault injection appears anywhere in this
document. Bench work should stay that way — do not introduce an AC-powered
component into this system.

---

## 3. Firmware Under Test

| Property | Value |
| --- | --- |
| Firmware version | `0.1.0-phase1` (`hydrax_config.h`) |
| Language / standard | C++17, PlatformIO, Arduino-ESP32 framework |
| Core control logic | `firmware/src/core/` — no Arduino/ESP-IDF headers; hardware sits behind `IAnalogSource`, `IDigitalActuator`, `IWifiRadio`, `IClock` |
| Build environments | `esp32dev`, `esp32dev_sim`, `esp32dev_bench`, `esp32dev_commission`, plus `native` (host tests) |

### Implemented in firmware vs. physically verified vs. not yet available

| Capability | Implemented in firmware? | Verified in simulation? | Physically verified? |
| --- | --- | --- | --- |
| Median-of-5 + EMA sensor filtering | Yes (`sensor_array.cpp`, `moisture.cpp`) | Yes — host tests | **NOT PHYSICALLY VERIFIED** |
| Two-point per-probe calibration | Yes | Yes (calibration math tested) | **NOT PHYSICALLY VERIFIED** — no probe has ever been calibrated |
| Sensor fault latch/recovery (3-bad / 3-good) | Yes | Yes | **NOT PHYSICALLY VERIFIED** |
| Hysteresis irrigation state machine | Yes (`irrigation_controller.cpp`) | Yes | **NOT PHYSICALLY VERIFIED** |
| Min-runtime / cooldown / max-runtime / timeout-lockout | Yes | Yes (both field and bench timing profiles) | **NOT PHYSICALLY VERIFIED** |
| Deadhead guard, valve-before-pump ordering | Yes | Yes | **NOT PHYSICALLY VERIFIED** |
| Actuator fault latch (`ACTUATOR_ERROR`) | Yes | Yes (interface-level failure injection) | **NOT PHYSICALLY VERIFIED** — no real stuck valve/pump has ever been tested |
| Offline continuation of irrigation | Yes (`IrrigationController` has no reference to Wi-Fi/HTTP) | Yes — host test "irrigation works with no network at all" | **NOT PHYSICALLY VERIFIED** |
| Wi-Fi reconnect with exponential backoff | Yes (`wifi_manager.cpp`) | Yes | **NOT PHYSICALLY VERIFIED** — never run against a real access point |
| Telemetry outbox (FIFO, drop-oldest, retry policy) | Yes (`outbox.h`, `telemetry_client.cpp`) | Logic tested on host; the FreeRTOS task + `HTTPClient` code itself is untested (see docs/TESTING.md known gap #3) | **NOT PHYSICALLY VERIFIED** |
| **Dedicated dry-run protection** | **No** — `HARDWARE.md` states explicitly: *"Never let the pump run dry. The firmware's maximum-runtime cut is a backstop, not a dry-run protector."* | N/A | **NOT IMPLEMENTED** |
| **Hardware/task watchdog** | **No.** No `esp_task_wdt` (or any watchdog) call exists anywhere in `firmware/src/`. Confirmed by search, not by memory. | N/A | **NOT IMPLEMENTED** — see §12/§16 |
| Predictive maintenance (anomaly score, RUL) | **No** — explicitly out of scope; see `docs/ARCHITECTURE.md` §"What Phase 1 deliberately excludes" | N/A | **NOT IMPLEMENTED** |
| Leak detection / localization | **No** — same exclusion; no flow sensor in the BOM | N/A | **NOT IMPLEMENTED** |

### Build status (freshly re-verified this session, 2026-09-05)

| Check | Result | Evidence |
| --- | --- | --- |
| Host core tests, field timing (`g++ ... && ./hydrax_tests`) | **PASS** | 50 tests, 1082 checks, 0 failed |
| Host core tests, bench timing (`-D HYDRAX_BENCH_TIMING`) | **PASS** | 50 tests, 962 checks, 0 failed |
| `pio run -e esp32dev` (real ESP32 target, no upload) | **PASS** | RAM 15.8% (51 812/327 680 B), Flash 71.7% (939 489/1 310 720 B) — identical to the figures recorded in `HARDWARE_BRINGUP.md`, i.e. unchanged since that record |
| `esp32dev_sim`, `esp32dev_bench`, `esp32dev_commission` | Not rebuilt this session | Last recorded PASS in `HARDWARE_BRINGUP.md` §1a; not re-verified today |
| Backend: `npm run typecheck` | **PASS** | clean |
| Backend: `npm run check` (dashboard/website/admin static checks) | **PASS** | all checks passed |
| Backend: `npm test` (129 tests, live Supabase Postgres) | **PASS** | 129/129, 0 failed |

None of the above required or touched physical hardware. **A green build
is not a hardware test.**

---

## 4. Test Environment

| Property | Value |
| --- | --- |
| Date | 2026-09-05 |
| Host toolchain | g++ (C++17), PlatformIO Core 6.1.19, Espressif 32 @ 7.0.1, Arduino-ESP32 @ 3.20017, GCC 8.4.0 (xtensa) |
| Physical ESP32 board | **None present** |
| Physical sensors/valves/pump | **None present** |
| Network / access point used for testing | None — no on-target Wi-Fi test has been performed |
| Backend under test | Node.js backend against a real Supabase-hosted Postgres instance (dev project) |
| Firmware image actually run on a board | **None — the firmware has never executed on an ESP32.** It has only ever been compiled. |

Every result in §6 onward that says "NOT TESTED" is a direct consequence
of the environment above, not a judgment call.

---

## 5. Commissioning Checklist

This is a **procedure to execute once hardware exists**, carried over from
and consistent with `HARDWARE_BRINGUP.md` (which contains the detailed
step-by-step script). It is reproduced here in checklist form so a bench
session has one place to record pass/fail against every commissioning
gate before any fault injection is attempted. **Every item is currently
NOT PERFORMED.**

### Power

| # | Item | Status |
| --- | --- | --- |
| P1 | ESP32 supply is a separate regulated rail from the 12 V pump/valve rail, common ground only | NOT PERFORMED |
| P2 | 12 V supply is rated above the pump's **stall** current, not running current | NOT PERFORMED |
| P3 | Flyback diode fitted across every solenoid valve and any relay coil | NOT PERFORMED |
| P4 | Power-on with no actuator wired: confirm ESP32 boots and logs over serial at 115200 | NOT PERFORMED |

### Inputs (sensors)

| # | Item | Status |
| --- | --- | --- |
| I1 | All four sensors wired to ADC1 pins (36/39/34/35) only — never ADC2 | NOT PERFORMED |
| I2 | Each probe reads a plausible raw count in air (~2800–3200) via the commissioning console (`r`) | NOT PERFORMED |
| I3 | Each probe's reading drops substantially when wetted (~1200–1400) | NOT PERFORMED |
| I4 | Each probe individually calibrated (`d`/`w`/`c`/`k` console commands), span ≥ 300 counts | NOT PERFORMED |
| I5 | Disconnecting a probe produces `INVALID`/`OUT_OF_RANGE` within 3 reads, not a false soil value | NOT PERFORMED |

### Outputs (actuators)

| # | Item | Status |
| --- | --- | --- |
| O1 | Pump and both valves are OFF at power-on, before any command (`a` in commissioning console) | NOT PERFORMED |
| O2 | Reset/EN mid-run drives outputs off and keeps them off | NOT PERFORMED |
| O3 | Each valve actuates individually (`1o`/`1c`, `2o`/`2c`) | NOT PERFORMED |
| O4 | Deadhead guard refuses `po` (pump on) with both valves closed | NOT PERFORMED |
| O5 | Only one valve can be open at a time; opening a second is refused | NOT PERFORMED |
| O6 | Closing the active valve while the pump runs cuts the pump first, then closes the valve | NOT PERFORMED |
| O7 | `stopAllIrrigation()` (`x`) turns everything off from any state | NOT PERFORMED |

### Communications

| # | Item | Status |
| --- | --- | --- |
| C1 | Device associates with the target Wi-Fi network and appears on the dashboard with its real `device_id` | NOT PERFORMED |
| C2 | Telemetry shows `simulated: false` (confirms `esp32dev`, not `esp32dev_sim`, was flashed) | NOT PERFORMED |
| C3 | Stopping the backend does not stop irrigation; restarting it flushes buffered telemetry | NOT PERFORMED |

### Safety

| # | Item | Status |
| --- | --- | --- |
| S1 | Bench-test valves and pump **with the pump physically dry** (out of the water loop) before any plumbing | NOT PERFORMED |
| S2 | Confirm max-runtime cutoff actually stops the pump under the bench timing profile before trusting the field profile | NOT PERFORMED |
| S3 | Confirm no mains/AC component has been introduced anywhere in the build | **N/A by design** — the design has no mains/AC component; verify this remains true |
| S4 | Verify GPIO12 (strapping pin, flash voltage) and other strapping pins are genuinely unused on the physical board, not just in the pin table | NOT PERFORMED |

Electrical checks that require measuring live current under fault
conditions (e.g. confirming actual pump stall current against the 12 V
supply's rating, or verifying flyback diode clamping under a real
inductive kick) are marked:

> **NOT SAFE TO PERFORM WITHOUT APPROPRIATE EQUIPMENT** (a current clamp
> or bench PSU with current limiting, and a scope to observe the flyback
> event). Do not attempt to characterize this by feel or by running the
> pump against a closed valve to "see what happens."

---

## 6. Fault Injection Matrix

Ten tests, as specified. **All ten are NOT TESTED on physical hardware —
no board exists to test them on.** Where the underlying *logic* has
already been exercised in simulation (host tests or `esp32dev_sim`), that
is noted separately and is not a substitute for the physical result.

| Test ID | Name | Status | Environment | Procedure | Expected | Observed | Evidence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FI-01 | Wi-Fi loss mid-irrigation | **NOT TESTED** | Physical hardware required | Start a run with telemetry flowing; power off the AP mid-run | Pump/valve keep operating; `[WARN][wifi] Wi-Fi disconnected - irrigation continues locally` logged; control loop keeps ticking at 1 Hz | — | — | Underlying logic PASS in simulation: host tests "irrigation works with no network at all", "wifi disconnect is detected and retried" |
| FI-02 | Backend unavailable | **NOT TESTED** (physical) | Physical hardware required for the device side | Stop the backend process while a device is publishing telemetry | Device logs failed POSTs, buffers into the outbox (capacity 20, oldest dropped when full), keeps irrigating; backend recovers without a crash | Backend-side behavior *is* verified: `reliability.test.ts` confirms the server survives a genuinely unreachable database (503, not a crash) and stays usable afterward | `backend/test/reliability.test.ts`, 129/129 passing | Device-side outbox behavior verified only via host test "uplink retries transient failures but discards poison payloads" — never against a real HTTP stack |
| FI-03 | Sensor disconnected | **NOT TESTED** | Physical hardware required | Unplug one probe's AOUT lead while running | Sensor reports `INVALID` within 3 reads; zone falls back to the remaining probe (`[DEGRADED]`), not to zero | — | — | Simulation PASS: "sensor latches fault after repeated failures", "zone excludes an invalid sensor from the average", "zone runs degraded on a single healthy sensor" |
| FI-04 | Unrealistic sensor reading | **NOT TESTED** | Physical hardware required | Short or float a probe lead so the raw ADC count falls outside [150, 4000] | Reading classified as an electrical fault (`OUT_OF_RANGE`/`DRIVER_ERROR`), not reported as extreme soil moisture | — | — | Simulation PASS: "sensor rejects out-of-range readings", "sensor reports driver error on negative raw" |
| FI-05 | Pump/valve restart sequencing | **NOT TESTED** | Physical hardware required | Stop a run, immediately attempt to restart the same zone; separately, cycle the actuators through the commissioning console's guided self-test (`t`) | Cooldown blocks the immediate restart; valve opens before pump on start, pump cuts before valve closes on stop, in every case | — | — | Simulation PASS: "cooldown blocks an immediate restart", "closing the active valve cuts the pump first" |
| FI-06 | ESP32 reboot mid-run | **NOT TESTED** | Physical hardware required | Energize a valve/pump, then press EN/reset | Actuators de-energize and stay off; controller resumes at `IDLE` on boot (no run-resume logic exists — this is a reset to idle, not a recovery) | — | — | **Code-reviewed only, not simulation-tested**: `main.cpp` binds and de-energizes actuators before sensors/control/networking, and `Esp32DigitalActuator::begin()` writes the de-energized level before and after `pinMode(OUTPUT)`. The host test suite has no concept of a mid-run power cycle, so this guarantee has not even been exercised in simulation — only read in source |
| FI-07 | Valve failure (stuck / non-responsive) | **NOT TESTED** | Physical hardware required | Simulate a valve that does not respond to a command (interface-level failure injection is what the host test does; a physical test needs an actual jammed or disconnected valve) | `ACTUATOR_ERROR` latched, safe state forced, latch persists until `clearActuatorFault()` is called explicitly | — | — | Simulation PASS: "valve failure latches ACTUATOR_ERROR and forces a safe state", "actuator error is latched until explicitly cleared". A simulated interface returning failure is not the same as a solenoid physically jamming |
| FI-08 | Pump failure | **NOT TESTED** | Physical hardware required | Same class as FI-07, pump side | Same: `ACTUATOR_ERROR` latched, safe state forced | — | — | The firmware's actuator-fault model does not distinguish pump-specific failure modes (e.g. stalled rotor, overcurrent) — there is no current sensing in the BOM (§2) to detect that distinction at all |
| FI-09 | Dry run (pump running against no water) | **NOT TESTED** | Physical hardware required | Run the pump with the suction/output line dry | — | — | — | **There is no dedicated dry-run protection in firmware.** Per `docs/HARDWARE.md`: *"Never let the pump run dry. The firmware's maximum-runtime cut is a backstop, not a dry-run protector."* Do not run this test expecting the firmware to prevent damage — it does not detect dry-running by itself |
| FI-10 | Power loss (full system, mid-run) | **NOT TESTED** | Physical hardware required | Remove power entirely from the whole system mid-run, then restore it | On restore: actuators boot de-energized (same guarantee as FI-06); no prior run state is remembered or resumed — the zone simply starts a fresh `IDLE → CHECKING_SOIL` cycle | — | — | Same code-reviewed-only caveat as FI-06. Also note: telemetry buffered in the outbox at the moment of power loss is lost — the outbox is in-RAM only, not persisted |

---

## 7. Sensor Validation

| Sensor | Expected range (raw ADC) | Expected range (percent) | Calibration status |
| --- | --- | --- | --- |
| S1 (zone 1) | 150–4000 valid; ~2800–3200 in air, ~1200–1400 in water (typical for this probe family) | 0–100%, relative | **CALIBRATION REQUIRED** — `hydrax_config.h` ships a shared placeholder (`raw_dry: 3000, raw_wet: 1300`) identical across all four sensors. This has not been measured against any physical probe |
| S2 (zone 1) | same | same | **CALIBRATION REQUIRED** — same placeholder |
| S3 (zone 2) | same | same | **CALIBRATION REQUIRED** — same placeholder |
| S4 (zone 2) | same | same | **CALIBRATION REQUIRED** — same placeholder |

No percentage this system has ever reported, in any dashboard screenshot
or demo, can be called an accurate soil-moisture measurement. The
percentage is defined as:

```
percent = (raw_dry - raw) / (raw_dry - raw_wet) * 100
```

— a position on a scale between *this specific probe in dry air* and
*this specific probe in water*, per `docs/HARDWARE.md`. It is explicitly
**not** volumetric water content, and it cannot be, until each of the four
placeholder calibration pairs above is replaced with a real measurement
taken from the actual physical probe that will ship in that slot. Until
then, every percentage this system reports is **CALIBRATION REQUIRED**,
not merely "approximate."

Sensor fault handling (latch after 3 consecutive bad reads, recover after
3 consecutive good ones, raw values outside [150, 4000] treated as an
electrical fault rather than soil data) is implemented and verified in
simulation (§3), but **NOT PHYSICALLY VERIFIED** — no real probe has ever
produced a real fault (a real loose connector, a real short) for this
firmware to react to.

---

## 8. Control Loop Validation

The control loop maps onto SENSE → UNDERSTAND → DECIDE → ACT → MONITOR as
follows. Every stage below is **implemented and verified in simulation**
via the host test suite re-run this session (§3): 50 tests, 1082
assertions (field timing) and 962 assertions (bench timing), 0 failures
in both. **No stage has been physically verified** — no real ADC reading,
real relay switch, or real network transaction has ever driven this loop.

| Stage | Implementation | Verified in simulation | Physically verified |
| --- | --- | --- | --- |
| **SENSE** | `SensorArray` reads each probe through `IAnalogSource`, median-of-5 sampling (5 ms spacing) rejects spikes, then a 0.30-alpha EMA smooths the calibrated percentage | Yes | **NOT PHYSICALLY VERIFIED** |
| **UNDERSTAND** | Per-zone aggregation averages only *valid* probes; a probe is FAULTED after 3 consecutive bad reads and trusted again after 3 consecutive good ones; a zone with one valid probe of two is `DEGRADED` and may finish but not start a run | Yes | **NOT PHYSICALLY VERIFIED** |
| **DECIDE** | `IrrigationController`'s state machine (`IDLE → CHECKING_SOIL → IRRIGATION_REQUIRED → STARTING → IRRIGATING → STOPPING → IDLE`, plus `SENSOR_ERROR`/`ACTUATOR_ERROR`/`TIMEOUT`) applies the hysteresis band and picks the driest eligible zone, one zone at a time | Yes | **NOT PHYSICALLY VERIFIED** |
| **ACT** | `IIrrigationHardware` opens the zone valve, waits `kValveSettleMs` (2 s), then energizes the pump; on stop, cuts the pump first and waits `kPumpSpindownMs` (2 s) before closing the valve. Deadhead guard refuses the pump with no valve open | Yes | **NOT PHYSICALLY VERIFIED** |
| **MONITOR** | `captureTelemetry()` builds the telemetry snapshot every `kTelemetryIntervalMs` (15 s); `ControllerEvent`s are queued to the outbox as they occur and forwarded to the backend, which stores them and raises/clears alerts | Yes (telemetry payload shape and event queueing); backend ingestion is covered by 129 backend tests against real Postgres | **NOT PHYSICALLY VERIFIED** end-to-end from a real sensor to a real dashboard pixel |

### Hysteresis validation

Values, from `firmware/src/config/hydrax_config.h` (field profile):

| Zone | Start threshold | Stop threshold | Minimum band enforced |
| --- | --- | --- | --- |
| 1 | 35.0% | 55.0% | `kMinHysteresisBand` = 5.0 (rejected at boot if narrower) |
| 2 | 35.0% | 55.0% | same |

Verified in simulation: "dry soil starts irrigation", "wet soil does not
start irrigation", "soil between thresholds does not start", "irrigation
continues until the stop threshold" (i.e. it does not stop the instant it
crosses back above the *start* threshold), "irrigation stops at the stop
threshold." The backend independently enforces the same minimum-band rule
on any threshold change submitted through its API (`zone configuration
validation` tests, §backend test suite).

**Not verified:** whether these specific percentages (35/55, on the
*relative*, uncalibrated scale described in §7) correspond to anything
agronomically meaningful for a real crop and soil. `docs/HARDWARE.md` is
explicit that these are "initial values, not agronomic recommendations."

### Minimum runtime / cooldown / timeout validation

| Limit | Field value | Bench value | Verified in simulation |
| --- | --- | --- | --- |
| Minimum runtime | 30 s | 3 s | Yes — "minimum runtime prevents an instant stop" |
| Zone cooldown | 5 min | 15 s | Yes — "cooldown blocks an immediate restart" |
| Maximum runtime | 10 min | 20 s | Yes — "max runtime triggers timeout and cuts the pump" |
| Timeout lockout | 30 min | 30 s | Yes — "timeout locks the zone out" |

Both timing profiles were re-run fresh this session with 0 failures. What
this does **not** demonstrate: whether 2 s of valve settle time and 2 s of
pump spindown are actually sufficient for a *real* solenoid valve and a
*real* pump with real hydraulic inertia — those numbers are, per
`docs/HARDWARE_BRINGUP.md`, "starting values" pending a bench rig.

---

## 9. Offline-First Validation

This is HYDRAX's core differentiator, so it gets its own honesty check.
**The claim "cloud failure ≠ control failure" is architecturally true by
construction, and verified in simulation, but has never been physically
demonstrated.**

What is actually true today:

- `IrrigationController` holds no reference to Wi-Fi or HTTP at all — it
  depends only on `SensorArray`, `IIrrigationHardware` and `IClock`. This
  is a property of the source code (`irrigation_controller.h`'s member
  list), confirmed by reading it.
- Host test "irrigation works with no network at all" runs a full
  irrigation cycle with no network object present in the test whatsoever
  — **PASS**.
- `WifiManager::tick()` logs exactly `"Wi-Fi disconnected - irrigation
  continues locally"` on a detected disconnect and returns immediately;
  it does not block.
- On the design's target hardware, `main.cpp`'s comment states the
  control loop runs on core 1 while network I/O runs on a FreeRTOS task
  pinned to core 0 — **this specific claim (which core each task runs on)
  has not been independently verified in this session**, since it
  requires the ESP32 RTOS scheduler, which only exists once code is
  actually running on a board.
- Backend-side: `sweepOfflineDevices()` raises a `DEVICE_OFFLINE` alert
  worded *"No telemetry for {N}s. The controller keeps irrigating
  locally; only monitoring is affected"* after `HYDRAX_OFFLINE_TIMEOUT_MS`
  (default 60 s) of silence, checked every `HYDRAX_OFFLINE_SWEEP_MS`
  (default 15 s), and clears it automatically the moment telemetry
  resumes. This part **is** verified by an automated test against a real
  server and real database (`alerts` test suite, part of the 129 passing
  backend tests) — but it is a monitoring-layer test, not proof the
  device kept irrigating.

**What has NOT been demonstrated:** an actual Wi-Fi access point being
powered off while a real ESP32, running real firmware, is actively
driving a real pump — and observing with your own eyes that the pump
keeps running. Until that specific observation happens (procedure: §8 of
`docs/HARDWARE_BRINGUP.md`), "offline-first" is a verified *architecture*
and a verified *simulation*, not a verified *product behavior*.

---

## 10. Telemetry Consistency

Four layers exist in the pipeline: **physical state → firmware's internal
state → backend's stored state → dashboard's displayed state.** A full
consistency check requires comparing all four simultaneously against a
real device.

| Layer pair | Checkable today? | Result |
| --- | --- | --- |
| Physical ↔ firmware | No — requires a real sensor/actuator and a way to independently observe physical state (e.g. a multimeter on the valve terminals) while reading the firmware's own telemetry | **NOT TESTED** |
| Firmware ↔ backend | Partially — the wire format is fully specified (`docs/TELEMETRY.md`) and the backend's validation is exhaustively tested (rejects impossible states: pump on with all valves closed, two valves open at once, an active zone missing from `soil`), but no *real* firmware has ever sent a real payload; only the `mock-device` fixture and the test suite's synthetic payloads have | Backend-side validation: **PASS** (129 tests). Real-firmware-to-backend: **NOT TESTED** |
| Backend ↔ dashboard | Yes, today, using the mock-device fixture as a stand-in for a device | Verified previously by manual end-to-end check (backend + `npm run mock-device`): telemetry flows, a normal irrigation run, a probe fault/recovery, and a runtime timeout all appear on the dashboard with alerts appearing and clearing correctly. **This is SIMULATION** — the mock device "replays a fixed script and contains no thresholds, hysteresis or irrigation decisions" (`docs/TESTING.md`); it is not the firmware |

Bottom line: the **backend-to-dashboard** half of the pipeline is real and
tested. The **physical-to-firmware** and **firmware-to-backend** halves
have never been exercised with an actual device — the mock device
deliberately stands in for a device's HTTP behavior but runs none of the
actual control logic, so it cannot validate that firmware and backend
agree on what a *real* irrigation decision looks like on the wire.

---

## 11. Predictive Maintenance Validation

There is nothing to validate. Per `docs/ARCHITECTURE.md`'s explicit
"What Phase 1 deliberately excludes" list: *"Predictive maintenance and
RUL models, pump failure prediction..."* are out of scope for this phase.
Confirmed by searching the entire firmware and backend source: there is
no anomaly score, no remaining-useful-life estimate, no failure-prediction
model, and no dataset of pump/valve failures anywhere in this repository.

**Status: NOT IMPLEMENTED.** No accuracy figure, confidence interval or
"AI-powered" claim should be made about this capability, because the
capability does not exist yet — not even as an untested prototype.

---

## 12. Leak Detection Validation

Same situation as §11. The bill of materials (§2) contains no flow
sensor, no pressure sensor, and no second pressure/flow measurement point
that a leak-detection algorithm would need to compare against. There is
no leak-detection code in `firmware/src/` or `backend/src/`.

**Status: NOT IMPLEMENTED.** No leak-detection accuracy, sensitivity, or
localization claim can be made, honestly, until flow or pressure sensing
hardware exists in the design at all — this is a prerequisite that
currently does not exist, not a software gap.

---

## 13. Results

| Category | PASS | PARTIAL | NOT TESTED | NOT APPLICABLE |
| --- | --- | --- | --- | --- |
| Commissioning checklist (§5) | 0 | 0 | 20 | 1 (S3, N/A by design — no mains component exists) |
| Fault injection matrix (§6) | 0 | 0 | 10 | 0 |
| Firmware logic, simulation (§3, §8) | 50/50 host tests (both timing profiles) | — | — | — |
| Firmware target build (§3) | 4/4 environments (as last recorded; `esp32dev` freshly reconfirmed) | — | — | — |
| Backend automated tests | 129/129 | — | — | — |
| Sensor calibration (§7) | 0/4 probes calibrated | — | — | — |
| Offline-first (§9) | Architecture + simulation PASS | Physical demonstration NOT TESTED | — | — |
| Predictive maintenance (§11) | — | — | — | Not implemented — not applicable to test |
| Leak detection (§12) | — | — | — | Not implemented — not applicable to test |

**No physical hardware test in this document has a PASS or FAIL result.**
Every physical row is NOT TESTED because no board was available at the
time of writing. This is the accurate state of the project, not an
incomplete report.

---

## 14. Known Gaps

Carried forward and extended from `docs/TESTING.md` and
`docs/HARDWARE_BRINGUP.md`, plus what this audit found new:

1. **No hardware/task watchdog exists in firmware.** Confirmed by
   searching the entire `firmware/` tree for any watchdog API — none is
   present. The control loop's own safety backstops (max-runtime cutoff,
   deadhead guard) only fire because `tick()` keeps being called; if the
   main loop itself hangs (a bug, a stack overflow, a peripheral driver
   lockup), none of those backstops execute, and there is no independent
   mechanism to force a reset. This is a real, currently-unaddressed
   safety gap for a system that switches a pump and valves unattended.
   **This was not fixed in this pass** — adding an ESP32 hardware watchdog
   is a genuine firmware change to safety-relevant code that this session
   cannot verify without a physical board, and shipping an unverified
   change to that code is a worse outcome than flagging it honestly. See
   §16 for the recommendation.
2. **No dedicated dry-run protection.** Explicitly documented in
   `docs/HARDWARE.md`; the max-runtime cutoff is a backstop, not a
   dry-run detector. A pump run dry for slightly under the max-runtime
   limit will not be caught by firmware at all.
3. **All four sensor calibration pairs are an identical placeholder**
   (`{3000, 1300}` × 4 in `hydrax_config.h`), not per-unit measurements.
   Every soil-moisture percentage this system has ever displayed is
   uncalibrated.
4. **The firmware has never executed on an ESP32.** It has only ever been
   compiled (confirmed again this session: `esp32dev` builds clean). No
   on-target behavior — timing, ADC noise, RTOS task scheduling, boot
   behavior — has been observed.
5. **The FreeRTOS uplink task and `HTTPClient` usage are untested** even
   on a simulation build; only the pure logic they depend on (outbox
   ordering, retry classification, Wi-Fi backoff) is tested on the host.
6. **Actual hydraulics are unknown.** `kValveSettleMs` (2 s) and
   `kPumpSpindownMs` (2 s) are starting values pending a bench rig with a
   real valve and pump.
7. **No current, flow, pressure or vibration sensing exists**, which
   means: pump-specific failure diagnosis (FI-08), dry-run detection
   (FI-09, gap #2), and any future leak-detection or predictive-
   maintenance feature (§11, §12) all require hardware that is not in the
   current BOM.
8. **Dashboard read endpoints are unauthenticated** (Phase 1 assumes a
   trusted LAN) — a pre-existing, already-documented gap, unrelated to
   this hardware audit but relevant to "competition credibility" framing
   if the dashboard is demonstrated on an open network.
9. Everything listed in `docs/TESTING.md`'s own "Known gaps" section
   still applies unchanged (static-file stream-error path exercised only
   by reasoning, not a passing targeted test; transaction rollback-error
   handling reviewed, not tested; global `uncaughtException` handlers are
   a fallback of last resort, not a tested mechanism).

No code was changed as part of producing this document. `npm run check`,
`npm run typecheck`, `npm test` and the firmware host test suite were run
to confirm the current state, not to fix anything — the one real issue
found (the missing watchdog) is a recommendation, not a patch, for the
reasons given in item 1.

---

## 15. Evidence / Photos

None exist yet. When physical testing begins, capture and attach:

- A photo of the assembled BOM before power-on (confirms P1–P3 visually).
- A photo or short video of each commissioning-console step in §5/§3–4
  of `HARDWARE_BRINGUP.md`, particularly the deadhead-guard refusal and
  the one-valve-at-a-time refusal (these are negative results — the
  console printing "REFUSED" — so a video or serial-log capture matters
  more than a photo).
- Serial log capture (full text, not a screenshot) of Step 6 in
  `HARDWARE_BRINGUP.md` (the bench-timing local irrigation test),
  covering all 12 sub-tests.
- Serial log capture of the offline-first test (§9 here / §8 of
  `HARDWARE_BRINGUP.md`), specifically the moment the Wi-Fi AP is powered
  off and the `"irrigation continues locally"` line appears.
- A dashboard screenshot taken *during* that same offline window, showing
  the device marked offline while irrigation event history shows it kept
  running once telemetry resumes.
- Raw ADC count log for each probe's dry and wet calibration reference
  (the `d`/`w` console captures), so the calibration values entered into
  `hydrax_config.h` are traceable to a real measurement.
- Photo of actual pump stall-current measurement against the 12 V supply
  rating (multimeter/clamp reading visible), before trusting the supply
  sizing.

---

## 16. Final Validation Status

### Hardware Readiness Score

| Dimension | Score |
| --- | --- |
| Firmware logic correctness (simulation) | **Strong** — 50/50 host tests, 1082 + 962 assertions across both timing profiles, 0 failures, re-verified this session |
| Firmware buildability for target hardware | **Confirmed** — `esp32dev` compiles clean, re-verified this session; other 3 environments last confirmed in `HARDWARE_BRINGUP.md` |
| Backend/API correctness | **Strong** — 129/129 automated tests against a real Postgres instance, re-verified this session |
| Physical hardware validation | **0%** — 0 of 20 commissioning items performed, 0 of 10 fault-injection tests performed |
| Sensor calibration | **0%** — 0 of 4 probes calibrated; all readings are currently uncalibrated placeholders |
| Offline-first (physical) | **Not demonstrated** — architecturally sound and simulation-verified only |
| Predictive maintenance / leak detection | **Not implemented** — explicitly out of scope, no hardware prerequisite exists |
| Watchdog / hang recovery | **Not implemented** — identified gap, unfixed pending hardware to verify against |

**Overall: the control software is well-tested in simulation and the
target firmware builds cleanly. The physical product has not begun
hardware validation.** Any claim to a competition judge should state
these as two separate facts, not blend them into one "tested" claim.

### Critical Gaps for Competition Credibility

1. Nothing in this project has been demonstrated on real hardware. If a
   judge asks "has this run on an actual ESP32," the honest answer is no.
2. No soil-moisture percentage shown anywhere (including any prior
   dashboard screenshot or demo) has been calibrated against a real
   probe. It is a relative number on an uncalibrated placeholder scale.
3. There is no dry-run protection and no watchdog — both are real,
   unaddressed safety gaps for unattended operation, not merely
   "not yet tested" items.
4. "Offline-first" — the headline differentiator — has only been proven
   as an architecture and a simulation, never as an observed physical
   behavior.
5. Predictive maintenance and leak detection do not exist in any form.
   If either is mentioned in a pitch, it must be framed as roadmap, never
   as a working feature.

### Recommended Test Order

1. **Commissioning §5** (power → inputs → outputs → communications) —
   nothing else is meaningful until the board boots safely and every
   actuator is confirmed off-by-default.
2. **Actuator bring-up** (`HARDWARE_BRINGUP.md` §4) with the pump
   physically dry — confirms the deadhead guard and ordering before any
   water is involved.
3. **Sensor bring-up and per-probe calibration** (§7 here / §3 of
   `HARDWARE_BRINGUP.md`) — nothing about irrigation decisions is
   trustworthy before this.
4. **Bench-timing local irrigation test** (§8 here / §6 of
   `HARDWARE_BRINGUP.md`) — exercises the full state machine, hysteresis
   and safety limits in about a minute per cycle instead of 15+ minutes.
5. **Telemetry test** (§7 of `HARDWARE_BRINGUP.md`) — confirm real
   firmware, not the mock device, reaches the backend and dashboard
   correctly.
6. **Offline-first test** (§9 here / §8 of `HARDWARE_BRINGUP.md`) — the
   single most important test for this project's core claim.
7. **Fault injection matrix (§6)**, FI-03/FI-04 (sensor faults) before
   FI-07/FI-08 (actuator faults) before FI-09/FI-10 (dry-run, power
   loss) — cheapest and safest failures first.
8. Only after 1–7 are green: revisit the watchdog gap (§14 item 1) with
   real hardware available to verify a fix against, rather than shipping
   an unverified change now.

---

*This document reflects the repository and test environment as of
2026-09-05. Every "NOT TESTED" here should be updated to a real PASS or
FAIL, with evidence, the moment the corresponding physical test is
actually run — and not before.*
