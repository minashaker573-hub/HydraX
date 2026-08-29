#include "hal/esp32_analog_source.h"

#include <Arduino.h>

#include "core/log.h"
#include "core/moisture.h"

namespace hydrax {
namespace {
constexpr const char* kTag = "adc";
}

void Esp32AnalogSource::begin() {
    analogReadResolution(config::kAdcResolutionBits);
    for (uint8_t i = 0; i < config::kSensorCount; ++i) {
        const int pin = config::kSensorAdcPin[i];
        // 11 dB attenuation gives roughly a 0..3.1 V input span, which is what
        // a 3.3 V-powered capacitive probe swings across.
        analogSetPinAttenuation(pin, ADC_11db);
        HX_LOG_DEBUG(kTag, "Sensor %u on GPIO%d", static_cast<unsigned>(i + 1), pin);
    }
}

int Esp32AnalogSource::readRaw(uint8_t sensorIndex) {
    if (sensorIndex >= config::kSensorCount) return -1;

    const int pin = config::kSensorAdcPin[sensorIndex];
    int samples[config::kSamplesPerReading];

    for (uint8_t s = 0; s < config::kSamplesPerReading; ++s) {
        samples[s] = analogRead(pin);
        if (s + 1 < config::kSamplesPerReading && config::kSampleSpacingMs > 0) {
            delay(config::kSampleSpacingMs);
        }
    }

    // Total blocking time is kSamplesPerReading * kSampleSpacingMs (~20 ms) once
    // every kSensorIntervalMs. That is well inside the control loop's budget;
    // no network operation is ever allowed to block like this.
    return medianInPlace(samples, config::kSamplesPerReading);
}

}  // namespace hydrax
