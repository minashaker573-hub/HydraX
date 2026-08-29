#include "core/moisture.h"

#include "core/log.h"

namespace hydrax {
namespace {
constexpr const char* kTag = "sensor";

float clampPercent(float value) {
    if (value < 0.0f) return 0.0f;
    if (value > 100.0f) return 100.0f;
    return value;
}
}  // namespace

const char* sensorStatusName(SensorStatus status) {
    switch (status) {
        case SensorStatus::kOk:              return "OK";
        case SensorStatus::kDriverError:     return "DRIVER_ERROR";
        case SensorStatus::kOutOfRange:      return "OUT_OF_RANGE";
        case SensorStatus::kBadCalibration:  return "BAD_CALIBRATION";
        case SensorStatus::kFaulted:         return "FAULTED";
    }
    return "UNKNOWN";
}

int medianInPlace(int* samples, size_t count) {
    if (samples == nullptr || count == 0) return -1;
    // Insertion sort: count is always tiny (kSamplesPerReading).
    for (size_t i = 1; i < count; ++i) {
        const int key = samples[i];
        size_t j      = i;
        while (j > 0 && samples[j - 1] > key) {
            samples[j] = samples[j - 1];
            --j;
        }
        samples[j] = key;
    }
    return samples[count / 2];
}

float rawToRelativePercent(int raw, const config::SensorCalibration& cal) {
    const int span = cal.raw_dry - cal.raw_wet;
    if (span <= 0) return 0.0f;
    // Capacitive probes read HIGH in air and LOW in water, so the scale is
    // inverted: closer to raw_wet means wetter means a higher percentage.
    const float percent = static_cast<float>(cal.raw_dry - raw) * 100.0f / static_cast<float>(span);
    return clampPercent(percent);
}

void SoilMoistureSensor::begin(uint8_t index, const config::SensorCalibration& cal) {
    index_ = index;
    cal_   = cal;
    calibrationUsable_ = (cal.raw_dry - cal.raw_wet) >= config::kMinCalibrationSpan;
    if (!calibrationUsable_) {
        HX_LOG_ERROR(kTag, "Sensor %u calibration unusable (dry=%d wet=%d, need span >= %d)",
                     static_cast<unsigned>(index_), cal.raw_dry, cal.raw_wet,
                     config::kMinCalibrationSpan);
    }
    reset();
}

void SoilMoistureSensor::reset() {
    hasFilterState_     = false;
    filtered_           = 0.0f;
    consecutiveInvalid_ = 0;
    consecutiveValid_   = 0;
    last_               = SensorReading{};
}

SensorReading SoilMoistureSensor::update(int raw) {
    SensorReading reading;
    reading.raw = raw;

    // --- classify the acquisition ---------------------------------------
    SensorStatus status = SensorStatus::kOk;
    if (!calibrationUsable_) {
        status = SensorStatus::kBadCalibration;
    } else if (raw < 0) {
        status = SensorStatus::kDriverError;
    } else if (raw < config::kRawValidMin || raw > config::kRawValidMax) {
        status = SensorStatus::kOutOfRange;
    }

    if (status != SensorStatus::kOk) {
        consecutiveValid_ = 0;
        if (consecutiveInvalid_ < 0xFF) ++consecutiveInvalid_;

        const bool justLatched = (consecutiveInvalid_ == config::kSensorFaultThreshold);
        if (justLatched) {
            HX_LOG_WARN(kTag, "Sensor %u invalid (%s, raw=%d) - latched FAULTED",
                        static_cast<unsigned>(index_), sensorStatusName(status), raw);
        }

        reading.valid  = false;
        reading.status = isFaulted() ? SensorStatus::kFaulted : status;
        // Hold the last good percentage for display purposes only; `valid`
        // being false is what the controller acts on.
        reading.percent    = hasFilterState_ ? filtered_ : 0.0f;
        reading.rawPercent = reading.percent;
        last_              = reading;
        return reading;
    }

    // --- electrically valid: calibrate and filter -------------------------
    const float rawPercent = rawToRelativePercent(raw, cal_);
    if (!hasFilterState_) {
        filtered_       = rawPercent;
        hasFilterState_ = true;
    } else {
        filtered_ = config::kMoistureEmaAlpha * rawPercent +
                    (1.0f - config::kMoistureEmaAlpha) * filtered_;
    }

    const bool wasFaulted = isFaulted();
    if (consecutiveValid_ < 0xFF) ++consecutiveValid_;

    if (wasFaulted && consecutiveValid_ < config::kSensorRecoveryThreshold) {
        // Recovering, but not trusted yet. Keep the sensor out of the
        // irrigation decision until it has been stable for a few cycles.
        reading.valid      = false;
        reading.status     = SensorStatus::kFaulted;
        reading.rawPercent = rawPercent;
        reading.percent    = filtered_;
        last_              = reading;
        return reading;
    }

    if (consecutiveInvalid_ > 0) {
        HX_LOG_INFO(kTag, "Sensor %u recovered (raw=%d, %.1f%%)",
                    static_cast<unsigned>(index_), raw, static_cast<double>(filtered_));
        consecutiveInvalid_ = 0;
    }

    reading.valid      = true;
    reading.status     = SensorStatus::kOk;
    reading.rawPercent = rawPercent;
    reading.percent    = filtered_;
    last_              = reading;
    return reading;
}

}  // namespace hydrax
