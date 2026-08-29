// HYDRAX / SmartFarm Guardian - Phase 1 entry point.
//
// Composition root: this is the only file that knows which concrete hardware
// implementations exist. Everything below it talks to interfaces.
//
// STARTUP ORDER IS A SAFETY PROPERTY. Actuators are bound and driven to their
// de-energized state before sensors, control or networking are touched, so a
// reset in the middle of an irrigation run cannot leave the pump latched on.
//
// Build with -D HYDRAX_SIMULATE to run the identical control logic against a
// simulated sensor source with no probes attached.

#include <Arduino.h>

#include "config/hydrax_config.h"
#include "core/irrigation_controller.h"
#include "core/irrigation_hardware.h"
#include "core/log.h"
#include "core/sensor_array.h"
#include "core/telemetry.h"
#include "core/wifi_manager.h"
#include "hal/esp32_analog_source.h"
#include "hal/esp32_clock.h"
#include "hal/esp32_digital_actuator.h"
#include "hal/esp32_wifi_radio.h"
#include "net/telemetry_client.h"

#if __has_include("config/secrets.h")
#include "config/secrets.h"
#else
#error "firmware/src/config/secrets.h is missing. Copy secrets.example.h to secrets.h and fill it in."
#endif

namespace {

using namespace hydrax;

// --- hardware ------------------------------------------------------------
Esp32Clock g_clock;
Esp32WifiRadio g_radio;
Esp32DigitalActuator g_pump;
Esp32DigitalActuator g_valves[config::kZoneCount];
IDigitalActuator* g_valvePtrs[config::kZoneCount];

#ifdef HYDRAX_SIMULATE
SimulatedAnalogSource g_analog;
constexpr bool kSimulated = true;
#else
Esp32AnalogSource g_analog;
constexpr bool kSimulated = false;
#endif

// --- application ---------------------------------------------------------
IrrigationHardware g_hardware;
SensorArray g_sensors;
IrrigationController g_controller;
WifiManager g_wifi;
TelemetryClient g_uplink;

uint32_t g_lastTelemetryMs = 0;
bool g_telemetryPrimed     = false;

// --- logging -------------------------------------------------------------
void serialLogSink(LogLevel level, const char* tag, const char* message) {
    Serial.printf("[%7lu][%s][%s] %s\n", static_cast<unsigned long>(millis()),
                  logLevelName(level), tag, message);
}

// Controller events are forwarded to the uplink. This runs inside the control
// loop, so it only enqueues - it never performs I/O.
void onControllerEvent(const ControllerEvent& event, void* /*context*/) {
    g_uplink.queueEvent(event);
}

void publishTelemetry(uint32_t now) {
    const TelemetrySnapshot snapshot =
        captureTelemetry(g_sensors, g_controller, g_hardware, now, kSimulated,
                         g_wifi.isConnected(), g_wifi.rssi(), /*deviceTimeIso=*/"");
    g_uplink.queueTelemetry(snapshot);
}

}  // namespace

void setup() {
    Serial.begin(115200);
    delay(200);  // let the USB CDC settle before the first log line

    Log::setSink(&serialLogSink);
    Log::setLevel(LogLevel::kInfo);
    HX_LOG_INFO("boot", "HYDRAX %s starting (device %s)", config::kFirmwareVersion,
                config::kDeviceId);

    if (config::kBenchTiming) {
        HX_LOG_WARN("boot", "*** BENCH TIMING BUILD - safety limits are compressed ***");
        HX_LOG_WARN("boot", "max run %lus, cooldown %lus. DO NOT DEPLOY THIS IMAGE.",
                    static_cast<unsigned long>(config::kMaxIrrigationMs / 1000),
                    static_cast<unsigned long>(config::kZoneCooldownMs / 1000));
    }

    // 1. ACTUATORS FIRST, DE-ENERGIZED. Nothing else may run before this.
    g_pump.begin(config::kPumpPin, config::kPumpActiveLow, "pump");
    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        g_valves[z].begin(config::kZoneValvePin[z], config::kValveActiveLow, "valve");
        g_valvePtrs[z] = &g_valves[z];
    }
    g_hardware.begin(&g_pump, g_valvePtrs, config::kZoneCount);
    g_hardware.applySafeStartupState();

    // 2. Sensors.
#ifndef HYDRAX_SIMULATE
    g_analog.begin();
#else
    HX_LOG_WARN("boot", "SIMULATION BUILD - readings are synthetic, not field data");
#endif
    g_sensors.begin(&g_analog);

    // 3. Control. From here the state machine owns the actuators.
    g_controller.setEventSink(&onControllerEvent, nullptr);
    g_controller.begin(&g_sensors, &g_hardware, &g_clock);

    // 4. Networking LAST, and entirely optional. Irrigation is already fully
    //    operational at this point; if the radio never associates, nothing
    //    above is affected.
    g_wifi.begin(&g_radio, secrets::kWifiSsid, secrets::kWifiPassword);
    g_uplink.begin(&g_wifi, secrets::kBackendBaseUrl, secrets::kDeviceKey);

    HX_LOG_INFO("boot", "Startup complete - local irrigation control active");
}

void loop() {
    const uint32_t now = millis();

    // The critical path. Never waits on the network: Wi-Fi association and
    // HTTP both live on the pinned uplink task.
    g_controller.tick();

    if (!g_telemetryPrimed || elapsed(now, g_lastTelemetryMs, config::kTelemetryIntervalMs)) {
        publishTelemetry(now);
        g_lastTelemetryMs  = now;
        g_telemetryPrimed  = true;
    }

    // Yield to the scheduler; the control cadence is enforced inside tick().
    delay(50);
}
