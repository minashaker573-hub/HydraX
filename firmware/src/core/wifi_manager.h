// HYDRAX - Wi-Fi connection policy.
//
// Non-blocking by design. `tick()` never waits for the radio; it starts an
// association attempt and then polls, retrying with exponential backoff.
//
// The irrigation controller does not consult this class at all. Losing Wi-Fi
// has no effect on whether the farm gets watered - it only affects whether
// anyone can watch it happen.
#pragma once

#include <cstdint>

#include "hal/wifi_radio.h"

namespace hydrax {

class WifiManager {
   public:
    // `radio` must outlive this object.
    void begin(IWifiRadio* radio, const char* ssid, const char* password);

    // Advances the connection state machine. Returns immediately.
    void tick(uint32_t now);

    bool isConnected() const;
    int32_t rssi() const;

    uint32_t disconnectCount() const { return disconnectCount_; }
    uint32_t connectCount() const { return connectCount_; }
    // Current backoff delay, exposed for tests and diagnostics.
    uint32_t backoffMs() const { return backoffMs_; }

   private:
    enum class State : uint8_t { kIdle, kConnecting, kConnected };

    void startAttempt(uint32_t now);

    IWifiRadio* radio_    = nullptr;
    const char* ssid_     = nullptr;
    const char* password_ = nullptr;

    State state_             = State::kIdle;
    uint32_t attemptStartMs_ = 0;
    uint32_t retryMarkMs_    = 0;
    uint32_t backoffMs_      = 0;
    bool retryScheduled_     = false;

    uint32_t disconnectCount_ = 0;
    uint32_t connectCount_    = 0;
};

}  // namespace hydrax
