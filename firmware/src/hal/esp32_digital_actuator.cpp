#include "hal/esp32_digital_actuator.h"

#include <Arduino.h>

#include "core/log.h"

namespace hydrax {
namespace {
constexpr const char* kTag = "gpio";
}

void Esp32DigitalActuator::begin(int pin, bool activeLow, const char* name) {
    pin_       = pin;
    activeLow_ = activeLow;
    name_      = name;
    on_        = false;

    // Order matters: drive the de-energized level BEFORE switching the pin to
    // an output, so enabling the output cannot produce a brief pulse that
    // kicks the pump or a valve during boot.
    digitalWrite(pin_, activeLow_ ? HIGH : LOW);
    pinMode(pin_, OUTPUT);
    digitalWrite(pin_, activeLow_ ? HIGH : LOW);

    HX_LOG_DEBUG(kTag, "%s bound to GPIO%d (active %s), OFF", name_, pin_,
                 activeLow_ ? "LOW" : "HIGH");
}

bool Esp32DigitalActuator::set(bool on) {
    if (pin_ < 0) {
        HX_LOG_ERROR(kTag, "%s: set() before begin()", name_);
        return false;
    }
    const int level = (on != activeLow_) ? HIGH : LOW;
    digitalWrite(pin_, level);
    on_ = on;
    return true;
}

}  // namespace hydrax
