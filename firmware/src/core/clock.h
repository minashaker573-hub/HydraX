// HYDRAX - monotonic time source.
//
// The controller reasons entirely in milliseconds since boot supplied by this
// interface. Tests drive it manually, so a 10-minute timeout can be verified
// in microseconds of wall time.
#pragma once

#include <cstdint>

namespace hydrax {

class IClock {
   public:
    virtual ~IClock() = default;
    // Milliseconds since boot. Monotonic. Wraps after ~49.7 days; all
    // comparisons in the core use unsigned subtraction so the wrap is safe.
    virtual uint32_t nowMs() const = 0;
};

// Returns true once `durationMs` has elapsed since `startMs`.
// Uses unsigned wrap-around arithmetic, so it stays correct across the
// 32-bit millis() rollover.
inline bool elapsed(uint32_t nowMs, uint32_t startMs, uint32_t durationMs) {
    return static_cast<uint32_t>(nowMs - startMs) >= durationMs;
}

// Milliseconds elapsed since `startMs`, wrap-safe.
inline uint32_t since(uint32_t nowMs, uint32_t startMs) {
    return static_cast<uint32_t>(nowMs - startMs);
}

}  // namespace hydrax
