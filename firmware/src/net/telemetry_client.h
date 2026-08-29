// HYDRAX - telemetry uplink.
//
// HTTP is slow and can stall for seconds. The irrigation loop must never wait
// on it, so all network I/O runs on its own FreeRTOS task pinned to the
// protocol core, and the control loop only ever does a short mutex-guarded
// push into an in-memory queue.
//
// While offline, telemetry and events accumulate in fixed-size outboxes and
// are flushed when the link returns. Oldest entries are dropped when full;
// nothing grows without bound and nothing blocks.
#pragma once

#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <freertos/task.h>

#include <cstdint>

#include "config/hydrax_config.h"
#include "core/irrigation_controller.h"
#include "core/outbox.h"
#include "core/telemetry.h"
#include "core/wifi_manager.h"

namespace hydrax {

// A ControllerEvent flattened for queueing. `detail` always points at a string
// literal owned by the controller, so storing the pointer is safe.
struct QueuedEvent {
    EventType type      = EventType::kControllerStarted;
    uint8_t zoneId      = kNoZone;
    float moisture      = 0.0f;
    uint32_t atMs       = 0;
    uint32_t durationMs = 0;
    const char* detail  = "";
};

constexpr size_t kEventQueueCapacity = 24;

class TelemetryClient {
   public:
    // Starts the background network task. `wifi` must outlive this object.
    bool begin(WifiManager* wifi, const char* baseUrl, const char* deviceKey);

    // Called from the control loop. Both return quickly and never block on I/O.
    void queueTelemetry(const TelemetrySnapshot& snapshot);
    void queueEvent(const ControllerEvent& event);

    bool lastPublishOk() const { return lastPublishOk_; }
    uint32_t publishedCount() const { return publishedCount_; }
    uint32_t failedCount() const { return failedCount_; }
    uint32_t droppedCount() const;

   private:
    static void taskEntry(void* arg);
    void taskLoop();

    // Returns the HTTP status, or a negative value on a transport error.
    int postJson(const char* path, const char* body);
    // True when the backend's answer means retrying can never succeed, so the
    // payload must be discarded instead of blocking the head of the queue.
    static bool isPermanentRejection(int status);

    bool flushOneEvent();
    bool flushOneTelemetry();

    bool lock(uint32_t timeoutMs);
    void unlock();

    WifiManager* wifi_     = nullptr;
    const char* baseUrl_   = nullptr;
    const char* deviceKey_ = nullptr;

    SemaphoreHandle_t mutex_ = nullptr;
    TaskHandle_t task_       = nullptr;

    Outbox<TelemetrySnapshot, config::kTelemetryQueueCapacity> telemetry_;
    Outbox<QueuedEvent, kEventQueueCapacity> events_;

    volatile bool lastPublishOk_    = false;
    volatile uint32_t publishedCount_ = 0;
    volatile uint32_t failedCount_    = 0;
};

}  // namespace hydrax
