#include "core/wifi_manager.h"

#include "config/hydrax_config.h"
#include "core/clock.h"
#include "core/log.h"

namespace hydrax {
namespace {
constexpr const char* kTag = "wifi";

// How long a single association attempt is given before it is abandoned and
// rescheduled. This is a deadline, not a blocking wait.
constexpr uint32_t kAttemptTimeoutMs = 15u * 1000u;
}  // namespace

void WifiManager::begin(IWifiRadio* radio, const char* ssid, const char* password) {
    radio_    = radio;
    ssid_     = ssid;
    password_ = password;

    if (radio_ != nullptr) radio_->configure();

    backoffMs_      = config::kWifiRetryBaseMs;
    retryScheduled_ = false;
    state_          = State::kIdle;
}

bool WifiManager::isConnected() const {
    return radio_ != nullptr && radio_->isConnected();
}

int32_t WifiManager::rssi() const { return isConnected() ? radio_->rssi() : 0; }

void WifiManager::startAttempt(uint32_t now) {
    HX_LOG_INFO(kTag, "Connecting to \"%s\"", ssid_ != nullptr ? ssid_ : "(unset)");
    radio_->connect(ssid_, password_);
    attemptStartMs_ = now;
    state_          = State::kConnecting;
    retryScheduled_ = false;
}

void WifiManager::tick(uint32_t now) {
    if (radio_ == nullptr || ssid_ == nullptr) return;

    // Start a due attempt BEFORE reading the link state, so a radio that
    // associates immediately is recognised in this same tick. Otherwise a link
    // that comes up and drops again would not be noticed until the association
    // deadline expired, leaving the uplink idle for fifteen seconds.
    if (state_ == State::kIdle && !radio_->isConnected() &&
        (!retryScheduled_ || elapsed(now, retryMarkMs_, backoffMs_))) {
        startAttempt(now);
    }

    const bool connected = radio_->isConnected();

    switch (state_) {
        case State::kIdle:
            // An already-associated radio (auto-reconnect) is simply adopted.
            if (connected) state_ = State::kConnected;
            break;

        case State::kConnecting:
            if (connected) {
                ++connectCount_;
                backoffMs_ = config::kWifiRetryBaseMs;
                state_     = State::kConnected;
                HX_LOG_INFO(kTag, "Connected (RSSI %ld)", static_cast<long>(radio_->rssi()));
                break;
            }
            if (elapsed(now, attemptStartMs_, kAttemptTimeoutMs)) {
                // Back off, so a down access point does not become a tight
                // retry loop that starves the radio and floods the log.
                HX_LOG_WARN(kTag, "Association timed out, retrying in %lu ms",
                            static_cast<unsigned long>(backoffMs_));
                radio_->disconnect();
                retryMarkMs_    = now;
                retryScheduled_ = true;
                state_          = State::kIdle;

                backoffMs_ = (backoffMs_ >= config::kWifiRetryMaxMs / 2)
                                 ? config::kWifiRetryMaxMs
                                 : backoffMs_ * 2;
            }
            break;

        case State::kConnected:
            if (!connected) {
                ++disconnectCount_;
                HX_LOG_WARN(kTag, "Wi-Fi disconnected - irrigation continues locally");
                retryMarkMs_    = now;
                retryScheduled_ = true;
                // A link that was up a moment ago deserves a fast first retry.
                backoffMs_      = config::kWifiRetryBaseMs;
                state_          = State::kIdle;
            }
            break;
    }
}

}  // namespace hydrax
