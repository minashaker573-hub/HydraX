# HYDRAX — Phase 1A Hardware Bring-Up

Moving Phase 1 from host-tested logic to verified ESP32 hardware.

> ## Status of this document
>
> **No physical hardware was available when this was written.** Everything
> below that requires a board, a probe or a valve is marked
> **`NOT PERFORMED`** — not PASS, not FAIL. The procedures are written so you
> can execute them at the bench and fill in the results.
>
> The only rows that carry a real result are the ones that were actually run:
> the compile and the host test suites.

---

## 1. Hardware

### Expected bill of materials

| Qty | Item | Notes |
| --- | --- | --- |
| 1 | ESP32 dev board (ESP32-WROOM, `esp32dev`) | Must expose GPIO 34–39 |
| 4 | Capacitive soil moisture sensor v1.2 / v2.0 | 3.3 V analog output |
| 2 | 12 V solenoid valve | One per zone |
| 1 | 12 V DC pump | Sized for the plumbing |
| 3 | MOSFET or opto-isolated relay channel | Pump + 2 valves |
| 3 | Flyback diode (e.g. 1N4007) | Across every inductive load |
| 1 | 12 V PSU | Rated above pump **stall** current |
| 1 | Separate 5 V/3.3 V supply for the ESP32 | Common ground with the 12 V rail |

