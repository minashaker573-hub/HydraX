// HYDRAX - ESP32 monotonic clock.
#pragma once

#include <Arduino.h>

#include "core/clock.h"

namespace hydrax {

class Esp32Clock : public IClock {
   public:
    uint32_t nowMs() const override { return millis(); }
};

}  // namespace hydrax
