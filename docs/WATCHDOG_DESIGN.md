# HYDRAX Watchdog Design

> **Status: design review only. No production firmware has been modified
> as part of this document.** This is a plan to implement and physically
> validate *after* hardware bring-up (see `docs/HARDWARE_VALIDATION.md`),
> not a change that has shipped.

---

## 1. Current Firmware Execution Model

Confirmed by reading `firmware/src/main.cpp`, `firmware/src/net/telemetry_client.cpp/.h`,
`firmware/src/core/wifi_manager.cpp`, `firmware/src/hal/esp32_*`, and
`firmware/platformio.ini` — not assumed from prior documentation.

| Property | Value |
| --- | --- |
| Framework | Arduino-ESP32 (`framework = arduino` in `platformio.ini`), platform `espressif32 @ 7.0.1`, resolved framework package `framework-arduinoespressif32 @ 3.20017.241212+sha.dcc1105b` (confirmed on this machine today; `platformio.ini` does not pin an exact framework version, so this should be re-confirmed at implementation time — see §14) |
| Entry point | Standard Arduino `setup()` / `loop()` — no `app_main()` override |
| Task model | Arduino's own `loopTask` (created by the Arduino-ESP32 core itself, pinned to core 1 by default) runs `setup()` once, then `loop()` repeatedly. **One** additional FreeRTOS task is created by application code: `hydrax_net`, in `TelemetryClient::begin()`, via `xTaskCreatePinnedToCore(..., kTaskCore=0, ...)` — stack 6144 words, priority 3, pinned to core 0 |
| Timers | None. No `esp_timer`, no hardware timer, no `Ticker` anywhere in `firmware/src/` |
| Inter-task communication | A single FreeRTOS mutex (`xSemaphoreCreateMutex`) guarding two fixed-capacity `Outbox<T,N>` queues (telemetry, events). The control loop (core 1) is the producer; `hydrax_net` (core 0) is the consumer |
| Wi-Fi handling | `WifiManager` (pure state machine, no blocking) runs its `tick()` **from inside the `hydrax_net` task**, not from `loop()`. `Esp32WifiRadio::connect()` calls `WiFi.begin()`, documented in the adapter's own comment as **asynchronous** |

### The two-core split, as it actually exists in code

```
core 1 (Arduino loopTask)              core 0 (hydrax_net task)
────────────────────────────           ──────────────────────────
setup(): actuators → sensors →         WifiManager::tick(now)
          controller → wifi/uplink     if connected:
          init (network LAST)            flush one queued event, else
                                          flush one queued telemetry
loop():                                   sample (HTTPClient POST,
  controller.tick()   ◄── state           blocking, up to
    machine, sensor reads                 kHttpTimeoutMs)
  publishTelemetry()  ──► mutex,        vTaskDelay(200 ms)
    bounded 5 ms wait, never blocks     ...loop forever...
    on network I/O
  delay(50)
  ...loop forever...
```

This matches the design intent documented in `docs/HARDWARE.md` and
`net/telemetry_client.h`'s own header comment, and — unlike that
documentation, which I am not simply trusting here — it is now confirmed
by having read every line of the code that implements it.

---

## 2. Why a Watchdog Is Needed

`IrrigationController::tick()` is the **only** place the max-runtime
cutoff, the deadhead guard's periodic re-assertion, cooldown expiry, and
every other safety timer are evaluated. All of them are *cooperative*:
they depend on `loop()` calling `tick()` again. If `loop()` on core 1
ever stops advancing — an unanticipated infinite loop, a stack overflow,
a corrupted state, a peripheral driver that never returns, a bug not yet
found by the 50-test/1082-assertion host suite — **every one of those
safety timers stops with it**, and whatever the pump/valve state was at
the moment of the hang persists with no software mechanism able to
intervene. There is currently no external supervisor of any kind. A
watchdog is the only way to bound the recovery time from a class of
failure that, by definition, the rest of the firmware cannot detect or
correct on its own.

