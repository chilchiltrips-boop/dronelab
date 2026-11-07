#include <Arduino.h>
#include <Wire.h>
#include <string.h>
#include <stdlib.h>
#include <esp_system.h>
#include "FlightCoreTiming.h"
#include "FlightCoreEscProfile.h"
#include "FlightCoreFlightOutput.h"
static ZjRateCounter zjTelemetryRate;

// ZEBJUS AERION classroom diagnostics; version is emitted by the RUNNING app,
// not inferred from a downloaded image or an ESP-ROM bootloader message.
constexpr const char* FW_VERSION="1.7.21";
// Sketch compile time in GitHub Actions UTC. The prebuilt ESP-IDF app descriptor
// may retain its toolchain packaging date, so it must NOT label our release.
static constexpr const char* ZJ_OUTPUT_BUILD=ZJ_FLIGHT_OUTPUT_ENABLED?"ZJ_OUTPUT=PPM_RATE_EXPERIMENTAL":"ZJ_OUTPUT=BENCH_DIAGNOSTIC";
static constexpr char ZJ_BUILD_STAMP[]="ZJ_BUILD_UTC=" __DATE__ " " __TIME__;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
constexpr uint8_t BUS_SDA=22,BUS_SCL=23; // XIAO ESP32-C6 D4/D5
constexpr const char* FC_BOARD="ZFC-A2",*FC_LABEL="ZEBJUS AERION A2";
#else
constexpr uint8_t BUS_SDA=4,BUS_SCL=5; // A1: dedicated I2C pins; GPIO8 stays onboard LED-only
constexpr const char* FC_BOARD="ZFC-A1",*FC_LABEL="ZEBJUS AERION A1";
#endif

// Compact scan output contains addresses for Python Lab without verbose banners.
// Internal USER LEDs on both supported controllers use inverted (active-low) PWM.
#if defined(CONFIG_IDF_TARGET_ESP32C6)
constexpr uint8_t LED_PIN=15;   // Seeed XIAO ESP32-C6
#else
constexpr uint8_t LED_PIN=8;    // ESP32-C3 Super Mini
#endif
constexpr unsigned long LED_LEASE_MS=4000;
struct LedStep {uint8_t brightness;uint16_t duration;};
enum LedMode:uint8_t {LED_OFF,LED_MANUAL,LED_BLINK,LED_FADE,LED_SAFE,LED_WARNING,LED_SOS,LED_PATTERN};
LedMode ledMode=LED_OFF;
bool ledCommandOk=false;
LedStep pattern[16];uint8_t patternCount=0,manualBrightness=0;
unsigned long effectStart=0,leaseStart=0,telLast=0;
uint16_t telRateHz=20;
// COMBINED (default): one full IMU+RC line; RAW is the legacy two-stream protocol.
// Defined once by FlightCoreClassroom.h; works in the standalone firmware-host build too.
extern bool zjTelemetryRaw;
uint32_t telemetrySeq=0,telemetryDropped=0; // Declare before serialCommand() so rate changes compile
uint8_t activeSda=BUS_SDA,activeScl=BUS_SCL;
bool ledAvailable=true;
uint16_t onDuration=500,offDuration=500,fadeDuration=1200;
char serialLine[256];size_t serialUsed=0;bool serialOverflow=false;

