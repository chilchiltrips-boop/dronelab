#pragma once
#include <stdint.h>

// Short radio/HTTP gaps keep the existing source and throttle. Directional
// commands centre after 300 ms; no open-loop throttle is retained past 1 s.
namespace RcLinkPolicy {
constexpr uint32_t CENTER_AFTER_MS = 300;
constexpr uint32_t LOST_AFTER_MS = 1000;
inline bool live(uint32_t now, uint32_t receivedAt) {
    return receivedAt && uint32_t(now - receivedAt) < LOST_AFTER_MS;
}
inline void centreDuringGap(uint16_t channels[10], uint32_t age) {
    if (age >= CENTER_AFTER_MS) channels[0] = channels[1] = channels[3] = 1500;
}
}
