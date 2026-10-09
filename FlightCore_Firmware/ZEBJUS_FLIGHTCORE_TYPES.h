#pragma once
#include <Arduino.h>

// Declared in a header so Arduino auto-generated function prototypes can
// reference custom types safely before the .ino body is parsed.
enum ImuKind : uint8_t { IMU_NONE=0, IMU_LSM6DS3=1, IMU_MPU6050=2 };
enum FlightModeKind : uint8_t { FLIGHT_ANGLE=0, FLIGHT_RATE=1 };
enum RcSourceKind : uint8_t { RC_NONE=0, RC_PPM=1, RC_WEB_STA=2, RC_WEB_AP=3 };
enum BenchModeKind : uint8_t { BENCH_NONE=0, BENCH_MOTOR=1, BENCH_MOTOR_SEQUENCE=2, BENCH_ESC_CAL=3,BENCH_ESC_MANUAL=4 };

struct PidAxis{ float p=0,i=0,d=0; };
struct FlightPidSettings{
  PidAxis rateRoll,ratePitch,rateYaw;
  PidAxis angleRateRoll,angleRatePitch,angleRateYaw;
  PidAxis angleRoll,anglePitch;
};

struct ImuSample{
  uint8_t address=0,whoAmI=0,kind=0;
  int16_t rawGx=0,rawGy=0,rawGz=0,rawAx=0,rawAy=0,rawAz=0;
  float gx=0,gy=0,gz=0,ax=0,ay=0,az=0;
  uint32_t sampledAt=0;
};
