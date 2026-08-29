// HYDRAX - irrigation actuator façade.
//
// The one place allowed to command the pump and the zone valves. It enforces
// physical invariants independently of the state machine, so a logic bug
// upstream still cannot produce a damaging actuator combination:
//
//   * the pump never runs with every valve closed (deadheading);
//   * at most one zone valve is open at a time (single pump, Phase 1);
//   * closing the active valve always cuts the pump first.
//
// The application calls startPump()/openZone()/... - never a GPIO.
#pragma once

#include <cstdint>

#include "config/hydrax_config.h"
#include "hal/digital_actuator.h"

namespace hydrax {

class IIrrigationHardware {
   public:
    virtual ~IIrrigationHardware() = default;

    virtual bool startPump()               = 0;
    virtual bool stopPump()                = 0;
    virtual bool openZone(uint8_t zoneId)  = 0;
    virtual bool closeZone(uint8_t zoneId) = 0;

    // Unconditional shutdown: pump off first, then every valve.
    virtual bool stopAllIrrigation() = 0;

    // Drives every output to its de-energized state. Called before anything
    // else at boot.
    virtual bool applySafeStartupState() = 0;

    virtual bool isPumpOn() const                 = 0;
    virtual bool isZoneOpen(uint8_t zoneId) const = 0;
    virtual uint8_t openZoneCount() const         = 0;
};

class IrrigationHardware : public IIrrigationHardware {
   public:
    // `valves` must point to `zoneCount` actuator pointers that outlive this
    // object. Nothing is allocated here.
    void begin(IDigitalActuator* pump, IDigitalActuator* const* valves, uint8_t zoneCount);

    bool startPump() override;
    bool stopPump() override;
    bool openZone(uint8_t zoneId) override;
    bool closeZone(uint8_t zoneId) override;
    bool stopAllIrrigation() override;
    bool applySafeStartupState() override;

    bool isPumpOn() const override;
    bool isZoneOpen(uint8_t zoneId) const override;
    uint8_t openZoneCount() const override;

   private:
    bool valid(uint8_t zoneId) const { return valves_ != nullptr && zoneId < zoneCount_; }

    IDigitalActuator* pump_               = nullptr;
    IDigitalActuator* const* valves_      = nullptr;
    uint8_t zoneCount_                    = 0;
};

}  // namespace hydrax
