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
 Wire.begin(); // SDA/SCL default pins, same as the existing scanner
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
 if(now-lastScan>=SCAN_PERIOD_MS){lastScan=now;scanI2C();}
}
