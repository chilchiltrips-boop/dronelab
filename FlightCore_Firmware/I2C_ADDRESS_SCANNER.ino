#include <Arduino.h>
#include <Wire.h>
#include <string.h>
#include <stdlib.h>

// FlightCore USB diagnostics v1.3.0; version is emitted by the RUNNING app,
// not inferred from a downloaded image or an ESP-ROM bootloader message.
constexpr const char* FW_VERSION="1.3.1";
#if defined(CONFIG_IDF_TARGET_ESP32C6)
constexpr uint8_t BUS_SDA=22,BUS_SCL=23; // XIAO ESP32-C6 D4/D5
constexpr const char* FC_BOARD="ZFC-A2",*FC_LABEL="ZEBJUS FlightCore A2 C6";
#else
constexpr uint8_t BUS_SDA=4,BUS_SCL=5; // A1: dedicated I2C pins; GPIO8 stays onboard LED-only
constexpr const char* FC_BOARD="ZFC-A1",*FC_LABEL="ZEBJUS FlightCore A1 SuperMini";
#endif

// Scanner output is intentionally backward-compatible with Python Lab's I2C parser.
// Internal USER LEDs on both supported controllers use inverted (active-low) PWM.
#if defined(CONFIG_IDF_TARGET_ESP32C6)
constexpr uint8_t LED_PIN=15;   // Seeed XIAO ESP32-C6
#else
constexpr uint8_t LED_PIN=8;    // ESP32-C3 Super Mini
#endif
constexpr unsigned long SCAN_PERIOD_MS=5000,LED_LEASE_MS=4000;
struct LedStep {uint8_t brightness;uint16_t duration;};
enum LedMode:uint8_t {LED_OFF,LED_MANUAL,LED_BLINK,LED_FADE,LED_SAFE,LED_WARNING,LED_SOS,LED_PATTERN};
LedMode ledMode=LED_OFF;
LedStep pattern[16];uint8_t patternCount=0,manualBrightness=0;
unsigned long effectStart=0,leaseStart=0,lastScan=0,telLast=0;
uint16_t telRateHz=20;
uint8_t activeSda=BUS_SDA,activeScl=BUS_SCL;
bool ledAvailable=true;
uint16_t onDuration=500,offDuration=500,fadeDuration=1200;
char serialLine[192];size_t serialUsed=0;

