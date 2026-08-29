// HYDRAX - ESP32 ADC soil sensor input.
//
// Burst sampling and its timing live here because they are hardware concerns.
// The core receives one already-conditioned raw count per sensor.
//
// NOTE: all sensor pins must be on ADC1. ADC2 is claimed by the Wi-Fi radio on
// the ESP32 and returns garbage while the radio is active.
#pragma once

#include "hal/analog_source.h"

namespace hydrax {

class Esp32AnalogSource : public IAnalogSource {
   public:
    void begin();

    // Takes config::kSamplesPerReading samples and returns their median,
    // which rejects the single-sample spikes common on long probe leads.
    int readRaw(uint8_t sensorIndex) override;
};

}  // namespace hydrax
