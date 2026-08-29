#include "hal/esp32_wifi_radio.h"

#include <WiFi.h>

namespace hydrax {

void Esp32WifiRadio::configure() {
    WiFi.mode(WIFI_STA);
    // Do not rewrite credentials to flash on every boot.
    WiFi.persistent(false);
    WiFi.setAutoReconnect(true);
    // Modem sleep makes telemetry latency unpredictable for no useful saving
    // on a mains/solar powered controller.
    WiFi.setSleep(false);
}

void Esp32WifiRadio::connect(const char* ssid, const char* password) {
    WiFi.disconnect();
    WiFi.begin(ssid, password);  // asynchronous
}

void Esp32WifiRadio::disconnect() { WiFi.disconnect(); }

bool Esp32WifiRadio::isConnected() const { return WiFi.status() == WL_CONNECTED; }

int32_t Esp32WifiRadio::rssi() const { return WiFi.RSSI(); }

}  // namespace hydrax