This is not a hypothetical box-ticking exercise: it is the one concrete
gap `docs/HARDWARE_VALIDATION.md` identified as a real, currently
unaddressed safety property missing from a system that switches a pump
and two valves unattended.

---

## 3. Potential Blocking Paths

Every call chain reachable from `loop()` (core 1) and from `hydrax_net`'s
task loop (core 0) was read directly, not inferred. Time budgets below
are computed from the actual constants in `hydrax_config.h` and
`telemetry_client.cpp`.

| Path | Core | Blocking? | Bound | Notes |
| --- | --- | --- | --- | --- |
| `Esp32AnalogSource::readRaw()` (per sensor, via `Arduino delay()`) | 1 (inside `controller.tick()` → `sensors_->update()`) | **Yes** | `kSamplesPerReading` (5) samples per sensor, `kSampleSpacingMs` (5 ms) between samples → up to **~20 ms per sensor**. `SensorArray::update()` reads all 4 sensors **sequentially in one call**, so a single `sensors_->update()` invocation can block **up to ~80 ms total**, not ~20 ms — the in-code comment on `readRaw()` describes the per-sensor cost only. Occurs at most once every `kSensorIntervalMs` (2000 ms) | Real, but small and already-bounded by constants, not an unbounded loop |
| `delay(50)` at the end of `loop()` | 1 | Yes, by design | Fixed 50 ms | Intentional scheduler yield, not a hang risk |
| `Log::write()` → `Serial.printf()` (via the sink installed in `main.cpp`) | 1 (called throughout `controller.tick()`'s call chain) and 0 (called from `hydrax_net` too) | **Potentially**, in theory | Not bounded in code | `core/log.h`'s own comment already flags this: *"Must not block for long: it runs inside the control loop."* At 115200 baud with the current log volume this is a low-probability, small-magnitude risk, but it is **not** provably bounded from the source alone — a UART TX buffer that fills with nothing draining it (no monitor attached, in some configurations) is a known class of issue on Arduino cores. Not measured in this review |
| `TelemetryClient::queueTelemetry()` / `queueEvent()` (producer side, core 1) | 1 | Bounded | `xSemaphoreTake(..., pdMS_TO_TICKS(5))` — **5 ms max**, then drops the sample rather than waiting further | Cannot hang the control loop by construction |
| `TelemetryClient::flushOneEvent()` / `flushOneTelemetry()` lock (consumer side) | 0 | Bounded | 100 ms max | Runs on `hydrax_net`, not the control loop |
| `WifiManager::connect()` → `WiFi.begin()` | 0 | **No** | — | Adapter's own comment: "asynchronous." Association progress is polled via `isConnected()`, with a 15 s per-attempt deadline enforced by `WifiManager::tick()`'s own elapsed-time check, not a sleep |
| `HTTPClient::POST()` (via `postJson()`) | 0 | **Yes, legitimately** | `http.setTimeout()` / `setConnectTimeout()` both set to `kHttpTimeoutMs` = **4000 ms** | This is the one path that can legitimately block for **multiple seconds by design**. It runs only on `hydrax_net` (core 0), never on the control-loop task. Real-world caveat: Arduino-ESP32's `HTTPClient`/`WiFiClient` stack has known cases (varying by core version) where DNS resolution or a stalled TCP handshake can exceed the configured timeout — this cannot be fully bounded from reading the configuration alone and would need on-target measurement (§14) |
| `IrrigationController::step()` transition loop | 1 | Self-limited | `kMaxTransitionsPerTick` = 5 | Already exists in the current code specifically to stop any future cycle in the transition graph from spinning `tick()` indefinitely. No `delay()` or blocking call exists anywhere in `irrigation_controller.cpp` — confirmed by reading the whole file |
| Mutex/semaphore waits anywhere in this codebase | both | Bounded | — | Confirmed by search: **`portMAX_DELAY` (an unbounded wait) does not appear anywhere in `firmware/src/`.** Every `xSemaphoreTake` call already uses an explicit millisecond timeout |

**Bottom line for the control-loop task (core 1):** the only genuine,
currently-unbounded-in-source risk is the log sink (`Serial.printf`)
already flagged by the code's own comment. Everything else on this core
is either instantaneous or bounded by a config constant, with the largest
routine bound being the ~80 ms sensor-read burst every 2 s. **The network
task (core 0) legitimately blocks for up to ~4 s per HTTP call, by
design, and this must never be confused with a hang.** This distinction
— which the user's own review request specifically asked to check — is
the central constraint on the watchdog design in §5.

---

## 4. Actuator Safety Requirements

What the firmware *can* guarantee, and what it cannot, informed by
reading `hal/esp32_digital_actuator.cpp` and `main.cpp` directly:

- **From the moment `Esp32DigitalActuator::begin()` executes:** the
  de-energized logic level is written *before* `pinMode(pin, OUTPUT)` and
  again *after* — so switching the pin to an output cannot itself emit a
  pulse. This is a property of the code, verified by reading it.
- **`main.cpp`'s boot order is a safety property, not an accident:**
  actuators are bound and driven to their de-energized state *before*
  sensors, control logic, or networking are touched. This is true on
  every boot, unconditionally — including a boot caused by a
  watchdog-triggered reset, because a reset re-enters the exact same
  `setup()` path. There is no separate "reset" code path in this firmware
  to audit separately from "normal boot."
- **What the firmware cannot guarantee:** the electrical state of GPIO
  25/26/27 *before* `begin()` executes — i.e., from the instant of
  power-up or reset until that specific line of `setup()` runs. During
  that window the ESP32 boot ROM holds pins in their silicon default
  (input, high-impedance) state, and what a MOSFET gate or opto-relay
  input does when driven by a floating input depends entirely on the
  **external driver board's own pull resistor** — which is not specified
  or verified anywhere in this repository. This is marked **NOT VERIFIED
  WITHOUT HARDWARE** and cannot be resolved by any firmware change; it
  requires an oscilloscope on the real driver board.
- **A watchdog-triggered reset always lands in the same safe-boot path**
  described above, once code starts running again. The open question is
  only the brief transient *before* that path resumes — see §5 for why
  this matters to the design, and §9 for the specific boot/reset/
  brownout/startup/Wi-Fi-reconnect breakdown requested.
- **Turning everything off is always an acceptable outcome.** The
  existing ordering rules (valve-before-pump on start, pump-before-valve
  on stop) exist to protect the pump from deadheading and to protect
  irrigation efficiency — they are not required to make an "everything
  off" reset state safe. A watchdog reset that lands on
  `applySafeStartupState()` (pump off, all valves closed) is always a
  safe outcome, even though it is disruptive to whatever run was in
  progress.

---

## 5. Recommended Watchdog Architecture

**Use ESP-IDF's Task Watchdog Timer (TWDT), subscribed to the control-loop
task only. Do not subscribe the network task.**

### Why per-task, not the legacy global watchdog

The Arduino-ESP32 core exposes ESP-IDF's TWDT, which supports subscribing
individual tasks by handle (`esp_task_wdt_add(TaskHandle_t)`) rather than
only watching the idle tasks of both cores. Given §3's finding — the
control loop (core 1) has a tight, ~50–150 ms normal cadence, while the
network task (core 0) legitimately blocks for up to several seconds per
HTTP call — a single shared timeout cannot serve both without either
being too loose to catch a real hang quickly (if sized for the network
task) or falsely resetting the whole chip on a legitimate HTTP wait (if
sized for the control loop). **These two tasks must not share a watchdog
budget.**

### The recommendation

1. Subscribe **only** the Arduino `loopTask` (obtainable via
   `xTaskGetCurrentTaskHandle()` called from inside `setup()`, which runs
   on that same task) to the TWDT.
2. Do **not** subscribe `hydrax_net` to the TWDT in this first pass. Its
   failure mode is fundamentally different (§10) and does not threaten
   actuator safety, because — confirmed in §3/§4 — nothing on that task
   ever calls into `IIrrigationHardware` or `IrrigationController`.
3. Feed (`esp_task_wdt_reset()`) exactly once per `loop()` iteration,
   positioned **after** `g_controller.tick()` returns (§7) — proving a
   full control-loop pass actually completed, not merely that some code
   somewhere on core 1 is still running.

### The honest limit of a software-only design

The requested failure sequence is:

```
WATCHDOG FAILURE → SAFE ACTUATOR STATE → ESP32 RESET → SAFE BOOT → CONTROLLER RECOVERY
```

Note the order: **safe actuator state is asked for *before* the reset.**
This is the hard part, and it deserves an honest answer rather than an
assumed one:

- **Tier 1 — best effort, achievable with current hardware, software
  only.** ESP-IDF's TWDT can be configured to invoke the panic handler
  on timeout (`trigger_panic = true`) before the final reset, and a
  custom panic handler *can* attempt to force the pump/valve GPIOs low
  before the chip resets. This is worth doing — it costs nothing and
  helps in many real hang scenarios. **It is not provable for every
  possible hang cause.** A hang caused by corrupted memory, a fault with
  interrupts disabled, or a wedged state deep enough to prevent the panic
  handler itself from running cleanly means this best-effort step may not
  execute. Claiming it as a guarantee would be exactly the kind of
  unverified safety claim this review exists to prevent.
- **Tier 2 — a provable guarantee, requires hardware not in the current
  BOM.** The only way to *guarantee* actuators go safe during an
  arbitrary MCU hang, independent of whatever state the firmware is
  wedged in, is an independent hardware supervisory circuit — e.g. a
  retriggerable monostable/supervisor IC (such as a TPL5010-class part)
  or a simple RC-based "dead-man" circuit wired in series with the
  driver-stage enable line, which cuts the driver's enable signal in
  hardware if the MCU stops toggling a heartbeat pin within a bounded
  time, regardless of *why* it stopped. This project's current BOM
  (`docs/HARDWARE_VALIDATION.md` §2) has no such component. This is a
  **recommendation for consideration during hardware bring-up**, not
  something to build in software.

Given this, the honest framing of what is achievable today is:

```
WATCHDOG FAILURE → (best-effort, unproven force-off attempt) → ESP32 RESET
   → SAFE BOOT (code-verified) → CONTROLLER RECOVERY (code-verified)
```

with the "safe actuator state" step genuinely guaranteed only *after*
reset, not provably before it, unless Tier 2 hardware is added.

---

## 6. Timeout Selection

From §3: the control loop's normal per-iteration cost is dominated by the
50 ms yield plus, once every 2 s, an ~80 ms sensor-read burst — call it a
worst-case routine iteration of roughly **150 ms**. A watchdog timeout
must sit comfortably above the worst *legitimate* case, not the typical
case, while still being short enough to matter.

**Recommendation: 5–8 seconds for the control-loop task**, roughly 35–55×
the worst-case routine iteration time. This margin absorbs scheduler
jitter, an occasional multi-transition tick (still bounded to 5
transitions, each cheap), and the log-sink risk flagged in §3, while
still recovering from a genuine hang within single-digit seconds.

**This number is a reasoned starting hypothesis, not a measured
constant.** It must be validated by instrumenting real `loop()` timing on
actual hardware (§11/§14) before being finalized — ESP32 ADC timing, real
Wi-Fi radio interrupt load sharing core 1's cycles, and real Serial
throughput can all differ from the assumptions above in ways host testing
cannot reveal.

**Do not watch the network task with any timeout in this range.** Its
legitimate blocking window (`kHttpTimeoutMs` = 4000 ms per call, and the
`HTTPClient` caveat in §3) is already close to the control loop's entire
proposed budget. If the network task is ever watched at all, it needs its
own, much longer, separately-configured timeout (tens of seconds, to
tolerate several consecutive retry/backoff cycles) — and, per §10, this
review recommends not watchdog-resetting the whole chip over a network
task hang in the first implementation at all, since it cannot affect
actuator safety.

---

## 7. Feed/Reset Strategy

- Feed **once per `loop()` iteration**, placed immediately after
  `g_controller.tick()` returns (and after the conditional
  `publishTelemetry()` call, which is a fast, bounded, non-blocking
  enqueue per §3).
- Feeding at this specific point means a feed is evidence that the
  state machine actually advanced through a real tick, not just that
  *some* instruction on core 1 executed. A watchdog fed from an
  independent timer/ISR regardless of `tick()`'s outcome would defeat the
  entire purpose — it would keep resetting the timer while the actual
  control logic was the thing stuck.
- Do not feed from inside `Esp32AnalogSource::readRaw()`, any log call,
  or any other sub-routine — there must be exactly one feed point, at the
  end of a fully-completed loop iteration.

---

## 8. Boot and Recovery Behavior

- **Reset-reason logging.** `esp_reset_reason()` distinguishes a
  watchdog-triggered reset (`ESP_RST_TASK_WDT`, `ESP_RST_WDT`, or
  `ESP_RST_PANIC` depending on configuration) from a normal power-on,
  software reset, or brownout. Recommend reading and logging this at the
  very top of `setup()`, before actuator init — it is a passive read, not
  a control action, so it cannot compromise the existing boot-order
  safety property. Surfacing it (e.g., as a detail on the existing
  `CONTROLLER_STARTED` event, or a new boot-reason telemetry field) is
  low-risk, low-cost future work: without it, a watchdog silently firing
  in the field would be invisible to anyone watching only the dashboard.
- **No special recovery path is needed.** The irrigation state machine
  persists no state across a reboot today (confirmed in
  `docs/HARDWARE_VALIDATION.md`) — every boot, watchdog-triggered or not,
  is a cold start into `IDLE`. This is favorable for watchdog safety:
  there is no partially-recovered, ambiguous state to reconcile after a
  reset.
- **Boot-loop risk.** If the bug causing a hang is reliably re-triggered
  shortly after each recovery (e.g., a specific state reached a fixed
  time after `IDLE`), the system could reset repeatedly. Recommend (as
  future work, not implemented here) counting consecutive
  watchdog-reset-reasons in `RTC_DATA_ATTR` memory (survives a reset,
  not a full power loss) and, after a small threshold (e.g. 3), entering
  a degraded mode that keeps reporting telemetry but refuses to open a
  valve or start the pump until an operator clears it. This closes a real
  gap a naive "just reset and try again" design would leave open.

---

## 9. Pump/Valve Safe-State Requirements

Direct answers to the five scenarios requested, each rated by how it was
actually checked — not assumed:

| Scenario | What the firmware controls | How checked | Verdict |
| --- | --- | --- | --- |
| **Normal boot** | `Esp32DigitalActuator::begin()` writes OFF before and after `pinMode(OUTPUT)`; `main.cpp` binds/de-energizes all actuators before sensors, control or networking | Read the full source of both files | Firmware logic **CODE-VERIFIED**. Electrical behavior on a real GPIO/driver board: **NOT PHYSICALLY VERIFIED** (never run on hardware) |
| **Reset** (manual EN, software, or future watchdog) | Identical to normal boot — a reset re-enters the same boot ROM → `setup()` path; there is no distinct "reset" code branch | Same source read; confirmed no alternate entry point exists | Same verdict as normal boot. The transient between the reset event and `setup()` reaching the actuator-init line is governed by ESP32 silicon defaults + the external driver board's pull resistors, neither of which this firmware controls: **NOT VERIFIED WITHOUT HARDWARE** |
| **Brownout/restart** | No brownout-detector configuration (`esp_brownout_*`, `CONFIG_ESP32_BROWNOUT_DET_*`) appears anywhere in this codebase — confirmed by search. Default Arduino-ESP32 brownout behavior applies (chip reset below ~2.43 V by default) | Searched `firmware/src/` for any brownout override; found none | GPIO behavior during and immediately after a real brownout event is **NOT VERIFIED WITHOUT HARDWARE**. Testing this deliberately requires a bench PSU capable of a controlled, current-limited voltage ramp-down and a scope on the driver input — **NOT SAFE TO PERFORM WITHOUT APPROPRIATE EQUIPMENT** (do not attempt this by degrading the supply informally or repeatedly power-cycling under load "to see what happens") |
| **Firmware startup (`setup()`)** | Fully firmware-controlled: actuators → sensors → controller → network, in that order | Read `main.cpp` in full | Firmware logic **CODE-VERIFIED**; **NOT PHYSICALLY VERIFIED** (the firmware has never executed on a board at all, per `docs/HARDWARE_VALIDATION.md`) |
| **Wi-Fi reconnect** | `IrrigationController` holds no reference to Wi-Fi, HTTP, or any type from `wifi_manager.h`/`telemetry_client.h` (confirmed from its member list in `irrigation_controller.h`). `WifiManager` and `TelemetryClient` never call any method on `IIrrigationHardware` or `IrrigationController` (confirmed — neither file includes or references either type) | Read both headers/`.cpp` files and traced every call they make | **CODE-VERIFIED**: a Wi-Fi reconnect cannot alter actuator state, by construction — there is no code path from the networking layer to the hardware layer. **NOT PHYSICALLY VERIFIED**: no real reconnect has ever been observed against a real, running pump |

---

## 10. Failure Scenarios

| # | Scenario | Current behavior | With the recommended watchdog |
| --- | --- | --- | --- |
| 1 | Main loop hangs (unanticipated bug: infinite loop, stuck peripheral, corrupted state) | Runs forever with whatever actuator state existed at the hang. No recovery. | TWDT fires after 5–8 s (§6); best-effort force-off attempt (§5 Tier 1, not guaranteed); chip resets; safe boot; controller resumes at `IDLE` |
| 2 | Deadlocked mutex | **Not currently reproducible from the code as written** — every `xSemaphoreTake` in this codebase already uses a bounded timeout (confirmed: no `portMAX_DELAY` anywhere in `firmware/src/`), so a true deadlock on the existing mutex is not possible without a future code change introducing one | Watchdog would still catch it if a future change ever introduced an unbounded wait on the control-loop task |
| 3 | Network task (`hydrax_net`) genuinely wedges (e.g., an `HTTPClient`/driver bug hangs past its configured timeout) | Telemetry/events silently stop flushing; irrigation is entirely unaffected (§3/§4 isolation) | **Recommend not watchdog-resetting the whole chip for this.** It is a monitoring-availability problem, not a safety problem — resetting the MCU over a non-safety fault would itself interrupt an irrigation run in progress, which is a worse outcome than a temporarily silent dashboard. Left as a known, accepted gap for this first pass (see §13) |
| 4 | A sensor read genuinely stalls (e.g. an ADC driver bug makes `analogRead()` block far longer than its expected ~5 ms) | This runs synchronously inside `tick()` on core 1, so it **would** hang the control loop | Correctly caught by the control-loop watchdog — this is exactly the class of failure the design targets |
| 5 | Repeated/looping watchdog resets (a hang that recurs quickly after each recovery) | Not applicable today (no watchdog exists) | Recommend the RTC-memory boot-loop counter and degraded mode from §8 (future work, not implemented) |
| 6 | Brownout mid-run | Chip resets via the ESP32's own default brownout detector (already active; not firmware-configured) | Same safe-boot path as any other reset. GPIO behavior during the brownout transient itself: **NOT VERIFIED WITHOUT HARDWARE** |
| 7 | Watchdog false-positive during a legitimate but unusually long sensor/log burst | N/A | Mitigated by the generous margin in §6; residual risk must be measured empirically before the timeout is finalized (§11/§14) |

---

## 11. Test Plan

**No fake watchdog test has been added.** None of the behavior this
document proposes — `esp_task_wdt`, FreeRTOS task subscription, a reset
caused by a hang — is expressible in the host test suite, because
`firmware/src/core/` is deliberately free of Arduino/ESP-IDF headers so
it can be tested without hardware at all (see `docs/TESTING.md`). A
watchdog is by definition a property of the Arduino/FreeRTOS/silicon
layer that the host suite excludes on purpose. Simulating a hang and a
reset in a way that would "pass" on the host would not prove anything
about the real behavior this document is trying to make safe, so no such
test was written.

### What was actually run in this review

```
cd firmware
g++ -std=c++17 -Wall -Wextra -I src -o hydrax_tests test/test_core/main.cpp src/core/*.cpp
./hydrax_tests
```

**Result: 50 tests, 1082 checks, 0 failed. ALL TESTS PASSED.** (Re-run
fresh for this document; no firmware source was changed, so this
confirms the pre-existing behavior is unaffected by this review, not
that anything new was validated.)

### What must be run once hardware exists (all currently NOT TESTED)

1. Instrument real `loop()` timing (min/max/average iteration time over
   an extended run) to empirically confirm or correct the ~150 ms
   worst-case assumption in §6 **before** finalizing the timeout.
2. Deliberately induce a hang in a temporary debug build (e.g. a
   `while(true){}` inserted in one state handler) and confirm: the TWDT
   fires within the expected window; the chip resets; `esp_reset_reason()`
   correctly reports the watchdog cause; actuators are OFF once `setup()`
   completes; irrigation resumes normally from `IDLE`.
3. Point the device at an unreachable backend and soak-test for at least
   an hour of continuous `kHttpTimeoutMs` timeouts, confirming the
   network task's legitimate blocking **never** triggers a watchdog reset
   (since it is not subscribed — this test would also catch a mistake in
   the implementation that subscribed it anyway).
4. A real Wi-Fi disconnect/reconnect cycle against a running pump,
   confirming actuator state and the watchdog feed cadence are both
   undisturbed.
5. A real, safely-conducted brownout event (bench PSU with a controlled,
   current-limited ramp-down; scope on the driver input) —
   **NOT SAFE TO PERFORM WITHOUT APPROPRIATE EQUIPMENT** if attempted any
   other way.
6. If the boot-loop escalation (§8) is implemented: force three
   consecutive watchdog resets and confirm the degraded mode engages and
   refuses to actuate until cleared.

---

## 12. Implementation Plan (future work — not done in this review)

1. At the top of `setup()`, before actuator init, read and log
   `esp_reset_reason()` (§8) — a passive diagnostic, no control-path risk.
2. Inside `setup()`, after the existing actuator → sensor → controller
   init and **before** Wi-Fi/uplink init begins (preserving the existing
   "network last" ordering, which exists for an unrelated but compatible
   reason), obtain the current task handle
   (`xTaskGetCurrentTaskHandle()`) and register it with
   `esp_task_wdt_add()`.
3. Add exactly one `esp_task_wdt_reset()` call, at the end of `loop()`,
   after `g_controller.tick()` and the telemetry-publish call (§7).
4. Do **not** subscribe `hydrax_net` in this pass (§5/§6/§10).
5. Empirically measure real `loop()` timing on actual hardware (§11
   item 1) and adjust the timeout constant from the §6 starting
   hypothesis if the data warrants it, before trusting it on a system
   connected to real plumbing.
6. *(Second pass, optional)* Add the RTC-memory boot-loop counter and
   degraded safe mode from §8.
7. *(Hardware pass, optional)* Evaluate a Tier 2 independent hardware
   supervisory circuit (§5) if a provable — not best-effort — pre-reset
   actuator-off guarantee is required.
8. After implementing steps 1–4: re-run the full firmware host suite,
   rebuild `pio run -e esp32dev` clean, and execute the induced-hang test
   (§11 item 2) on real hardware before trusting this anywhere near real
   plumbing.

---

## 13. Risks

- **False-positive resets** from an underestimated timeout — mitigated
  by the generous margin in §6, but not provable without on-target
  measurement (§11 item 1).
- **A watchdog can mask a recurring bug** by silently "fixing" the
  symptom on every reset without anyone noticing the underlying hang
  keeps happening — mitigated by the reset-reason logging in §8/§12
  item 1, which makes a recurring watchdog reset visible instead of
  invisible.
- **A reset while a valve is physically mid-travel** cuts the driver
  logic signal, but the solenoid's own mechanical state (partially
  open) is a hardware behavior outside firmware's control —
  **NOT VERIFIED WITHOUT HARDWARE**.
