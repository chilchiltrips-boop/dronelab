#pragma once
#include <stdint.h>

// Profile math is testable without an ESC. Only the established 50Hz profile
// is deployable; 250Hz stays disabled until a separate hardware compatibility
// change. There is deliberately no runtime frequency-switch command.
struct ZjEscProfile {
 uint16_t hz=50;
 uint8_t bits=14;
 bool valid()const{return (hz==50||hz==250)&&bits==14;}
 bool deployable()const{return valid()&&hz==50;}
 uint32_t duty(uint16_t pulseUs)const{
  if(!valid()||pulseUs<1000||pulseUs>2000||uint32_t(pulseUs)*hz>=1000000)return 0;
  return uint32_t(uint64_t(pulseUs)*(uint64_t(1)<<bits)*hz/1000000ULL);
 }
};

static constexpr ZjEscProfile ZJ_ESC_PROFILE={50,14};
