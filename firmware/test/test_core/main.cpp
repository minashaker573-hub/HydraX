// HYDRAX - core logic test suite.
//
// Self-contained: no test framework, no PlatformIO required. Build and run
// with any C++17 compiler:
//
//   g++ -std=c++17 -I src -o hydrax_tests test/test_core/main.cpp src/core/*.cpp
//   ./hydrax_tests
//
// or, under PlatformIO:  pio test -e native
//
// Everything here exercises the PURE core. The simulated clock means a
// ten-minute irrigation timeout is verified in microseconds of wall time.

#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "config/hydrax_config.h"
#include "core/irrigation_controller.h"
#include "core/irrigation_hardware.h"
#include "core/log.h"
#include "core/moisture.h"
#include "core/outbox.h"
#include "core/sensor_array.h"
#include "core/telemetry.h"
#include "core/uplink_policy.h"
#include "core/wifi_manager.h"
#include "core/zone.h"

using namespace hydrax;

// ---------------------------------------------------------------------------
// tiny assertion harness
// ---------------------------------------------------------------------------
namespace {

int g_checks     = 0;
int g_failures   = 0;
int g_testsRun   = 0;
int g_testsFailed = 0;
bool g_currentFailed = false;
const char* g_currentTest = "";

void reportFailure(const char* file, int line, const char* expr, const std::string& extra) {
    ++g_failures;
    g_currentFailed = true;
    std::printf("  FAIL %s:%d\n    %s\n", file, line, expr);
    if (!extra.empty()) std::printf("    %s\n", extra.c_str());
}

void checkTrue(bool cond, const char* file, int line, const char* expr) {
    ++g_checks;
    if (!cond) reportFailure(file, line, expr, "");
}

void checkEqInt(long long actual, long long expected, const char* file, int line,
                const char* expr) {
    ++g_checks;
    if (actual != expected) {
        reportFailure(file, line, expr,
                      "expected " + std::to_string(expected) + ", got " + std::to_string(actual));
    }
}

void checkNear(double actual, double expected, double eps, const char* file, int line,
               const char* expr) {
    ++g_checks;
    if (std::fabs(actual - expected) > eps) {
        reportFailure(file, line, expr,
                      "expected " + std::to_string(expected) + " +/- " + std::to_string(eps) +
                          ", got " + std::to_string(actual));
    }
}

void checkStrContains(const char* haystack, const char* needle, const char* file, int line,
                      const char* expr) {
    ++g_checks;
    if (haystack == nullptr || std::strstr(haystack, needle) == nullptr) {
        reportFailure(file, line, expr, std::string("missing substring: ") + needle);
    }
}

#define CHECK(cond) checkTrue((cond), __FILE__, __LINE__, #cond)
#define CHECK_EQ(a, b) checkEqInt(static_cast<long long>(a), static_cast<long long>(b), __FILE__, __LINE__, #a " == " #b)
#define CHECK_NEAR(a, b, eps) checkNear((a), (b), (eps), __FILE__, __LINE__, #a " ~= " #b)
#define CHECK_CONTAINS(s, sub) checkStrContains((s), (sub), __FILE__, __LINE__, #s " contains " #sub)

void runTest(const char* name, void (*fn)()) {
    g_currentTest   = name;
    g_currentFailed = false;
    ++g_testsRun;
    fn();
    if (g_currentFailed) {
        ++g_testsFailed;
        std::printf("[FAIL] %s\n", name);
    } else {
        std::printf("[ ok ] %s\n", name);
    }
}

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

class TestClock : public IClock {
   public:
    uint32_t ms = 0;
    uint32_t nowMs() const override { return ms; }
};

// Converts a target relative-moisture percentage into the raw ADC count that
// produces it under the configured calibration.
int rawForPercent(float percent, uint8_t sensorIndex = 0) {
    const auto& cal  = config::kSensorCalibration[sensorIndex];
    const int span   = cal.raw_dry - cal.raw_wet;
    return cal.raw_dry - static_cast<int>((percent / 100.0f) * static_cast<float>(span));
}

// Full controller rig with simulated hardware.
struct Rig {
    TestClock clock;
    SimulatedAnalogSource analog;
    SimulatedDigitalActuator pump{"pump"};
    SimulatedDigitalActuator valveA{"valve1"};
    SimulatedDigitalActuator valveB{"valve2"};
    IDigitalActuator* valves[config::kZoneCount];
    IrrigationHardware hw;
    SensorArray sensors;
    IrrigationController controller;
    std::vector<ControllerEvent> events;

    Rig() {
        valves[0] = &valveA;
        valves[1] = &valveB;
        hw.begin(&pump, valves, config::kZoneCount);
        sensors.begin(&analog);
        controller.setEventSink(&Rig::onEvent, this);
        controller.begin(&sensors, &hw, &clock);
    }

    static void onEvent(const ControllerEvent& e, void* ctx) {
        static_cast<Rig*>(ctx)->events.push_back(e);
    }

    void setZonePercent(uint8_t zoneId, float percent) {
        analog.setZoneRaw(zoneId, rawForPercent(percent));
    }

    void advance(uint32_t ms) { clock.ms += ms; }

    // Advances simulated time, ticking the controller on its normal cadence.
    void run(uint32_t totalMs, uint32_t stepMs = config::kControlIntervalMs) {
        for (uint32_t t = 0; t < totalMs; t += stepMs) {
            advance(stepMs);
            controller.tick();
        }
    }

