#include "core/irrigation_controller.h"

#include "core/log.h"

namespace hydrax {
namespace {
constexpr const char* kTag = "irrigation";

// Upper bound on state transitions processed in a single tick. Prevents any
// future cycle in the transition graph from spinning the control loop.
constexpr int kMaxTransitionsPerTick = 5;

// Fault states retry the safe-state command at this interval instead of on
// every tick, so a stuck driver cannot flood the log.
constexpr uint32_t kFaultRetryMs = 10u * 1000u;
}  // namespace

const char* irrigationStateName(IrrigationState state) {
    switch (state) {
        case IrrigationState::kIdle:               return "IDLE";
        case IrrigationState::kCheckingSoil:       return "CHECKING_SOIL";
        case IrrigationState::kIrrigationRequired: return "IRRIGATION_REQUIRED";
        case IrrigationState::kStarting:           return "STARTING";
        case IrrigationState::kIrrigating:         return "IRRIGATING";
        case IrrigationState::kStopping:           return "STOPPING";
        case IrrigationState::kSensorError:        return "SENSOR_ERROR";
        case IrrigationState::kActuatorError:      return "ACTUATOR_ERROR";
        case IrrigationState::kTimeout:            return "TIMEOUT";
    }
    return "UNKNOWN";
}

const char* controllerStatusName(ControllerStatus status) {
    switch (status) {
        case ControllerStatus::kOk:            return "OK";
        case ControllerStatus::kDegraded:      return "DEGRADED";
        case ControllerStatus::kSensorError:   return "SENSOR_ERROR";
        case ControllerStatus::kActuatorError: return "ACTUATOR_ERROR";
    }
    return "UNKNOWN";
}

const char* eventTypeName(EventType type) {
    switch (type) {
        case EventType::kControllerStarted:  return "CONTROLLER_STARTED";
        case EventType::kZoneActivated:      return "ZONE_ACTIVATED";
        case EventType::kIrrigationStarted:  return "IRRIGATION_STARTED";
        case EventType::kIrrigationStopped:  return "IRRIGATION_STOPPED";
        case EventType::kIrrigationTimeout:  return "IRRIGATION_TIMEOUT";
        case EventType::kSensorError:        return "SENSOR_ERROR";
        case EventType::kSensorRecovered:    return "SENSOR_RECOVERED";
        case EventType::kActuatorError:      return "ACTUATOR_ERROR";
        case EventType::kFaultCleared:       return "FAULT_CLEARED";
        case EventType::kSafeShutdown:       return "SAFE_SHUTDOWN";
    }
    return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

void IrrigationController::begin(SensorArray* sensors, IIrrigationHardware* hardware,
                                 IClock* clock) {
    sensors_  = sensors;
    hardware_ = hardware;
    clock_    = clock;

    state_      = IrrigationState::kIdle;
    activeZone_ = kNoZone;
    firstTick_  = true;
    sensorErrorAnnounced_ = false;

    // Validate the hysteresis configuration up front. A zone whose band is
    // inverted or too narrow is refused irrigation rather than being allowed
    // to chatter the pump.
    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        zones_[z] = ZoneRuntime{};
        const auto& t    = config::kZoneThresholds[z];
        const float band = t.stop_percent - t.start_percent;
        const bool ok    = (band >= config::kMinHysteresisBand) && (t.start_percent >= 0.0f) &&
                        (t.stop_percent <= 100.0f);
        zones_[z].configValid = ok;
        if (!ok) {
            HX_LOG_ERROR(kTag,
                         "Zone %u thresholds invalid (start=%.1f stop=%.1f, need stop-start >= "
                         "%.1f) - zone disabled",
                         static_cast<unsigned>(z + 1), static_cast<double>(t.start_percent),
                         static_cast<double>(t.stop_percent),
                         static_cast<double>(config::kMinHysteresisBand));
        }
    }

    // Nothing may be energized before the machine has evaluated anything.
    if (hardware_ != nullptr) hardware_->applySafeStartupState();

    const uint32_t now = (clock_ != nullptr) ? clock_->nowMs() : 0;
    emit(EventType::kControllerStarted, kNoZone, 0.0f, now, 0, "boot");
    HX_LOG_INFO(kTag, "Controller started in %s", irrigationStateName(state_));
}

void IrrigationController::setEventSink(EventSink sink, void* context) {
    sink_        = sink;
    sinkContext_ = context;
}

void IrrigationController::emit(EventType type, uint8_t zoneId, float moisture, uint32_t now,
                                uint32_t durationMs, const char* detail) {
    if (sink_ == nullptr) return;
    ControllerEvent event;
    event.type       = type;
    event.zoneId     = zoneId;
    event.moisture   = moisture;
    event.atMs       = now;
    event.durationMs = durationMs;
    event.detail     = detail;
    sink_(event, sinkContext_);
}

// ---------------------------------------------------------------------------
// tick
// ---------------------------------------------------------------------------

void IrrigationController::tick() {
    if (clock_ == nullptr || sensors_ == nullptr || hardware_ == nullptr) return;

    const uint32_t now  = clock_->nowMs();
    const bool firstRun = firstTick_;
    if (!firstRun && !elapsed(now, lastTickMs_, config::kControlIntervalMs)) return;

    firstTick_  = false;
    lastTickMs_ = now;

    if (firstRun || elapsed(now, lastSensorMs_, config::kSensorIntervalMs)) {
        sensors_->update();
        lastSensorMs_ = now;
    }

    evaluatedThisTick_ = false;
    for (int i = 0; i < kMaxTransitionsPerTick; ++i) {
        const IrrigationState before = state_;
        step(now);
        if (state_ == before) break;
    }
}

void IrrigationController::step(uint32_t now) {
    switch (state_) {
        case IrrigationState::kIdle:
            // One soil evaluation per tick; without this guard IDLE and
            // CHECKING_SOIL would ping-pong inside the transition loop.
            if (!evaluatedThisTick_) transitionTo(IrrigationState::kCheckingSoil, now, "periodic check");
            break;
        case IrrigationState::kCheckingSoil:       handleCheckingSoil(now); break;
        case IrrigationState::kIrrigationRequired: handleIrrigationRequired(now); break;
        case IrrigationState::kStarting:           handleStarting(now); break;
        case IrrigationState::kIrrigating:         handleIrrigating(now); break;
        case IrrigationState::kStopping:           handleStopping(now); break;
        case IrrigationState::kTimeout:            handleTimeout(now); break;
        case IrrigationState::kSensorError:        handleSensorError(now); break;
        case IrrigationState::kActuatorError:      handleActuatorError(now); break;
    }
}

void IrrigationController::transitionTo(IrrigationState next, uint32_t now, const char* reason) {
    if (next == state_) return;
    HX_LOG_INFO(kTag, "%s -> %s (%s)", irrigationStateName(state_), irrigationStateName(next),
                reason);
    state_        = next;
    stageStartMs_ = now;
}

// ---------------------------------------------------------------------------
// states
// ---------------------------------------------------------------------------

void IrrigationController::handleCheckingSoil(uint32_t now) {
    evaluatedThisTick_ = true;
    expireLockouts(now);

    // No usable data anywhere: refuse to guess, fail safe.
    if (sensors_->allSensorsInvalid()) {
        if (!sensorErrorAnnounced_) {
            HX_LOG_ERROR(kTag, "No valid sensor data on any zone - entering SENSOR_ERROR");
            emit(EventType::kSensorError, kNoZone, 0.0f, now, 0, "no valid sensor data");
            sensorErrorAnnounced_ = true;
        }
        hardware_->stopAllIrrigation();
        transitionTo(IrrigationState::kSensorError, now, "all sensors invalid");
        return;
    }

    const uint8_t candidate = selectZone(now);
    if (candidate == kNoZone) {
        transitionTo(IrrigationState::kIdle, now, "no zone needs water");
        return;
    }

    activeZone_ = candidate;
    const ZoneMoisture zm = sensors_->zone(candidate);
    HX_LOG_INFO(kTag, "Zone %u irrigation requested (%.1f%% < %.1f%%)",
                static_cast<unsigned>(candidate + 1), static_cast<double>(zm.average),
                static_cast<double>(config::kZoneThresholds[candidate].start_percent));
    transitionTo(IrrigationState::kIrrigationRequired, now, "below start threshold");
}

void IrrigationController::handleIrrigationRequired(uint32_t now) {
    const ZoneMoisture zm = sensors_->zone(activeZone_);

    // Valve first: the pump must never start against a closed system.
    if (!hardware_->openZone(activeZone_)) {
        enterActuatorError(now, "valve failed to open");
        return;
    }
    emit(EventType::kZoneActivated, activeZone_, zm.average, now, 0, "zone selected");
    transitionTo(IrrigationState::kStarting, now, "valve opening");
}

void IrrigationController::handleStarting(uint32_t now) {
    // Give the solenoid time to actually travel before pressurizing.
    if (!elapsed(now, stageStartMs_, config::kValveSettleMs)) return;

    if (!hardware_->startPump()) {
        enterActuatorError(now, "pump failed to start");
        return;
    }

    runStartMs_ = now;
    const ZoneMoisture zm = sensors_->zone(activeZone_);
    emit(EventType::kIrrigationStarted, activeZone_, zm.average, now, 0, "hysteresis start");
    transitionTo(IrrigationState::kIrrigating, now, "pump running");
}

void IrrigationController::handleIrrigating(uint32_t now) {
    const uint32_t runMs = since(now, runStartMs_);

    // --- hard runtime ceiling: a fault, not a normal stop -----------------
    if (runMs >= config::kMaxIrrigationMs) {
        ZoneRuntime& zr          = zones_[activeZone_];
        zr.timeoutCount          += 1;
        zr.timeoutLockoutActive  = true;
        zr.lockoutStartMs        = now;
        zr.lastRunMs             = runMs;

        HX_LOG_ERROR(kTag, "Irrigation timeout on zone %u after %lu ms - cutting pump",
                     static_cast<unsigned>(activeZone_ + 1),
                     static_cast<unsigned long>(runMs));
        emit(EventType::kIrrigationTimeout, activeZone_, sensors_->zone(activeZone_).average, now,
             runMs, "max runtime exceeded");

        if (!hardware_->stopPump()) {
            enterActuatorError(now, "pump would not stop on timeout");
            return;
        }
        transitionTo(IrrigationState::kTimeout, now, "max runtime exceeded");
        return;
    }

    // --- the pump must actually be running --------------------------------
    if (!hardware_->isPumpOn() || !hardware_->isZoneOpen(activeZone_)) {
        enterActuatorError(now, "actuator state diverged while irrigating");
        return;
    }

    const ZoneMoisture zm = sensors_->zone(activeZone_);

    // --- sensor coverage --------------------------------------------------
    // Starting requires both probes; continuing tolerates one, so a single
    // glitching probe does not abort a run that is already under way. Losing
    // both means we are irrigating blind, which must stop immediately.
    if (zm.validCount == 0) {
        HX_LOG_ERROR(kTag, "Zone %u lost all sensor data while irrigating - stopping",
                     static_cast<unsigned>(activeZone_ + 1));
        emit(EventType::kSensorError, activeZone_, 0.0f, now, runMs, "sensors lost during run");
        // Stop this run and return to IDLE rather than latching the whole
        // controller: the other zone may still have healthy probes, and the
        // affected zone cannot restart anyway because starting demands full
        // sensor coverage. The global SENSOR_ERROR state is reserved for
        // losing every sensor on the farm.
        beginStopSequence(now, IrrigationState::kIdle, EventType::kIrrigationStopped,
                          "sensor loss");
        return;
    }

    // --- hysteresis stop --------------------------------------------------
    const float stopAt = config::kZoneThresholds[activeZone_].stop_percent;
    if (zm.average >= stopAt) {
        // Minimum run time protects the pump from short-cycling on a noisy
        // reading right after start-up.
        if (runMs < config::kMinIrrigationMs) return;

        HX_LOG_INFO(kTag, "Zone %u reached %.1f%% (>= %.1f%%) - stopping",
                    static_cast<unsigned>(activeZone_ + 1), static_cast<double>(zm.average),
                    static_cast<double>(stopAt));
        beginStopSequence(now, IrrigationState::kIdle, EventType::kIrrigationStopped,
                          "stop threshold reached");
    }
}

void IrrigationController::beginStopSequence(uint32_t now, IrrigationState after, EventType event,
                                             const char* reason) {
    afterStop_  = after;
    stopEvent_  = event;
    stopReason_ = reason;

    if (!hardware_->stopPump()) {
        enterActuatorError(now, "pump would not stop");
        return;
    }
    transitionTo(IrrigationState::kStopping, now, reason);
}

void IrrigationController::handleStopping(uint32_t now) {
    // Let the pump spin down before the valve shuts, so the last of the
    // pressure has somewhere to go.
    if (!elapsed(now, stageStartMs_, config::kPumpSpindownMs)) return;

    if (!hardware_->closeZone(activeZone_)) {
        enterActuatorError(now, "valve failed to close");
        return;
    }

    const uint32_t runMs = since(now, runStartMs_);
    ZoneRuntime& zr      = zones_[activeZone_];
    zr.hasCompletedRun   = true;
    zr.lastStopMs        = now;
    zr.lastRunMs         = runMs;
    zr.runCount          += 1;

    emit(stopEvent_, activeZone_, sensors_->zone(activeZone_).average, now, runMs, stopReason_);
    HX_LOG_INFO(kTag, "Irrigation completed on zone %u after %lu ms",
                static_cast<unsigned>(activeZone_ + 1), static_cast<unsigned long>(runMs));

    const IrrigationState next = afterStop_;
    activeZone_                = kNoZone;
    transitionTo(next, now, "stop sequence complete");
}

void IrrigationController::handleTimeout(uint32_t now) {
    // Pump was already cut on entry. Close the valve after spin-down, then
    // release the machine; the offending zone stays locked out.
    if (!elapsed(now, stageStartMs_, config::kPumpSpindownMs)) return;

    if (!hardware_->closeZone(activeZone_)) {
        enterActuatorError(now, "valve failed to close after timeout");
        return;
    }

    zones_[activeZone_].lastStopMs      = now;
    zones_[activeZone_].hasCompletedRun = true;

    HX_LOG_WARN(kTag, "Zone %u locked out for %lu ms after timeout",
                static_cast<unsigned>(activeZone_ + 1),
                static_cast<unsigned long>(config::kTimeoutLockoutMs));
    activeZone_ = kNoZone;
    transitionTo(IrrigationState::kIdle, now, "timeout handled");
}

void IrrigationController::handleSensorError(uint32_t now) {
    // Everything stays off until data comes back.
    if (elapsed(now, lastRetryMs_, kFaultRetryMs)) {
        lastRetryMs_ = now;
        hardware_->stopAllIrrigation();
    }

    if (!sensors_->allSensorsInvalid()) {
        HX_LOG_INFO(kTag, "Sensor data recovered - resuming normal operation");
        emit(EventType::kSensorRecovered, kNoZone, 0.0f, now, 0, "sensor data restored");
        sensorErrorAnnounced_ = false;
        activeZone_           = kNoZone;
        transitionTo(IrrigationState::kIdle, now, "sensors recovered");
    }
}

void IrrigationController::handleActuatorError(uint32_t now) {
    // Latched. Keep commanding the safe state periodically in case the driver
    // recovers, but never resume irrigation without an explicit fault clear.
    if (elapsed(now, lastRetryMs_, kFaultRetryMs)) {
        lastRetryMs_ = now;
        hardware_->stopAllIrrigation();
    }
}

void IrrigationController::enterActuatorError(uint32_t now, const char* reason) {
    HX_LOG_ERROR(kTag, "Actuator fault: %s - forcing safe state and latching", reason);
    hardware_->stopAllIrrigation();
    emit(EventType::kActuatorError, activeZone_, 0.0f, now, 0, reason);
    activeZone_  = kNoZone;
    lastRetryMs_ = now;
    transitionTo(IrrigationState::kActuatorError, now, reason);
}

// ---------------------------------------------------------------------------
// zone selection
// ---------------------------------------------------------------------------

bool IrrigationController::zoneEligibleToStart(uint8_t zoneId, uint32_t now) const {
    if (zoneId >= config::kZoneCount) return false;
    const ZoneRuntime& zr = zones_[zoneId];
    if (!zr.configValid) return false;

    // A zone locked out by a timeout stays out until the lockout expires.
    if (zr.timeoutLockoutActive && !elapsed(now, zr.lockoutStartMs, config::kTimeoutLockoutMs)) {
        return false;
    }
    // Anti-cycling backstop, independent of the hysteresis band.
    if (zr.hasCompletedRun && !elapsed(now, zr.lastStopMs, config::kZoneCooldownMs)) {
        return false;
    }

    const ZoneMoisture zm = sensors_->zone(zoneId);
    // Starting is the conservative direction: demand full sensor coverage.
    if (zm.validCount < config::kSensorsPerZone) return false;

    return zm.average < config::kZoneThresholds[zoneId].start_percent;
}

void IrrigationController::expireLockouts(uint32_t now) {
    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        if (zones_[z].timeoutLockoutActive &&
            elapsed(now, zones_[z].lockoutStartMs, config::kTimeoutLockoutMs)) {
            zones_[z].timeoutLockoutActive = false;
            HX_LOG_INFO(kTag, "Zone %u timeout lockout expired", static_cast<unsigned>(z + 1));
        }
    }
}

