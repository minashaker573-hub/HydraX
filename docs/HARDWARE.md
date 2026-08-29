# HYDRAX — Hardware (Phase 1)

## Safety: before you connect anything

This system switches a 12 V pump and solenoid valves — inductive loads with
enough stored energy to destroy an ESP32.

- **Fit a flyback diode** across every solenoid valve, and across any relay
  coil. Firmware cannot protect a GPIO from an inductive kick.
- **Never drive a valve or pump directly from a GPIO.** Use a MOSFET or a relay
  module. ESP32 pins source milliamps; these loads draw amps.
- **Common ground** between the ESP32 supply and the 12 V supply, but power the
  ESP32 from its own regulated 3.3 V/5 V rail. Motor current on a shared rail
  causes brownouts and resets.
- **Size the 12 V supply for the pump's stall current**, not its running
  current.
- **Never let the pump run dry.** The firmware's maximum-runtime cut is a
  backstop, not a dry-run protector.
- Bench-test with the pump **out of the loop** first: verify the valve and pump
  GPIOs behave through a full irrigation cycle before plumbing anything.

---

## Bill of materials

| Qty | Item | Notes |
| --- | --- | --- |
| 1 | ESP32 dev board | Any ESP32-WROOM board with ADC1 pins broken out |
| 4 | Capacitive soil moisture sensor | v1.2 / v2.0 style, 3.3 V |
| 2 | 12 V solenoid valve | One per zone |
| 1 | 12 V DC pump | Sized for the plumbing |
| 3 | MOSFET or relay driver channel | Pump + 2 valves |
| 3 | Flyback diode | e.g. 1N4007, across each inductive load |
| 1 | 12 V supply | Rated above pump stall current |
| 1 | 3.3 V/5 V supply for the ESP32 | Separate rail, common ground |

---

## Pin map

Defined in `firmware/src/config/hydrax_config.h`. **These are provisional —
verify them against your build before flashing.** Nothing else in the firmware
hard-codes a pin.

### Sensors — must be ADC1

| Sensor | Zone | GPIO | ADC channel |
| --- | --- | --- | --- |
| 1 | 1 | 36 (VP) | ADC1_CH0 |
| 2 | 1 | 39 (VN) | ADC1_CH3 |
| 3 | 2 | 34 | ADC1_CH6 |
| 4 | 2 | 35 | ADC1_CH7 |

> **ADC2 is unusable while Wi-Fi is active on the ESP32.** Putting a probe on an
> ADC2 pin produces readings that work perfectly on the bench and break the
> moment telemetry connects. All four sensors are on ADC1 for this reason.
> GPIO34–39 are input-only, which is exactly right for sensors.

### Actuators

| Output | GPIO | Default polarity |
| --- | --- | --- |
| Pump | 26 | Active HIGH |
| Zone 1 valve | 25 | Active HIGH |
| Zone 2 valve | 27 | Active HIGH |

Strapping pins (0, 2, 5, 12, 15) are deliberately avoided, so a driver holding a
line during reset cannot stop the board booting.

**Using an opto-isolated relay board?** Those are usually active-LOW. Set:

```cpp
constexpr bool kPumpActiveLow  = true;
constexpr bool kValveActiveLow = true;
```

Nothing else changes — polarity is handled entirely in the actuator layer.

### Startup behaviour

`Esp32DigitalActuator::begin()` writes the de-energized level **before**
switching the pin to an output, then again afterwards. This ordering prevents a
brief pulse that could kick the pump during boot. `main.cpp` binds and
de-energizes all actuators before sensors, control or networking are touched.

---

## Wiring