    void tick() { controller.tick(); }

    int countEvents(EventType type) const {
        int n = 0;
        for (const auto& e : events) {
            if (e.type == type) ++n;
        }
        return n;
    }
    bool sawEvent(EventType type) const { return countEvents(type) > 0; }
    IrrigationState state() const { return controller.state(); }
};

// Drives a rig from boot into a steady IRRIGATING state on the given zone.
// Returns false if it never got there.
bool driveToIrrigating(Rig& rig, uint8_t zoneId) {
    rig.tick();                       // t=0: evaluate, open valve, enter STARTING
    rig.run(config::kValveSettleMs);  // let the valve settle, pump starts
    return rig.state() == IrrigationState::kIrrigating && rig.controller.activeZone() == zoneId;
}

// Runs until the controller settles back to IDLE, bounded so a stuck machine
// fails the test rather than hanging it. Expressed in ticks rather than a
// fixed wall time so it holds under both the field and bench timing profiles.
bool runUntilIdle(Rig& rig, uint32_t limitMs) {
    for (uint32_t elapsedMs = 0; elapsedMs < limitMs; elapsedMs += config::kControlIntervalMs) {
        rig.run(config::kControlIntervalMs);
        if (rig.state() == IrrigationState::kIdle) return true;
    }
    return false;
}

// A duration comfortably inside the maximum runtime, for tests that assert
// irrigation is still going. Deriving it from the configured limit keeps these
// tests valid when the bench timing profile compresses that limit.
constexpr uint32_t midRunDurationMs() { return config::kMaxIrrigationMs / 2; }

// ---------------------------------------------------------------------------
// SENSOR LAYER
// ---------------------------------------------------------------------------

void test_calibration_maps_dry_and_wet_references() {
    const config::SensorCalibration cal{3000, 1300};
    CHECK_NEAR(rawToRelativePercent(3000, cal), 0.0, 0.01);
    CHECK_NEAR(rawToRelativePercent(1300, cal), 100.0, 0.01);
    CHECK_NEAR(rawToRelativePercent(2150, cal), 50.0, 0.1);
    // Beyond the references the scale clamps rather than reporting >100%.
    CHECK_NEAR(rawToRelativePercent(3500, cal), 0.0, 0.01);
    CHECK_NEAR(rawToRelativePercent(900, cal), 100.0, 0.01);
}

void test_sensor_accepts_valid_reading() {
    SoilMoistureSensor s;
    s.begin(0, config::kSensorCalibration[0]);
    const SensorReading r = s.update(rawForPercent(30.0f));
    CHECK(r.valid);
    CHECK(r.status == SensorStatus::kOk);
    CHECK_NEAR(r.percent, 30.0, 0.6);
}

void test_sensor_rejects_out_of_range_readings() {
    SoilMoistureSensor s;
    s.begin(0, config::kSensorCalibration[0]);

    const SensorReading low = s.update(config::kRawValidMin - 1);
    CHECK(!low.valid);
    CHECK(low.status == SensorStatus::kOutOfRange);

    SoilMoistureSensor s2;
    s2.begin(1, config::kSensorCalibration[1]);
    const SensorReading high = s2.update(config::kRawValidMax + 1);
    CHECK(!high.valid);
    CHECK(high.status == SensorStatus::kOutOfRange);
}

void test_sensor_reports_driver_error_on_negative_raw() {
    SoilMoistureSensor s;
    s.begin(0, config::kSensorCalibration[0]);
    const SensorReading r = s.update(-1);
    CHECK(!r.valid);
    CHECK(r.status == SensorStatus::kDriverError);
}

void test_sensor_latches_fault_after_repeated_failures() {
    SoilMoistureSensor s;
    s.begin(0, config::kSensorCalibration[0]);

    for (uint8_t i = 0; i < config::kSensorFaultThreshold - 1; ++i) {
        s.update(-1);
        CHECK(!s.isFaulted());
    }
    s.update(-1);
    CHECK(s.isFaulted());
}

void test_sensor_requires_consecutive_good_reads_to_recover() {
    SoilMoistureSensor s;
    s.begin(0, config::kSensorCalibration[0]);
    for (uint8_t i = 0; i < config::kSensorFaultThreshold; ++i) s.update(-1);
    CHECK(s.isFaulted());

    const int good = rawForPercent(40.0f);
    // A single good reading must not clear a latched fault.
    SensorReading r = s.update(good);
    CHECK(!r.valid);

    for (uint8_t i = 1; i < config::kSensorRecoveryThreshold; ++i) r = s.update(good);
    CHECK(r.valid);
    CHECK(!s.isFaulted());
}

void test_sensor_rejects_unusable_calibration() {
    SoilMoistureSensor s;
    // Dry and wet references far too close to derive anything meaningful.
    s.begin(0, config::SensorCalibration{2000, 1950});
    const SensorReading r = s.update(1975);
    CHECK(!r.valid);
    CHECK(r.status == SensorStatus::kBadCalibration);
}

void test_median_rejects_single_sample_spike() {
    int samples[5] = {2500, 2510, 4095, 2495, 2505};
    CHECK_EQ(medianInPlace(samples, 5), 2505);

    int flat[3] = {100, 100, 100};
    CHECK_EQ(medianInPlace(flat, 3), 100);
    CHECK_EQ(medianInPlace(nullptr, 0), -1);
}

void test_ema_smooths_step_change() {
    SoilMoistureSensor s;
    s.begin(0, config::kSensorCalibration[0]);
    // First reading seeds the filter exactly.
    CHECK_NEAR(s.update(rawForPercent(20.0f)).percent, 20.0, 0.6);
    // A step to 100% must not be followed instantly.
    const float after = s.update(rawForPercent(100.0f)).percent;
    CHECK(after > 20.0f);
    CHECK(after < 100.0f);
    CHECK_NEAR(after, 20.0 + config::kMoistureEmaAlpha * 80.0, 1.0);
}

// ---------------------------------------------------------------------------
// ZONE AGGREGATION
// ---------------------------------------------------------------------------

void test_zone_averages_two_valid_sensors() {
    SensorReading a;
    a.valid = true;
    a.percent = 40.0f;
    SensorReading b;
    b.valid = true;
    b.percent = 50.0f;

    const ZoneMoisture zm = aggregateZone(a, b);
    CHECK_EQ(zm.validCount, 2);
    CHECK_NEAR(zm.average, 45.0, 0.001);
    CHECK(!zm.degraded);
}

void test_zone_excludes_invalid_sensor_from_average() {
    SensorReading a;
    a.valid   = true;
    a.percent = 40.0f;
    SensorReading b;
    b.valid   = false;
    b.percent = 0.0f;  // a dead probe reading zero must not drag the mean down

    const ZoneMoisture zm = aggregateZone(a, b);
    CHECK_EQ(zm.validCount, 1);
    CHECK_NEAR(zm.average, 40.0, 0.001);
    CHECK(zm.degraded);
}

void test_zone_with_no_valid_sensors_reports_nothing() {
    SensorReading a;
    SensorReading b;
    const ZoneMoisture zm = aggregateZone(a, b);
    CHECK_EQ(zm.validCount, 0);
    CHECK(!zm.degraded);
}

// ---------------------------------------------------------------------------
// ACTUATOR SAFETY
// ---------------------------------------------------------------------------

void test_startup_drives_every_output_off() {
    Rig rig;
    CHECK(!rig.pump.isOn());
    CHECK(!rig.valveA.isOn());
    CHECK(!rig.valveB.isOn());
    CHECK(!rig.hw.isPumpOn());
    CHECK_EQ(rig.hw.openZoneCount(), 0);
}

void test_pump_refuses_to_start_with_all_valves_closed() {
    SimulatedDigitalActuator pump{"pump"};
    SimulatedDigitalActuator v0{"v0"};
    SimulatedDigitalActuator v1{"v1"};
    IDigitalActuator* valves[2] = {&v0, &v1};
    IrrigationHardware hw;
    hw.begin(&pump, valves, 2);

    // Deadheading a positive-displacement pump against a closed system is how
    // pumps die. The façade must refuse regardless of what asked.
    CHECK(!hw.startPump());
    CHECK(!pump.isOn());

    CHECK(hw.openZone(0));
    CHECK(hw.startPump());
    CHECK(pump.isOn());
}

void test_only_one_zone_valve_may_be_open() {
    SimulatedDigitalActuator pump{"pump"};
    SimulatedDigitalActuator v0{"v0"};
    SimulatedDigitalActuator v1{"v1"};
    IDigitalActuator* valves[2] = {&v0, &v1};
    IrrigationHardware hw;
    hw.begin(&pump, valves, 2);

    CHECK(hw.openZone(0));
    CHECK(!hw.openZone(1));  // refused
    CHECK(v0.isOn());
    CHECK(!v1.isOn());
    CHECK_EQ(hw.openZoneCount(), 1);
}

void test_closing_active_valve_cuts_pump_first() {
    SimulatedDigitalActuator pump{"pump"};
    SimulatedDigitalActuator v0{"v0"};
    SimulatedDigitalActuator v1{"v1"};
    IDigitalActuator* valves[2] = {&v0, &v1};
    IrrigationHardware hw;
    hw.begin(&pump, valves, 2);

    hw.openZone(0);
    hw.startPump();
    CHECK(pump.isOn());

    CHECK(hw.closeZone(0));
    CHECK(!pump.isOn());
    CHECK(!v0.isOn());
}

void test_stop_all_irrigation_clears_every_output() {
    SimulatedDigitalActuator pump{"pump"};
    SimulatedDigitalActuator v0{"v0"};
    SimulatedDigitalActuator v1{"v1"};
    IDigitalActuator* valves[2] = {&v0, &v1};
    IrrigationHardware hw;
    hw.begin(&pump, valves, 2);

    hw.openZone(0);
    hw.startPump();
    CHECK(hw.stopAllIrrigation());
    CHECK(!pump.isOn());
    CHECK(!v0.isOn());
    CHECK(!v1.isOn());
}

// ---------------------------------------------------------------------------
// IRRIGATION DECISIONS
// ---------------------------------------------------------------------------

void test_dry_soil_starts_irrigation() {
    Rig rig;
    rig.setZonePercent(0, 20.0f);  // below the 35% start threshold
    rig.setZonePercent(1, 80.0f);  // comfortably wet

    rig.tick();
    // Valve must open first and the pump must still be off during settle.
    CHECK(rig.state() == IrrigationState::kStarting);
    CHECK(rig.valveA.isOn());
    CHECK(!rig.pump.isOn());

    rig.run(config::kValveSettleMs);
    CHECK(rig.state() == IrrigationState::kIrrigating);
    CHECK(rig.pump.isOn());
    CHECK_EQ(rig.controller.activeZone(), 0);
    CHECK(rig.sawEvent(EventType::kIrrigationStarted));
    CHECK(rig.sawEvent(EventType::kZoneActivated));
}

void test_wet_soil_does_not_start_irrigation() {
    Rig rig;
    rig.setZonePercent(0, 70.0f);
    rig.setZonePercent(1, 70.0f);

    rig.run(60u * 1000u);
    CHECK(rig.state() == IrrigationState::kIdle);
    CHECK(!rig.pump.isOn());
    CHECK(!rig.valveA.isOn());
    CHECK(!rig.valveB.isOn());
    CHECK(!rig.sawEvent(EventType::kIrrigationStarted));
}

void test_soil_between_thresholds_does_not_start() {
    Rig rig;
    // 45% sits inside the hysteresis band: above start (35), below stop (55).
    // A system without hysteresis would water here; this one must not.
    rig.setZonePercent(0, 45.0f);
    rig.setZonePercent(1, 45.0f);

    rig.run(60u * 1000u);
    CHECK(rig.state() == IrrigationState::kIdle);
    CHECK(!rig.pump.isOn());
}

void test_irrigation_continues_until_stop_threshold() {
    Rig rig;
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);
    CHECK(driveToIrrigating(rig, 0));

