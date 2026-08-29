// HYDRAX - zone moisture aggregation.
//
// Each zone owns two soil sensors. This module reduces them to a single
// figure the irrigation controller can act on.
//
// AGGREGATION RULE (Phase 1):
//   The zone value is the arithmetic mean of the sensors that reported a VALID
//   reading this cycle. Invalid sensors are excluded rather than averaged in
//   as zero, because a faulty probe reading 0 would otherwise drag the average
//   down and trigger irrigation the soil does not need.
//
//   `validCount` is carried alongside the mean so the controller can apply a
//   stricter rule for starting than for continuing (see IrrigationController).
#pragma once

#include <cstdint>

#include "core/moisture.h"

namespace hydrax {

struct ZoneMoisture {
    uint8_t validCount = 0;
    float average      = 0.0f;  // mean over valid sensors only; 0 when none
    bool degraded      = false; // running on a single sensor
};

ZoneMoisture aggregateZone(const SensorReading& a, const SensorReading& b);

}  // namespace hydrax
