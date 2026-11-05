#pragma once
#include <stdint.h>

// Generated from js/pid-profiles.js by tools/sync-pid-profiles.mjs.
static constexpr unsigned ZJ_PID_RATE_GAIN_COUNT=9,ZJ_PID_GAIN_COUNT=15;
static constexpr const char* const ZJ_PID_AXES[]={"rateRoll","ratePitch","rateYaw","angleRoll","anglePitch"};
struct ZjPidProfile {const char* id;bool plus;uint32_t gains[ZJ_PID_GAIN_COUNT];};
static constexpr ZjPidProfile ZJ_PID_PROFILES[]={
 {"aerof450-quad-x",false,{1400,18000,35,1400,18000,35,3000,20000,0,3000,0,0,3000,0,0}},
 {"aerof450-quad-plus",true,{1400,18000,35,1400,18000,35,3000,20000,0,3000,0,0,3000,0,0}}
};
static constexpr unsigned ZJ_PID_PROFILE_COUNT=sizeof(ZJ_PID_PROFILES)/sizeof(ZJ_PID_PROFILES[0]);
