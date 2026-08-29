// HYDRAX - ESP32 GPIO actuator.
//
// The only place in the firmware that writes a pump or valve GPIO.
#pragma once

#include "hal/digital_actuator.h"

namespace hydrax {

class Esp32DigitalActuator : public IDigitalActuator {
   public:
    // Configures the pin as an output and immediately drives it to the
    // DE-ENERGIZED level. Must be called before anything else in setup().
    void begin(int pin, bool activeLow, const char* name);

    bool set(bool on) override;
    bool isOn() const override { return on_; }
    const char* name() const override { return name_; }

    int pin() const { return pin_; }

   private:
    int pin_        = -1;
    bool activeLow_ = false;
    bool on_        = false;
    const char* name_ = "unnamed";
};

}  // namespace hydrax