    // Soil rises past the START threshold but not to the STOP threshold.
    // Irrigation must continue - that is the whole point of the band.
    rig.setZonePercent(0, 45.0f);
    rig.run(midRunDurationMs());
    CHECK(rig.state() == IrrigationState::kIrrigating);
    CHECK(rig.pump.isOn());
}

void test_irrigation_stops_at_stop_threshold() {
    Rig rig;
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);
    CHECK(driveToIrrigating(rig, 0));

    rig.setZonePercent(0, 100.0f);
    rig.run(90u * 1000u);

    CHECK(rig.state() == IrrigationState::kIdle);
    CHECK(!rig.pump.isOn());
    CHECK(!rig.valveA.isOn());
    CHECK(rig.sawEvent(EventType::kIrrigationStopped));
}

void test_minimum_runtime_prevents_instant_stop() {
    Rig rig;
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);
    CHECK(driveToIrrigating(rig, 0));

    // Soil jumps straight to saturated. The pump must still honour the
    // minimum run time instead of producing a one-second burst.
    rig.setZonePercent(0, 100.0f);
    rig.run(config::kMinIrrigationMs / 2);
    CHECK(rig.state() == IrrigationState::kIrrigating);
    CHECK(rig.pump.isOn());
}

void test_cooldown_blocks_immediate_restart() {
    Rig rig;
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);
    CHECK(driveToIrrigating(rig, 0));

    rig.setZonePercent(0, 100.0f);
    CHECK(runUntilIdle(rig, config::kMaxIrrigationMs));
    const int runs = rig.countEvents(EventType::kIrrigationStarted);

    // Soil goes bone dry again immediately. Without a cooldown this is exactly
    // where a controller starts short-cycling the pump.
    rig.setZonePercent(0, 10.0f);
    rig.run(config::kZoneCooldownMs / 2);
    CHECK(rig.state() == IrrigationState::kIdle);
    CHECK(!rig.pump.isOn());
    CHECK_EQ(rig.countEvents(EventType::kIrrigationStarted), runs);

    // Once the cooldown has passed it may run again.
    rig.run(config::kZoneCooldownMs);
    CHECK(rig.countEvents(EventType::kIrrigationStarted) > runs);
}

