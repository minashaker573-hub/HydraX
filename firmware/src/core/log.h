// HYDRAX - leveled logging.
//
// The core must be able to log without knowing that `Serial` exists. A sink is
// installed once at startup (main.cpp on device, a capture buffer in tests);
// everything else just calls HX_LOG_*.
#pragma once

#include <cstdarg>
#include <cstdint>

namespace hydrax {

enum class LogLevel : uint8_t {
    kError = 0,
    kWarn  = 1,
    kInfo  = 2,
    kDebug = 3,
};

const char* logLevelName(LogLevel level);

// Sink receives an already-formatted line. Must not block for long: it runs
// inside the control loop.
using LogSink = void (*)(LogLevel level, const char* tag, const char* message);

class Log {
   public:
    static void setSink(LogSink sink);
    static void setLevel(LogLevel level);
    static LogLevel level();

    static void write(LogLevel level, const char* tag, const char* fmt, ...);

   private:
    static LogSink sink_;
    static LogLevel level_;
};

}  // namespace hydrax

#define HX_LOG_ERROR(tag, ...) ::hydrax::Log::write(::hydrax::LogLevel::kError, tag, __VA_ARGS__)
#define HX_LOG_WARN(tag, ...)  ::hydrax::Log::write(::hydrax::LogLevel::kWarn, tag, __VA_ARGS__)
#define HX_LOG_INFO(tag, ...)  ::hydrax::Log::write(::hydrax::LogLevel::kInfo, tag, __VA_ARGS__)
#define HX_LOG_DEBUG(tag, ...) ::hydrax::Log::write(::hydrax::LogLevel::kDebug, tag, __VA_ARGS__)