```
                    ┌──────────────┐
   3.3V ────────────┤ Soil probe 1 ├──── AOUT ──► GPIO36
                    └──────────────┘
                    (repeat for probes 2/3/4 → GPIO39 / 34 / 35)

                        +12V ──────┬──────────────┐
                                   │              │
                              ┌────┴────┐    ┌────┴────┐
                              │  Pump   │    │ Valve 1 │   (diode across each)
                              └────┬────┘    └────┬────┘
                                   │              │
   GPIO26 ──► [driver] ────────────┘              │
   GPIO25 ──► [driver] ───────────────────────────┘
   GPIO27 ──► [driver] ──► Valve 2

   ESP32 GND ─────────────── 12V supply GND        (common ground)
```

Hydraulically, both zone valves sit **downstream** of the pump. The firmware
guarantees a valve is open before the pump starts and stays open until after it
stops.

---

## Calibration

Capacitive probes vary enough between units that uncalibrated readings are
meaningless. **Calibrate each probe individually.**

### Procedure

1. Flash the firmware and open the serial monitor at 115200.
2. Raise the log level to see raw counts:
   ```cpp
   Log::setLevel(LogLevel::kDebug);   // in setup()
   ```
3. **Dry reference** — hold the probe in open air, clean and dry. Record the
   settled raw count. This is `raw_dry` (higher).
4. **Wet reference** — submerge the probe in water **up to its marked line
   only** (never past the electronics). Record the settled count. This is
   `raw_wet` (lower).
5. Repeat for all four probes.
6. Enter the values in `firmware/src/config/hydrax_config.h`:

```cpp
constexpr SensorCalibration kSensorCalibration[kSensorCount] = {
    {3012, 1284},  // zone 1 / sensor 1
    {2988, 1301},  // zone 1 / sensor 2
    {3040, 1275},  // zone 2 / sensor 1
    {2995, 1290},  // zone 2 / sensor 2
};
```

The dry and wet references must differ by at least `kMinCalibrationSpan` (300
counts). A narrower span is rejected at boot: the sensor reports
`BAD_CALIBRATION` and is excluded from irrigation decisions rather than
producing a meaningless number.

### What the percentage means

```
percent = (raw_dry - raw) / (raw_dry - raw_wet) * 100      clamped to 0..100
```

This is a **relative soil moisture percentage** on a scale between *this probe
in air* and *this probe in water*.

> It is **not** volumetric water content, and must not be reported as such. 0%
> means "as dry as air", 100% means "as wet as free water" — neither
> corresponds to a soil-science measurement. Deriving true VWC requires
> gravimetric calibration against your actual soil, which Phase 1 does not do.

### Tuning the thresholds

The shipped values (`start 35%`, `stop 55%`) are **initial values, not
agronomic recommendations**. They must be tuned per crop and soil type. The
firmware enforces a minimum 5-point band; the backend applies the same rule to
values set through the API.

---

## Signal quality

- Probe leads are high-impedance analog runs. Keep them short, or use shielded
  cable with the shield to ground. The firmware's median-of-5 sampling absorbs
  occasional spikes but cannot fix continuous noise pickup.
- The firmware flags a raw count outside `[150, 4000]` as an electrical fault
  rather than as very dry or very wet soil: a disconnected probe floats near a
  rail, a shorted one reads near zero. Neither is soil data.
- A probe must fail 3 consecutive readings to be latched out, and deliver 3
  consecutive good readings to be trusted again. That hysteresis stops a loose
  connector bouncing the controller in and out of fault.

---

## Testing without hardware

Two options, both running the **real** control logic:

```bash
# Host: full core test suite, simulated sensors and actuators
cd firmware
g++ -std=c++17 -I src -o hydrax_tests test/test_core/main.cpp src/core/*.cpp
./hydrax_tests

# On the board: real firmware, synthetic sensor data, no probes attached
pio run -e esp32dev_sim -t upload
```

The simulation build swaps `Esp32AnalogSource` for `SimulatedAnalogSource`
behind the `IAnalogSource` interface. The irrigation controller cannot tell the
difference — which is the point. Telemetry from that build is tagged
`simulated: true` and the dashboard labels it accordingly.
