// HYDRAX - irrigation state machine.
//
// THE single source of truth for whether water flows. No other module may
// command the pump or a valve during normal operation.
//
// This is local-first by construction: it depends on a sensor array, an
// actuator façade and a clock. It has no knowledge of Wi-Fi, HTTP or the
// backend, so it keeps irrigating correctly with the network down.
//
//   IDLE -> CHECKING_SOIL -> IRRIGATION_REQUIRED -> STARTING -> IRRIGATING
//        -> STOPPING -> IDLE
//
//   failure states: SENSOR_ERROR, ACTUATOR_ERROR, TIMEOUT
//
// See docs/STATE_MACHINE.md for the full transition table.
#pragma once

#include <cstdint>

#include "config/hydrax_config.h"
#include "core/clock.h"
#include "core/irrigation_hardware.h"
#include "core/sensor_array.h"

namespace hydrax {

enum class IrrigationState : uint8_t {
    kIdle = 0,
    kCheckingSoil,
    kIrrigationRequired,
    kStarting,
    kIrrigating,
    kStopping,
    kSensorError,
    kActuatorError,
    kTimeout,
};

const char* irrigationStateName(IrrigationState state);

// Coarse health summary reported in telemetry.
enum class ControllerStatus : uint8_t {
    kOk = 0,
    kDegraded,       // running, but on reduced sensor coverage
    kSensorError,
    kActuatorError,
};

const char* controllerStatusName(ControllerStatus status);

enum class EventType : uint8_t {
    kControllerStarted = 0,
    kZoneActivated,
    kIrrigationStarted,
    kIrrigationStopped,
    kIrrigationTimeout,
    kSensorError,
    kSensorRecovered,
    kActuatorError,
    kFaultCleared,
    kSafeShutdown,
};

const char* eventTypeName(EventType type);

constexpr uint8_t kNoZone = 0xFF;

struct ControllerEvent {
    EventType type   = EventType::kControllerStarted;
    uint8_t zoneId   = kNoZone;  // 0-based; kNoZone when not zone-specific
    float moisture   = 0.0f;
    uint32_t atMs    = 0;
    uint32_t durationMs = 0;     // populated for irrigation stop/timeout
    const char* detail  = "";    // must point at a string literal
};

using EventSink = void (*)(const ControllerEvent& event, void* context);

// Per-zone bookkeeping exposed for telemetry and tests.
struct ZoneRuntime {
    bool configValid          = true;
    bool hasCompletedRun      = false;
    uint32_t lastStopMs       = 0;
    bool timeoutLockoutActive = false;
    uint32_t lockoutStartMs   = 0;
    uint32_t lastRunMs        = 0;
    uint32_t runCount         = 0;
    uint32_t timeoutCount     = 0;
};

class IrrigationController {
   public:
    void begin(SensorArray* sensors, IIrrigationHardware* hardware, IClock* clock);
    void setEventSink(EventSink sink, void* context);

    // Drives the machine. Safe to call as fast as the main loop runs; it
    // rate-limits itself to config::kControlIntervalMs internally.
    void tick();

    // Emergency stop from outside the machine (e.g. an unrecoverable fault
    // detected in main). Cuts everything and latches ACTUATOR_ERROR.
    void requestSafeShutdown(const char* reason);

    // Explicit operator action to leave ACTUATOR_ERROR. Returns false if the
    // hardware still will not go to a safe state.
    bool clearActuatorFault();

    IrrigationState state() const { return state_; }
    ControllerStatus status() const;
    // 0-based active zone, or kNoZone.
    uint8_t activeZone() const { return activeZone_; }
    // Milliseconds the current run has been irrigating; 0 when not irrigating.
    uint32_t currentRunMs() const;
    const ZoneRuntime& zoneRuntime(uint8_t zoneId) const;

   private:
    void step(uint32_t now);
    void transitionTo(IrrigationState next, uint32_t now, const char* reason);

    void handleCheckingSoil(uint32_t now);
    void handleIrrigationRequired(uint32_t now);
    void handleStarting(uint32_t now);
    void handleIrrigating(uint32_t now);
    void handleStopping(uint32_t now);
    void handleTimeout(uint32_t now);
    void handleSensorError(uint32_t now);
    void handleActuatorError(uint32_t now);

    void expireLockouts(uint32_t now);
    bool zoneEligibleToStart(uint8_t zoneId, uint32_t now) const;
    uint8_t selectZone(uint32_t now) const;

    void beginStopSequence(uint32_t now, IrrigationState after, EventType event,
                           const char* reason);
    void enterActuatorError(uint32_t now, const char* reason);
    void emit(EventType type, uint8_t zoneId, float moisture, uint32_t now,
              uint32_t durationMs, const char* detail);

    SensorArray* sensors_          = nullptr;
    IIrrigationHardware* hardware_ = nullptr;
    IClock* clock_                 = nullptr;

    EventSink sink_       = nullptr;
    void* sinkContext_    = nullptr;

    IrrigationState state_ = IrrigationState::kIdle;
    uint8_t activeZone_    = kNoZone;

    bool firstTick_          = true;
    bool evaluatedThisTick_  = false;
    uint32_t lastTickMs_     = 0;
    uint32_t lastSensorMs_   = 0;
    uint32_t stageStartMs_   = 0;  // entry time of the current state
    uint32_t runStartMs_     = 0;  // when the pump actually started
    uint32_t lastRetryMs_    = 0;  // rate-limits fault-state retries

    // Where STOPPING hands control once the valve is closed.
    IrrigationState afterStop_ = IrrigationState::kIdle;
    EventType stopEvent_       = EventType::kIrrigationStopped;
    const char* stopReason_    = "";

    bool sensorErrorAnnounced_ = false;

    ZoneRuntime zones_[config::kZoneCount];
    ZoneRuntime invalidZone_{};
};

}  // namespace hydrax