void ledLevel(uint8_t pct){if(ledAvailable)ledcWrite(LED_PIN,255-(uint32_t(constrain(pct,0,100))*255/100));}
void ledOff(){ledMode=LED_OFF;manualBrightness=0;patternCount=0;ledLevel(0);}
void printFirmwareInfo(){
 Serial.print("ZJINFO,FW,");Serial.print(FC_BOARD);Serial.print(',');
 Serial.print(FW_VERSION);Serial.print(',');Serial.print(__DATE__);Serial.print(',');
 Serial.print(__TIME__);Serial.print(',');Serial.println(FC_LABEL);
 Serial.println(ZJ_BUILD_STAMP);
 Serial.println(ZJ_OUTPUT_BUILD);
 Serial.print("ZJI2C,PINS,");Serial.print(FC_BOARD);Serial.print(',');
 Serial.print(activeSda);Serial.print(',');Serial.print(activeScl);Serial.print(",0x");
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 Serial.println("68");
#else
 Serial.println("6B");
#endif
 Serial.print("ZJLED,INFO,");Serial.print(FC_BOARD);Serial.print(",GPIO");
 Serial.print(LED_PIN);
 Serial.println(",ACTIVE_LOW");
 Serial.print("ZJI2C,MODE,");Serial.print(FC_BOARD);
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 Serial.println(",XIAO_D4_D5");
#else
 Serial.println(",DEDICATED_4_5");
#endif
}
void ledAck(const char* id,const char* status){ledCommandOk=!strcmp(status,"OK");Serial.print("ZJLED,ACK,");Serial.print(id);Serial.print(',');Serial.println(status);}
bool parseNumber(const char* text,long minimum,long maximum,long& result){
 if(!text||!*text)return false;
 char* end=nullptr;const long n=strtol(text,&end,10);
 if(end==text||*end||n<minimum||n>maximum)return false;
 result=n;return true;
}
bool readLong(char*& state,long low,long high,long& result){
 return parseNumber(strtok_r(nullptr,",",&state),low,high,result);
}
#include "FlightCoreClassroom.h"
#include "FlightCorePpm.h"
#include "FlightCoreAccess.h"
static bool zjAccessStationary();
static bool zjAccessBusy();
static String zjControlRadio();
static bool zjFlightSerialCommand(char* line);
void ledCommand(char* line){
 ledCommandOk=false;
 if(strncmp(line,"ZJLED,",6)!=0)return;
 char* state=nullptr;
 char* id=strtok_r(line+6,",",&state);
 char* action=strtok_r(nullptr,",",&state);
 if(!id||!action)return;
 // A1 hardware contract: GPIO4 SDA / GPIO5 SCL; GPIO8 LED-only.
 // PIN_CONFLICT cannot occur on the supported board wiring.
 // Heartbeats do not alter the running pattern.
 if(!strcmp(action,"KEEP")){leaseStart=millis();ledAck(id,"OK");return;}
 long a=0,b=0,c=0;LedMode next=LED_OFF;
 if(!strcmp(action,"STOP")){
  ledOff();leaseStart=millis();ledAck(id,"OK");Serial.println("ZJLED,STATE,OFF");return;
 }else if(!strcmp(action,"SET")){
  if(!readLong(state,0,100,a)){ledAck(id,"BAD_ARGS");return;}
  manualBrightness=a;next=a?LED_MANUAL:LED_OFF;
 }else if(!strcmp(action,"BLINK")){
  if(!readLong(state,30,60000,a)||!readLong(state,30,60000,b)||!readLong(state,0,100,c)){ledAck(id,"BAD_ARGS");return;}
  onDuration=a;offDuration=b;manualBrightness=c;next=LED_BLINK;
 }else if(!strcmp(action,"FADE")){
  if(!readLong(state,100,30000,a)){ledAck(id,"BAD_ARGS");return;}
  fadeDuration=a;next=LED_FADE;
 }else if(!strcmp(action,"SAFE"))next=LED_SAFE;
 else if(!strcmp(action,"WARNING"))next=LED_WARNING;
 else if(!strcmp(action,"SOS"))next=LED_SOS;
 else if(!strcmp(action,"PATTERN")){
  // ZJLED,id,PATTERN,100:150|0:150|100:150|0:900
  char* spec=strtok_r(nullptr,",",&state);if(!spec){ledAck(id,"BAD_ARGS");return;}
  LedStep proposed[16];uint8_t count=0;char* save=nullptr;
  for(char* token=strtok_r(spec,"|",&save);token;token=strtok_r(nullptr,"|",&save)){
   char* colon=strchr(token,':');if(!colon||count>=16){ledAck(id,"BAD_ARGS");return;}
   *colon='\0';long brightness,duration;
   if(!parseNumber(token,0,100,brightness)||!parseNumber(colon+1,30,60000,duration)){ledAck(id,"BAD_ARGS");return;}
   proposed[count++]={uint8_t(brightness),uint16_t(duration)};
  }
  if(!count){ledAck(id,"BAD_ARGS");return;}
  memcpy(pattern,proposed,sizeof(LedStep)*count);patternCount=count;next=LED_PATTERN;
 }else{ledAck(id,"UNKNOWN");return;}
 ledMode=next;if(next==LED_OFF)ledOff();effectStart=leaseStart=millis();ledAck(id,"OK");
 Serial.print("ZJLED,STATE,");Serial.println(ledMode==LED_OFF?"OFF":"ON");
}
void requestScan();
static bool zjNetSerialCommand(char* line); // implemented by network module later in this sketch
static bool zjMotorSerial(char* line);
void serialCommand(char* line){
 if(zjMotorSerial(line))return;
 if(zjFlightSerialCommand(line))return;
 if(zjMotorSessionActive&&strncmp(line,"ZJRC,",5)&&strncmp(line,"ZJINFO,",7)){Serial.println("ZJMOTOR,ERR,STOP_SETUP_FIRST");return;}
 if(zjAccessSerialCommand(line,zjAccessStationary(),zjAccessBusy(),zjControlRadio()))return;
 if(zjRcSerialCommand(line))return;
 if(zjPpmSerialCommand(line))return;
 if(zjNetSerialCommand(line))return;
 if(!strcmp(line,"ZJINFO,GET")){printFirmwareInfo();return;}
 if(!strcmp(line,"ZJI2C,SCAN")){requestScan();return;}
 if(!strncmp(line,"ZJTEL,FORMAT,",13)){
  const char* requested=line+13;
  if(!strcmp(requested,"RAW")||!strcmp(requested,"COMBINED")){
   zjTelemetryRaw=!strcmp(requested,"RAW");
   Serial.print("ZJTEL,ACK,FORMAT,");Serial.println(zjTelemetryRaw?"RAW":"COMBINED");
  }else Serial.println("ZJTEL,ERR,FORMAT,USE_RAW_OR_COMBINED");
  return;
 }
 if(!strncmp(line,"ZJTEL,RATE,",11)){
  const long rate=atol(line+11);
  if((rate==10||rate==20||rate==50)&&strlen(line+11)<=2){
   telRateHz=uint16_t(rate);
   // Reset reported loss on a fresh telemetry-rate session. An earlier loop
   // timestamp may predate this command: emitTelemetry() handles that safely.
   telemetryDropped=0;telemetrySeq=0;telLast=millis();zjTelemetryRate.reset(micros());
   Serial.print("ZJTEL,ACK,RATE,");Serial.println(telRateHz);
  }else Serial.println("ZJTEL,ERR,RATE,USE_10_20_50");
  return;
 }
 ledCommand(line);
}
void readLedCommands(){
 // Keep parsing bounded so continuous serial data cannot starve the scanner.
 for(uint8_t n=0;n<96&&Serial.available();++n){
  const char c=char(Serial.read());
  if(c=='\n'||c=='\r'){
   if(serialUsed&&!serialOverflow){serialLine[serialUsed]='\0';serialCommand(serialLine);}
   serialUsed=0;serialOverflow=false;
  }else if(serialUsed<sizeof(serialLine)-1)serialLine[serialUsed++]=c;
  else serialOverflow=true;
 }
}
void updateLedEffect(unsigned long now){
 // A USB command can renew the lease after loop() captured its clock.
 // Read time after command processing so a fresh lease cannot underflow.
 now=millis();
 if(ledMode==LED_OFF)return;
 if(now-leaseStart>LED_LEASE_MS){ledOff();Serial.println("ZJLED,STATUS,TIMEOUT");return;}
 const unsigned long elapsed=now-effectStart;
 switch(ledMode){
  case LED_MANUAL:ledLevel(manualBrightness);break;
  case LED_BLINK:{
   const unsigned long period=onDuration+offDuration;
   ledLevel(elapsed%period<onDuration?manualBrightness:0);break;
  }
  case LED_FADE:{
   const unsigned long phase=elapsed%(2UL*fadeDuration);
   const unsigned long rising=phase<=fadeDuration?phase:2UL*fadeDuration-phase;
   ledLevel(uint8_t(rising*100/fadeDuration));break;
  }
  case LED_SAFE:ledLevel(elapsed%2000<100?100:0);break;
  case LED_WARNING:{
   const unsigned long tick=elapsed%1200;
   ledLevel((tick<100||(tick>=200&&tick<300))?100:0);break;
  }
  case LED_SOS:{
   // S O S: 3 short, 3 long, 3 short; one 150 ms time unit.
   const uint8_t widths[]={1,1,1,3,3,3,1,1,1};
   const unsigned long tick=elapsed%((3+3+3+9+3+3+7)*150UL);
   unsigned long cursor=0;uint8_t level=0;
   for(uint8_t i=0;i<9;i++){
    const unsigned long lit=150UL*widths[i],space=150UL*(i==2||i==5?3:1);
    if(tick>=cursor&&tick<cursor+lit){level=100;break;}
    cursor+=lit+space;
   }
   ledLevel(level);break;
  }
  case LED_PATTERN:{
   unsigned long total=0;for(uint8_t i=0;i<patternCount;i++)total+=pattern[i].duration;
   if(!total){ledOff();break;}
   const unsigned long phase=elapsed%total;unsigned long edge=0;
   for(uint8_t i=0;i<patternCount;i++){edge+=pattern[i].duration;if(phase<edge){ledLevel(pattern[i].brightness);break;}}
   break;
  }
  default:ledOff();break;
 }
}

