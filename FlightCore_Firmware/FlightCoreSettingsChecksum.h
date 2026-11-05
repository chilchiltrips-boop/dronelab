#pragma once
#include <stdint.h>

inline uint32_t zjSettingsChecksum(const String& body){
 uint32_t checksum=2166136261u;
 for(size_t n=0;n<body.length();n++)checksum=(checksum^uint8_t(body[n]))*16777619u;
 return checksum;
}
