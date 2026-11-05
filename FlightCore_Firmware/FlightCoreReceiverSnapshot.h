#pragma once
#include <stdint.h>

enum class ZjReceiverSource : uint8_t {NONE,PPM,ANDROID,WEB};

struct FlightReceiverSnapshot {
 // Canonical order is Roll, Pitch, Throttle, Yaw, AUX1 through AUX4.
 // Values outside availableMask are neutral placeholders for internal math only.
 uint16_t channels[8]={1500,1500,1000,1500,1000,1000,1000,1000};
 uint32_t sequence=0,receivedAtMs=0,accepted=0,generation=0;
 ZjReceiverSource source=ZjReceiverSource::NONE;
 uint8_t availableMask=0;
 bool valid=false,selected=false,inputArmed=false;

 bool fresh(uint32_t now,uint32_t maximumAgeMs)const{
  return valid&&selected&&sequence&&(availableMask&0x0f)==0x0f&&uint32_t(now-receivedAtMs)<=maximumAgeMs;
 }
};

inline void zjMapPpmChannels(const uint16_t (&physical)[8],const uint8_t (&map)[5],uint16_t (&channels)[8]){
 uint8_t used=0;
 for(unsigned n=0;n<5;n++){channels[n]=physical[map[n]];used|=uint8_t(1u<<map[n]);}
 unsigned next=5;
 for(unsigned n=0;n<8;n++)if(!(used&(1u<<n)))channels[next++]=physical[n];
}
