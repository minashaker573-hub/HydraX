// HYDRAX - hardware commissioning console.
//
// A separate firmware image used ONLY for bench bring-up (Phase 1A steps 3-5).
// It reuses the production sensor and actuator layers unchanged - it does not
// reimplement any of them - and adds an interactive serial console so each
// piece of hardware can be verified in isolation before the irrigation state
// machine is trusted with it.
//
// Build:   pio run -e esp32dev_commission -t upload
// Monitor: pio device monitor
//
// SAFETY PROPERTIES OF THIS TOOL:
//   * every actuator is driven OFF before anything else runs;
//   * manual pump/valve commands go through IrrigationHardware, so the
//     deadhead guard and one-zone-at-a-time rule still apply;
//   * any manually energized output switches itself off after
//     kManualTimeoutMs, so a forgotten command cannot leave a pump running.
//
// This image contains NO irrigation logic. It never decides to water anything.

#include <Arduino.h>

#include "config/hydrax_config.h"
#include "core/irrigation_hardware.h"
#include "core/log.h"
#include "core/moisture.h"
#include "core/sensor_array.h"
#include "hal/esp32_analog_source.h"
#include "hal/esp32_clock.h"
#include "hal/esp32_digital_actuator.h"

namespace {

using namespace hydrax;

// A manually energized output is cut after this long with no further command.
constexpr uint32_t kManualTimeoutMs = 30u * 1000u;
constexpr uint32_t kStreamIntervalMs = 1000;
constexpr size_t kLineBufferSize = 32;

Esp32Clock g_clock;
Esp32AnalogSource g_analog;
Esp32DigitalActuator g_pump;
Esp32DigitalActuator g_valves[config::kZoneCount];
IDigitalActuator* g_valvePtrs[config::kZoneCount];

IrrigationHardware g_hardware;
SensorArray g_sensors;

bool g_streaming = false;
uint32_t g_lastStreamMs = 0;
uint32_t g_lastActuatorCommandMs = 0;
bool g_manualActive = false;

char g_line[kLineBufferSize];
size_t g_lineLength = 0;

// Captured calibration references, seeded from the compiled-in config.
int g_dryRef[config::kSensorCount];
int g_wetRef[config::kSensorCount];

void serialLogSink(LogLevel level, const char* tag, const char* message) {
    Serial.printf("[%7lu][%s][%s] %s\n", static_cast<unsigned long>(millis()),
                  logLevelName(level), tag, message);
}

void printBanner() {
    Serial.println();
    Serial.println(F("======================================================="));
    Serial.println(F(" HYDRAX - HARDWARE COMMISSIONING CONSOLE"));
    Serial.println(F("======================================================="));
    Serial.printf(" firmware : %s\n", config::kFirmwareVersion);
    Serial.printf(" device   : %s\n", config::kDeviceId);
    Serial.println();
    Serial.println(F(" SAFETY"));
    Serial.println(F("  * Keep the pump OUT of the water loop until valves"));
    Serial.println(F("    have been verified."));
    Serial.println(F("  * Never drive a valve or pump from a GPIO directly."));
    Serial.println(F("  * Fit a flyback diode across every inductive load."));
    Serial.printf("  * Manual outputs auto-OFF after %lu s.\n",
                  static_cast<unsigned long>(kManualTimeoutMs / 1000));
    Serial.println();
    Serial.println(F(" Type 'h' for the command list."));
    Serial.println(F("======================================================="));
    Serial.println();
}

void printHelp() {
    Serial.println(F("\n--- commands ---------------------------------------"));
    Serial.println(F(" h        this help"));
    Serial.println(F(" p        pin map"));
    Serial.println(F(" r        raw ADC counts for all sensors"));
    Serial.println(F(" s        one sensor + zone readout"));
    Serial.println(F(" S        toggle continuous readout (1 Hz)"));
    Serial.println(F(" c        show calibration references"));
    Serial.println(F(" d<n>     capture DRY reference for sensor n (1-4)"));
    Serial.println(F(" w<n>     capture WET reference for sensor n (1-4)"));
    Serial.println(F(" k        print calibration block to paste into config"));
    Serial.println(F(" a        actuator state"));
    Serial.println(F(" 1o / 1c  zone 1 valve open / close"));
    Serial.println(F(" 2o / 2c  zone 2 valve open / close"));
    Serial.println(F(" po / pf  pump on / off  (refused with no valve open)"));
    Serial.println(F(" t        guided actuator self-test (valve1, valve2, pump)"));
    Serial.println(F(" x        stopAllIrrigation() - everything OFF"));
    Serial.println(F("-----------------------------------------------------\n"));
}

void printPinMap() {
    Serial.println(F("\n--- pin map (from config/hydrax_config.h) -----------"));
    for (uint8_t i = 0; i < config::kSensorCount; ++i) {
        Serial.printf(" sensor %u (zone %u) : GPIO%d  [ADC1, input-only]\n",
                      static_cast<unsigned>(i + 1),
                      static_cast<unsigned>(i / config::kSensorsPerZone + 1),
                      config::kSensorAdcPin[i]);
    }
    Serial.printf(" pump             : GPIO%d  active %s\n", config::kPumpPin,
                  config::kPumpActiveLow ? "LOW" : "HIGH");
    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        Serial.printf(" zone %u valve      : GPIO%d  active %s\n",
                      static_cast<unsigned>(z + 1), config::kZoneValvePin[z],
                      config::kValveActiveLow ? "LOW" : "HIGH");
    }
    Serial.println(F("-----------------------------------------------------\n"));
}

