#define ZJ_SHIM_EXTERNAL_MICROS
#define ZJ_TIMING_SYNCHRONOUS_TEST
#include "host-stubs/ArduinoShim.h"
#include <cassert>
#include <cmath>
#include <array>
#include <vector>
#include <iostream>
static uint32_t clockUs=0;
static uint32_t micros(){return clockUs;}
static constexpr int HEX=16;
struct ImuWire {
 uint8_t reg=0;std::vector<uint8_t> tx,rx;size_t pos=0;
 std::array<uint8_t,256> registers{};
 int16_t x=131,y=-262,z=65;
 int16_t ax=4096,ay=-8192,az=2048;
 bool fresh=true,nack=false,shortRead=false,badConfig=false;
 unsigned transactions=0,writes=0;
 ImuWire(){registers[0x75]=0x68;registers[0x0F]=0x69;}
 void beginTransmission(uint8_t){tx.clear();}
 void write(uint8_t v){tx.push_back(v);}
 uint8_t endTransmission(bool=true){
  ++transactions;if(nack){nack=false;return 2;}
  if(tx.empty())return 4;
  reg=tx[0];if(tx.size()>1){++writes;registers[reg]=badConfig&&reg==0x1A?0:tx[1];}return 0;
 }
 uint8_t requestFrom(uint8_t,uint8_t count){
  rx.clear();pos=0;
  if(reg==0x3B){for(auto v:{ax,ay,az,int16_t(0),x,y,z}){rx.push_back(uint16_t(v)>>8);rx.push_back(uint16_t(v)&255);}}
  else if(reg==0x43||reg==0x22){for(auto v:{x,y,z}){
   const uint8_t hi=uint16_t(v)>>8,lo=uint16_t(v)&255;
   if(reg==0x43){rx.push_back(hi);rx.push_back(lo);}else{rx.push_back(lo);rx.push_back(hi);}
  }}else if(reg==0x3A){rx.push_back(fresh?1:0);fresh=false;}
  else rx.push_back(registers[reg]);
  if(shortRead){shortRead=false;rx.clear();}
  return uint8_t(rx.size()<count?rx.size():count);
 }
 int read(){return pos<rx.size()?rx[pos++]:-1;}
} Wire;
#include "FlightCoreTiming.h"
#include "FlightCoreEscProfile.h"
static ZjRateCounter zjTelemetryRate;
static uint16_t telRateHz=20;static uint32_t telemetryDropped=0;
#include "generated-imu.h"
static void advance(uint32_t us=1000,bool fresh=true){clockUs+=us;clockMs=clockUs/1000;Wire.fresh=fresh;updateGyro(clockMs);}
static void reset(){
 Wire=ImuWire{};clockUs=100000;clockMs=100;gyroReady=false;gyroSampleSeq=0;lastGyroSample=0;lastGyroProbe=clockMs-2500;
 RateRoll=RatePitch=RateYaw=0;
 zjImuDriver=ZjImuAcquisition{};zjImuDriver.lastGyroProbe=clockMs-2500;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 zjImuDriver.gyroConfigured=zjImuDriver.gyroConfigValid=zjImuDriver.gyroWaitingFresh=false;zjImuDriver.zjGyroCalibration=ZjGyroCalibration{};
 zjImuDriver.gyroReadFailures=zjImuDriver.gyroWriteFailures=zjImuDriver.gyroMaxGapUs=zjImuDriver.gyroMaxReadUs=0;
#endif
 updateGyro(clockMs);
}
static void finish(){for(int i=0;i<2800&&!gyroReady;i++)advance();assert(gyroReady);}
int main(){
 reset();
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 assert(!gyroReady&&zjImuDriver.zjGyroCalibration.is("SETTLING"));
 assert(Wire.registers[0x1A]==5&&Wire.registers[0x1B]==8&&Wire.registers[0x1C]==16&&Wire.registers[0x19]==0&&Wire.registers[0x38]==1);
 for(int i=0;i<260;i++)advance();
 const auto count=zjImuDriver.zjGyroCalibration.samples;
 for(int i=0;i<50;i++)advance(1000,false);
 assert(zjImuDriver.zjGyroCalibration.samples==count&&!gyroReady&&gyroSampleSeq==0);
 finish();assert(zjImuDriver.zjGyroCalibration.samples==2000&&gyroSampleSeq==1);
 assert(fabs(RateRoll)<0.0001&&fabs(RatePitch)<0.0001&&fabs(RateYaw)<0.0001);
 assert(fabs(zjImuDriver.zjGyroCalibration.bias[0]-2)<0.0001);
 Wire.x+=1310;Wire.y-=655;advance(20000);
 assert(fabs(RateRoll-20)<0.0001&&fabs(RatePitch+10)<0.0001);
 assert(zjImuStatus().indexOf('[')>0);
 // Actual acquisition path: normal 250Hz, fresh equal values count, no register
 // writes per read, coherent +/-8g accel burst, missed-period and stale handling.
 const auto before=gyroSampleSeq,writes=Wire.writes;
 for(int i=0;i<1000;i++)advance(1000);
 assert(gyroSampleSeq-before==250&&Wire.writes==writes);
 const auto jitterBefore=gyroSampleSeq;const uint32_t intervals[]={1000,900,1000,900,1200};
 for(int i=0;i<1000;i++)advance(intervals[i%5]);
 assert(gyroSampleSeq-jitterBefore==250); // fixed phase avoids drift to ~200Hz

 assert(fabs(zjImuDriver.accelG[0]-1)<0.0001&&fabs(zjImuDriver.accelG[1]+2)<0.0001&&fabs(zjImuDriver.accelG[2]-0.5)<0.0001);
 const auto seq=gyroSampleSeq;advance(4000,false);assert(gyroSampleSeq==seq);
 advance(12000);assert(zjImuDriver.sample.missed>=2);
 assert(zjImuDriver.sample.fresh(clockUs,12000));
 // A short read invalidates readiness; no invalid sample enters calibration.
 Wire.shortRead=true;advance(20000);assert(!gyroReady&&zjImuDriver.gyroReadFailures==1&&zjImuDriver.zjGyroCalibration.is("SENSOR_ERROR"));
 Wire.x=262;Wire.y=-131;advance(2500000);assert(zjImuDriver.zjGyroCalibration.attempt==2&&zjImuDriver.zjGyroCalibration.samples==0);
 finish();assert(fabs(zjImuDriver.zjGyroCalibration.bias[0]-4)<0.0001&&fabs(RateRoll)<0.0001);
 assert(zjImuDriver.zjGyroCalibration.failures==1&&std::string(zjImuDriver.zjGyroCalibration.lastFailure)=="I2C_ERROR"&&zjImuDriver.zjGyroCalibration.lastFailureAttempt==1);
 // Motion repeatedly resets the window, then reaches a bounded failure.
 reset();for(int i=0;i<15001;i++){Wire.x=4000;advance();}
 assert(!gyroReady&&zjImuDriver.zjGyroCalibration.is("FAILED")&&zjImuDriver.zjGyroCalibration.restarts>0);
 assert(std::string(zjImuDriver.zjGyroCalibration.error)=="CALIBRATION_TIMEOUT");
 assert(zjImuDriver.zjGyroCalibration.failures==1);
 // Configuration read-back catches an acknowledged but unapplied write.
 reset();zjImuDriver.gyroConfigured=false;zjImuDriver.lastGyroProbe=clockMs-2500;Wire.badConfig=true;updateGyro(clockMs);
 assert(!gyroReady&&!zjImuDriver.gyroConfigured&&std::string(zjImuDriver.zjGyroCalibration.error)=="CONFIG_MISMATCH");
 // Never count repeated stale registers as new samples.
 reset();for(int i=0;i<600;i++)advance(1000,false);
 assert(!gyroReady&&zjImuDriver.zjGyroCalibration.is("SENSOR_ERROR")&&zjImuDriver.zjGyroCalibration.samples==0);
 // Calibration arithmetic, timing rollover, and exactly-once correction.
 ZjGyroCalibration cal;const uint32_t start=0xfffffff0u;cal.start(start);
 const float raw[]={1.5f,-2.25f,0.5f};
 for(uint32_t i=0;i<2000;i++)cal.feed(raw,start+250+i,0xfffff000u+i*1000);
 assert(cal.is("READY")&&cal.samples==2000&&fabs(cal.bias[1]+2.25)<0.00001&&cal.maxGapUs==1000);
 std::cout<<"PASS A2 actual IMU: 2000 fresh samples, known bias/rate, data-ready, no premature READY, failure/recovery, motion/timeout, config read-back, clock rollover\n";
#else
 assert(gyroReady);advance(20000);
 assert(gyroSampleSeq==1&&fabs(RateRoll-131*0.070f)<0.0001);
 assert(Wire.registers[0x11]==0x4C&&Wire.registers[0x12]==0x44&&Wire.registers[0x38]==0);
 std::cout<<"PASS A1 actual IMU unchanged: LSM6DS3 configuration, direct rates and 50Hz sampling\n";
#endif
}
