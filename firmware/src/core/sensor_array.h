// HYDRAX - the farm's sensor set.
//
// Owns one SoilMoistureSensor per physical probe and maps them onto zones.
// Pulls raw counts from an IAnalogSource, so the same object serves real
// hardware and simulation unchanged.
#pragma once

#include <cstdint>

#include "config/hydrax_config.h"
#include "core/moisture.h"
#include "core/zone.h"
#include "hal/analog_source.h"

namespace hydrax {

class SensorArray {
   public:
    void begin(IAnalogSource* source);

    // Acquires one reading from every sensor. Cheap and non-blocking from the
    // control loop's perspective; any burst sampling happens inside the
    // IAnalogSource implementation where the hardware timing belongs.
    void update();

    void reset();

    const SensorReading& reading(uint8_t sensorIndex) const;

    // Aggregated moisture for a 0-based zone id.
    ZoneMoisture zone(uint8_t zoneId) const;

    // Sensor index of the n-th sensor within a zone (both 0-based).
    static uint8_t sensorIndexFor(uint8_t zoneId, uint8_t slot) {
        return static_cast<uint8_t>(zoneId * config::kSensorsPerZone + slot);
    }

    // True when no sensor in the array is producing valid data.
    bool allSensorsInvalid() const;

   private:
    IAnalogSource* source_ = nullptr;
    SoilMoistureSensor sensors_[config::kSensorCount];
    SensorReading readings_[config::kSensorCount];
    SensorReading invalid_{};
};

}  // namespace hydrax
