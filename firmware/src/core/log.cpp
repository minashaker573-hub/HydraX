#include "core/log.h"

#include <cstdio>

namespace hydrax {

LogSink Log::sink_   = nullptr;
LogLevel Log::level_ = LogLevel::kInfo;

const char* logLevelName(LogLevel level) {
    switch (level) {
        case LogLevel::kError: return "ERROR";
        case LogLevel::kWarn:  return "WARN";
        case LogLevel::kInfo:  return "INFO";
        case LogLevel::kDebug: return "DEBUG";
    }
    return "?";
}

void Log::setSink(LogSink sink) { sink_ = sink; }
void Log::setLevel(LogLevel level) { level_ = level; }
LogLevel Log::level() { return level_; }

void Log::write(LogLevel level, const char* tag, const char* fmt, ...) {
    if (sink_ == nullptr) return;
    if (static_cast<uint8_t>(level) > static_cast<uint8_t>(level_)) return;

    char buffer[192];
    va_list args;
    va_start(args, fmt);
    vsnprintf(buffer, sizeof(buffer), fmt, args);
    va_end(args);

    sink_(level, tag, buffer);
}

}  // namespace hydrax