void printRaw() {
    Serial.println(F("\n--- raw ADC ------------------------------------------"));
    for (uint8_t i = 0; i < config::kSensorCount; ++i) {
        const int raw = g_analog.readRaw(i);
        const bool inRange = raw >= config::kRawValidMin && raw <= config::kRawValidMax;
        Serial.printf(" sensor %u  GPIO%-2d  raw=%4d  %s\n", static_cast<unsigned>(i + 1),
                      config::kSensorAdcPin[i], raw,
                      inRange ? "in range" : "OUT OF RANGE (check wiring)");
    }
    Serial.println(F("------------------------------------------------------\n"));
}

// The commissioning readout required by Phase 1A step 4.
void printReadout() {
    g_sensors.update();

    Serial.println();
    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        const ZoneMoisture zm = g_sensors.zone(z);
        Serial.printf("Zone %u:\n", static_cast<unsigned>(z + 1));

        for (uint8_t s = 0; s < config::kSensorsPerZone; ++s) {
            const uint8_t index    = SensorArray::sensorIndexFor(z, s);
            const SensorReading& r = g_sensors.reading(index);
            if (r.valid) {
                Serial.printf("  S%u = %.1f%%   (raw %4d)\n", static_cast<unsigned>(index + 1),
                              static_cast<double>(r.percent), r.raw);
            } else {
                Serial.printf("  S%u = INVALID  (raw %4d, %s)\n", static_cast<unsigned>(index + 1),
                              r.raw, sensorStatusName(r.status));
            }
        }

        if (zm.validCount == 0) {
            Serial.println(F("  Average = UNAVAILABLE (no valid probe)"));
        } else {
            Serial.printf("  Average = %.1f%%  (%u/%u probes valid)%s\n",
                          static_cast<double>(zm.average), static_cast<unsigned>(zm.validCount),
                          static_cast<unsigned>(config::kSensorsPerZone),
                          zm.degraded ? "  [DEGRADED]" : "");
        }
        Serial.println();
    }
    Serial.println(F("  (relative soil moisture - NOT volumetric water content)"));
    Serial.println();
}

void printCalibration() {
    Serial.println(F("\n--- calibration references ---------------------------"));
    for (uint8_t i = 0; i < config::kSensorCount; ++i) {
        const int span = g_dryRef[i] - g_wetRef[i];
        Serial.printf(" sensor %u  dry=%4d  wet=%4d  span=%4d  %s\n",
                      static_cast<unsigned>(i + 1), g_dryRef[i], g_wetRef[i], span,
                      span >= config::kMinCalibrationSpan ? "ok" : "TOO NARROW");
    }
    Serial.println(F("------------------------------------------------------\n"));
}

void printCalibrationBlock() {
    Serial.println(F("\n// paste into firmware/src/config/hydrax_config.h"));
    Serial.println(F("constexpr SensorCalibration kSensorCalibration[kSensorCount] = {"));
    for (uint8_t i = 0; i < config::kSensorCount; ++i) {
        Serial.printf("    {%4d, %4d},  // zone %u / sensor %u\n", g_dryRef[i], g_wetRef[i],
                      static_cast<unsigned>(i / config::kSensorsPerZone + 1),
                      static_cast<unsigned>(i % config::kSensorsPerZone + 1));
    }
    Serial.println(F("};\n"));
}

