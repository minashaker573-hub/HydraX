#include "core/zone.h"

namespace hydrax {

ZoneMoisture aggregateZone(const SensorReading& a, const SensorReading& b) {
    ZoneMoisture out;
    float sum = 0.0f;

    if (a.valid) {
        sum += a.percent;
        ++out.validCount;
    }
    if (b.valid) {
        sum += b.percent;
        ++out.validCount;
    }

    if (out.validCount > 0) {
        out.average = sum / static_cast<float>(out.validCount);
    }
    out.degraded = (out.validCount == 1);
    return out;
}

}  // namespace hydrax