void test_max_runtime_triggers_timeout_and_cuts_pump() {
    Rig rig;
    rig.setZonePercent(0, 10.0f);
    rig.setZonePercent(1, 80.0f);
    CHECK(driveToIrrigating(rig, 0));

    // Soil never responds - a stuck valve, a burst line, a dry well.
    rig.run(config::kMaxIrrigationMs + 5u * 1000u);

    CHECK(!rig.pump.isOn());
    CHECK(rig.sawEvent(EventType::kIrrigationTimeout));
    CHECK_EQ(rig.controller.zoneRuntime(0).timeoutCount, 1);
}

void test_timeout_locks_the_zone_out() {
    Rig rig;
    rig.setZonePercent(0, 10.0f);
    rig.setZonePercent(1, 80.0f);
    CHECK(driveToIrrigating(rig, 0));
    rig.run(config::kMaxIrrigationMs + 5u * 1000u);

    const int started = rig.countEvents(EventType::kIrrigationStarted);
    CHECK(rig.controller.zoneRuntime(0).timeoutLockoutActive);

    // Still bone dry, but the zone must stay out for the lockout window.
    rig.run(config::kTimeoutLockoutMs / 2);
    CHECK(!rig.pump.isOn());
    CHECK_EQ(rig.countEvents(EventType::kIrrigationStarted), started);
}

// ---------------------------------------------------------------------------
// ZONE INDEPENDENCE
// ---------------------------------------------------------------------------

void test_zone_two_operates_independently() {
    Rig rig;
    rig.setZonePercent(0, 80.0f);  // zone 1 wet
    rig.setZonePercent(1, 20.0f);  // zone 2 dry

    rig.tick();
    rig.run(config::kValveSettleMs);

    CHECK(rig.state() == IrrigationState::kIrrigating);
    CHECK_EQ(rig.controller.activeZone(), 1);
    CHECK(rig.valveB.isOn());
    CHECK(!rig.valveA.isOn());
    CHECK(rig.pump.isOn());
}

