#include "net/telemetry_client.h"

#include <Arduino.h>
#include <HTTPClient.h>

#include <cstdio>
#include <cstring>

#include "core/clock.h"
#include "core/uplink_policy.h"
#include "core/log.h"

namespace hydrax {
namespace {
constexpr const char* kTag = "telemetry";

constexpr uint32_t kTaskStackWords = 6144;
constexpr UBaseType_t kTaskPriority = 3;
// Pin the network task to core 0 (the protocol core) so it cannot delay the
// control loop running on core 1.
constexpr BaseType_t kTaskCore = 0;

constexpr uint32_t kTaskPeriodMs = 200;
// Never hold the control loop for more than a tick to enqueue.
constexpr uint32_t kProducerLockTimeoutMs = 5;
constexpr uint32_t kConsumerLockTimeoutMs = 100;

constexpr size_t kEventBufferSize = 320;
}  // namespace

bool TelemetryClient::begin(WifiManager* wifi, const char* baseUrl, const char* deviceKey) {
    wifi_      = wifi;
    baseUrl_   = baseUrl;
    deviceKey_ = deviceKey;

    mutex_ = xSemaphoreCreateMutex();
    if (mutex_ == nullptr) {
        HX_LOG_ERROR(kTag, "Could not create telemetry mutex - uplink disabled");
        return false;
    }

    const BaseType_t created = xTaskCreatePinnedToCore(&TelemetryClient::taskEntry, "hydrax_net",
                                                       kTaskStackWords, this, kTaskPriority,
                                                       &task_, kTaskCore);
    if (created != pdPASS) {
        HX_LOG_ERROR(kTag, "Could not start network task - uplink disabled");
        return false;
    }

    HX_LOG_INFO(kTag, "Uplink task started (endpoint %s)",
                baseUrl_ != nullptr ? baseUrl_ : "(unset)");
    return true;
}

bool TelemetryClient::lock(uint32_t timeoutMs) {
    if (mutex_ == nullptr) return false;
    return xSemaphoreTake(mutex_, pdMS_TO_TICKS(timeoutMs)) == pdTRUE;
}

void TelemetryClient::unlock() {
    if (mutex_ != nullptr) xSemaphoreGive(mutex_);
}

uint32_t TelemetryClient::droppedCount() const {
    return telemetry_.droppedCount() + events_.droppedCount();
}

// ---------------------------------------------------------------------------
// producer side (control loop)
// ---------------------------------------------------------------------------

void TelemetryClient::queueTelemetry(const TelemetrySnapshot& snapshot) {
    // If the lock is momentarily unavailable we drop this sample rather than
    // stall the control loop. Another one follows in kTelemetryIntervalMs.
    if (!lock(kProducerLockTimeoutMs)) return;
    telemetry_.push(snapshot);
    unlock();
}

void TelemetryClient::queueEvent(const ControllerEvent& event) {
    QueuedEvent queued;
    queued.type       = event.type;
    queued.zoneId     = event.zoneId;
    queued.moisture   = event.moisture;
    queued.atMs       = event.atMs;
    queued.durationMs = event.durationMs;
    queued.detail     = event.detail;

    if (!lock(kProducerLockTimeoutMs)) {
        HX_LOG_WARN(kTag, "Dropped event %s: outbox busy", eventTypeName(event.type));
        return;
    }
    events_.push(queued);
    unlock();
}

// ---------------------------------------------------------------------------
// consumer side (network task)
// ---------------------------------------------------------------------------

void TelemetryClient::taskEntry(void* arg) {
    static_cast<TelemetryClient*>(arg)->taskLoop();
}

void TelemetryClient::taskLoop() {
    for (;;) {
        const uint32_t now = millis();
        if (wifi_ != nullptr) wifi_->tick(now);

        if (wifi_ != nullptr && wifi_->isConnected()) {
            // Events first: they are the audit trail and are far rarer than
            // telemetry, so they must not be starved or aged out behind it.
            if (!flushOneEvent()) {
                flushOneTelemetry();
            }
        }

        vTaskDelay(pdMS_TO_TICKS(kTaskPeriodMs));
    }
}

bool TelemetryClient::flushOneEvent() {
    QueuedEvent event;
    if (!lock(kConsumerLockTimeoutMs)) return false;
    const bool has = events_.peek(event);
    unlock();
    if (!has) return false;

    char body[kEventBufferSize];
    const int zone = (event.zoneId == kNoZone) ? -1 : static_cast<int>(event.zoneId + 1);

    int written = std::snprintf(body, sizeof(body),
                                "{\"device_id\":\"%s\",\"uptime_ms\":%lu,\"type\":\"%s\","
                                "\"zone\":%d,\"moisture\":%.1f,\"duration_ms\":%lu,"
                                "\"detail\":\"%s\"}",
                                config::kDeviceId, static_cast<unsigned long>(event.atMs),
                                eventTypeName(event.type), zone,
                                static_cast<double>(event.moisture),
                                static_cast<unsigned long>(event.durationMs), event.detail);
    if (written < 0 || static_cast<size_t>(written) >= sizeof(body)) {
        HX_LOG_ERROR(kTag, "Event payload too large - discarding %s", eventTypeName(event.type));
        if (lock(kConsumerLockTimeoutMs)) {
            events_.pop();
            unlock();
        }
        return true;
    }

    const int status = postJson("/api/v1/events", body);
    const bool ok    = (status >= 200 && status < 300);
    if (!ok && !isPermanentRejection(status)) return false;

    if (!ok) {
        HX_LOG_ERROR(kTag, "Backend rejected event %s (status %d) - discarding",
                     eventTypeName(event.type), status);
    }
    if (lock(kConsumerLockTimeoutMs)) {
        events_.pop();
        unlock();
    }
    return true;
}

bool TelemetryClient::flushOneTelemetry() {
    TelemetrySnapshot snapshot;
    if (!lock(kConsumerLockTimeoutMs)) return false;
    const bool has = telemetry_.peek(snapshot);
    unlock();
    if (!has) return false;

    char body[kTelemetryBufferSize];
    if (serializeTelemetry(snapshot, body, sizeof(body)) < 0) {
        HX_LOG_ERROR(kTag, "Telemetry payload did not fit in %u bytes - discarding",
                     static_cast<unsigned>(kTelemetryBufferSize));
        if (lock(kConsumerLockTimeoutMs)) {
            telemetry_.pop();
            unlock();
        }
        return true;
    }

    const int status = postJson("/api/v1/telemetry", body);
    const bool ok    = (status >= 200 && status < 300);
    if (!ok && !isPermanentRejection(status)) return false;

    if (!ok) {
        HX_LOG_ERROR(kTag, "Backend rejected telemetry (status %d) - discarding", status);
    }
    if (lock(kConsumerLockTimeoutMs)) {
        telemetry_.pop();
        unlock();
    }
    return true;
}

bool TelemetryClient::isPermanentRejection(int status) { return hydrax::isPermanentRejection(status); }

int TelemetryClient::postJson(const char* path, const char* body) {
    if (baseUrl_ == nullptr) return -1;

    char url[192];
    if (std::snprintf(url, sizeof(url), "%s%s", baseUrl_, path) < 0) return -1;

    HTTPClient http;
    http.setTimeout(config::kHttpTimeoutMs);
    http.setConnectTimeout(config::kHttpTimeoutMs);
    if (!http.begin(url)) {
        HX_LOG_WARN(kTag, "Could not open %s", url);
        lastPublishOk_ = false;
        return -1;
    }

    http.addHeader("Content-Type", "application/json");
    if (deviceKey_ != nullptr) http.addHeader("X-Device-Key", deviceKey_);

    // HTTPClient::POST takes a non-const uint8_t* even though it only reads the
    // payload; the cast works around that missing const in the Arduino API. The
    // pointer-and-length overload is used instead of the String one so a ~1.2 KB
    // telemetry body is not copied onto the heap on every publish.
    const int status = http.POST(reinterpret_cast<uint8_t*>(const_cast<char*>(body)),
                                 static_cast<size_t>(strlen(body)));
    http.end();

    const bool ok = (status >= 200 && status < 300);
    if (ok) {
        ++publishedCount_;
        lastPublishOk_ = true;
    } else {
        ++failedCount_;
        lastPublishOk_ = false;
        // Expected whenever the backend is down. The farm keeps watering.
        HX_LOG_WARN(kTag, "POST %s failed (status %d)", path, status);
    }
    return status;
}

}  // namespace hydrax
