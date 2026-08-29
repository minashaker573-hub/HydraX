// HYDRAX - credential template.
//
// Copy this file to `secrets.h` and fill in real values.
// `secrets.h` is git-ignored and MUST NOT be committed.
//
//   cp firmware/src/config/secrets.example.h firmware/src/config/secrets.h
#pragma once

namespace hydrax {
namespace secrets {

constexpr const char* kWifiSsid     = "YOUR_WIFI_SSID";
constexpr const char* kWifiPassword = "YOUR_WIFI_PASSWORD";

// Base URL of the HYDRAX backend, no trailing slash.
// Example: "http://192.168.1.50:8080"
constexpr const char* kBackendBaseUrl = "http://192.168.1.50:8080";

// Shared secret sent as the X-Device-Key header. Must match the value the
// backend was started with (HYDRAX_DEVICE_KEY).
constexpr const char* kDeviceKey = "CHANGE_ME";

}  // namespace secrets
}  // namespace hydrax