void test_driest_zone_is_served_first() {
    Rig rig;
    rig.setZonePercent(0, 30.0f);
    rig.setZonePercent(1, 15.0f);  // drier

    rig.tick();
    rig.run(config::kValveSettleMs);
    CHECK_EQ(rig.controller.activeZone(), 1);
}

void test_two_zones_never_irrigate_simultaneously() {
    Rig rig;
    rig.setZonePercent(0, 15.0f);
    rig.setZonePercent(1, 15.0f);  // both parched

    rig.tick();
    rig.run(config::kValveSettleMs);
    CHECK(rig.state() == IrrigationState::kIrrigating);

    // Across a long run the two valves must never be open at the same time.
    for (int i = 0; i < 400; ++i) {
        rig.run(config::kControlIntervalMs);
        CHECK(!(rig.valveA.isOn() && rig.valveB.isOn()));
        if (rig.pump.isOn()) CHECK(rig.hw.openZoneCount() == 1);
    }
}

// ---------------------------------------------------------------------------
// FAILURE HANDLING
// ---------------------------------------------------------------------------

void test_all_sensors_invalid_enters_sensor_error_and_stops_pump() {
    Rig rig;
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);
    CHECK(driveToIrrigating(rig, 0));
    CHECK(rig.pump.isOn());

    // Every probe goes open-circuit.
    rig.analog.failAll = true;
    rig.run(60u * 1000u);

    CHECK(!rig.pump.isOn());
    CHECK(!rig.valveA.isOn());
    CHECK(rig.state() == IrrigationState::kSensorError);
    CHECK(rig.controller.status() == ControllerStatus::kSensorError);
    CHECK(rig.sawEvent(EventType::kSensorError));
}

void test_sensor_recovery_returns_controller_to_idle() {
    Rig rig;
    rig.setZonePercent(0, 80.0f);
    rig.setZonePercent(1, 80.0f);
    rig.analog.failAll = true;
    rig.run(30u * 1000u);
    CHECK(rig.state() == IrrigationState::kSensorError);

    rig.analog.failAll = false;
    rig.setZonePercent(0, 80.0f);
    rig.setZonePercent(1, 80.0f);
    rig.run(60u * 1000u);

    CHECK(rig.state() == IrrigationState::kIdle);
    CHECK(rig.sawEvent(EventType::kSensorRecovered));
}

void test_losing_one_zones_sensors_mid_run_stops_that_run() {
    Rig rig;
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);
    CHECK(driveToIrrigating(rig, 0));

    // Both probes on the active zone fail; zone 2 stays healthy.
    rig.analog.setRaw(0, -1);
    rig.analog.setRaw(1, -1);
    rig.run(60u * 1000u);

    CHECK(!rig.pump.isOn());
    CHECK(!rig.valveA.isOn());
    CHECK(rig.sawEvent(EventType::kSensorError));
    // The whole controller must not latch: zone 2 still has good data.
    CHECK(rig.state() != IrrigationState::kSensorError);
}

void test_zone_runs_degraded_on_a_single_healthy_sensor() {
    Rig rig;
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);
    CHECK(driveToIrrigating(rig, 0));

    // One probe of the active zone dies mid-run. Irrigation continues on the
    // survivor rather than aborting a legitimate cycle.
    rig.analog.setRaw(1, -1);
    rig.run(midRunDurationMs());

    CHECK(rig.state() == IrrigationState::kIrrigating);
    CHECK(rig.pump.isOn());
    CHECK(rig.controller.status() == ControllerStatus::kDegraded);
}

void test_degraded_zone_cannot_start_a_new_run() {
    Rig rig;
    // Zone 1 is dry but only one of its probes works. Starting demands full
    // coverage, so it must stay dry rather than water on half the evidence.
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);
    rig.analog.setRaw(1, -1);

    rig.run(60u * 1000u);
    CHECK(!rig.pump.isOn());
    CHECK(rig.state() == IrrigationState::kIdle);
}

void test_valve_failure_latches_actuator_error_and_forces_safe_state() {
    Rig rig;
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);

    rig.valveA.failNext = true;  // driver refuses to open
    rig.run(10u * 1000u);

    CHECK(rig.state() == IrrigationState::kActuatorError);
    CHECK(rig.controller.status() == ControllerStatus::kActuatorError);
    CHECK(!rig.pump.isOn());
    CHECK(!rig.valveA.isOn());
    CHECK(rig.sawEvent(EventType::kActuatorError));
}

void test_actuator_error_is_latched_until_explicitly_cleared() {
    Rig rig;
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);
    rig.valveA.failNext = true;
    rig.run(10u * 1000u);
    CHECK(rig.state() == IrrigationState::kActuatorError);

    // Conditions are now perfectly normal. The controller must NOT resume by
    // itself - an actuator fault means something physical needs looking at.
    rig.run(10u * 60u * 1000u);
    CHECK(rig.state() == IrrigationState::kActuatorError);
    CHECK(!rig.pump.isOn());

    CHECK(rig.controller.clearActuatorFault());
    CHECK(rig.state() == IrrigationState::kIdle);
    CHECK(rig.sawEvent(EventType::kFaultCleared));
}