// Board-specific USB gyroscope telemetry. Sensor reads only; no actuation or PID logic.
// A1: LSM6DS3 @ 0x6B; A2: MPU6050 @ 0x68.
// Canonical ZJTEL records carry sensor health and X/Y/Z rates (degrees/second).
#if defined(CONFIG_IDF_TARGET_ESP32C6)
constexpr uint8_t GYRO_ADDR=0x68;
constexpr unsigned long GYRO_PERIOD_MS=4; // 250 Hz normal acquisition; calibration retains 1 kHz
constexpr const char* GYRO_BOARD="A2",*GYRO_NAME="MPU6050";
#else
constexpr uint8_t GYRO_ADDR=0x6B; // Verified GY-LSM6DS3 SA0 high
constexpr unsigned long GYRO_PERIOD_MS=20; // 50 Hz sensor sampling; LSM6DS3 ODR 104 Hz
constexpr const char* GYRO_BOARD="A1",*GYRO_NAME="LSM6DS3";
#endif
#include "FlightCoreImu.h"
#include "FlightCoreControlRuntime.h"
// Main-loop projection for legacy USB telemetry and stationary checks. The
// acquisition task never writes these globals; a protected mailbox owns copies.
bool gyroReady=false;
unsigned long lastGyro=0,lastGyroProbe=0,lastGyroSample=0;
uint32_t gyroSampleSeq=0;
const char* gyroHealth="STARTING";
float RateRoll=0,RatePitch=0,RateYaw=0;
static ZjImuAcquisition zjImu;
static void updateGyro(unsigned long now){
 zjImu=zjReadImu(now);
 gyroReady=zjImu.gyroReady;lastGyroSample=zjImu.lastGyroSample;gyroSampleSeq=zjImu.gyroSampleSeq;
 RateRoll=zjImu.RateRoll;RatePitch=zjImu.RatePitch;RateYaw=zjImu.RateYaw;
 if(strcmp(gyroHealth,zjImu.gyroHealth)){
  gyroHealth=zjImu.gyroHealth;
  if(Serial.availableForWrite()>=64){Serial.print("ZJGYRO,STATUS,");Serial.print(GYRO_BOARD);Serial.print(',');
   Serial.print(GYRO_NAME);Serial.print(",0x");Serial.print(GYRO_ADDR,HEX);Serial.print(',');Serial.println(gyroHealth);}
 }
}
static String zjImuVector(const float values[3]){
 return String("[")+String(values[0],4)+","+String(values[1],4)+","+String(values[2],4)+"]";
}
static uint32_t gyroDiagnosticDrops=0;
static String zjControlTimingStatus(){
 const auto c=zjReadControl();const auto shadow=zjReadRateShadow();const uint32_t now=micros();
 const char* health=!zjControlRuntimeReady?"UNAVAILABLE":!c.ticks?"STARTING":c.healthy(now)?"HEALTHY":"LATE";
 return String("\"controlTargetHz\":250,\"controlActuating\":")+(shadow.actuating?"true":"false")+",\"controlHealth\":\""+health+"\",\"controlActualHz\":"+
  (c.rate.known?String(c.rate.actual(now),2):String("null"))+",\"controlIntervalUs\":"+String(c.intervalUs)+
  ",\"controlMinIntervalUs\":"+String(c.minIntervalUs)+",\"controlMaxIntervalUs\":"+String(c.maxIntervalUs)+
  ",\"controlJitterUs\":"+String(c.jitterUs)+",\"controlMaxJitterUs\":"+String(c.maxJitterUs)+
  ",\"controlExecutionUs\":"+String(c.executionUs)+",\"controlMaxExecutionUs\":"+String(c.maxExecutionUs)+
  ",\"controlMissedTicks\":"+String(c.missedTicks)+",\"controlDeadlineMisses\":"+String(c.deadlineMisses)+",\"controlOverruns\":"+String(c.overruns)+
  ",\"controlLastTickUs\":"+(c.ticks?String(c.lastSuccessfulUs):String("null"))+
  ",\"controlMaxIntervalPhase\":\""+shadow.maxIntervalPhase+"\",\"ratePidComputeMaxUs\":"+String(shadow.computeMaxUs)+
  ",\"controlMeasuredHz\":"+(c.rate.known?String(c.rate.actual(now),2):String("null"))+
  ",\"controlDtUs\":"+String(c.intervalUs)+",\"controlMaxDtUs\":"+String(c.maxIntervalUs)+
  ",\"controlStartupMaxDtUs\":"+String(shadow.phaseMaxUs[0])+",\"controlCalibrationMaxDtUs\":"+String(shadow.phaseMaxUs[1])+
  ",\"controlDisarmedMaxDtUs\":"+String(shadow.phaseMaxUs[2])+",\"controlDiagnosticMaxDtUs\":"+String(shadow.phaseMaxUs[3])+
  ",\"controlFlightMaxDtUs\":"+String(shadow.phaseMaxUs[4])+
  ",\"imuReadMaxUs\":"+String(shadow.imuReadMaxUs)+",\"pidComputeMaxUs\":"+String(shadow.computeMaxUs)+
  ",\"motorUpdateMaxUs\":"+String(zjMotorUpdateMaxUs.load(std::memory_order_relaxed))+",\"flightQualified\":"+(ZJ_FLIGHT_HARDWARE_QUALIFIED?"true":"false")+
  ",\"flightOutputAuthorized\":"+(shadow.outputAuthorized?"true":"false")+
  ",\"flightDeadlineFault\":"+(shadow.deadlineFault?"true":"false")+
  ",\"controlMaxIntervalAtUs\":"+String(c.maxIntervalAtUs)+",\"ratePidShadowState\":\""+shadow.reason+
  "\",\"ratePidShadowRevision\":"+String(shadow.revision)+",\"ratePidShadowSaturated\":"+(shadow.mix.saturated?"true":"false");
}
static String zjImuStatus(){
 updateGyro(millis());
 const float corrected[3]={RateRoll,RatePitch,RateYaw};
 String out=String("{\"version\":1,\"board\":\"")+GYRO_BOARD+"\",\"dataReady\":"+(gyroReady?"true":"false")+
  ",\"sampleSequence\":"+String(gyroSampleSeq)+",\"sampleAgeMs\":"+(gyroSampleSeq?String(uint32_t(millis()-lastGyroSample)):String("null"));
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 out+=",\"enabled\":true,\"state\":\""+String(zjImu.zjGyroCalibration.state)+"\",\"error\":\""+String(zjImu.zjGyroCalibration.error)+
  "\",\"attempt\":"+String(zjImu.zjGyroCalibration.attempt)+",\"samples\":"+String(zjImu.zjGyroCalibration.samples)+",\"target\":2000,\"validTotal\":"+String(zjImu.zjGyroCalibration.validTotal)+
  ",\"durationMs\":"+String(zjImu.zjGyroCalibration.duration(millis()))+",\"startedMs\":"+String(zjImu.zjGyroCalibration.startedMs)+",\"restarts\":"+String(zjImu.zjGyroCalibration.restarts)+
  ",\"bias\":"+zjImuVector(zjImu.zjGyroCalibration.bias)+",\"raw\":"+zjImuVector(zjImu.gyroRaw)+",\"corrected\":"+zjImuVector(corrected)+
  ",\"stddev\":"+zjImuVector(zjImu.zjGyroCalibration.stddev)+",\"failures\":"+String(zjImu.zjGyroCalibration.failures)+
  ",\"lastFailure\":\""+zjImu.zjGyroCalibration.lastFailure+"\",\"lastFailureMs\":"+String(zjImu.zjGyroCalibration.lastFailureMs)+",\"lastFailureAttempt\":"+String(zjImu.zjGyroCalibration.lastFailureAttempt)+
  ",\"readFailures\":"+String(zjImu.gyroReadFailures)+",\"writeFailures\":"+String(zjImu.gyroWriteFailures)+
  ",\"lastI2cCode\":"+String(zjImu.gyroLastI2cCode)+",\"whoAmI\":"+String(zjImu.gyroWhoAmI)+",\"configValid\":"+(zjImu.gyroConfigValid?"true":"false")+
  ",\"maxGapUs\":"+String(zjImu.gyroMaxGapUs)+",\"calibrationMaxGapUs\":"+String(zjImu.zjGyroCalibration.maxGapUs)+",\"missedSamples\":"+String(zjImu.zjGyroCalibration.missedSamples)+
  ",\"maxReadUs\":"+String(zjImu.gyroMaxReadUs)+",\"diagnosticDrops\":"+String(gyroDiagnosticDrops);
#else
 out+=",\"enabled\":false,\"state\":\""+String(gyroHealth)+"\"";
#endif
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 const uint32_t at=micros();
 out+=","+zjControlTimingStatus()+",\"imuTargetHz\":250,\"imuSensorOdrHz\":1000,\"imuActualHz\":"+
  (zjImu.sampleRate.known?String(zjImu.sampleRate.actual(at),2):String("null"))+
  ",\"imuSampleAgeUs\":"+(zjImu.sample.valid?String(zjImu.sample.ageUs(at)):String("null"))+
  ",\"imuValid\":"+(zjImu.sample.fresh(at,12000)?"true":"false")+
  ",\"imuErrors\":"+String(zjImu.sample.errors)+",\"imuMissedNormalSamples\":"+String(zjImu.sample.missed)+
  ",\"imuDlpFilter\":5,\"imuGyroBandwidthHz\":10,\"imuFilterDelayMs\":13.4,\"gyroRangeDps\":500,\"accelRangeG\":8,\"accelG\":"+zjImuVector(zjImu.accelG)+
  ",\"accelRawG\":"+zjImuVector(zjImu.accelRawG)+",\"manualGyro\":"+(zjImu.manualGyro?"true":"false")+
  ",\"escPwmHz\":"+String(ZJ_ESC_PROFILE.hz)+",\"esc250HzEnabled\":false,\"telemetryConfiguredHz\":"+String(telRateHz)+
  ",\"telemetryActualHz\":"+(zjTelemetryRate.known?String(zjTelemetryRate.actual(at),2):String("null"))+
  ",\"telemetryDrops\":"+String(telemetryDropped);
#endif
 return out+"}";
}
static void emitImuDiagnostics(unsigned long now){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 // The independent acquisition task may have published after loop() captured
 // its clock. Read time after the main-owned snapshot to avoid age underflow.
 now=millis();
 static uint32_t last=0,lastErrorAt=0,lastErrorCount=0;static bool sample=false;
 if(uint32_t(now-last)<500)return;last=now;
 String line;
 const bool history=zjImu.zjGyroCalibration.failures&&(zjImu.zjGyroCalibration.failures!=lastErrorCount||uint32_t(now-lastErrorAt)>=2000);
 if(history){
  line=String("ZJIMUE,1,A2,")+String(zjImu.zjGyroCalibration.failures)+","+zjImu.zjGyroCalibration.lastFailure+","+
   String(zjImu.zjGyroCalibration.lastFailureMs)+","+String(zjImu.zjGyroCalibration.lastFailureAttempt);
 }else if(!sample){
  line=String("ZJIMU,1,A2,")+String(zjImu.zjGyroCalibration.attempt)+","+zjImu.zjGyroCalibration.state+","+String(zjImu.zjGyroCalibration.samples)+",2000,"+
   String(zjImu.zjGyroCalibration.duration(now))+","+String(zjImu.zjGyroCalibration.restarts)+","+String(zjImu.zjGyroCalibration.bias[0],4)+","+
   String(zjImu.zjGyroCalibration.bias[1],4)+","+String(zjImu.zjGyroCalibration.bias[2],4)+","+zjImu.zjGyroCalibration.error+","+
   String(zjImu.gyroReadFailures)+","+String(zjImu.gyroWriteFailures)+","+String(zjImu.gyroWhoAmI)+","+(zjImu.gyroConfigValid?"1":"0")+","+(gyroReady?"1":"0");
 }else{
  line=String("ZJIMUS,1,A2,")+String(zjImu.zjGyroCalibration.attempt)+","+String(zjImu.gyroRaw[0],3)+","+String(zjImu.gyroRaw[1],3)+","+String(zjImu.gyroRaw[2],3)+","+
   String(RateRoll,3)+","+String(RatePitch,3)+","+String(RateYaw,3)+","+String(gyroSampleSeq)+","+
   (gyroSampleSeq?String(uint32_t(now-lastGyroSample)):String("-1"))+","+String(zjImu.gyroMaxGapUs)+","+String(zjImu.zjGyroCalibration.maxGapUs)+","+String(zjImu.zjGyroCalibration.missedSamples);
 }
 if(!history)sample=!sample;
 if(size_t(Serial.availableForWrite())>=line.length()+2){Serial.println(line);if(history){lastErrorAt=now;lastErrorCount=zjImu.zjGyroCalibration.failures;}}
 else ++gyroDiagnosticDrops;
#endif
}