- **The Tier 1 best-effort pre-reset force-off (§5) is not provable for
  every hang cause.** This is a real, currently-unaddressed residual risk
  unless/until a Tier 2 hardware supervisory circuit is added. This
  document does not claim otherwise.
- **This is safety-adjacent code.** Even scoped as narrowly as §12
  proposes, it touches boot sequencing and the main loop of a system that
  drives a pump and valves. It must go through the full physical test
  plan in §11 before being trusted — which is precisely why this review
  recommends design-and-document now, implement and validate later, not
  implementing today.
- **Excluding the network task from the watchdog (§5/§10) means a truly
  wedged (not just slow) network task would run forever undetected.**
  Accepted as a monitoring gap, not a safety gap, given the confirmed
  isolation between that task and actuator control (§3/§4/§9) — but it
  does mean a wedged uplink could go unnoticed indefinitely without a
  human checking the dashboard.

---

## 14. Hardware Validation Required

Everything below is currently **NOT TESTED** and must be physically
confirmed before this design is implemented and trusted:

- Real `loop()` iteration timing (§6/§11 item 1) — the 5–8 s timeout
  proposed here is a reasoned starting hypothesis, not a measurement.
- The exact `esp_task_wdt` API surface for whatever Arduino-ESP32 core
  version resolves at implementation time. Today, on this machine, that
  resolved to `framework-arduinoespressif32 @ 3.20017.241212+sha.dcc1105b`
  (built on ESP-IDF 5.x) — but `platformio.ini` does not pin an exact
  framework version, so this must be re-confirmed at implementation time,
  since the TWDT initialization signature has changed across ESP-IDF/
  Arduino-ESP32 core generations.
- Whether a custom panic handler can reliably force the pump/valve GPIOs
  off before the final reset on this exact resolved core version (§5
  Tier 1) — or whether that guarantee requires the Tier 2 hardware
  addition instead.
- Real brownout behavior on the actual driver board, using proper bench
  equipment (§9, §11 item 5) — **NOT SAFE TO PERFORM WITHOUT APPROPRIATE
  EQUIPMENT** otherwise.
- The external driver board's actual pull-resistor / floating-input
  behavior during the boot/reset transient (§4/§9) — this depends on
  hardware that has not been chosen or built yet.
- All five items in §11's "what must be run once hardware exists" list.

---

*This document is a design and review artifact. It changes no behavior
of the shipped firmware. Implementation should follow `docs/HARDWARE_VALIDATION.md`'s
recommended test order — commissioning, actuator bring-up, sensor
calibration, and the bench-timing irrigation cycle should all be green
on real hardware first, so that watchdog testing (§11) has a trustworthy
baseline to compare against rather than debugging two unknowns at once.*