void test_safe_shutdown_request_cuts_everything() {
    Rig rig;
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);
    CHECK(driveToIrrigating(rig, 0));

    rig.controller.requestSafeShutdown("test");
    CHECK(!rig.pump.isOn());
    CHECK(!rig.valveA.isOn());
    CHECK(rig.state() == IrrigationState::kActuatorError);
    CHECK(rig.sawEvent(EventType::kSafeShutdown));
}

void test_pump_never_runs_without_an_open_valve_across_a_full_cycle() {
    Rig rig;
    rig.setZonePercent(0, 15.0f);
    rig.setZonePercent(1, 90.0f);

    // Invariant sweep across start, run, threshold stop and back to idle.
    for (int i = 0; i < 200; ++i) {
        rig.run(config::kControlIntervalMs);
        if (rig.pump.isOn()) CHECK(rig.hw.openZoneCount() >= 1);
        if (i == 60) rig.setZonePercent(0, 100.0f);
    }
    CHECK(!rig.pump.isOn());
}

// ---------------------------------------------------------------------------
// LOCAL-FIRST / CONNECTIVITY
// ---------------------------------------------------------------------------

void test_irrigation_works_with_no_network_at_all() {
    // The rig has no WifiManager and no uplink wired in. The controller must
    // be entirely indifferent to that.
    Rig rig;
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);

    CHECK(driveToIrrigating(rig, 0));
    CHECK(rig.pump.isOn());

    rig.setZonePercent(0, 100.0f);
    rig.run(90u * 1000u);
    CHECK(rig.state() == IrrigationState::kIdle);
    CHECK(!rig.pump.isOn());
}

void test_wifi_connects_and_reports_link() {
    SimulatedWifiRadio radio;
    WifiManager wifi;
    wifi.begin(&radio, "ssid", "pass");
    CHECK_EQ(radio.configureCount, 1);

    wifi.tick(0);
    CHECK(wifi.isConnected());
    CHECK_EQ(wifi.connectCount(), 1);
    CHECK_EQ(wifi.rssi(), radio.rssiValue);
}

void test_wifi_disconnect_is_detected_and_retried() {
    SimulatedWifiRadio radio;
    WifiManager wifi;
    wifi.begin(&radio, "ssid", "pass");

    uint32_t t = 0;
    wifi.tick(t);
    CHECK(wifi.isConnected());

    radio.dropLink();
    t += 1000;
    wifi.tick(t);
    CHECK(!wifi.isConnected());
    CHECK_EQ(wifi.disconnectCount(), 1);

    // Backoff elapses, the manager retries, the link comes back.
    t += config::kWifiRetryBaseMs + 1;
    wifi.tick(t);
    CHECK(wifi.isConnected());
    CHECK_EQ(wifi.connectCount(), 2);
}

void test_wifi_backoff_grows_when_association_keeps_failing() {
    SimulatedWifiRadio radio;
    radio.associateImmediately = false;  // access point is down
    WifiManager wifi;
    wifi.begin(&radio, "ssid", "pass");

    const uint32_t firstBackoff = wifi.backoffMs();
    uint32_t t = 0;

    // Two failed attempts, each abandoned after the association deadline.
    for (int attempt = 0; attempt < 2; ++attempt) {
        wifi.tick(t);
        t += 20u * 1000u;  // beyond the association timeout
        wifi.tick(t);
        t += wifi.backoffMs() + 1;
    }

    CHECK(!wifi.isConnected());
    CHECK(wifi.backoffMs() > firstBackoff);
    CHECK(wifi.backoffMs() <= config::kWifiRetryMaxMs);

    // The access point returns.
    radio.associateImmediately = true;
    wifi.tick(t);
    CHECK(wifi.isConnected());
}

void test_wifi_backoff_is_capped() {
    SimulatedWifiRadio radio;
    radio.associateImmediately = false;
    WifiManager wifi;
    wifi.begin(&radio, "ssid", "pass");

    uint32_t t = 0;
    for (int attempt = 0; attempt < 20; ++attempt) {
        wifi.tick(t);
        t += 20u * 1000u;
        wifi.tick(t);
        t += wifi.backoffMs() + 1;
    }
    CHECK(wifi.backoffMs() <= config::kWifiRetryMaxMs);
}

// ---------------------------------------------------------------------------
// OFFLINE BUFFERING
// ---------------------------------------------------------------------------

void test_outbox_is_fifo() {
    Outbox<int, 4> box;
    CHECK(box.empty());
    box.push(1);
    box.push(2);

    int v = 0;
    CHECK(box.peek(v));
    CHECK_EQ(v, 1);
    box.pop();
    CHECK(box.peek(v));
    CHECK_EQ(v, 2);
    box.pop();
    CHECK(box.empty());
    CHECK(!box.peek(v));
    CHECK(!box.pop());
}

void test_outbox_drops_oldest_when_full() {
    Outbox<int, 3> box;
    CHECK(box.push(1));
    CHECK(box.push(2));
    CHECK(box.push(3));
    CHECK(box.full());

    // Buffer is full: the newest sample matters more than the oldest one.
    CHECK(!box.push(4));
    CHECK_EQ(box.size(), 3);
    CHECK_EQ(box.droppedCount(), 1);

    int v = 0;
    box.peek(v);
    CHECK_EQ(v, 2);  // the 1 was discarded
}

