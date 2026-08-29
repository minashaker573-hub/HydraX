#include "core/telemetry.h"

#include <cstdarg>
#include <cstdio>
#include <cstring>

namespace hydrax {
namespace {

// Minimal bounded JSON writer. Tracks overflow instead of truncating silently,
// so a payload is either complete or explicitly rejected.
class JsonWriter {
   public:
    JsonWriter(char* out, size_t size) : out_(out), size_(size) {
        if (size_ > 0) out_[0] = '\0';
    }

    void append(const char* fmt, ...) {
        if (overflow_) return;
        va_list args;
        va_start(args, fmt);
        const int written = vsnprintf(out_ + pos_, size_ - pos_, fmt, args);
        va_end(args);
        if (written < 0 || static_cast<size_t>(written) >= size_ - pos_) {
            overflow_ = true;
            return;
        }
        pos_ += static_cast<size_t>(written);
    }

    bool overflow() const { return overflow_; }
    size_t length() const { return pos_; }

   private:
    char* out_;
    size_t size_;
    size_t pos_    = 0;
    bool overflow_ = false;
};

}  // namespace

TelemetrySnapshot captureTelemetry(const SensorArray& sensors,
                                   const IrrigationController& controller,
                                   const IIrrigationHardware& hardware, uint32_t uptimeMs,
                                   bool simulated, bool wifiConnected, int32_t wifiRssi,
                                   const char* deviceTimeIso) {
    TelemetrySnapshot snap;
    snap.deviceId        = config::kDeviceId;
    snap.firmwareVersion = config::kFirmwareVersion;
    snap.uptimeMs        = uptimeMs;
    snap.simulated       = simulated;
    snap.wifiConnected   = wifiConnected;
    snap.wifiRssi        = wifiRssi;

    if (deviceTimeIso != nullptr) {
        std::snprintf(snap.deviceTimeIso, sizeof(snap.deviceTimeIso), "%s", deviceTimeIso);
    }

    for (uint8_t i = 0; i < config::kSensorCount; ++i) {
        const SensorReading& r = sensors.reading(i);
        SensorTelemetry& st    = snap.sensors[i];
        st.id      = static_cast<uint8_t>(i + 1);
        st.zone    = static_cast<uint8_t>(i / config::kSensorsPerZone + 1);
        st.raw     = r.raw;
        st.percent = r.percent;
        st.valid   = r.valid;
        st.status  = sensorStatusName(r.status);
    }

    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        const ZoneMoisture zm = sensors.zone(z);
        ZoneTelemetry& zt     = snap.zones[z];
        for (uint8_t s = 0; s < config::kSensorsPerZone; ++s) {
            zt.sensorPercent[s] = sensors.reading(SensorArray::sensorIndexFor(z, s)).percent;
        }
        zt.average      = zm.average;
        zt.validSensors = zm.validCount;
        zt.valveOpen    = hardware.isZoneOpen(z);
    }

    snap.pumpOn           = hardware.isPumpOn();
    snap.irrigationState  = irrigationStateName(controller.state());
    snap.controllerStatus = controllerStatusName(controller.status());
    snap.runMs            = controller.currentRunMs();

    const uint8_t active = controller.activeZone();
    snap.activeZone      = (active == kNoZone) ? -1 : static_cast<int8_t>(active + 1);

    return snap;
}

int serializeTelemetry(const TelemetrySnapshot& snapshot, char* out, size_t outSize) {
    if (out == nullptr || outSize == 0) return -1;
    JsonWriter w(out, outSize);

    w.append("{\"device_id\":\"%s\",\"firmware\":\"%s\",\"uptime_ms\":%lu",
             snapshot.deviceId, snapshot.firmwareVersion,
             static_cast<unsigned long>(snapshot.uptimeMs));

    if (snapshot.deviceTimeIso[0] != '\0') {
        w.append(",\"device_time\":\"%s\"", snapshot.deviceTimeIso);
    } else {
        w.append(",\"device_time\":null");
    }

    w.append(",\"simulated\":%s", snapshot.simulated ? "true" : "false");

    // --- soil ------------------------------------------------------------
    w.append(",\"soil\":{");
    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        const ZoneTelemetry& zt = snapshot.zones[z];
        w.append("%s\"zone_%u\":{", (z == 0 ? "" : ","), static_cast<unsigned>(z + 1));
        for (uint8_t s = 0; s < config::kSensorsPerZone; ++s) {
            w.append("%s\"sensor_%u\":%.1f", (s == 0 ? "" : ","), static_cast<unsigned>(s + 1),
                     static_cast<double>(zt.sensorPercent[s]));
        }
        w.append(",\"average\":%.1f,\"valid_sensors\":%u}", static_cast<double>(zt.average),
                 static_cast<unsigned>(zt.validSensors));
    }
    w.append("}");

    // --- actuators -------------------------------------------------------
    w.append(",\"actuators\":{\"pump\":%s", snapshot.pumpOn ? "true" : "false");
    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        w.append(",\"zone_%u_valve\":%s", static_cast<unsigned>(z + 1),
                 snapshot.zones[z].valveOpen ? "true" : "false");
    }
    w.append("}");

    // --- irrigation ------------------------------------------------------
    w.append(",\"irrigation\":{\"state\":\"%s\",\"run_ms\":%lu,\"active_zone\":",
             snapshot.irrigationState, static_cast<unsigned long>(snapshot.runMs));
    if (snapshot.activeZone < 0) {
        w.append("null}");
    } else {
        w.append("%d}", static_cast<int>(snapshot.activeZone));
    }

    // --- controller / link -----------------------------------------------
    w.append(",\"controller\":{\"status\":\"%s\"}", snapshot.controllerStatus);
    w.append(",\"network\":{\"wifi_connected\":%s,\"rssi\":%ld}",
             snapshot.wifiConnected ? "true" : "false", static_cast<long>(snapshot.wifiRssi));

    // --- per-sensor detail ------------------------------------------------
    w.append(",\"sensors\":[");
    for (uint8_t i = 0; i < config::kSensorCount; ++i) {
        const SensorTelemetry& st = snapshot.sensors[i];
        w.append(
            "%s{\"id\":%u,\"zone\":%u,\"raw\":%d,\"percent\":%.1f,\"valid\":%s,\"status\":\"%s\"}",
            (i == 0 ? "" : ","), static_cast<unsigned>(st.id), static_cast<unsigned>(st.zone),
            st.raw, static_cast<double>(st.percent), st.valid ? "true" : "false", st.status);
    }
    w.append("]}");

    if (w.overflow()) {
        out[0] = '\0';
        return -1;
    }
    return static_cast<int>(w.length());
}

}  // namespace hydrax
