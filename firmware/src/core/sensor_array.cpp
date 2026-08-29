#include "core/sensor_array.h"

#include "core/log.h"

namespace hydrax {
namespace {
constexpr const char* kTag = "sensor";
}

void SensorArray::begin(IAnalogSource* source) {
    source_ = source;
    for (uint8_t i = 0; i < config::kSensorCount; ++i) {
        sensors_[i].begin(i, config::kSensorCalibration[i]);
        readings_[i] = SensorReading{};
    }
}

void SensorArray::reset() {
    for (uint8_t i = 0; i < config::kSensorCount; ++i) {
        sensors_[i].reset();
        readings_[i] = SensorReading{};
    }
}

void SensorArray::update() {
    if (source_ == nullptr) return;
    for (uint8_t i = 0; i < config::kSensorCount; ++i) {
        const int raw   = source_->readRaw(i);
        const bool wasValid = readings_[i].valid;
        readings_[i]    = sensors_[i].update(raw);

        // Log only on edges, never every cycle.
        if (wasValid && !readings_[i].valid) {
            HX_LOG_WARN(kTag, "Sensor %u invalid (%s)", static_cast<unsigned>(i + 1),
                        sensorStatusName(readings_[i].status));
        }
    }
}

const SensorReading& SensorArray::reading(uint8_t sensorIndex) const {
    if (sensorIndex >= config::kSensorCount) return invalid_;
    return readings_[sensorIndex];
}

ZoneMoisture SensorArray::zone(uint8_t zoneId) const {
    if (zoneId >= config::kZoneCount) return ZoneMoisture{};
    return aggregateZone(reading(sensorIndexFor(zoneId, 0)), reading(sensorIndexFor(zoneId, 1)));
}

bool SensorArray::allSensorsInvalid() const {
    for (uint8_t i = 0; i < config::kSensorCount; ++i) {
        if (readings_[i].valid) return false;
    }
    return true;
}

}  // namespace hydrax