void ledLevel(uint8_t pct){if(ledAvailable)ledcWrite(LED_PIN,255-(uint32_t(constrain(pct,0,100))*255/100));}
void ledOff(){ledMode=LED_OFF;manualBrightness=0;patternCount=0;ledLevel(0);}
void printFirmwareInfo(){
 Serial.print("ZJINFO,FW,");Serial.print(FC_BOARD);Serial.print(',');
 Serial.print(FW_VERSION);Serial.print(',');Serial.print(__DATE__);Serial.print(',');
 Serial.print(__TIME__);Serial.print(',');Serial.println(FC_LABEL);
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
void ledAck(const char* id,const char* status){Serial.print("ZJLED,ACK,");Serial.print(id);Serial.print(',');Serial.println(status);}
bool parseNumber(const char* text,long minimum,long maximum,long& result){
 if(!text||!*text)return false;
 char* end=nullptr;const long n=strtol(text,&end,10);
 if(end==text||*end||n<minimum||n>maximum)return false;
 result=n;return true;
}
bool readLong(char*& state,long low,long high,long& result){
 return parseNumber(strtok_r(nullptr,",",&state),low,high,result);
}
void ledCommand(char* line){
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
  ledOff();leaseStart=millis();ledAck(id,"OK");return;
 }else if(!strcmp(action,"SET")){
  if(!readLong(state,0,100,a)){ledAck(id,"BAD_ARGS");return;}
  manualBrightness=a;next=LED_MANUAL;
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
 ledMode=next;effectStart=leaseStart=millis();ledAck(id,"OK");
}
void requestScan();
void serialCommand(char* line){
 if(!strcmp(line,"ZJINFO,GET")){printFirmwareInfo();return;}
 if(!strcmp(line,"ZJI2C,SCAN")){requestScan();return;}
 if(!strncmp(line,"ZJTEL,RATE,",11)){
  const long rate=atol(line+11);
  if((rate==10||rate==20||rate==50)&&strlen(line+11)<=2){
   telRateHz=uint16_t(rate);
   // Reset reported loss on a fresh telemetry-rate session. An earlier loop
   // timestamp may predate this command: emitTelemetry() handles that safely.
   telemetryDropped=0;telemetrySeq=0;telLast=millis();
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
   if(serialUsed){serialLine[serialUsed]='\0';serialCommand(serialLine);serialUsed=0;}
  }else if(serialUsed<sizeof(serialLine)-1)serialLine[serialUsed++]=c;
  else serialUsed=0;
 }
}
void updateLedEffect(unsigned long now){
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
// The serial frame is ZJGYRO,DATA,A1|A2,SENSOR,0xADDR,X,Y,Z (degrees/second).
#if defined(CONFIG_IDF_TARGET_ESP32C6)
constexpr uint8_t GYRO_ADDR=0x68;
constexpr unsigned long GYRO_PERIOD_MS=20; // 50 Hz sensor sampling independent of USB telemetry
constexpr const char* GYRO_BOARD="A2",*GYRO_NAME="MPU6050";
#else
constexpr uint8_t GYRO_ADDR=0x6B; // Verified GY-LSM6DS3 SA0 high
constexpr unsigned long GYRO_PERIOD_MS=20; // 50 Hz sensor sampling; LSM6DS3 ODR 104 Hz
constexpr const char* GYRO_BOARD="A1",*GYRO_NAME="LSM6DS3";
#endif
bool gyroReady=false;
unsigned long lastGyro=0,lastGyroProbe=0;
const char* gyroHealth="STARTING";
unsigned long legacyLast=0,telemetrySent=0;
uint32_t telemetrySeq=0,telemetryDropped=0;
constexpr unsigned long LEGACY_PERIOD_MS=200; // 5 Hz legacy gyro frames; low traffic
float RateRoll=0,RatePitch=0,RateYaw=0;

bool gyroWrite(uint8_t reg,uint8_t value){
 Wire.beginTransmission(GYRO_ADDR);Wire.write(reg);Wire.write(value);
 return Wire.endTransmission()==0;
}
bool gyroRead(uint8_t reg,uint8_t* data,uint8_t length){
 Wire.beginTransmission(GYRO_ADDR);Wire.write(reg);
 if(Wire.endTransmission(false)!=0)return false;
 if(Wire.requestFrom(GYRO_ADDR,length)!=length)return false;
 for(uint8_t i=0;i<length;i++)data[i]=uint8_t(Wire.read());
 return true;
}
void gyroStatus(const char* state){
 gyroHealth=state;
 Serial.print("ZJGYRO,STATUS,");Serial.print(GYRO_BOARD);Serial.print(',');
 Serial.print(GYRO_NAME);Serial.print(",0x");
 if(GYRO_ADDR<16)Serial.print('0');
 Serial.print(GYRO_ADDR,HEX);Serial.print(',');Serial.println(state);
}
bool beginGyro(){
 uint8_t id=0;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 // MPU6050 WHO_AM_I=0x68; wake, DLPF_CFG=5 and ±500 dps (65.5 LSB/dps).
 if(!gyroRead(0x75,&id,1)||id!=0x68)return false;
 if(!gyroWrite(0x6B,0x00))return false; // PWR_MGMT_1
 if(!gyroWrite(0x1A,0x05))return false; // DLPF_CFG
 if(!gyroWrite(0x1B,0x08))return false; // GYRO_CONFIG
#else
 // LSM6DS3 WHO_AM_I=0x69. 0x6C is accepted for compatible LSM6DS-family revisions.
 if(!gyroRead(0x0F,&id,1)||(id!=0x69&&id!=0x6C))return false;
 if(!gyroWrite(0x12,0x44))return false; // CTRL3_C: block data update + register auto-increment
 if(!gyroWrite(0x11,0x4C))return false; // CTRL2_G: 104 Hz, ±2000 dps
#endif
 return true;
}
bool gyroSignals(){
 uint8_t d[6];
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 if(!gyroRead(0x43,d,6))return false; // GYRO_XOUT_H, MSB first
 const int16_t x=int16_t((uint16_t(d[0])<<8)|d[1]);
 const int16_t y=int16_t((uint16_t(d[2])<<8)|d[3]);
 const int16_t z=int16_t((uint16_t(d[4])<<8)|d[5]);
 RateRoll=float(x)/65.5f;RatePitch=float(y)/65.5f;RateYaw=float(z)/65.5f;
#else
 if(!gyroRead(0x22,d,6))return false; // OUTX_L_G, LSB first
 const int16_t x=int16_t((uint16_t(d[1])<<8)|d[0]);
 const int16_t y=int16_t((uint16_t(d[3])<<8)|d[2]);
 const int16_t z=int16_t((uint16_t(d[5])<<8)|d[4]);
 RateRoll=float(x)*0.070f;RatePitch=float(y)*0.070f;RateYaw=float(z)*0.070f;
#endif
 return true;
}
void updateGyro(unsigned long now){
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
 // Gyro sampling is independent of USB transmission timing.
 // Maintain a separate low-rate ZJGYRO frame for legacy Python/plot clients.
}

// Non-blocking I2C scan: up to 3 addresses per pass; once per 5 seconds or on request.
// Legacy Arduino scanner text remains available for existing Python USB scan examples.
uint8_t scanAddress=1,scanCount=0;
bool scanActive=false,scanRequested=true;
unsigned long lastScanStart=0;
void requestScan(){scanRequested=true;}
void scanI2C(unsigned long now){
 if(!scanActive){
  if(!scanRequested&&now-lastScanStart<SCAN_PERIOD_MS)return;
  scanRequested=false;scanActive=true;scanAddress=1;scanCount=0;lastScanStart=now;
  Serial.println("Scanning I2C bus...\n");
 }
 for(uint8_t budget=0;budget<3&&scanAddress<127;budget++,scanAddress++){
  Wire.beginTransmission(scanAddress);
  const byte error=Wire.endTransmission();
  if(error==0){
   Serial.print("✔ Found device at 0x");
   if(scanAddress<16)Serial.print("0");
   Serial.println(scanAddress,HEX);scanCount++;
  }else if(error==4){
   Serial.print("⚠ Unknown error at 0x");
   if(scanAddress<16)Serial.print("0");
   Serial.println(scanAddress,HEX);
  }
 }
 if(scanAddress>=127){
  if(!scanCount)Serial.println("❌ No I2C devices found.\n");
  else{Serial.print("\n✅ Total I2C devices found: ");Serial.println(scanCount);}
  Serial.println("\n-----------------------------\n");
  Serial.print("ZJSCAN,");Serial.print(GYRO_BOARD);Serial.print(',');
  Serial.print(now);Serial.print(',');Serial.println(scanCount);
  scanActive=false;
 }
}
void selectI2cBus(){
 // A1 dedicated SDA4/SCL5, preserving GPIO8 for the active-low LED.
 // A2 remains GPIO22/23. Both controllers use 400 kHz.
 Wire.begin(BUS_SDA,BUS_SCL);Wire.setClock(400000);
 activeSda=BUS_SDA;activeScl=BUS_SCL;ledAvailable=true;
}
void emitLegacyGyro(unsigned long now){
 if(!gyroReady||now-legacyLast<LEGACY_PERIOD_MS||Serial.availableForWrite()<65)return;
 legacyLast=now;
 Serial.print("ZJGYRO,DATA,");Serial.print(GYRO_BOARD);Serial.print(',');
 Serial.print(GYRO_NAME);Serial.print(",0x");Serial.print(GYRO_ADDR,HEX);Serial.print(',');
 Serial.print(RateRoll,2);Serial.print(',');Serial.print(RatePitch,2);Serial.print(',');
 Serial.println(RateYaw,2);
}
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
 Serial.print(ledAvailable?"LED_READY":"PIN_CONFLICT");
 Serial.print(',');Serial.println(telemetryDropped);
 telemetrySent++;
}
void setup(){
 Serial.begin(115200);
 selectI2cBus();
 digitalWrite(LED_PIN,HIGH);
 pinMode(LED_PIN,OUTPUT);
 ledcAttach(LED_PIN,5000,8);
 ledOff();
 Serial.println("\n=== I2C Address Scanner ===");
 printFirmwareInfo();
 Serial.println("ZJTEL,ACK,RATE,20");
 lastGyro=millis()-GYRO_PERIOD_MS;
 lastGyroProbe=millis()-2500;
 telLast=millis();
}
void loop(){
 const unsigned long now=millis();
 readLedCommands();
 updateLedEffect(now);
 updateGyro(now);
 scanI2C(now);
 emitTelemetry(now);
 emitLegacyGyro(now);
}
