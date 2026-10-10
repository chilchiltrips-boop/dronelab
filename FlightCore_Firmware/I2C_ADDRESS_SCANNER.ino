#include <Arduino.h>
#include <Wire.h>
#include <string.h>
#include <stdlib.h>

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
unsigned long effectStart=0,leaseStart=0,lastScan=0;
uint16_t onDuration=500,offDuration=500,fadeDuration=1200;
char serialLine[192];size_t serialUsed=0;

void ledLevel(uint8_t pct){ledcWrite(LED_PIN,255-(uint32_t(constrain(pct,0,100))*255/100));}
void ledOff(){ledMode=LED_OFF;manualBrightness=0;patternCount=0;ledLevel(0);}
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
void readLedCommands(){
 // Keep parsing bounded so continuous serial data cannot starve the scanner.
 for(uint8_t n=0;n<96&&Serial.available();++n){
  const char c=char(Serial.read());
  if(c=='\n'||c=='\r'){
   if(serialUsed){serialLine[serialUsed]='\0';ledCommand(serialLine);serialUsed=0;}
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

// Board-specific USB gyroscope telemetry. No flight control, motors or PID logic.
// A1: LSM6DS3 @ 0x6B; A2: MPU6050 @ 0x68.
// The serial frame is ZJGYRO,DATA,A1|A2,SENSOR,0xADDR,X,Y,Z (degrees/second).
#if defined(CONFIG_IDF_TARGET_ESP32C6)
constexpr uint8_t GYRO_ADDR=0x68;
constexpr unsigned long GYRO_PERIOD_MS=50; // 20 Hz, matching MPU6050 example
constexpr const char* GYRO_BOARD="A2",*GYRO_NAME="MPU6050";
#else
constexpr uint8_t GYRO_ADDR=0x6B; // Verified GY-LSM6DS3 SA0 high
constexpr unsigned long GYRO_PERIOD_MS=20; // 50 Hz; sensor internally operates at 104 Hz
constexpr const char* GYRO_BOARD="A1",*GYRO_NAME="LSM6DS3";
#endif
bool gyroReady=false;
unsigned long lastGyro=0,lastGyroProbe=0;
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
 // Machine-readable for serial plotter / future Python Lab bridge.
 Serial.print("ZJGYRO,DATA,");Serial.print(GYRO_BOARD);Serial.print(',');
 Serial.print(GYRO_NAME);Serial.print(",0x");Serial.print(GYRO_ADDR,HEX);Serial.print(',');
 Serial.print(RateRoll,2);Serial.print(',');
 Serial.print(RatePitch,2);Serial.print(',');
 Serial.println(RateYaw,2);
}

// Original I2C scanner behavior and text preserved: address range 1..126, every 5 seconds.
void scanI2C(){
 byte error,address;int deviceCount=0;
 Serial.println("Scanning I2C bus...\n");
 for(address=1;address<127;address++){
  Wire.beginTransmission(address);error=Wire.endTransmission();
  if(error==0){
   Serial.print("✔ Found device at 0x");
   if(address<16)Serial.print("0");
   Serial.println(address,HEX);deviceCount++;
  }else if(error==4){
   Serial.print("⚠ Unknown error at 0x");
   if(address<16)Serial.print("0");
   Serial.println(address,HEX);
  }
 }
 if(deviceCount==0)Serial.println("❌ No I2C devices found.\n");
 else{Serial.print("\n✅ Total I2C devices found: ");Serial.println(deviceCount);}
 Serial.println("\n-----------------------------\n");
}
void setup(){
 Serial.begin(115200);
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 Wire.begin(); // XIAO D4 GPIO22 SDA / D5 GPIO23 SCL
#else
 // Arduino esp32c3 default SDA GPIO8 conflicts with the onboard LED GPIO8.
 // FlightCore A1 therefore uses GPIO4 SDA / GPIO5 SCL; rewire the IMU accordingly.
 Wire.begin(4,5);
#endif
 Wire.setClock(400000);
 digitalWrite(LED_PIN,HIGH);
 pinMode(LED_PIN,OUTPUT);
 ledcAttach(LED_PIN,5000,8);
 ledOff();
 Serial.println("\n=== I2C Address Scanner ===");
 delay(1000);
 lastScan=millis()-SCAN_PERIOD_MS;
}
void loop(){
 const unsigned long now=millis();
 readLedCommands();
 updateLedEffect(now);
 updateGyro(now);
 if(now-lastScan>=SCAN_PERIOD_MS){lastScan=now;scanI2C();}
}
