#pragma once
#include <stdint.h>

// Working sketch output. Legacy 50 Hz remains representable for compatibility.
struct ZjEscProfile {
 uint16_t hz=250;
 uint8_t bits=12;
 bool valid()const{return (hz==250&&bits==12)||(hz==50&&bits==14);}
 bool deployable()const{return valid();}
 uint32_t duty(uint16_t pulseUs)const{
  if(!valid()||pulseUs<1000||pulseUs>2000)return 0;
  if(hz==250)return (uint32_t(pulseUs)*4096UL+2000UL)/4000UL;
  return uint32_t(uint64_t(pulseUs)*(uint64_t(1)<<bits)*hz/1000000ULL);
 }
};

static constexpr ZjEscProfile ZJ_ESC_PROFILE={250,12};