static void emitTimingDiagnostics(uint32_t now){
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 static uint32_t last=0;
 if(uint32_t(now-last)<1000)return;last=now;
 const auto c=zjReadControl();const uint32_t at=micros();
 const String line=String("ZJTIMING,1,A2,")+String(c.rate.known?c.rate.actual(at):-1,2)+","+
  String(c.intervalUs)+","+String(c.minIntervalUs)+","+String(c.maxIntervalUs)+","+String(c.jitterUs)+","+String(c.maxJitterUs)+","+
  String(c.executionUs)+","+String(c.maxExecutionUs)+","+String(c.missedTicks)+","+String(c.overruns)+","+
  (!zjControlRuntimeReady?"UNAVAILABLE":!c.ticks?"STARTING":c.healthy(at)?"HEALTHY":"LATE")+","+
  String(zjImu.sampleRate.known?zjImu.sampleRate.actual(at):-1,2)+","+(zjImu.sample.valid?String(zjImu.sample.ageUs(at)):String("-1"))+","+
  String(zjImu.sample.errors)+","+String(telRateHz)+","+String(zjTelemetryRate.known?zjTelemetryRate.actual(at):-1,2)+","+String(telemetryDropped);
 if(size_t(Serial.availableForWrite())>=line.length()+2)Serial.println(line);
 else ++gyroDiagnosticDrops;
#endif
}
// Non-blocking I2C scan: at most one bounded bus transaction per pass.
// Scan once on boot or after ZJI2C,SCAN; no periodic bus probing during telemetry.
uint8_t scanAddress=1,scanCount=0,scanAddresses[126]={0};
bool scanActive=false,scanRequested=true;
void requestScan(){scanRequested=true;}
void scanI2C(unsigned long now){
 if(!scanActive){
  if(!scanRequested)return;
  scanRequested=false;scanActive=true;scanAddress=1;scanCount=0;

  // Structured scan only.
 }
 if(!zjTryI2c())return;
 for(uint8_t budget=0;budget<1&&scanAddress<127;budget++,scanAddress++){
  Wire.beginTransmission(scanAddress);
  const byte error=Wire.endTransmission();
  if(error==0){

   scanAddresses[scanCount++]=scanAddress;
  }else if(error==4){

   // Suppress noisy I2C diagnostic output.
  }
 }
 zjReleaseI2c();
 if(scanAddress>=127){

  // ZJSCAN summary follows.
  Serial.print("ZJSCAN,");Serial.print(GYRO_BOARD);Serial.print(',');
  Serial.print(now);Serial.print(',');Serial.print(scanCount);
  for(uint8_t i=0;i<scanCount;i++){
   Serial.print(",0x");if(scanAddresses[i]<16)Serial.print('0');Serial.print(scanAddresses[i],HEX);
  }
  Serial.println();
  scanActive=false;
 }
}
void selectI2cBus(){
 // A1 dedicated SDA4/SCL5, preserving GPIO8 for the active-low LED.
 // A2 remains GPIO22/23. Both controllers use 400 kHz.
 Wire.begin(BUS_SDA,BUS_SCL);Wire.setClock(400000);
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 Wire.setTimeOut(2); // Each I2C operation is bounded; scanner shares a mutex.
#endif
 activeSda=BUS_SDA;activeScl=BUS_SCL;ledAvailable=true;
}
static uint32_t zjStationarySince=0;
static bool zjAccessStationary(){
 const uint32_t now=millis();
 const bool quiet=gyroReady&&gyroSampleSeq&&uint32_t(now-lastGyroSample)<=200&&
  RateRoll>-3&&RateRoll<3&&RatePitch>-3&&RatePitch<3&&RateYaw>-3&&RateYaw<3;
 if(!quiet){zjStationarySince=0;return false;}
 if(!zjStationarySince)zjStationarySince=now;
 return uint32_t(now-zjStationarySince)>=500;
}
static String zjFlightStatusJson();
static String zjFlightTelemetryJson();
static String zjFlightReadinessJson(); // read-only A2 snapshot; no flight ARM or PWM operation
#include "FlightCoreNetwork.h"
static String zjControlRadio(){return WiFi.status()==WL_CONNECTED?String("STA"):zjApStarted?String("AP"):String("");}
static bool zjAccessBusy(){return zjHandoverPending||zjNetTesting||zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt||zjUsbScanning;}
void emitTelemetry(unsigned long now){
 const unsigned long period=1000UL/telRateHz;
 // A rate-change command can update telLast after loop() captured "now".
 // Signed modular subtraction rejects such a future timestamp and also
 // handles normal millis() rollover without 2^32/period bogus frame loss.
 const int32_t elapsed=int32_t(uint32_t(now-telLast));
 if(elapsed<0||uint32_t(elapsed)<period)return;
 // Count only actual skipped periods; never infer loss from a clock underflow.
 const uint32_t due=uint32_t(elapsed)/period;
 if(telLast&&due>1)telemetryDropped+=due-1;
 telLast=now;
 if(Serial.availableForWrite()<108){telemetryDropped++;return;}
 // Canonical frame: ZJTEL,1,board,seq,millis,addr,status,x,y,z,LED_STATUS,drops
 Serial.print("ZJTEL,1,");Serial.print(GYRO_BOARD);Serial.print(',');
 Serial.print(++telemetrySeq);Serial.print(',');Serial.print(now);Serial.print(",0x");
 Serial.print(GYRO_ADDR,HEX);Serial.print(',');Serial.print(gyroHealth);Serial.print(',');
 Serial.print(RateRoll,2);Serial.print(',');Serial.print(RatePitch,2);Serial.print(',');
 Serial.print(RateYaw,2);Serial.print(',');
 Serial.print(ledAvailable?"1":"0");
 Serial.print(',');Serial.print(telemetryDropped);
 if(!zjTelemetryRaw){
  // Append compact, clearly labelled RC inputs to the SAME telemetry record.
  // Fields 0..11 remain 100% compatible with the canonical ZJTEL v1 schema.
  // A deadman/lease expiry is always displayed as neutral INPUT OFF.
  const bool fresh=zjRcOwned&&zjRcHasFrame&&uint32_t(now-zjRcLast)<=ZJ_RC_DEADMAN_MS;
  Serial.print(",RC=");
  if(fresh){Serial.print(zjRcTransport);Serial.print('/');Serial.print(zjRcSource);}
  else Serial.print("NONE/IDLE");
  Serial.print(",RCSEQ=");Serial.print(fresh?zjRcSeq:0);
  Serial.print(",T=");Serial.print(fresh?zjRcThrottle:1000);
  Serial.print(",R=");Serial.print(fresh?zjRcRoll:1500);
  Serial.print(",P=");Serial.print(fresh?zjRcPitch:1500);
  Serial.print(",Y=");Serial.print(fresh?zjRcYaw:1500);
  Serial.print(",INPUT_ARMED=");Serial.print(fresh&&zjRcInputArmed?1:0);
  Serial.print(zjMotorEnabled?",MOTORS=ACTIVE":",MOTORS=OFF");
 }
 Serial.println();zjTelemetryRate.event(micros());
}
#include "FlightCoreMotor.h"
#if defined(CONFIG_IDF_TARGET_ESP32C6) && !defined(ZJ_TIMING_SYNCHRONOUS_TEST)
static ZjFlightConditions zjFlightMainConditions(){
 ZjFlightConditions conditions;
 conditions.input=zjRcReceiver();
 conditions.acro=zjFlightMode=="acro";conditions.angle=zjFlightMode=="angle";
 const auto attitude=zjReadRateShadow().attitude;
 conditions.attitudeReady=attitude.valid&&uint32_t(micros()-attitude.atUs)<=12000;
 conditions.levelCalibrated=attitude.levelCalibrated;
 conditions.localController=zjRcNetwork&&((zjRcControlPath=="ANDROID_AP"&&String(zjRcTransport)=="AP"&&zjRcSource=="ANDROID")||
  (zjRcControlPath=="WEB_STA"&&String(zjRcTransport)=="STA"&&zjRcSource=="WEB"));
 const bool flight=zjFlightDriverRead().lease!=0;
 conditions.escCalibration=!zjAutoEscFinalized||zjAutoEscRecord.state==ZjAutoEscRecord::PENDING||
  zjAutoEscRecord.state==ZjAutoEscRecord::RUNNING||zjMotor.mode==ZjMotorSafety::CAL_HIGH||zjMotor.mode==ZjMotorSafety::CAL_LOW;
 conditions.benchActive=!flight&&(zjMotorEnabled||zjMotorSessionActive||zjMotorArmed);
 conditions.maintenance=zjMaintenanceActive||zjHandoverPending||zjNetTesting||zjUsbScanning||
  zjOtaAuthorized||zjSecureOtaActive||zjOtaRebootAt||zjImuMaintenanceBusy();
 conditions.wiringVerified=zjPidLayoutMatches(ZJ_PID_PROFILES[zjPidActive.profile].plus)&&
  zjWizardRecordVerified&&!zjPidStorageCorrupt&&!zjPidStorageUncertain;
 if(flight||ZJ_FLIGHT_OUTPUT_ENABLED)
  for(unsigned n=0;n<4;n++)conditions.wiringVerified=conditions.wiringVerified&&zjMotorConfig.rotation[n]==n%2;
 conditions.driverReady=zjMotorDriverReady;
 conditions.setupComplete=zjWizardSetupComplete();
 conditions.pidSaved=zjPidSettings.persisted&&!zjPidPreview&&zjPidSame(zjPidActive,zjPidSettings);
 conditions.escSequenceComplete=zjAutoEscStoredResult();
 // Existing Wizard records supply ESC readiness; PWM cannot detect endpoint acceptance.
 conditions.escOperatorConfirmed=zjMotorCalibrationSaved&&zjWizardRecordVerified;
 return conditions;
}
#endif
#if defined(CONFIG_IDF_TARGET_ESP32C6) && !defined(ZJ_TIMING_SYNCHRONOUS_TEST)
// Common status for WebApp/Android. It reads firmware state, never claims an
// output lease. Setup completion and readiness survive disarm independently.
static ZjFlightConditions zjFlightObservedConditions(){
 auto c=zjFlightMainConditions();
 const auto imu=zjReadImu(millis());const auto control=zjReadControl();
 const auto driver=zjFlightDriverRead();const uint32_t at=micros();
 c.nowMs=millis();c.inputDeadlineMs=c.input.source==ZjReceiverSource::PPM?ZJ_PPM_LOST_MS:ZJ_RC_DEADMAN_MS;
 c.imuFresh=imu.gyroReady&&imu.sample.fresh(at,12000)&&
  std::isfinite(imu.RateRoll)&&std::isfinite(imu.RatePitch)&&std::isfinite(imu.RateYaw);
 c.timingHealthy=zjControlRuntimeReady&&control.healthy(at)&&control.intervalUs>=1000&&control.intervalUs<=8000;
 c.outputOffAck=driver.offAck&&!driver.lease;
 return c;
}
static String zjFlightStatusJson(){
 auto c=zjFlightObservedConditions();
 const auto driver=zjFlightDriverRead();
 portENTER_CRITICAL(&zjTimingMux);
 const auto state=zjFlightOutputGate.state;const auto reason=zjFlightOutputGate.reason;
 portEXIT_CRITICAL(&zjTimingMux);
 const bool authorized=driver.lease&&state==ZjFlightState::ARMED;
 // Pre-arm readiness should be useful BEFORE the operator performs ARM.
 c.input.inputArmed=true;
 ZjFlightOutputGate preflight;
 const bool ready=preflight.arm(c,ZJ_FLIGHT_OUTPUT_ENABLED,true);
 const auto block=authorized?ZjFlightFault::NONE:preflight.reason;
 return String("{\"version\":1,\"enabled\":")+(ZJ_FLIGHT_OUTPUT_ENABLED?"true":"false")+
  ",\"qualified\":false,\"physicalAcceptance\":\"NOT_RUN\",\"inputScope\":\"LOCAL_ACRO_ANGLE\""+
  ",\"setupComplete\":"+(c.setupComplete?"true":"false")+",\"pidSaved\":"+(c.pidSaved?"true":"false")+
  ",\"authorized\":"+(authorized?"true":"false")+",\"canArm\":"+(!authorized&&ready?"true":"false")+
  ",\"state\":"+zjJson(authorized?"ARMED":state==ZjFlightState::FAILSAFE?"FAILSAFE":"DISARMED")+
  ",\"blockReason\":"+zjJson(zjFlightFaultName(block))+",\"lastArmReason\":"+zjJson(zjFlightFaultName(reason))+"}";
}
// A2 read-only Acro preflight. All motor corrections are *mathematical predictions*.
// It never claims a lease, arms, changes throttle, or writes PWM.
static String zjFlightReadinessJson(){
 auto c=zjFlightObservedConditions();
 const auto imu=zjReadImu(millis());
 const auto control=zjReadControl();
 const auto shadow=zjReadRateShadow();
 const auto driver=zjFlightDriverRead();
 const uint32_t at=micros();
 const bool receiverFresh=c.input.fresh(c.nowMs,c.inputDeadlineMs);
 // Evaluate each software precondition without claiming hardware qualification.
 // This is a checklist; a green software check is NEVER physical-flight approval.
 auto prearm=c;prearm.input.inputArmed=true;
 const auto softwareFault=ZjFlightOutputGate{}.fault(prearm,true);
 const char* softwareBlock=zjFlightFaultName(softwareFault);
 if(softwareFault==ZjFlightFault::NONE){
  if(!zjFlightLowThrottle(c.input.channels[2]))softwareBlock="THROTTLE_HIGH";
  else if(!c.outputOffAck)softwareBlock="OFF_UNVERIFIED";
  else softwareBlock="NONE";
 }
 const auto gyroFresh=c.imuFresh;
 const bool readyForAnyFlight=ZJ_FLIGHT_OUTPUT_ENABLED&&softwareFault==ZjFlightFault::NONE&&
  zjFlightLowThrottle(c.input.channels[2])&&c.outputOffAck;
 // P-only 1500us fixed-reference geometry prediction, NOT a dynamic PID output
 // and NEVER a real ESC request. Body rotation sign must be physically checked.
 const auto gainsRoll=zjPidActive.axis(0).p,gainsPitch=zjPidActive.axis(1).p,gainsYaw=zjPidActive.axis(2).p;
 ZjRateMix reference;
 if(gyroFresh&&c.wiringVerified){
  const float roll=-gainsRoll*imu.RateRoll,pitch=-gainsPitch*imu.RatePitch,yaw=-gainsYaw*imu.RateYaw;
  reference=(zjMotorConfig.plus?zjRateMixQuadPlus:zjRateMixQuadX)(1500,roll,pitch,yaw);
 }
 String out;
 out.reserve(980);
 out=String("{\"schema\":1,\"mode\":\"FLIGHT_READINESS\",\"kitId\":")+zjJson(zjKitId)+
  ",\"bootId\":"+zjJson(zjBootId)+",\"firmwareVersion\":"+zjJson(FW_VERSION)+
  ",\"board\":"+zjJson(FC_BOARD)+",\"flightQualified\":"+(ZJ_FLIGHT_HARDWARE_QUALIFIED?"true":"false")+
  ",\"flightOutputEnabled\":"+(ZJ_FLIGHT_OUTPUT_ENABLED?"true":"false")+",\"flight\":"+zjFlightStatusJson()+
  ",\"physicalAcceptance\":\"NOT_RUN\",\"setupComplete\":"+(zjWizardSetupComplete()?"true":"false")+
  ",\"setupRevision\":"+String(zjWizardSaved.revision)+",\"flightOutputAuthorized\":"+(shadow.outputAuthorized?"true":"false")+
  ",\"controlActuating\":"+(shadow.actuating?"true":"false")+
  ",\"blockReason\":"+zjJson(ZJ_FLIGHT_OUTPUT_ENABLED?softwareBlock:"UNQUALIFIED")+
  ",\"softwareBlockReason\":"+zjJson(softwareBlock)+
  ",\"flightModeState\":"+zjFlightModeState()+",\"attitudeReady\":"+(c.attitudeReady?"true":"false")+
  ",\"levelCalibrated\":"+(c.levelCalibrated?"true":"false")+
  ",\"acroSelected\":"+(c.acro?"true":"false")+
  ",\"inputArmed\":"+(c.input.inputArmed?"true":"false")+
  ",\"receiverFresh\":"+(receiverFresh?"true":"false")+
  ",\"ppmFresh\":"+(receiverFresh&&c.input.source==ZjReceiverSource::PPM?"true":"false")+
  ",\"gyroFresh\":"+(gyroFresh?"true":"false")+
  ",\"wiringVerified\":"+(c.wiringVerified?"true":"false")+
  ",\"escOperatorConfirmed\":"+(c.escOperatorConfirmed?"true":"false")+
  ",\"escSequenceComplete\":"+(c.escSequenceComplete?"true":"false")+
  ",\"pidSaved\":"+(c.pidSaved?"true":"false")+
  ",\"driverReady\":"+(c.driverReady?"true":"false")+
  ",\"timingHealthy\":"+(c.timingHealthy?"true":"false")+
  ",\"outputsOffAck\":"+(c.outputOffAck?"true":"false")+
  ",\"maintenance\":"+(c.maintenance?"true":"false")+
  ",\"escCalibrationActive\":"+(c.escCalibration?"true":"false")+
  ",\"benchActive\":"+(c.benchActive?"true":"false")+
  ",\"canArm\":"+(readyForAnyFlight?"true":"false")+
  ",\"explicitFlightArmRequired\":true,\"safeForFlight\":false"+
  ",\"inputSource\":"+zjJson(c.input.source==ZjReceiverSource::PPM?"PPM":
    c.input.source==ZjReceiverSource::ANDROID?"ANDROID":
    c.input.source==ZjReceiverSource::WEB?"WEB":"NONE")+
  ",\"inputAgeMs\":"+(c.input.valid?String(uint32_t(c.nowMs-c.input.receivedAtMs)):String("null"))+
  ",\"throttleUs\":"+String(c.input.channels[2])+
  ",\"armedIdlePulseUs\":"+String(ZJ_FLIGHT_ARMED_IDLE_US)+
  ",\"disarmedOutput\":\"PWM_OFF\",\"escPwmHz\":"+String(ZJ_ESC_PROFILE.hz)+
  ",\"actualMotorPulseUs\":[";
 for(unsigned n=0;n<4;n++){if(n)out+=',';out+=String(driver.lease?driver.applied[n]:0);}
 out+="],\"gyroRateDegS\":[";
 const float rate[]={imu.RateRoll,imu.RatePitch,imu.RateYaw};
 for(unsigned n=0;n<3;n++){if(n)out+=',';out+=gyroFresh?String(rate[n],3):String("null");}
 out+="],\"geometryPredictionUs\":[";
 for(unsigned n=0;n<4;n++){if(n)out+=',';out+=gyroFresh&&c.wiringVerified?String(reference.pulse[n],1):String("null");}
 out+="],\"pidShadowPulseUs\":[";
 const bool hasPidShadow=c.acro&&c.input.inputArmed&&shadow.reason&&!strcmp(shadow.reason,"READY");
 for(unsigned n=0;n<4;n++){if(n)out+=',';out+=hasPidShadow?String(shadow.mix.pulse[n],1):String("null");}
 out+="],\"geometryPredictionNote\":\"P-only at neutral sticks / 1500us reference; not PID dynamic output or PWM\",\"controlHz\":";
 out+=control.rate.known?String(control.rate.actual(at),2):String("null");
 out+=",\"controlMissedTicks\":"+String(control.missedTicks)+
  ",\"controlDeadlineMisses\":"+String(control.deadlineMisses)+
  ",\"flightDriverFault\":"+zjJson(zjFlightFaultName(driver.fault))+
  ",\"owner\":"+zjJson(driver.owner==ZjOutputOwner::FLIGHT?"FLIGHT":
   driver.owner==ZjOutputOwner::BENCH?"BENCH":
   driver.owner==ZjOutputOwner::ESC_CALIBRATION?"ESC_CALIBRATION":"NONE")+"}";
 return out;
}
#else
static String zjFlightStatusJson(){return "{\"version\":1,\"enabled\":false,\"qualified\":false,\"authorized\":false,\"canArm\":false,\"state\":\"DISARMED\",\"blockReason\":\"UNSUPPORTED_A2_ONLY\"}";}
static String zjFlightReadinessJson(){
 return String("{\"schema\":1,\"mode\":\"FLIGHT_READINESS\",\"board\":")+zjJson(FC_BOARD)+
  ",\"flightQualified\":false,\"canArm\":false,\"blockReason\":\"UNSUPPORTED_A2_ONLY\"}";
}
#endif
// Compact observation built outside the control/IMU workers. It never renews RC
// ownership, updates sample freshness, reserves an output, or writes flash.
static String zjFlightTelemetryJson(){
#if defined(CONFIG_IDF_TARGET_ESP32C6) && !defined(ZJ_TIMING_SYNCHRONOUS_TEST)
 auto sample=zjReadRateShadow();const auto control=zjReadControl();
 const auto driver=zjFlightDriverRead();const uint32_t at=micros();
 portENTER_CRITICAL(&zjTimingMux);
 const auto state=zjFlightOutputGate.state;const auto reason=zjFlightOutputGate.reason;
 portEXIT_CRITICAL(&zjTimingMux);
 const uint32_t age=uint32_t(at-sample.sampleAtUs);
 // Invalid sensor numbers must not prevent delivery of a failsafe observation.
 for(unsigned n=0;n<3;n++){
  if(!std::isfinite(sample.rates[n])){sample.rates[n]=0;sample.sampleValid=false;}
  if(!std::isfinite(sample.gravity[n])){sample.gravity[n]=0;sample.sampleValid=false;sample.attitude.valid=false;}
 }
 String out;out.reserve(900);
 out=String("{\"version\":1,\"kitId\":")+zjJson(zjKitId)+",\"bootId\":"+zjJson(zjBootId)+
  ",\"sequence\":"+String(control.ticks)+",\"sampleSequence\":"+String(sample.sampleSequence)+
  ",\"atUs\":"+String(at)+",\"ageUs\":"+String(age)+",\"valid\":"+(sample.sampleValid&&age<=12000?"true":"false")+
  ",\"rates\":"+zjImuVector(sample.rates)+",\"gravity\":"+zjImuVector(sample.gravity)+
  ",\"attitude\":["+String(sample.attitude.roll,3)+","+String(sample.attitude.pitch,3)+"]"+
  ",\"attitudeValid\":"+(sample.attitude.valid&&uint32_t(at-sample.attitude.atUs)<=12000?"true":"false")+
  ",\"levelCalibrated\":"+(sample.attitude.levelCalibrated?"true":"false")+
  ",\"accelUsed\":"+(sample.attitude.accelUsed?"true":"false")+
  ",\"flightModeState\":"+zjFlightModeState()+",\"owner\":"+String(unsigned(driver.owner))+
  ",\"offAck\":"+(driver.offAck?"true":"false")+",\"authorized\":"+(driver.lease&&state==ZjFlightState::ARMED?"true":"false")+
  ",\"state\":"+zjJson(state==ZjFlightState::ARMED?"ARMED":state==ZjFlightState::FAILSAFE?"FAILSAFE":"DISARMED")+
  ",\"reason\":"+zjJson(zjFlightFaultName(reason))+",\"applied\":[";
 for(unsigned n=0;n<4;n++){if(n)out+=',';out+=driver.appliedKnown?String(driver.applied[n]):String("null");}
 out+="],\"dtUs\":"+String(control.intervalUs)+",\"measuredHz\":"+String(control.rate.known?control.rate.actual(at):0,1)+
  ",\"missedTicks\":"+String(control.missedTicks)+",\"deadlineFault\":"+(sample.deadlineFault?"true":"false")+"}";
 return out;
#else
 return "{\"version\":0,\"error\":\"UNSUPPORTED\"}";
#endif
}
// Network code can access verified scanner/gyro state and existing serial commands.
void setup(){
 Serial.begin(115200);
 zjKitSetup();
 pinMode(LED_PIN,OUTPUT);
 digitalWrite(LED_PIN,HIGH);
 ledAvailable=ledcAttachChannel(LED_PIN,5000,8,5);
 ledOff();
 // Consume a verified one-use request and start PWM before network/sensor
 // initialization can occupy the loop. The independent timer owns the phases.
 zjMotorSetup();
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 zjAutoEscBoot(esp_reset_reason()==ESP_RST_POWERON);
#endif
 zjPpmSetup();
 selectI2cBus();
 // No decorative startup banner.
 printFirmwareInfo();
 Serial.println("ZJTEL,ACK,RATE,20");
 Serial.println("ZJTEL,ACK,FORMAT,COMBINED");
 zjNetworkSetup();
 zjControlRuntimeSetup();
 lastGyro=millis()-GYRO_PERIOD_MS;
 lastGyroProbe=millis()-2500;
 telLast=millis();
}
void loop(){
 const unsigned long now=millis();
 zjMotorLoop();
 readLedCommands();
 updateLedEffect(now);
 updateGyro(now);
 (void)zjAccessStationary();zjAccessLoop();
 scanI2C(now);
 zjPpmLoop(millis());
 emitTelemetry(now);
  emitImuDiagnostics(now);
 zjNetworkLoop(now);
 zjRcLoop(now);
 zjPublishControlInput();
 zjControlPpmArmEdge(); // one flight ARM attempt per fresh PPM gesture
 emitTimingDiagnostics(millis());
 // Versioned extension leaves the legacy ZJTEL record unchanged.
 static uint32_t lastState=0;
 if(uint32_t(millis()-lastState)>=250&&Serial.availableForWrite()>=108){
  lastState=millis();
  // Compact record avoids repeating the large network JSON on a 115200-baud link.
  Serial.printf("ZJSTATE,1,%s,%s,%s,%s,%d,%d,%d,%d,%d,%d,%u,%lu,%lu,%lu,%lu,%u,%s,%s,%u,%u,%u\n",
   zjKitId.c_str(),zjSavedFlightMode.c_str(),zjFlightMode.c_str(),zjFlightModePending?zjSavedFlightMode.c_str():"none",
   zjRcThrottle,zjRcRoll,zjRcPitch,zjRcYaw,zjRcCh5,zjRcCh6,unsigned(ledMode),
   (unsigned long)zjRcSeq,(unsigned long)(zjRcSeq?uint32_t(millis()-zjRcLast):0),(unsigned long)zjRcAccepted,(unsigned long)zjRcRejected,
   zjRcInputArmed?1U:0U,zjRcSource.c_str(),zjRcTransport,zjRcHasFrame?1U:0U,zjMotorEnabled?1U:0U,zjMotorArmed?1U:0U);
 }
 // Legacy ZJGYRO duplicates are disabled.
 static uint32_t lastAccess=0;
 if(uint32_t(millis()-lastAccess)>=750&&Serial.availableForWrite()>=100){
  lastAccess=millis();zjAccessLoop();
  const bool held=zjMaintenanceActive&&zjMaintenanceOwner.length();
  const uint32_t remaining=held?ZJ_MAINTENANCE_LEASE_MS-uint32_t(millis()-zjMaintenanceRenewedAt):0;
  Serial.printf("ZJACCESS,STATE,%s,%s,%u,%u,%u,%u,%lu,%s\n",zjKitId.c_str(),zjRcSelection.c_str(),
   zjRcPaused?1U:0U,zjAccessStationary()?1U:0U,zjMaintenanceActive?1U:0U,
   held&&zjMaintenanceOwner=="USB"?1U:0U,(unsigned long)remaining,zjRcControlPath.c_str());
 }
}
