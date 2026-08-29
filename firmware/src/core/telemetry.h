// HYDRAX - telemetry model.
//
// Split deliberately in two:
//   * TelemetrySnapshot  - a plain data capture of "what the system is right now"
//   * serializeTelemetry - turns that capture into the wire format (JSON)
//
// Neither half touches the network. Telemetry is an observation of the control
// system, never an input to it.
//
// TIME: the ESP32 has no guaranteed real-time clock and must keep working with
// no Internet, so the device reports `uptime_ms` as its authoritative clock and
// an ISO-8601 `device_time` only when NTP has actually synced. The backend
// stamps its own `received_at` on arrival and treats that as the timeline.
#pragma once

#include <cstddef>
#include <cstdint>

#include "config/hydrax_config.h"
#include "core/irrigation_controller.h"
#include "core/sensor_array.h"

namespace hydrax {

struct SensorTelemetry {
    uint8_t id          = 0;  // 1-based, matches the physical label
    uint8_t zone        = 0;  // 1-based
    int raw             = -1;
    float percent       = 0.0f;
    bool valid          = false;
    const char* status  = "FAULTED";
};

struct ZoneTelemetry {
    float sensorPercent[config::kSensorsPerZone]{};
    float average        = 0.0f;
    uint8_t validSensors = 0;
    bool valveOpen       = false;
};

struct TelemetrySnapshot {
    const char* deviceId        = config::kDeviceId;
    const char* firmwareVersion = config::kFirmwareVersion;
    uint32_t uptimeMs           = 0;

    // Empty string when the clock has never been synced.
    char deviceTimeIso[32] = {0};

    // True when readings came from a simulated source rather than real probes.
    // The dashboard surfaces this so simulated values are never mistaken for
    // field data.
    bool simulated = false;

    SensorTelemetry sensors[config::kSensorCount];
    ZoneTelemetry zones[config::kZoneCount];

    bool pumpOn                  = false;
    const char* irrigationState  = "IDLE";
    int8_t activeZone            = -1;  // 1-based, or -1 when none
    uint32_t runMs               = 0;
    const char* controllerStatus = "OK";

    bool wifiConnected = false;
    int32_t wifiRssi   = 0;
};

// Captures the current system state. Reads only; changes nothing.
TelemetrySnapshot captureTelemetry(const SensorArray& sensors,
                                   const IrrigationController& controller,
                                   const IIrrigationHardware& hardware, uint32_t uptimeMs,
                                   bool simulated, bool wifiConnected, int32_t wifiRssi,
                                   const char* deviceTimeIso);

// Writes the JSON body into `out`. Returns the number of bytes written, or -1
// if the buffer was too small (in which case `out` is left as an empty string).
int serializeTelemetry(const TelemetrySnapshot& snapshot, char* out, size_t outSize);

// Suggested buffer size for serializeTelemetry with the Phase 1 topology.
constexpr size_t kTelemetryBufferSize = 1280;

}  // namespace hydrax