> **None of this has been confirmed against a physical build.** The firmware
> makes no assumption about a specific driver board — see
> [§5 electrical interface](#5-electrical-interface-expected-by-the-firmware).

---

## 1a. Toolchain and build (Step 1) — **PASS**

```bash
cd firmware
cp src/config/secrets.example.h src/config/secrets.h   # required; git-ignored
pio run -e esp32dev
```

| Component | Version |
| --- | --- |
| PlatformIO Core | 6.1.19 |
| Platform | Espressif 32 @ 7.0.1 |
| Framework | Arduino-ESP32 @ 3.20017 |
| Compiler | `toolchain-xtensa-esp32` GCC 8.4.0 |
| Board | `esp32dev` (ESP32, 240 MHz, 320 KB RAM, 4 MB flash) |
| Libraries | WiFi 2.0.0, HTTPClient 2.0.0 |

All four environments build clean with `-Wall -Wextra`:

| Environment | Result | RAM | Flash |
| --- | --- | --- | --- |
| `esp32dev` | SUCCESS | 15.8% | 71.7% |
| `esp32dev_sim` | SUCCESS | 15.8% | 71.3% |
| `esp32dev_bench` | SUCCESS | 15.8% | 71.7% |
| `esp32dev_commission` | SUCCESS | 6.7% | 23.1% |

### Two real defects the first compile caught

The ESP32-specific files had never been through a compiler before. The first
`pio run` failed on both of these:

1. **`src/config/secrets.h` missing** — working as intended. The `#error` guard
   stops the firmware compiling with placeholder credentials. Copy the example
   file and fill it in.
2. **`net/telemetry_client.cpp:216` — invalid conversion from `const uint8_t*`
   to `uint8_t*`.** `HTTPClient::POST()` takes a non-const pointer even though
   it only reads the payload. Fixed with an explicit `const_cast`, keeping the
   pointer+length overload so a ~1.2 KB body is not copied onto the heap on
   every publish. **This bug was invisible to the host test suite** — it lives
   in the Arduino-facing layer that only the ESP32 build touches.

### If the platform install fails with `HTTPClientError`

On a network doing **TLS interception** (a corporate proxy or AV that
re-signs HTTPS with a private root CA), PlatformIO fails with an empty
`HTTPClientError`. The underlying cause is
`CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate` — Python's
`requests` uses the `certifi` bundle, which does not contain your enterprise
root, while Windows itself trusts it.

Fix by trusting exactly what Windows already trusts — **do not disable
verification**:

```powershell
python -c "import ssl,certifi,os; out=os.path.join(os.path.expanduser('~'),'.platformio','windows-ca-bundle.pem'); os.makedirs(os.path.dirname(out),exist_ok=True); p=[open(certifi.where(),encoding='utf-8').read()]; [p.append(ssl.DER_cert_to_PEM_cert(d)) for s in ('ROOT','CA') for d,e,t in ssl.enum_certificates(s) if e=='x509_asn']; open(out,'w',encoding='utf-8').write('\n'.join(p))"
$env:REQUESTS_CA_BUNDLE = "$env:USERPROFILE\.platformio\windows-ca-bundle.pem"
$env:SSL_CERT_FILE = $env:REQUESTS_CA_BUNDLE
```

This was required on the machine where the build above was run.

---

## 2. Pin table

Source of truth: `firmware/src/config/hydrax_config.h`. Nothing else in the
firmware hard-codes a pin.

### Sensors — ADC1 only

| Sensor | Zone | GPIO | ADC channel | Status |
| --- | --- | --- | --- | --- |
| S1 | 1 | **36** (VP) | ADC1_CH0 | ⚠ UNVERIFIED |
| S2 | 1 | **39** (VN) | ADC1_CH3 | ⚠ UNVERIFIED |
| S3 | 2 | **34** | ADC1_CH6 | ⚠ UNVERIFIED |
| S4 | 2 | **35** | ADC1_CH7 | ⚠ UNVERIFIED |

### Actuators

| Output | GPIO | Polarity | Status |
| --- | --- | --- | --- |
| Pump | **26** | Active HIGH (`kPumpActiveLow = false`) | ⚠ UNVERIFIED |
| Zone 1 valve | **25** | Active HIGH (`kValveActiveLow = false`) | ⚠ UNVERIFIED |
| Zone 2 valve | **27** | Active HIGH (`kValveActiveLow = false`) | ⚠ UNVERIFIED |

**⚠ Every pin above is a design-time placeholder chosen from the ESP32
datasheet. None has been confirmed against a physical board.** Verify against
your build before flashing anything connected to a pump.

### ADC limitations and constraints

| Constraint | Consequence |
| --- | --- |
| **ADC2 is unusable while Wi-Fi is active** | All four sensors are on ADC1. A probe on ADC2 works on the bench and breaks the instant telemetry connects — a genuinely nasty intermittent fault. |
| GPIO 34–39 are **input-only** | Correct for sensors; they cannot be used as outputs, so they can never be miswired to an actuator. |
| ESP32 ADC is **non-linear**, especially below ~0.15 V and above ~3.0 V | Why calibration is two-point per probe and the result is *relative*, not absolute. |
| Attenuation set to `ADC_11db` | Input span ≈ 0–3.1 V, matching a 3.3 V-powered capacitive probe. |
| Resolution 12-bit (0–4095) | Raw counts outside **150–4000** are treated as an electrical fault, not as soil. |
| Sampling: median of 5 per read | Rejects single-sample spikes on long probe leads. |

### GPIO conflict check

| Check | Result |
| --- | --- |
| Any sensor pin on ADC2? | No — 36/39/34/35 are all ADC1 |
| Any actuator on an input-only pin (34–39)? | No — 26/25/27 are all I/O capable |
| Any strapping pin used (0, 2, 5, 12, 15)? | No — deliberately avoided, so a driver holding a line during reset cannot block boot |
| Any pin assigned twice? | No — all seven are distinct |
| Any flash/PSRAM pin used (6–11)? | No |
| Boot-state risk | `Esp32DigitalActuator::begin()` writes the de-energized level **before** `pinMode(OUTPUT)`, then again after, so enabling the output cannot emit a pulse |

> Note: GPIO 12 (MTDI) is a strapping pin that affects flash voltage and is a
> classic source of boards that will not boot. It is not used here.

---

## 3. Sensor bring-up

Both sensor steps use the **commissioning console**, a separate firmware image
that reuses the production sensor and actuator layers unchanged and adds an
interactive serial interface. It contains **no irrigation logic** — it never
decides to water anything.

```bash
cd firmware
pio run -e esp32dev_commission -t upload
pio device monitor
```

### Step 3 — one sensor

1. Wire **S1 only**: probe VCC → 3.3 V, GND → GND, AOUT → GPIO36.
2. `p` — confirm the pin map matches your wiring.
3. `r` — raw ADC counts. With the probe in air you should see a **high**
   count (~2800–3200). `OUT OF RANGE` here means a wiring fault, not dry soil.
4. **Confirm the reading actually responds:** hold the probe in air, note the
   value, then insert it into a glass of water to its marked line. The count
   must drop substantially (~1200–1400). If it does not move, the probe or the
   wiring is faulty — stop here.
5. `s` — the calibrated readout. With the shipped placeholder calibration this
   is approximate; that is expected until step 6 below.
6. **Test invalid handling:** unplug AOUT. Within 3 reads the sensor must
   report `INVALID` with a status of `OUT_OF_RANGE` or `DRIVER_ERROR`, and the
   zone average must fall back to the remaining probe (or `UNAVAILABLE`).
7. **Calibrate:**
   - probe clean and dry in air → `d1`
   - probe in water to the marked line → `w1`
   - `c` to review; the span must be ≥ 300 counts or the probe is rejected as
     `BAD_CALIBRATION`
8. `k` — prints a ready-to-paste `kSensorCalibration` block.

> The console averages 20 reads over ~1 s per capture, so a reference is never
> taken from a single sample.

### Step 4 — four sensors

1. Wire S2 → GPIO39, S3 → GPIO34, S4 → GPIO35.
2. Repeat the calibration capture for each: `d2`/`w2`, `d3`/`w3`, `d4`/`w4`.
3. `k`, paste the block into `firmware/src/config/hydrax_config.h`, rebuild and
   re-upload.
4. `S` — continuous 1 Hz readout:

```
Zone 1:
  S1 = 42.0%   (raw 2286)
  S2 = 46.0%   (raw 2218)
  Average = 44.0%  (2/2 probes valid)

Zone 2:
  S3 = 61.0%   (raw 1963)
  S4 = 58.0%   (raw 2014)
  Average = 59.5%  (2/2 probes valid)

  (relative soil moisture - NOT volumetric water content)
```

**Verify:**

- **Independence** — wet only S3. Only S3 and the zone 2 average may move.
- **Identification** — the moving reading must be the probe you touched. If S3
  moves when you wet S1, two channels are swapped.
- **Averaging rule** — the zone average is the mean of *valid* probes only.
- **Fault handling** — unplug S3. Zone 2 must show `[DEGRADED]` with a 1/2
  valid count and average only S4 — **not** average S4 with a zero.

---

## 4. Actuator bring-up (Step 5)

> **Keep the pump out of the water loop for this entire step.** Verify the
> electrical behaviour before anything can move water.

Order is deliberate: valve 1, valve 2, then pump.

```
1o / 1c   zone 1 valve open / close
2o / 2c   zone 2 valve open / close
po / pf   pump on / off
t         guided self-test of all three, in order
x         stopAllIrrigation() — everything off
a         actuator state
```

**Verify, in order:**

| # | Check | Expected |
| --- | --- | --- |
| 1 | Power-on state | Pump and both valves **off** before any command. `a` confirms. |
| 2 | Reset mid-run | Energize a valve, press EN/reset. Output must go off and stay off. |
| 3 | Valve 1 | `1o` audibly actuates it; `1c` releases. |
| 4 | Valve 2 | `2o` / `2c` likewise. |
| 5 | **One zone at a time** | `1o` then `2o` → the second is **REFUSED**. |
| 6 | **Deadhead guard** | With both valves closed, `po` → **REFUSED**. This is the guard that stops the pump running against a closed system. |
| 7 | Pump | `1o`, wait, `po` → pump runs. |
| 8 | Ordered shutdown | `1c` while the pump runs → the pump is cut *first*, then the valve closes. |
| 9 | `stopAllIrrigation()` | `x` from any state → everything off. |
| 10 | **Manual timeout** | `1o` then wait 30 s → the console force-stops the output on its own. |

`t` runs 1, 3, 4, 6, 7 and 9 automatically, including asserting that the
deadhead guard actually refuses.

---

## 5. Electrical interface expected by the firmware

The firmware drives **logic-level control signals only**. It makes no
assumption about the driver technology.

| Property | Expectation |
| --- | --- |
| Signal | 3.3 V logic on GPIO 25/26/27 |
| Current | Signal-level only (a MOSFET gate or opto input). **Never the load.** |
| Default polarity | Active HIGH (energized = 3.3 V) |
| Relay boards | Usually **active LOW** — set `kPumpActiveLow` / `kValveActiveLow` to `true`. Nothing else changes; polarity is handled entirely in the actuator layer. |
| De-energized at boot | Guaranteed by firmware before anything else runs |
| Flyback protection | **Must be provided in hardware.** Firmware cannot protect a GPIO from an inductive kick. |
| Grounds | ESP32 ground and 12 V ground must be common, but the ESP32 must have its **own regulated supply** — pump current on a shared rail causes brownouts and resets. |
| Supply sizing | 12 V PSU rated above the pump's **stall** current, not its running current |

---

## 6. Local irrigation test (Step 6)

Field timings make one cycle take 15+ minutes. A **bench profile** compresses
the safety limits so a full cycle is observable in about a minute:

```bash
pio run -e esp32dev_bench -t upload && pio device monitor
```

| Limit | Field | Bench |
| --- | --- | --- |
| Max runtime | 10 min | 20 s |
| Min runtime | 30 s | 3 s |
| Zone cooldown | 5 min | 15 s |
| Timeout lockout | 30 min | 30 s |

> **Never deploy a bench-profile image.** It shortens the maximum-runtime
> safety cut-off. The firmware logs a loud `*** BENCH TIMING BUILD ***` warning
> at boot, and the host test suite is verified to pass under **both** profiles.

**Procedure** — with the pump still dry and valves plumbed to a bucket or open
air:

| # | Test | How | Expected |
| --- | --- | --- | --- |
| 1 | Start on dry soil | Hold S1+S2 in air | `IDLE → CHECKING_SOIL → IRRIGATION_REQUIRED → STARTING → IRRIGATING`, zone 1 valve opens **before** the pump starts |
| 2 | Valve-before-pump | Watch the 2 s settle | Valve open, pump still off during `STARTING` |
| 3 | **Hysteresis** | Wet the probes to just above the 35% start threshold | Irrigation **continues** — it must not stop until 55% |
| 4 | Normal stop | Wet to above 55% | `STOPPING → IDLE`, pump cut first, then valve after spin-down |
| 5 | Minimum runtime | Wet immediately after start | Pump keeps running to the minimum, no 1-second burst |
| 6 | **Cooldown** | Return probes to air right after a stop | No restart until the cooldown expires |
| 7 | **Max runtime** | Keep probes in air and let it run | `TIMEOUT` at the limit, pump cut, zone locked out |
| 8 | Zone independence | Dry zone 2 only | Zone 2 irrigates alone; zone 1 valve stays shut |
| 9 | Both dry | Dry all four | **Driest zone first**, one at a time, never both valves |
| 10 | **Invalid sensor** | Unplug both zone-1 probes mid-run | Pump stops immediately, `SENSOR_ERROR` event |
| 11 | All sensors invalid | Unplug all four | `SENSOR_ERROR` state, everything off |
| 12 | Recovery | Reconnect | Returns to `IDLE` after 3 consecutive good reads |

---

## 7. Telemetry test (Step 7)

1. Start the backend on a machine on the same LAN:
   ```bash
   cd backend && HYDRAX_DEVICE_KEY=your-secret npm start
   ```
2. Fill in `firmware/src/config/secrets.h` — `kBackendBaseUrl` must be the
   backend host's **LAN IP**, not `localhost`, and `kDeviceKey` must match.
3. Flash `esp32dev` (**not** `_sim`, **not** `_bench`) and open the dashboard.

**Verify:**

- The device appears with its real `device_id`.
- **`simulated` is `false`** and the dashboard shows **no** "SIMULATED DATA"
  badge. That badge appearing here means you flashed the wrong environment.
- Moisture values track the physical probes in real time.
- Irrigation events appear in *Recent events* as they happen.
- Stop the backend → the ESP32 logs failed POSTs and keeps irrigating.
  Restart it → buffered telemetry flushes.

> Run the mock device **only** against a separate `device_id`, never as a stand-in
> for this test.

---

## 8. Offline-first verification (Step 8)

**The most important test in this phase.**

| # | Action | Expected |
| --- | --- | --- |
| 1 | Start irrigation on zone 1 with telemetry flowing | Dashboard live, pump running |
| 2 | **Power off the Wi-Fi access point** mid-run | — |
| 3 | Watch the serial log | `[WARN][wifi] Wi-Fi disconnected - irrigation continues locally` |
| 4 | Observe the pump and valve | **Both keep operating.** No pause, no stall. |
| 5 | Watch state transitions | The control loop keeps ticking at 1 Hz — `IRRIGATING` continues, thresholds still evaluated |
| 6 | Let the run finish while still offline | Normal `STOPPING → IDLE` on the stop threshold, entirely locally |
| 7 | Trigger a timeout while offline | Pump still cut at the limit — the safety cut-off does not depend on the network |
| 8 | Restore the access point | Reconnect with exponential backoff; buffered telemetry flushes |
| 9 | Check the dashboard | Device returns online; the offline alert clears automatically |

**Why it works:** `IrrigationController` depends only on `SensorArray`,
`IIrrigationHardware` and `IClock`. It holds no reference to Wi-Fi or HTTP. All
network I/O runs on a FreeRTOS task pinned to core 0, while the control loop
runs on core 1 — the control path has no code path that can block on the radio.

---

## 9. Test results

> **PASS is recorded only for tests actually executed.** Everything requiring
> physical hardware is `NOT PERFORMED` because no board was available.

| Test | Result | Evidence |
| --- | --- | --- |
| **ESP32 build** (`pio run -e esp32dev`) | **PASS** | Xtensa GCC 8.4.0, Arduino-ESP32 3.20017. RAM 15.8% (51 812 B), Flash 71.7% (939 489 B) |
| ESP32 sim build (`esp32dev_sim`) | **PASS** | RAM 15.8%, Flash 71.3% |
| ESP32 bench build (`esp32dev_bench`) | **PASS** | RAM 15.8%, Flash 71.7% |
| Commissioning build (`esp32dev_commission`) | **PASS** | RAM 6.7%, Flash 23.1% |
| Host core tests — field timings | **PASS** | 50 tests, 1082 assertions |
| Host core tests — bench timings | **PASS** | 50 tests, 962 assertions |
| Backend tests | **PASS** | 65 tests |
| Sensor 1 | **NOT PERFORMED** | No hardware |
| Sensor 2 | **NOT PERFORMED** | No hardware |
| Sensor 3 | **NOT PERFORMED** | No hardware |
| Sensor 4 | **NOT PERFORMED** | No hardware |
| Valve 1 | **NOT PERFORMED** | No hardware |
| Valve 2 | **NOT PERFORMED** | No hardware |
| Pump | **NOT PERFORMED** | No hardware |
| Local irrigation (real sensors/actuators) | **NOT PERFORMED** | No hardware |
| Telemetry from real hardware | **NOT PERFORMED** | No hardware |
| Offline operation on hardware | **NOT PERFORMED** | No hardware |
| Field calibration | **NOT PERFORMED** | Requires probes and soil |

### Recording your results

Replace `NOT PERFORMED` with `PASS` or `FAIL` **only** after running the
procedure, and note what you observed — a bare PASS with no evidence is worth
very little six months later.

---

## 10. Current milestone

The honest description of where this project stands once the hardware steps
above are completed:

> A working edge-controlled irrigation prototype using real sensors and
> actuators, with real telemetry and dashboard monitoring.

Claims that must **not** be made yet, because the experiments do not exist:

- ❌ "Accurate soil moisture measurement" — the scale is *relative*, calibrated
  between air and water. Absolute volumetric water content needs gravimetric
  calibration against actual soil.
- ❌ "Predictive pump failure" / "RUL"
- ❌ "AI-powered irrigation"
- ❌ "Leak localization"
- ❌ "Production-ready" — not until the hardware tests above are green and the
  system has run unattended across a real irrigation season.
