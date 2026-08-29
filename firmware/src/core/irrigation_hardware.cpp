#include "core/irrigation_hardware.h"

#include "core/log.h"

namespace hydrax {
namespace {
constexpr const char* kTag = "actuator";
}

void IrrigationHardware::begin(IDigitalActuator* pump, IDigitalActuator* const* valves,
                               uint8_t zoneCount) {
    pump_      = pump;
    valves_    = valves;
    zoneCount_ = zoneCount;
}

bool IrrigationHardware::isPumpOn() const { return pump_ != nullptr && pump_->isOn(); }

bool IrrigationHardware::isZoneOpen(uint8_t zoneId) const {
    if (!valid(zoneId) || valves_[zoneId] == nullptr) return false;
    return valves_[zoneId]->isOn();
}

uint8_t IrrigationHardware::openZoneCount() const {
    uint8_t count = 0;
    for (uint8_t i = 0; i < zoneCount_; ++i) {
        if (isZoneOpen(i)) ++count;
    }
    return count;
}

bool IrrigationHardware::startPump() {
    if (pump_ == nullptr) {
        HX_LOG_ERROR(kTag, "startPump with no pump driver bound");
        return false;
    }
    // Deadhead guard: refuse to pressurize a fully closed system.
    if (openZoneCount() == 0) {
        HX_LOG_ERROR(kTag, "Refusing to start pump: no zone valve is open");
        return false;
    }
    if (pump_->isOn()) return true;

    if (!pump_->set(true)) {
        HX_LOG_ERROR(kTag, "Pump driver refused ON");
        return false;
    }
    HX_LOG_INFO(kTag, "Pump started");
    return true;
}

bool IrrigationHardware::stopPump() {
    if (pump_ == nullptr) return false;
    if (!pump_->isOn()) return true;

    if (!pump_->set(false)) {
        HX_LOG_ERROR(kTag, "Pump driver refused OFF");
        return false;
    }
    HX_LOG_INFO(kTag, "Pump stopped");
    return true;
}

bool IrrigationHardware::openZone(uint8_t zoneId) {
    if (!valid(zoneId) || valves_[zoneId] == nullptr) {
        HX_LOG_ERROR(kTag, "openZone(%u): no such zone", static_cast<unsigned>(zoneId));
        return false;
    }
    if (isZoneOpen(zoneId)) return true;

    // One zone at a time: a second open valve would split the pump's pressure
    // across both and under-irrigate each.
    if (openZoneCount() > 0) {
        HX_LOG_ERROR(kTag, "Refusing to open zone %u: another zone is already open",
                     static_cast<unsigned>(zoneId + 1));
        return false;
    }

    if (!valves_[zoneId]->set(true)) {
        HX_LOG_ERROR(kTag, "Zone %u valve driver refused OPEN", static_cast<unsigned>(zoneId + 1));
        return false;
    }
    HX_LOG_INFO(kTag, "Zone %u valve opened", static_cast<unsigned>(zoneId + 1));
    return true;
}

bool IrrigationHardware::closeZone(uint8_t zoneId) {
    if (!valid(zoneId) || valves_[zoneId] == nullptr) {
        HX_LOG_ERROR(kTag, "closeZone(%u): no such zone", static_cast<unsigned>(zoneId));
        return false;
    }

    bool ok = true;
    // Never strand a running pump against a closing valve.
    if (isPumpOn()) {
        HX_LOG_WARN(kTag, "closeZone(%u) while pump running - cutting pump first",
                    static_cast<unsigned>(zoneId + 1));
        ok = stopPump() && ok;
    }

    if (!valves_[zoneId]->isOn()) return ok;

    if (!valves_[zoneId]->set(false)) {
        HX_LOG_ERROR(kTag, "Zone %u valve driver refused CLOSE", static_cast<unsigned>(zoneId + 1));
        return false;
    }
    HX_LOG_INFO(kTag, "Zone %u valve closed", static_cast<unsigned>(zoneId + 1));
    return ok;
}

bool IrrigationHardware::stopAllIrrigation() {
    // Pump first, then valves. Every output is attempted even if an earlier
    // one fails - a failure must not leave the rest energized.
    bool ok = true;
    if (pump_ != nullptr && pump_->isOn()) {
        ok = pump_->set(false) && ok;
    }
    for (uint8_t i = 0; i < zoneCount_; ++i) {
        if (valves_[i] != nullptr && valves_[i]->isOn()) {
            ok = valves_[i]->set(false) && ok;
        }
    }
    if (!ok) {
        HX_LOG_ERROR(kTag, "stopAllIrrigation: at least one driver did not confirm OFF");
    }
    return ok;
}

bool IrrigationHardware::applySafeStartupState() {
    bool ok = true;
    if (pump_ != nullptr) ok = pump_->set(false) && ok;
    for (uint8_t i = 0; i < zoneCount_; ++i) {
        if (valves_[i] != nullptr) ok = valves_[i]->set(false) && ok;
    }
    HX_LOG_INFO(kTag, "Safe startup state applied (pump OFF, all valves CLOSED)");
    return ok;
}

}  // namespace hydrax
