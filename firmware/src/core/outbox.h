// HYDRAX - fixed-capacity outbox.
//
// Telemetry and events are produced by the control loop whether or not the
// network is up. They land here first. When the buffer is full the OLDEST
// entry is dropped, because for monitoring the freshest state matters more
// than a complete history, and because blocking or growing without bound
// inside a control loop is not acceptable.
//
// Pure, allocation-free, header-only: usable on device and in host tests.
#pragma once

#include <cstddef>
#include <cstdint>

namespace hydrax {

template <typename T, size_t Capacity>
class Outbox {
   public:
    static_assert(Capacity > 0, "Outbox capacity must be non-zero");

    bool empty() const { return count_ == 0; }
    bool full() const { return count_ == Capacity; }
    size_t size() const { return count_; }
    static constexpr size_t capacity() { return Capacity; }
    uint32_t droppedCount() const { return dropped_; }

    // Returns false if an older entry had to be discarded to make room.
    bool push(const T& item) {
        bool droppedOne = false;
        if (full()) {
            head_ = next(head_);
            --count_;
            ++dropped_;
            droppedOne = true;
        }
        items_[tail_] = item;
        tail_         = next(tail_);
        ++count_;
        return !droppedOne;
    }

    // Reads the oldest entry without removing it.
    bool peek(T& out) const {
        if (empty()) return false;
        out = items_[head_];
        return true;
    }

    // Removes the oldest entry. Call only after it has been delivered.
    bool pop() {
        if (empty()) return false;
        head_ = next(head_);
        --count_;
        return true;
    }

    void clear() {
        head_  = 0;
        tail_  = 0;
        count_ = 0;
    }

   private:
    static size_t next(size_t index) { return (index + 1) % Capacity; }

    T items_[Capacity]{};
    size_t head_     = 0;
    size_t tail_     = 0;
    size_t count_    = 0;
    uint32_t dropped_ = 0;
};

}  // namespace hydrax