void test_uplink_retries_transient_failures_but_discards_poison_payloads() {
    // Transport failure and server errors are worth retrying.
    CHECK(!isPermanentRejection(-1));
    CHECK(!isPermanentRejection(500));
    CHECK(!isPermanentRejection(503));
    CHECK(!isPermanentRejection(200));
    // Explicitly transient 4xx.
    CHECK(!isPermanentRejection(408));
    CHECK(!isPermanentRejection(429));
    // A payload the backend will always reject must not block the queue head.
    CHECK(isPermanentRejection(400));
    CHECK(isPermanentRejection(401));
    CHECK(isPermanentRejection(422));
}

// ---------------------------------------------------------------------------
// TELEMETRY
// ---------------------------------------------------------------------------

void test_telemetry_reports_idle_system() {
    Rig rig;
    rig.setZonePercent(0, 60.0f);
    rig.setZonePercent(1, 70.0f);
    rig.run(5u * 1000u);

    const TelemetrySnapshot snap = captureTelemetry(rig.sensors, rig.controller, rig.hw,
                                                    rig.clock.ms, false, false, 0, "");
    char buf[kTelemetryBufferSize];
    const int n = serializeTelemetry(snap, buf, sizeof(buf));
    CHECK(n > 0);

    CHECK_CONTAINS(buf, "\"device_id\"");
    CHECK_CONTAINS(buf, "\"zone_1\"");
    CHECK_CONTAINS(buf, "\"zone_2\"");
    CHECK_CONTAINS(buf, "\"average\"");
    CHECK_CONTAINS(buf, "\"pump\":false");
    CHECK_CONTAINS(buf, "\"zone_1_valve\":false");
    CHECK_CONTAINS(buf, "\"zone_2_valve\":false");
    CHECK_CONTAINS(buf, "\"state\":\"IDLE\"");
    CHECK_CONTAINS(buf, "\"active_zone\":null");
    CHECK_CONTAINS(buf, "\"status\":\"OK\"");
    CHECK_CONTAINS(buf, "\"simulated\":false");
    CHECK_CONTAINS(buf, "\"device_time\":null");
}

void test_telemetry_reports_active_irrigation() {
    Rig rig;
    rig.setZonePercent(0, 20.0f);
    rig.setZonePercent(1, 80.0f);
    CHECK(driveToIrrigating(rig, 0));

    const TelemetrySnapshot snap = captureTelemetry(rig.sensors, rig.controller, rig.hw,
                                                    rig.clock.ms, true, true, -55, "");
    CHECK_EQ(snap.activeZone, 1);  // 1-based on the wire
    CHECK(snap.pumpOn);

    char buf[kTelemetryBufferSize];
    CHECK(serializeTelemetry(snap, buf, sizeof(buf)) > 0);
    CHECK_CONTAINS(buf, "\"state\":\"IRRIGATING\"");
    CHECK_CONTAINS(buf, "\"active_zone\":1");
    CHECK_CONTAINS(buf, "\"pump\":true");
    CHECK_CONTAINS(buf, "\"zone_1_valve\":true");
    CHECK_CONTAINS(buf, "\"simulated\":true");
    CHECK_CONTAINS(buf, "\"wifi_connected\":true");
}

void test_telemetry_marks_invalid_sensors() {
    Rig rig;
    rig.setZonePercent(0, 50.0f);
    rig.setZonePercent(1, 50.0f);
    rig.analog.setRaw(2, -1);
    rig.run(20u * 1000u);

    const TelemetrySnapshot snap = captureTelemetry(rig.sensors, rig.controller, rig.hw,
                                                    rig.clock.ms, false, false, 0, "");
    CHECK(!snap.sensors[2].valid);
    CHECK_EQ(snap.zones[1].validSensors, 1);

    char buf[kTelemetryBufferSize];
    CHECK(serializeTelemetry(snap, buf, sizeof(buf)) > 0);
    CHECK_CONTAINS(buf, "\"valid\":false");
    CHECK_CONTAINS(buf, "\"status\":\"DEGRADED\"");
}

void test_telemetry_rejects_undersized_buffer() {
    TelemetrySnapshot snap;
    char tiny[16];
    CHECK_EQ(serializeTelemetry(snap, tiny, sizeof(tiny)), -1);
    // On failure the buffer must be left as a valid empty string, never a
    // half-written payload that could be transmitted.
    CHECK_EQ(std::strlen(tiny), 0);
    CHECK_EQ(serializeTelemetry(snap, nullptr, 0), -1);
}

}  // namespace

// ---------------------------------------------------------------------------