/** Averages a burst of reads so a reference is not taken from one sample. */
int captureReference(uint8_t sensorIndex) {
    constexpr int kCaptureSamples = 20;
    long total = 0;
    int taken  = 0;
    for (int i = 0; i < kCaptureSamples; ++i) {
        const int raw = g_analog.readRaw(sensorIndex);
        if (raw >= 0) {
            total += raw;
            ++taken;
        }
        delay(50);
    }
    return taken == 0 ? -1 : static_cast<int>(total / taken);
}

void printActuators() {
    Serial.println(F("\n--- actuator state -----------------------------------"));
    Serial.printf(" pump          : %s\n", g_hardware.isPumpOn() ? "ON" : "off");
    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        Serial.printf(" zone %u valve   : %s\n", static_cast<unsigned>(z + 1),
                      g_hardware.isZoneOpen(z) ? "OPEN" : "closed");
    }
    Serial.printf(" open zones    : %u\n", static_cast<unsigned>(g_hardware.openZoneCount()));
    Serial.println(F("------------------------------------------------------\n"));
}

void noteManualCommand() {
    g_lastActuatorCommandMs = millis();
    g_manualActive          = true;
}

/** Guided sequence for Phase 1A step 5, in the required order. */
void runActuatorSelfTest() {
    Serial.println(F("\n=== actuator self-test ==============================="));
    Serial.println(F("Watch/listen for each actuator. Pump is tested LAST and"));
    Serial.println(F("only with a valve already open."));

    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        Serial.printf("\n[%u/3] zone %u valve -> OPEN for 3 s\n", static_cast<unsigned>(z + 1),
                      static_cast<unsigned>(z + 1));
        if (!g_hardware.openZone(z)) {
            Serial.println(F("  FAILED to open - check driver wiring"));
            continue;
        }
        delay(3000);
        Serial.println(F("  -> CLOSE"));
        if (!g_hardware.closeZone(z)) Serial.println(F("  FAILED to close"));
        delay(1000);
    }

    Serial.println(F("\n[3/3] pump test"));
    Serial.println(F("  first: verify the deadhead guard refuses with all valves shut"));
    if (g_hardware.startPump()) {
        Serial.println(F("  *** GUARD FAILED: pump started with no valve open ***"));
        g_hardware.stopAllIrrigation();
    } else {
        Serial.println(F("  guard OK - pump refused, as designed"));
    }

    Serial.println(F("  now: open zone 1, run pump 3 s"));
    if (!g_hardware.openZone(0)) {
        Serial.println(F("  could not open zone 1 - aborting pump test"));
    } else {
        delay(config::kValveSettleMs);
        if (!g_hardware.startPump()) {
            Serial.println(F("  FAILED to start pump - check driver wiring"));
        } else {
            delay(3000);
            g_hardware.stopPump();
            delay(config::kPumpSpindownMs);
        }
        g_hardware.closeZone(0);
    }

    g_hardware.stopAllIrrigation();
    Serial.println(F("\nself-test complete - all outputs OFF"));
    Serial.println(F("======================================================\n"));
}

