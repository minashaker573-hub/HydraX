// HYDRAX - Wi-Fi radio abstraction.
//
// Exists so the connection/reconnection policy in core/wifi_manager.h can be
// exercised on the host: disconnects, backoff and recovery are logic, and
// logic that only runs on a board is logic nobody tests.
#pragma once

#include <cstdint>

namespace hydrax {

class IWifiRadio {
   public:
    virtual ~IWifiRadio() = default;

    // One-time station-mode setup.
    virtual void configure() = 0;

    // Starts an association attempt. MUST return immediately.
    virtual void connect(const char* ssid, const char* password) = 0;

    virtual void disconnect()        = 0;
    virtual bool isConnected() const = 0;
    virtual int32_t rssi() const     = 0;
};

// Scriptable radio for host tests: association only succeeds when a test says
// it should, and a test can drop the link at any moment.
class SimulatedWifiRadio : public IWifiRadio {
   public:
    void configure() override { ++configureCount; }

    void connect(const char* /*ssid*/, const char* /*password*/) override {
        ++connectCount;
        attempting_ = true;
        if (associateImmediately) {
            connected_  = true;
            attempting_ = false;
        }
    }

    void disconnect() override {
        connected_  = false;
        attempting_ = false;
    }

    bool isConnected() const override { return connected_; }
    int32_t rssi() const override { return connected_ ? rssiValue : 0; }

    // --- test controls ---
    // When false, connect() leaves the radio pending until completeAssociation().
    bool associateImmediately = true;
    int32_t rssiValue         = -55;
    uint32_t connectCount     = 0;
    uint32_t configureCount   = 0;

    void completeAssociation() {
        if (attempting_) {
            connected_  = true;
            attempting_ = false;
        }
    }
    void dropLink() { connected_ = false; }
    bool attempting() const { return attempting_; }

   private:
    bool connected_  = false;
    bool attempting_ = false;
};

}  // namespace hydrax
