// HYDRAX - ESP32 Wi-Fi radio.
//
// Thin adapter over the Arduino WiFi library. Contains no retry or backoff
// policy; that lives in core/wifi_manager.h where it can be tested.
#pragma once

#include "hal/wifi_radio.h"

namespace hydrax {

class Esp32WifiRadio : public IWifiRadio {
   public:
    void configure() override;
    void connect(const char* ssid, const char* password) override;
    void disconnect() override;
    bool isConnected() const override;
    int32_t rssi() const override;
};

}  // namespace hydrax