int main() {
    // Keep the controller's own logging out of the test output unless the
    // suite is run with HYDRAX_TEST_VERBOSE set.
    if (std::getenv("HYDRAX_TEST_VERBOSE") != nullptr) {
        Log::setLevel(LogLevel::kDebug);
        Log::setSink([](LogLevel level, const char* tag, const char* message) {
            std::printf("      . [%s][%s] %s\n", logLevelName(level), tag, message);
        });
    }

    std::printf("HYDRAX core test suite\n\n");

    std::printf("-- sensor layer --\n");
    runTest("calibration maps dry and wet references", test_calibration_maps_dry_and_wet_references);
    runTest("sensor accepts a valid reading", test_sensor_accepts_valid_reading);
    runTest("sensor rejects out-of-range readings", test_sensor_rejects_out_of_range_readings);
    runTest("sensor reports driver error on negative raw",
            test_sensor_reports_driver_error_on_negative_raw);
    runTest("sensor latches fault after repeated failures",
            test_sensor_latches_fault_after_repeated_failures);
    runTest("sensor requires consecutive good reads to recover",
            test_sensor_requires_consecutive_good_reads_to_recover);
    runTest("sensor rejects unusable calibration", test_sensor_rejects_unusable_calibration);
    runTest("median rejects a single-sample spike", test_median_rejects_single_sample_spike);
    runTest("EMA smooths a step change", test_ema_smooths_step_change);

    std::printf("\n-- zone aggregation --\n");
    runTest("zone averages two valid sensors", test_zone_averages_two_valid_sensors);
    runTest("zone excludes an invalid sensor from the average",
            test_zone_excludes_invalid_sensor_from_average);
    runTest("zone with no valid sensors reports nothing",
            test_zone_with_no_valid_sensors_reports_nothing);

    std::printf("\n-- actuator safety --\n");
    runTest("startup drives every output off", test_startup_drives_every_output_off);
    runTest("pump refuses to start with all valves closed",
            test_pump_refuses_to_start_with_all_valves_closed);
    runTest("only one zone valve may be open", test_only_one_zone_valve_may_be_open);
    runTest("closing the active valve cuts the pump first",
            test_closing_active_valve_cuts_pump_first);
    runTest("stopAllIrrigation clears every output", test_stop_all_irrigation_clears_every_output);

    std::printf("\n-- irrigation decisions --\n");
    runTest("dry soil starts irrigation", test_dry_soil_starts_irrigation);
    runTest("wet soil does not start irrigation", test_wet_soil_does_not_start_irrigation);
    runTest("soil between thresholds does not start", test_soil_between_thresholds_does_not_start);
    runTest("irrigation continues until the stop threshold",
            test_irrigation_continues_until_stop_threshold);
    runTest("irrigation stops at the stop threshold", test_irrigation_stops_at_stop_threshold);
    runTest("minimum runtime prevents an instant stop", test_minimum_runtime_prevents_instant_stop);
    runTest("cooldown blocks an immediate restart", test_cooldown_blocks_immediate_restart);
    runTest("max runtime triggers timeout and cuts the pump",
            test_max_runtime_triggers_timeout_and_cuts_pump);
    runTest("timeout locks the zone out", test_timeout_locks_the_zone_out);

    std::printf("\n-- zone independence --\n");
    runTest("zone 2 operates independently", test_zone_two_operates_independently);
    runTest("driest zone is served first", test_driest_zone_is_served_first);
    runTest("two zones never irrigate simultaneously", test_two_zones_never_irrigate_simultaneously);

    std::printf("\n-- failure handling --\n");
    runTest("all sensors invalid enters SENSOR_ERROR and stops the pump",
            test_all_sensors_invalid_enters_sensor_error_and_stops_pump);
    runTest("sensor recovery returns the controller to IDLE",
            test_sensor_recovery_returns_controller_to_idle);
    runTest("losing one zone's sensors mid-run stops that run",
            test_losing_one_zones_sensors_mid_run_stops_that_run);
    runTest("zone runs degraded on a single healthy sensor",
            test_zone_runs_degraded_on_a_single_healthy_sensor);
    runTest("a degraded zone cannot start a new run", test_degraded_zone_cannot_start_a_new_run);
    runTest("valve failure latches ACTUATOR_ERROR and forces a safe state",
            test_valve_failure_latches_actuator_error_and_forces_safe_state);
    runTest("actuator error is latched until explicitly cleared",
            test_actuator_error_is_latched_until_explicitly_cleared);
    runTest("safe shutdown request cuts everything", test_safe_shutdown_request_cuts_everything);
    runTest("pump never runs without an open valve across a full cycle",
            test_pump_never_runs_without_an_open_valve_across_a_full_cycle);

    std::printf("\n-- local-first / connectivity --\n");
    runTest("irrigation works with no network at all", test_irrigation_works_with_no_network_at_all);
    runTest("wifi connects and reports the link", test_wifi_connects_and_reports_link);
    runTest("wifi disconnect is detected and retried",
            test_wifi_disconnect_is_detected_and_retried);
    runTest("wifi backoff grows when association keeps failing",
            test_wifi_backoff_grows_when_association_keeps_failing);
    runTest("wifi backoff is capped", test_wifi_backoff_is_capped);

    std::printf("\n-- offline buffering --\n");
    runTest("outbox is FIFO", test_outbox_is_fifo);
    runTest("outbox drops the oldest entry when full", test_outbox_drops_oldest_when_full);
    runTest("uplink retries transient failures but discards poison payloads",
            test_uplink_retries_transient_failures_but_discards_poison_payloads);

    std::printf("\n-- telemetry --\n");
    runTest("telemetry reports an idle system", test_telemetry_reports_idle_system);
    runTest("telemetry reports active irrigation", test_telemetry_reports_active_irrigation);
    runTest("telemetry marks invalid sensors", test_telemetry_marks_invalid_sensors);
    runTest("telemetry rejects an undersized buffer", test_telemetry_rejects_undersized_buffer);

    std::printf("\n----------------------------------------\n");
    std::printf("%d tests, %d checks, %d failed\n", g_testsRun, g_checks, g_testsFailed);
    if (g_testsFailed == 0) {
        std::printf("ALL TESTS PASSED\n");
        return 0;
    }
    std::printf("%d FAILING TEST(S)\n", g_testsFailed);
    return 1;
}
