// HYDRAX / SmartFarm Guardian - Phase 1
// Centralized hardware & control configuration.
//
// THIS IS THE SINGLE SOURCE OF TRUTH for pins, calibration, thresholds and
// timings. Control logic must never hard-code any of these values.
//
// This header is intentionally free of Arduino/ESP-IDF includes so that the
// pure core (and the host test build) can consume it unchanged.
#pragma once

#include <cstdint>

namespace hydrax {
namespace config {

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------
// Overridable at build time via -D HYDRAX_DEVICE_ID=...
#ifndef HYDRAX_DEVICE_ID
#define HYDRAX_DEVICE_ID "HYDRAX-001"
#endif
constexpr const char* kDeviceId = HYDRAX_DEVICE_ID;

// Firmware version reported in telemetry.
constexpr const char* kFirmwareVersion = "0.1.0-phase1";

// ---------------------------------------------------------------------------
// Topology
// ---------------------------------------------------------------------------
constexpr uint8_t kZoneCount      = 2;
constexpr uint8_t kSensorsPerZone = 2;
constexpr uint8_t kSensorCount    = kZoneCount * kSensorsPerZone;  // 4

// ---------------------------------------------------------------------------
// GPIO ASSIGNMENT  (PROVISIONAL - verify against the physical build)
// ---------------------------------------------------------------------------
// Soil moisture sensors MUST be on ADC1 channels. ADC2 is unusable while Wi-Fi
// is active on the ESP32, which would silently break readings the moment
// telemetry connects. ADC1 pins: GPIO32..GPIO39.
//
//   Zone 1: sensor 0 -> GPIO36 (VP / ADC1_CH0),  sensor 1 -> GPIO39 (VN / ADC1_CH3)
//   Zone 2: sensor 2 -> GPIO34 (ADC1_CH6),       sensor 3 -> GPIO35 (ADC1_CH7)
//
// GPIO34..39 are input-only, which is exactly what we want for sensors.
constexpr int kSensorAdcPin[kSensorCount] = {36, 39, 34, 35};

// Actuator pins drive a driver stage (MOSFET gate or relay input), never the
// 12 V load directly. Chosen to avoid strapping pins (0, 2, 5, 12, 15) so the
// board still boots if a driver holds a line during reset.
constexpr int kPumpPin                  = 26;
constexpr int kZoneValvePin[kZoneCount] = {25, 27};

// Set true if the driver stage is active-LOW (common for opto-isolated relay
// boards). The actuator layer inverts logic accordingly; nothing else cares.
constexpr bool kPumpActiveLow  = false;
constexpr bool kValveActiveLow = false;

// ---------------------------------------------------------------------------
// ADC / sensor acquisition
// ---------------------------------------------------------------------------
constexpr int kAdcResolutionBits = 12;
constexpr int kAdcMaxCount       = (1 << kAdcResolutionBits) - 1;  // 4095

// Raw samples taken per logical reading; the median is used to reject spikes.
// Must be odd so the median is a real sample.
constexpr uint8_t  kSamplesPerReading = 5;
constexpr uint32_t kSampleSpacingMs   = 5;

// Exponential moving average applied to the calibrated percentage.
// smoothed = alpha * new + (1 - alpha) * previous
constexpr float kMoistureEmaAlpha = 0.30f;

// A raw count outside this band is treated as an electrical fault rather than
// dry/wet soil: a floating input reads near rail, a shorted probe reads ~0.
constexpr int kRawValidMin = 150;
constexpr int kRawValidMax = 4000;

// Consecutive invalid readings tolerated before the sensor is marked FAULTED.
constexpr uint8_t kSensorFaultThreshold = 3;
// Consecutive valid readings required to clear a fault.
constexpr uint8_t kSensorRecoveryThreshold = 3;

// ---------------------------------------------------------------------------
// CALIBRATION  (INITIAL VALUES - NOT SCIENTIFICALLY CALIBRATED)
// ---------------------------------------------------------------------------
// These are placeholder references for capacitive v1.2/v2.0 probes on a 3.3 V
// rail. They MUST be re-measured per physical sensor before field use, using
// the procedure in docs/HARDWARE.md.
//
// Capacitive probes read HIGH in air (dry) and LOW in water (wet).
//   raw_dry -> reading with the probe in dry air
//   raw_wet -> reading with the probe in a glass of water to the marked line
//
// The resulting figure is a RELATIVE SOIL MOISTURE PERCENTAGE on a 0..100
// scale between these two references. It is NOT volumetric water content and
// must not be reported as such.
struct SensorCalibration {
    int raw_dry;
    int raw_wet;
};

constexpr SensorCalibration kSensorCalibration[kSensorCount] = {
    {3000, 1300},  // zone 1 / sensor 1
    {3000, 1300},  // zone 1 / sensor 2
    {3000, 1300},  // zone 2 / sensor 1
    {3000, 1300},  // zone 2 / sensor 2
};

// Minimum separation between the dry and wet reference. A narrower span means
// the calibration is bad and the derived percentage is meaningless.
constexpr int kMinCalibrationSpan = 300;

// ---------------------------------------------------------------------------
// IRRIGATION THRESHOLDS  (INITIAL VALUES - tune per crop and soil)
// ---------------------------------------------------------------------------
// Hysteresis band, in relative soil moisture percent:
//   start irrigating when zone average <  start_percent
//   stop  irrigating when zone average >= stop_percent
// stop_percent must exceed start_percent; the gap is what prevents the pump
// from chattering around a single setpoint.
struct ZoneThresholds {
    float start_percent;
    float stop_percent;
};

constexpr ZoneThresholds kZoneThresholds[kZoneCount] = {
    {35.0f, 55.0f},  // zone 1
    {35.0f, 55.0f},  // zone 2
};

// Guard rail enforced at startup: a band narrower than this is rejected as a
// configuration error rather than being silently accepted.
constexpr float kMinHysteresisBand = 5.0f;

// ---------------------------------------------------------------------------
// TIMING / SAFETY LIMITS
// ---------------------------------------------------------------------------
// Hard ceiling on a single irrigation run. Hitting it is a fault, not a normal
// stop: the pump is cut and the zone enters TIMEOUT.
constexpr uint32_t kMaxIrrigationMs = 10u * 60u * 1000u;  // 10 minutes

// Minimum run time once started, so a noisy sensor cannot produce a 2-second
// burst that stresses the pump.
constexpr uint32_t kMinIrrigationMs = 30u * 1000u;  // 30 seconds

// Enforced rest between two runs of the SAME zone. Anti-cycling backstop that
// holds even if the hysteresis band is misconfigured.
constexpr uint32_t kZoneCooldownMs = 5u * 60u * 1000u;  // 5 minutes

// Rest imposed after a TIMEOUT before the zone may be retried.
constexpr uint32_t kTimeoutLockoutMs = 30u * 60u * 1000u;  // 30 minutes

// Valve is opened BEFORE the pump starts, and closed AFTER it stops, so the
// pump never runs against a closed head.
constexpr uint32_t kValveSettleMs  = 2000;  // valve open -> pump on
constexpr uint32_t kPumpSpindownMs = 2000;  // pump off  -> valve close

// Control loop cadence.
constexpr uint32_t kSensorIntervalMs  = 2000;
constexpr uint32_t kControlIntervalMs = 1000;

// ---------------------------------------------------------------------------
// NETWORK  (non-secret parameters only - credentials live in secrets.h)
// ---------------------------------------------------------------------------
constexpr uint32_t kTelemetryIntervalMs = 15u * 1000u;
constexpr uint32_t kWifiRetryBaseMs     = 2000;
constexpr uint32_t kWifiRetryMaxMs      = 60u * 1000u;
// Kept short and non-blocking: the control loop must never wait on the radio.
constexpr uint32_t kHttpTimeoutMs = 4000;
// Telemetry buffered while offline. Oldest entries are dropped when full.
constexpr uint8_t kTelemetryQueueCapacity = 20;

}  // namespace config
}  // namespace hydrax