void handleCommand(const char* cmd) {
    if (cmd[0] == '\0') return;

    // --- sensors ---------------------------------------------------------
    if (strcmp(cmd, "h") == 0 || strcmp(cmd, "?") == 0) {
        printHelp();
    } else if (strcmp(cmd, "p") == 0) {
        printPinMap();
    } else if (strcmp(cmd, "r") == 0) {
        printRaw();
    } else if (strcmp(cmd, "s") == 0) {
        printReadout();
    } else if (strcmp(cmd, "S") == 0) {
        g_streaming = !g_streaming;
        Serial.printf("continuous readout %s\n", g_streaming ? "ON" : "OFF");
    } else if (strcmp(cmd, "c") == 0) {
        printCalibration();
    } else if (strcmp(cmd, "k") == 0) {
        printCalibrationBlock();

        // --- calibration capture -----------------------------------------
    } else if ((cmd[0] == 'd' || cmd[0] == 'w') && cmd[1] >= '1' &&
               cmd[1] <= ('0' + config::kSensorCount) && cmd[2] == '\0') {
        const uint8_t index = static_cast<uint8_t>(cmd[1] - '1');
        const bool dry      = (cmd[0] == 'd');
        Serial.printf("capturing %s reference for sensor %u (1 s)...\n", dry ? "DRY" : "WET",
                      static_cast<unsigned>(index + 1));
        const int value = captureReference(index);
        if (value < 0) {
            Serial.println(F("  capture failed - no valid reads"));
            return;
        }
        if (dry) {
            g_dryRef[index] = value;
        } else {
            g_wetRef[index] = value;
        }
        Serial.printf("  sensor %u %s = %d\n", static_cast<unsigned>(index + 1),
                      dry ? "dry" : "wet", value);
        const int span = g_dryRef[index] - g_wetRef[index];
        if (span < config::kMinCalibrationSpan) {
            Serial.printf("  WARNING: span %d is below the %d minimum - readings from this\n",
                          span, config::kMinCalibrationSpan);
            Serial.println(F("  probe will be rejected as BAD_CALIBRATION."));
        }

        // --- actuators ----------------------------------------------------
    } else if (strcmp(cmd, "a") == 0) {
        printActuators();
    } else if (strcmp(cmd, "1o") == 0) {
        Serial.println(g_hardware.openZone(0) ? "zone 1 valve OPEN" : "zone 1 open REFUSED");
        noteManualCommand();
    } else if (strcmp(cmd, "1c") == 0) {
        Serial.println(g_hardware.closeZone(0) ? "zone 1 valve closed" : "zone 1 close FAILED");
    } else if (strcmp(cmd, "2o") == 0) {
        Serial.println(g_hardware.openZone(1) ? "zone 2 valve OPEN" : "zone 2 open REFUSED");
        noteManualCommand();
    } else if (strcmp(cmd, "2c") == 0) {
        Serial.println(g_hardware.closeZone(1) ? "zone 2 valve closed" : "zone 2 close FAILED");
    } else if (strcmp(cmd, "po") == 0) {
        if (g_hardware.startPump()) {
            Serial.println(F("pump ON"));
            noteManualCommand();
        } else {
            Serial.println(F("pump REFUSED (open a zone valve first - deadhead guard)"));
        }
    } else if (strcmp(cmd, "pf") == 0) {
        Serial.println(g_hardware.stopPump() ? "pump off" : "pump stop FAILED");
    } else if (strcmp(cmd, "t") == 0) {
        runActuatorSelfTest();
    } else if (strcmp(cmd, "x") == 0) {
        Serial.println(g_hardware.stopAllIrrigation() ? "ALL OUTPUTS OFF"
                                                     : "stopAllIrrigation reported a failure");
        g_manualActive = false;
    } else {
        Serial.printf("unknown command \"%s\" - type 'h'\n", cmd);
    }
}

void pollSerial() {
    while (Serial.available() > 0) {
        const int c = Serial.read();
        if (c == '\r') continue;
        if (c == '\n') {
            g_line[g_lineLength] = '\0';
            handleCommand(g_line);
            g_lineLength = 0;
            continue;
        }
        if (g_lineLength + 1 < kLineBufferSize) {
            g_line[g_lineLength++] = static_cast<char>(c);
        }
    }
}

/** Cuts anything left energized by a manual command. */
void enforceManualTimeout() {
    if (!g_manualActive) return;
    if (!g_hardware.isPumpOn() && g_hardware.openZoneCount() == 0) {
        g_manualActive = false;
        return;
    }
    if (millis() - g_lastActuatorCommandMs < kManualTimeoutMs) return;

    Serial.println(F("\n*** manual timeout - forcing all outputs OFF ***\n"));
    g_hardware.stopAllIrrigation();
    g_manualActive = false;
}

}  // namespace

void setup() {
    Serial.begin(115200);
    delay(300);

    Log::setSink(&serialLogSink);
    Log::setLevel(LogLevel::kDebug);

    // Actuators first, de-energized, exactly as the production image does.
    g_pump.begin(config::kPumpPin, config::kPumpActiveLow, "pump");
    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        g_valves[z].begin(config::kZoneValvePin[z], config::kValveActiveLow, "valve");
        g_valvePtrs[z] = &g_valves[z];
    }
    g_hardware.begin(&g_pump, g_valvePtrs, config::kZoneCount);
    g_hardware.applySafeStartupState();

    g_analog.begin();
    g_sensors.begin(&g_analog);

    for (uint8_t i = 0; i < config::kSensorCount; ++i) {
        g_dryRef[i] = config::kSensorCalibration[i].raw_dry;
        g_wetRef[i] = config::kSensorCalibration[i].raw_wet;
    }

    printBanner();
    printPinMap();
    printActuators();
}

void loop() {
    pollSerial();
    enforceManualTimeout();

    if (g_streaming && millis() - g_lastStreamMs >= kStreamIntervalMs) {
        g_lastStreamMs = millis();
        printReadout();
    }

    delay(20);
}