uint8_t IrrigationController::selectZone(uint32_t now) const {
    uint8_t best    = kNoZone;
    float bestValue = 0.0f;

    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        if (!zoneEligibleToStart(z, now)) continue;

        const float value = sensors_->zone(z).average;
        // Driest zone wins; ties break toward the lower zone id.
        if (best == kNoZone || value < bestValue) {
            best      = z;
            bestValue = value;
        }
    }
    return best;
}

// ---------------------------------------------------------------------------
// external control / accessors
// ---------------------------------------------------------------------------

void IrrigationController::requestSafeShutdown(const char* reason) {
    const uint32_t now = (clock_ != nullptr) ? clock_->nowMs() : 0;
    HX_LOG_ERROR(kTag, "Safe shutdown requested: %s", reason);
    if (hardware_ != nullptr) hardware_->stopAllIrrigation();
    emit(EventType::kSafeShutdown, activeZone_, 0.0f, now, 0, reason);
    activeZone_  = kNoZone;
    lastRetryMs_ = now;
    transitionTo(IrrigationState::kActuatorError, now, reason);
}

bool IrrigationController::clearActuatorFault() {
    if (state_ != IrrigationState::kActuatorError) return true;
    const uint32_t now = (clock_ != nullptr) ? clock_->nowMs() : 0;

    if (!hardware_->stopAllIrrigation()) {
        HX_LOG_ERROR(kTag, "Refusing to clear fault: hardware not in a safe state");
        return false;
    }
    HX_LOG_INFO(kTag, "Actuator fault cleared by operator");
    emit(EventType::kFaultCleared, kNoZone, 0.0f, now, 0, "operator clear");
    activeZone_ = kNoZone;
    transitionTo(IrrigationState::kIdle, now, "fault cleared");
    return true;
}

ControllerStatus IrrigationController::status() const {
    if (state_ == IrrigationState::kActuatorError) return ControllerStatus::kActuatorError;
    if (state_ == IrrigationState::kSensorError) return ControllerStatus::kSensorError;

    if (sensors_ != nullptr) {
        for (uint8_t i = 0; i < config::kSensorCount; ++i) {
            if (!sensors_->reading(i).valid) return ControllerStatus::kDegraded;
        }
    }
    for (uint8_t z = 0; z < config::kZoneCount; ++z) {
        if (!zones_[z].configValid) return ControllerStatus::kDegraded;
    }
    return ControllerStatus::kOk;
}

uint32_t IrrigationController::currentRunMs() const {
    if (state_ != IrrigationState::kIrrigating || clock_ == nullptr) return 0;
    return since(clock_->nowMs(), runStartMs_);
}

const ZoneRuntime& IrrigationController::zoneRuntime(uint8_t zoneId) const {
    if (zoneId >= config::kZoneCount) return invalidZone_;
    return zones_[zoneId];
}

}  // namespace hydrax
