// HYDRAX - soil moisture sensor model.
//
// Pure logic: raw ADC counts in, validated + calibrated + filtered relative
// moisture out. Knows nothing about GPIO, ADC peripherals or timing.
//
// TERMINOLOGY: the value produced here is a RELATIVE SOIL MOISTURE PERCENTAGE,
// linearly interpolated between a per-sensor dry-air reference and a
// submerged-in-water reference. It is NOT volumetric water content.
#pragma once

#include <cstddef>
#include <cstdint>

#include "config/hydrax_config.h"

namespace hydrax {

enum class SensorStatus : uint8_t {
    kOk = 0,
    kDriverError,      // the ADC read itself failed
    kOutOfRange,       // raw count outside the plausible electrical band
    kBadCalibration,   // dry/wet references too close together to be usable
    kFaulted,          // repeated failures; sensor is latched out
};

const char* sensorStatusName(SensorStatus status);

struct SensorReading {
    bool valid            = false;
    int raw               = -1;
    float rawPercent      = 0.0f;  // calibrated, unfiltered
    float percent         = 0.0f;  // calibrated + EMA filtered
    SensorStatus status   = SensorStatus::kFaulted;
};

// Median of a small sample buffer. Rejects single-sample spikes, which are
// common on long unshielded probe leads. The buffer is modified (sorted).
int medianInPlace(int* samples, size_t count);

// Converts a raw ADC count to relative moisture percent, clamped to [0, 100].
// Capacitive probes read HIGH when dry, so the mapping is inverted.
float rawToRelativePercent(int raw, const config::SensorCalibration& cal);

class SoilMoistureSensor {
   public:
    SoilMoistureSensor() = default;
    void begin(uint8_t index, const config::SensorCalibration& cal);

    // Feeds one acquired raw count (already median-filtered by the caller).
    // Pass a negative value to signal a driver-level read failure.
    SensorReading update(int raw);

    // Drops filter state and fault counters. Used on controller reset.
    void reset();

    uint8_t index() const { return index_; }
    const SensorReading& last() const { return last_; }
    bool isFaulted() const { return consecutiveInvalid_ >= config::kSensorFaultThreshold; }

   private:
    uint8_t index_ = 0;
    config::SensorCalibration cal_{0, 0};
    bool calibrationUsable_ = false;

    bool hasFilterState_ = false;
    float filtered_      = 0.0f;

    uint8_t consecutiveInvalid_ = 0;
    uint8_t consecutiveValid_   = 0;

    SensorReading last_{};
};

}  // namespace hydrax
