#pragma once
#include <stdint.h>

// Generated from js/pid-profiles.js by tools/sync-pid-profiles.mjs.
static constexpr unsigned ZJ_PID_RATE_GAIN_COUNT=9,ZJ_PID_GAIN_COUNT=15;
static constexpr const char* const ZJ_PID_AXES[]={"rateRoll","ratePitch","rateYaw","angleRoll","anglePitch"};
struct ZjPidProfile {const char* id;bool plus;uint32_t gains[ZJ_PID_GAIN_COUNT];};
static constexpr ZjPidProfile ZJ_PID_PROFILES[]={
 {"aerof450-quad-x",false,{900,15000,30,900,15000,30,3000,15000,0,3000,0,0,3000,0,0}},
 {"aerof450-quad-plus",true,{900,15000,30,900,15000,30,3000,15000,0,3000,0,0,3000,0,0}}
};
static constexpr unsigned ZJ_PID_PROFILE_COUNT=sizeof(ZJ_PID_PROFILES)/sizeof(ZJ_PID_PROFILES[0]);
