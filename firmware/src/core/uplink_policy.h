// HYDRAX - uplink retry policy.
//
// Pure decision, kept out of the HTTP code so it can be tested: given a
// backend response, should the queued payload be retried or discarded?
//
// Getting this wrong is a real failure mode. A payload the backend will always
// reject (malformed, unauthorized) must not be retried forever, because it
// would sit at the head of the outbox and block every later payload behind it.
#pragma once

namespace hydrax {

// `status` is an HTTP status code, or negative for a transport-level failure.
inline bool isPermanentRejection(int status) {
    // Transport failures and 5xx are the backend's problem and may clear.
    if (status < 400 || status >= 500) return false;
    // Explicitly transient 4xx responses.
    if (status == 408 || status == 429) return false;
    return true;
}

}  // namespace hydrax
