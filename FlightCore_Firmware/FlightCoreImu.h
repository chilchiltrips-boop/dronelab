#pragma once
#include "FlightCoreGyroCalibration.h"
#include "FlightCoreTiming.h"
#include "FlightCoreAccelCalibration.h"

enum class ZjImuAction : uint8_t { NONE, GYRO, CANCEL_GYRO, LEVEL, FACE, CLEAR_ACCEL };

// Caller owns Wire and this state for the entire update. No printing, JSON,
// flash, network, or actuation here. INT is not wired: DATA_RDY proves freshness;
// timestamp is acquisition-complete time, not the unknown physical conversion.
struct ZjImuAcquisition {
 ZjSampleStamp sample;
 ZjRateCounter sampleRate;
 float accelG[3]={};
bool gyroReady=false;
unsigned long lastGyro=0,lastGyroProbe=0,lastGyroSample=0;
uint32_t gyroSampleSeq=0;
const char* gyroHealth="STARTING";
float RateRoll=0,RatePitch=0,RateYaw=0;

#if defined(CONFIG_IDF_TARGET_ESP32C6)
ZjGyroCalibration zjGyroCalibration;
ZjAccelModel accelModel;
ZjAccelCapture accelCapture;
float accelRawG[3]={};
bool manualGyro=false,gyroPaused=false;
uint32_t maintenanceSequence=0;
bool gyroConfigured=false,gyroConfigValid=false,gyroWaitingFresh=false;
uint8_t gyroWhoAmI=0,gyroLastI2cCode=0;
uint32_t gyroReadFailures=0,gyroWriteFailures=0,gyroLastPollUs=0,gyroWaitStarted=0;
uint32_t gyroLastNormalUs=0,gyroMaxGapUs=0,gyroMaxReadUs=0,gyroNextNormalUs=0;
float gyroRaw[3]={};
void imuAction(ZjImuAction action,uint8_t face,uint32_t now){
 if(action==ZjImuAction::GYRO){
  if(!gyroConfigured){gyroPaused=false;return;}
  manualGyro=true;gyroPaused=false;gyroReady=false;sample.valid=false;
  zjGyroCalibration.start(now);gyroLastPollUs=micros();gyroWaitingFresh=false;
  if(accelCapture.running)accelCapture.fail("GYRO_RECALIBRATING");
  gyroStatus("CALIBRATING");
 }else if(action==ZjImuAction::CANCEL_GYRO){
  manualGyro=false;gyroPaused=true;gyroReady=false;sample.valid=false;
  zjGyroCalibration.fail("CALIBRATION_CANCELLED",now);
  if(accelCapture.running)accelCapture.fail("GYRO_CANCELLED");
  gyroStatus("CALIBRATION_FAILED");
 }else if(action==ZjImuAction::CLEAR_ACCEL){
  accelCapture=ZjAccelCapture{};
 }else if(gyroReady&&sample.fresh(micros(),12000)){
  const auto base=accelCapture.ready?accelCapture.result:accelModel;
  accelCapture.start(now,face,action==ZjImuAction::LEVEL,base);
 }else accelCapture.fail("IMU_NOT_READY");
}
#endif

bool gyroWrite(uint8_t reg,uint8_t value){
 Wire.beginTransmission(GYRO_ADDR);Wire.write(reg);Wire.write(value);
 const uint8_t error=Wire.endTransmission();
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 if(error){++gyroWriteFailures;gyroLastI2cCode=error;}
#endif
 return error==0;
}
bool gyroRead(uint8_t reg,uint8_t* data,uint8_t length){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 const uint32_t started=micros();
#endif
 Wire.beginTransmission(GYRO_ADDR);Wire.write(reg);
 const uint8_t error=Wire.endTransmission(false);
 const uint8_t received=error?0:Wire.requestFrom(GYRO_ADDR,length);
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 const uint32_t duration=micros()-started;if(duration>gyroMaxReadUs)gyroMaxReadUs=duration;
 if(error||received!=length){++gyroReadFailures;gyroLastI2cCode=error?error:255;return false;}
#else
 if(error||received!=length)return false;
#endif
 for(uint8_t i=0;i<length;i++)data[i]=uint8_t(Wire.read());
 return true;
}
void gyroStatus(const char* state){gyroHealth=state;}
bool beginGyro(){
 uint8_t id=0;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 // Keep the working MPU6050 DLPF=5 and +/-500 dps / 65.5 configuration.
 gyroConfigValid=false;gyroWhoAmI=0;
 if(!gyroRead(0x75,&id,1))return false;
 gyroWhoAmI=id;if(id!=0x68){zjGyroCalibration.error="WHO_AM_I";return false;}
 if(!gyroWrite(0x6B,0x00))return false;
 if(!gyroWrite(0x1A,0x05))return false;
 if(!gyroWrite(0x1B,0x08)||!gyroWrite(0x1C,0x10))return false; // +/-500 dps, +/-8g
 // DLPF-enabled output is 1kHz. Poll DATA_RDY rather than counting repeated
 // snapshots. INT is not wired to an MCU pin; status clears only on 0x3A read.
 if(!gyroWrite(0x19,0x00)||!gyroWrite(0x37,0x00)||!gyroWrite(0x38,0x01))return false;
 const uint8_t registers[]={0x6B,0x1A,0x1B,0x1C,0x19,0x37,0x38};
 const uint8_t expected[]={0x00,0x05,0x08,0x10,0x00,0x00,0x01};
 for(uint8_t i=0;i<7;i++){
  if(!gyroRead(registers[i],&id,1))return false;
  if(id!=expected[i]){zjGyroCalibration.error="CONFIG_MISMATCH";return false;}
 }
 gyroConfigValid=true;
#else
 // LSM6DS3 WHO_AM_I=0x69. 0x6C is accepted for compatible LSM6DS-family revisions.
 if(!gyroRead(0x0F,&id,1)||(id!=0x69&&id!=0x6C))return false;
 if(!gyroWrite(0x12,0x44))return false;
 if(!gyroWrite(0x11,0x4C))return false;
#endif
 return true;
}
bool gyroSignals(){
 uint8_t d[6];
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 uint8_t burst[14];
 if(!gyroRead(0x3B,burst,14))return false; // coherent accel/temp/gyro user-register burst
 for(uint8_t i=0;i<3;i++){
  accelRawG[i]=float(int16_t((uint16_t(burst[i*2])<<8)|burst[i*2+1]))/4096.0f;
  accelG[i]=accelModel.correct(accelRawG[i],i);
 }
 const int16_t x=int16_t((uint16_t(burst[8])<<8)|burst[9]);
 const int16_t y=int16_t((uint16_t(burst[10])<<8)|burst[11]);
 const int16_t z=int16_t((uint16_t(burst[12])<<8)|burst[13]);
 gyroRaw[0]=float(x)/65.5f;gyroRaw[1]=float(y)/65.5f;gyroRaw[2]=float(z)/65.5f;
 if(zjGyroCalibration.is("READY")){
  RateRoll=gyroRaw[0]-zjGyroCalibration.bias[0];
  RatePitch=gyroRaw[1]-zjGyroCalibration.bias[1];
  RateYaw=gyroRaw[2]-zjGyroCalibration.bias[2];
 }
#else
 if(!gyroRead(0x22,d,6))return false;
 const int16_t x=int16_t((uint16_t(d[1])<<8)|d[0]);
 const int16_t y=int16_t((uint16_t(d[3])<<8)|d[2]);
 const int16_t z=int16_t((uint16_t(d[5])<<8)|d[4]);
 RateRoll=float(x)*0.070f;RatePitch=float(y)*0.070f;RateYaw=float(z)*0.070f;
#endif
 return true;
}
#if defined(CONFIG_IDF_TARGET_ESP32C6)
void gyroA2Fault(const char* reason,uint32_t now,bool sensor=true){
 gyroReady=false;gyroConfigured=false;gyroConfigValid=false;gyroWaitingFresh=false;sample.valid=false;++sample.errors;
 manualGyro=false;accelCapture=ZjAccelCapture{};
 lastGyroProbe=now;
 if(sensor||!zjGyroCalibration.is("FAILED"))zjGyroCalibration.fail(reason,now,sensor);
 gyroStatus(sensor?"READ_ERROR":"CALIBRATION_FAILED");
}
#endif
void updateGyro(unsigned long now){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 if(gyroPaused)return;
 accelCapture.tick(now);
 if(!gyroConfigured){
  if(uint32_t(now-lastGyroProbe)<2500)return;
  lastGyroProbe=now;zjGyroCalibration.error="I2C_ERROR";
  if(!beginGyro()){
   sample.valid=false;++sample.errors;
   zjGyroCalibration.fail(zjGyroCalibration.error,now,true);gyroStatus("NOT_FOUND");return;
  }
  gyroConfigured=true;gyroReady=false;gyroWaitingFresh=false;
  zjGyroCalibration.start(now);gyroLastPollUs=micros();gyroLastNormalUs=0;
  sample.valid=false;sampleRate.reset(micros());gyroStatus("CALIBRATING");return;
 }
 zjGyroCalibration.tick(now);
 if(zjGyroCalibration.is("FAILED")){gyroA2Fault(zjGyroCalibration.error,now,false);return;}
 if(zjGyroCalibration.is("SETTLING"))return;
 const uint32_t atUs=micros();
 if(zjGyroCalibration.is("READY")){
  if(int32_t(atUs-gyroNextNormalUs)<0)return;
  const uint32_t periods=uint32_t(atUs-gyroNextNormalUs)/4000+1;
  sample.missed+=periods-1;gyroNextNormalUs+=periods*4000;lastGyro=now;
 }else{if(uint32_t(atUs-gyroLastPollUs)<1000)return;gyroLastPollUs=atUs;}
 uint8_t ready=0;
 if(!gyroRead(0x3A,&ready,1)){gyroA2Fault("I2C_ERROR",now);return;}
 if(!(ready&1)){
  if(zjGyroCalibration.is("READY"))++sample.missed;
  if(!gyroWaitingFresh){gyroWaitingFresh=true;gyroWaitStarted=now;}
  else if(uint32_t(now-gyroWaitStarted)>=200)gyroA2Fault("DATA_STALE",now);
  return;
 }
 gyroWaitingFresh=false;
 if(!gyroSignals()){gyroA2Fault("I2C_ERROR",now);return;}
 if(zjGyroCalibration.is("CALIBRATING")){
  if(zjGyroCalibration.feed(gyroRaw,now,atUs)){lastGyro=now;gyroNextNormalUs=micros()+4000;sampleRate.reset(micros());}
  return; // Never publish a calibration sample as corrected live telemetry.
 }
 const uint32_t acquiredUs=micros();
 const float rates[]={RateRoll,RatePitch,RateYaw};
 accelCapture.feed(accelRawG,rates);manualGyro=false;
 if(sample.valid){const uint32_t gap=acquiredUs-gyroLastNormalUs;if(gap>gyroMaxGapUs)gyroMaxGapUs=gap;}
 gyroLastNormalUs=acquiredUs;lastGyroSample=millis();++gyroSampleSeq;
 sample.accept(acquiredUs);sample.expectedHz=250;sampleRate.event(acquiredUs);
 if(!gyroReady){gyroReady=true;gyroStatus("READY");}
#else
 if(!gyroReady){
  if(now-lastGyroProbe<2500)return;
  lastGyroProbe=now;gyroReady=beginGyro();
  gyroStatus(gyroReady?"READY":"NOT_FOUND");
  if(gyroReady)lastGyro=now-GYRO_PERIOD_MS;
  return;
 }
 if(now-lastGyro<GYRO_PERIOD_MS)return;
 lastGyro=now;
 if(!gyroSignals()){
  gyroReady=false;lastGyroProbe=now;gyroStatus("READ_ERROR");return;
 }
 lastGyroSample=now;gyroSampleSeq++;
#endif
}
};
