// HYDRAX - digital output abstraction.
//
// One on/off load (pump or valve) behind a driver stage. The application never
// touches a GPIO directly; it talks to this interface, so the same control
// logic runs against a MOSFET board, a relay board, or a simulation.
#pragma once

#include <cstdint>

namespace hydrax {

class IDigitalActuator {
   public:
    virtual ~IDigitalActuator() = default;

    // Drives the output. Returns false if the driver could not be commanded.
    virtual bool set(bool on) = 0;

    // Last successfully commanded state.
    virtual bool isOn() const = 0;

    // Human-readable name, used in logs.
    virtual const char* name() const = 0;
};

// In-memory actuator for host tests and simulation runs.
// `failNext` lets a test inject a driver fault to exercise ACTUATOR_ERROR.
class SimulatedDigitalActuator : public IDigitalActuator {
   public:
    explicit SimulatedDigitalActuator(const char* name = "sim") : name_(name) {}

    bool set(bool on) override {
        ++commandCount;
        if (failNext) {
            failNext = false;
            ++failureCount;
            return false;
        }
        if (on != on_) ++transitionCount;
        on_ = on;
        return true;
    }

    bool isOn() const override { return on_; }
    const char* name() const override { return name_; }

    // Test instrumentation.
    bool failNext            = false;
    uint32_t commandCount    = 0;
    uint32_t transitionCount = 0;
    uint32_t failureCount    = 0;

    // Forces the reported state without going through set(), to simulate an
    // output that is stuck on despite being commanded off.
    void forceState(bool on) { on_ = on; }

   private:
    const char* name_;
    bool on_ = false;
};

}  // namespace hydrax
