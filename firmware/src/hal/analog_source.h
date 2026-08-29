// HYDRAX - analog input abstraction.
//
// Supplies raw ADC counts for a sensor index. The irrigation controller cannot
// tell whether a count came from a real probe or from a simulation, which is
// what makes hardware-in-the-loop testing possible without rewiring logic.
#pragma once

#include <cstddef>
#include <cstdint>

#include "config/hydrax_config.h"

namespace hydrax {

class IAnalogSource {
   public:
    virtual ~IAnalogSource() = default;

    // Raw count for `sensorIndex`, or a negative value if the read failed.
    virtual int readRaw(uint8_t sensorIndex) = 0;
};

// Scriptable analog source for host tests and the simulated build.
//
// Each channel holds a raw count that a test sets directly. `drift` lets a
// scenario emulate soil drying out or wetting up over successive reads.
class SimulatedAnalogSource : public IAnalogSource {
   public:
    SimulatedAnalogSource() {
        for (uint8_t i = 0; i < config::kSensorCount; ++i) {
            raw_[i]   = config::kSensorCalibration[i].raw_dry;
            drift_[i] = 0;
        }
    }

    int readRaw(uint8_t sensorIndex) override {
        if (sensorIndex >= config::kSensorCount) return -1;
        ++readCount;
        if (failAll) return -1;
        raw_[sensorIndex] += drift_[sensorIndex];
        if (raw_[sensorIndex] < 0) raw_[sensorIndex] = 0;
        if (raw_[sensorIndex] > config::kAdcMaxCount) raw_[sensorIndex] = config::kAdcMaxCount;
        return raw_[sensorIndex];
    }

    void setRaw(uint8_t sensorIndex, int raw) {
        if (sensorIndex < config::kSensorCount) raw_[sensorIndex] = raw;
    }

    // Applied on every read; negative values make the soil appear wetter.
    void setDrift(uint8_t sensorIndex, int deltaPerRead) {
        if (sensorIndex < config::kSensorCount) drift_[sensorIndex] = deltaPerRead;
    }

    // Sets both sensors of a zone at once (zoneId is 0-based).
    void setZoneRaw(uint8_t zoneId, int raw) {
        const uint8_t base = static_cast<uint8_t>(zoneId * config::kSensorsPerZone);
        for (uint8_t i = 0; i < config::kSensorsPerZone; ++i) setRaw(base + i, raw);
    }

    bool failAll        = false;
    uint32_t readCount  = 0;

   private:
    int raw_[config::kSensorCount]{};
    int drift_[config::kSensorCount]{};
};

}  // namespace hydrax
