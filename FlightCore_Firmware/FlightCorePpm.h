#pragma once
// FlightCore PPM-SUM diagnostic receiver. 3.3V-only signal; NO MOTOR OUTPUTS.
// A1 ESP32-C3 Super Mini = GPIO10. A2 XIAO ESP32-C6 D10 = GPIO18.
// Rising-to-rising 8 channel PPM frame; 3.2ms+ sync gap, 850..2150us pulses.
// All ISR operations stay in IRAM and copy fixed-size integers, not String/Serial.
#if defined(CONFIG_IDF_TARGET_ESP32C6)
#include <driver/rmt_rx.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include "FlightCorePpmDecode.h"
static constexpr uint8_t ZJ_PPM_PIN=18;
#else
static constexpr uint8_t ZJ_PPM_PIN=10;
#endif
#include "FlightCorePpmArm.h"
static constexpr uint8_t ZJ_PPM_CHANNELS=8;
static constexpr uint32_t ZJ_PPM_SYNC_US=3200,ZJ_PPM_MAX_GAP_US=30000;
static constexpr uint32_t ZJ_PPM_LOST_MS=150,ZJ_PPM_LOG_MS=100;
static portMUX_TYPE zjPpmMux=portMUX_INITIALIZER_UNLOCKED;
static volatile uint32_t zjPpmLastEdge=0;
static volatile uint16_t zjPpmBuilding[ZJ_PPM_CHANNELS]={};
static volatile uint16_t zjPpmReady[ZJ_PPM_CHANNELS]={};
static volatile uint8_t zjPpmIndex=0;
static volatile bool zjPpmFrameReady=false;
static volatile uint32_t zjPpmReadyAt=0;
static volatile uint32_t zjPpmIsrFrames=0,zjPpmFaults=0;
static volatile uint32_t zjPpmCaptureAt=0,zjPpmCaptureLosses=0;
static uint32_t zjPpmSeenCaptureLosses=0,zjPpmRateAt=0,zjPpmRateFrames=0,zjPpmCaptureHz=0;
static uint16_t zjPpmRaw[ZJ_PPM_CHANNELS]={},zjPpmValues[ZJ_PPM_CHANNELS]={};
static uint16_t zjPpmMin[ZJ_PPM_CHANNELS],zjPpmMid[ZJ_PPM_CHANNELS],zjPpmMax[ZJ_PPM_CHANNELS];
static uint8_t zjPpmMap[5]={0,1,2,3,4}; // roll,pitch,throttle,yaw,CH5 auxiliary
static uint32_t zjPpmLastFrameAt=0,zjPpmFrameSeq=0,zjPpmReportAt=0,zjPpmLostCount=0;
static uint8_t zjPpmSafeFrames=0;
static bool zjPpmInputAvailable=false,zjPpmReportedLost=false;
static ZjPpmArmGesture zjPpmArm;

// Caller holds the mailbox lock (ISR or receiver task). Keep physical arrival
// continuity even when an HTTP handler temporarily occupies the Arduino loop.
static void IRAM_ATTR zjPpmPublish(const volatile uint16_t* channels,uint32_t at){
 if(zjPpmIsrFrames&&uint32_t(at-zjPpmCaptureAt)>ZJ_PPM_LOST_MS)++zjPpmCaptureLosses;
 for(uint8_t i=0;i<ZJ_PPM_CHANNELS;i++)zjPpmReady[i]=channels[i];
 zjPpmCaptureAt=zjPpmReadyAt=at;zjPpmFrameReady=true;++zjPpmIsrFrames;
}

#if defined(CONFIG_IDF_TARGET_ESP32C6)
static rmt_channel_handle_t zjPpmRx=nullptr;
static rmt_symbol_word_t zjPpmSymbols[48];
static TaskHandle_t zjPpmRxTask=nullptr;
static volatile size_t zjPpmSymbolCount=0;
static volatile uint32_t zjPpmArmedAt=0,zjPpmCompletedAt=0,zjPpmRxErrors=0;
static bool zjPpmCaptureReady=false;
static bool IRAM_ATTR zjPpmRxDone(rmt_channel_handle_t,const rmt_rx_done_event_data_t* data,void*){
 // Use receive-start time as a conservative arrival bound. A delayed callback
 // or stalled receiver task cannot turn an old hardware packet into fresh RC.
 zjPpmSymbolCount=data->num_symbols;zjPpmCompletedAt=zjPpmArmedAt;
 BaseType_t woken=pdFALSE;vTaskNotifyGiveFromISR(zjPpmRxTask,&woken);return woken==pdTRUE;
}
static void zjPpmReceiveTask(void*){
 // C6 filter uses the 80 MHz group clock, not the 1 MHz channel tick.
 // Its 8-bit threshold permits 1 us (80 ticks), not a 40 us filter.
 rmt_receive_config_t receive={};receive.signal_range_min_ns=1000;receive.signal_range_max_ns=2500000;
 for(;;){
  zjPpmArmedAt=millis();
  if(rmt_receive(zjPpmRx,zjPpmSymbols,sizeof(zjPpmSymbols),&receive)!=ESP_OK){++zjPpmRxErrors;vTaskDelay(pdMS_TO_TICKS(2));continue;}
  ulTaskNotifyTake(pdTRUE,portMAX_DELAY);
  uint16_t channels[8];const size_t count=zjPpmSymbolCount;
  const bool good=zjDecodePpm(zjPpmSymbols,count,channels);
  portENTER_CRITICAL(&zjPpmMux);
  if(good)zjPpmPublish(channels,zjPpmCompletedAt);
  else if(count>=5)++zjPpmFaults; // Empty/no-signal captures are not invalid frames.
  portEXIT_CRITICAL(&zjPpmMux);
 }
}
static void zjPpmCaptureSetup(){
 rmt_rx_channel_config_t config={};config.gpio_num=gpio_num_t(ZJ_PPM_PIN);
 config.clk_src=RMT_CLK_SRC_DEFAULT;config.resolution_hz=1000000;config.mem_block_symbols=48;
 if(rmt_new_rx_channel(&config,&zjPpmRx)!=ESP_OK){++zjPpmRxErrors;return;}
 rmt_rx_event_callbacks_t callbacks={};callbacks.on_recv_done=zjPpmRxDone;
 if(rmt_rx_register_event_callbacks(zjPpmRx,&callbacks,nullptr)!=ESP_OK||rmt_enable(zjPpmRx)!=ESP_OK){++zjPpmRxErrors;return;}
 zjPpmCaptureReady=xTaskCreate(zjPpmReceiveTask,"zj-ppm-rx",3072,nullptr,4,&zjPpmRxTask)==pdPASS;
 if(!zjPpmCaptureReady)++zjPpmRxErrors;
}
#endif

static void IRAM_ATTR zjPpmInterrupt(){
 const uint32_t at=micros();
 portENTER_CRITICAL_ISR(&zjPpmMux);
 const uint32_t gap=at-zjPpmLastEdge;
 zjPpmLastEdge=at;
 if(gap>=ZJ_PPM_SYNC_US&&gap<=ZJ_PPM_MAX_GAP_US){
  if(zjPpmIndex==ZJ_PPM_CHANNELS){
   zjPpmPublish(zjPpmBuilding,millis());
  }else if(zjPpmIndex&&zjPpmIndex!=ZJ_PPM_CHANNELS)++zjPpmFaults;
  zjPpmIndex=0;
 }else if(gap>=850&&gap<=2150){
  if(zjPpmIndex<ZJ_PPM_CHANNELS)zjPpmBuilding[zjPpmIndex++]=uint16_t(gap);
  else {zjPpmIndex=ZJ_PPM_CHANNELS+1;++zjPpmFaults;}
 }else if(gap){
  zjPpmIndex=ZJ_PPM_CHANNELS+1;++zjPpmFaults;
 }
 portEXIT_CRITICAL_ISR(&zjPpmMux);
}
static uint16_t zjPpmScaled(uint16_t raw,uint8_t ch){
 const long minimum=zjPpmMin[ch],middle=zjPpmMid[ch],maximum=zjPpmMax[ch];
 if(raw<=minimum)return 1000;
 if(raw>=maximum)return 2000;
 if(raw<middle)return uint16_t(1000L+(long(raw)-minimum)*500/(middle-minimum));
 return uint16_t(1500L+(long(raw)-middle)*500/(maximum-middle));
}
static void zjPpmSetup(){
 for(uint8_t i=0;i<ZJ_PPM_CHANNELS;i++){
  const String index=String(i+1);
  const int lo=zjKitPrefs.getUShort(("ppm"+index+"lo").c_str(),1000);
  const int mid=zjKitPrefs.getUShort(("ppm"+index+"mid").c_str(),1500);
  const int hi=zjKitPrefs.getUShort(("ppm"+index+"hi").c_str(),2000);
  const bool valid=lo>=850&&lo<=1400&&mid>lo+100&&mid<hi-100&&hi<=2150;
  zjPpmMin[i]=valid?lo:1000;zjPpmMid[i]=valid?mid:1500;zjPpmMax[i]=valid?hi:2000;
 }
 const String stored=zjKitPrefs.getString("ppmMap","");
 if(stored.length()==5){
  bool valid=true;
  for(uint8_t i=0;i<5;i++){uint8_t ch=uint8_t(stored[i]-'1');if(stored[i]<'1'||stored[i]>'8'){valid=false;break;}
   for(uint8_t j=0;j<i;j++)if(zjPpmMap[j]==ch){valid=false;break;}
   zjPpmMap[i]=ch;
  }
  if(!valid){for(uint8_t i=0;i<5;i++)zjPpmMap[i]=i;}
 }
 pinMode(ZJ_PPM_PIN,INPUT_PULLDOWN); // receiver must drive a proper 3.3V signal
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 zjPpmCaptureSetup(); // Hardware timestamps every edge; Arduino loop is not the sample clock.
#else
 attachInterrupt(digitalPinToInterrupt(ZJ_PPM_PIN),zjPpmInterrupt,RISING);
#endif
 Serial.printf("ZJPPM,PIN,%s,GPIO%u,CH8,MOTORS_OFF\n",FC_BOARD,unsigned(ZJ_PPM_PIN));
}
static bool zjPpmSignalFresh(uint32_t now){
 return zjPpmInputAvailable&&uint32_t(now-zjPpmLastFrameAt)<=ZJ_PPM_LOST_MS;
}
static String zjPpmChannelsJson(){
 String out="[";
 for(uint8_t i=0;i<ZJ_PPM_CHANNELS;i++){if(i)out+=',';out+=String(zjPpmValues[i]);}
 return out+"]";
}
static String zjPpmRawJson(){
 String out="[";
 for(uint8_t i=0;i<ZJ_PPM_CHANNELS;i++){if(i)out+=',';out+=String(zjPpmRaw[i]);}
 return out+"]";
}
static String zjPpmRcChannelsJson(){
 return zjRcOwned&&zjRcSource=="PPM"&&zjRcHasFrame&&zjPpmSignalFresh(millis())?
  zjPpmChannelsJson():String("null");
}
static String zjPpmStatus(){
 const uint32_t now=millis();const bool good=zjPpmSignalFresh(now);
 String output=String("{\"pin\":")+String(ZJ_PPM_PIN)+",\"board\":"+String("\"")+FC_BOARD+"\"";
 output+=",\"present\":"+(good?String("true"):String("false"))+",\"owner\":"+
   (zjRcOwned&&zjRcSource=="PPM"?String("true"):String("false"));
 output+=",\"ageMs\":"+(zjPpmLastFrameAt?String(now-zjPpmLastFrameAt):String("null"));
 output+=",\"seq\":"+String(zjPpmFrameSeq)+",\"losses\":"+String(zjPpmLostCount)+
   ",\"faults\":"+String(uint32_t(zjPpmFaults));
 output+=",\"expectedHz\":50,\"captureHz\":"+String(zjPpmSignalFresh(now)?zjPpmCaptureHz:0);
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 output+=",\"captureBackend\":\"RMT_RX\",\"captureReady\":"+String(zjPpmCaptureReady?"true":"false")+",\"captureErrors\":"+String(uint32_t(zjPpmRxErrors));
#else
 output+=",\"captureBackend\":\"GPIO_ISR\",\"captureReady\":true,\"captureErrors\":0";
#endif
 output+=",\"raw\":"+(good?zjPpmRawJson():String("null"))+",\"channels\":"+
   (good?zjPpmChannelsJson():String("null"));
 output+=",\"map\":[";
 for(uint8_t i=0;i<5;i++){if(i)output+=',';output+=String(zjPpmMap[i]+1);}output+="]";
 output+=",\"armMethod\":\"THROTTLE_LOW_YAW_GESTURE\",\"armStatus\":"+
   zjJson(good&&zjRcOwned&&zjRcSource=="PPM"&&zjPpmArm.armed?"ARMED":"DISARMED");
 output+=",\"armHoldMs\":"+String(ZjPpmArmGesture::HOLD_MS)+",\"throttleLowUs\":1050,\"yawRightUs\":1900,\"yawLeftUs\":1100";
 output+=",\"inputArmed\":"+(good&&zjRcOwned&&zjRcSource=="PPM"&&zjPpmArm.armed?String("true"):String("false"))+","+zjMotorFlags()+"}";
 return output;
}
static void zjPpmLoop(uint32_t now){
 uint16_t captured[ZJ_PPM_CHANNELS];
 uint32_t receivedAt=0,capturedFrames=0,captureLosses=0;
 bool newFrame=false;
 portENTER_CRITICAL(&zjPpmMux);
 if(zjPpmFrameReady){
  for(uint8_t i=0;i<ZJ_PPM_CHANNELS;i++)captured[i]=zjPpmReady[i];
  receivedAt=zjPpmReadyAt;
  zjPpmFrameReady=false;newFrame=true;
 }
 capturedFrames=zjPpmIsrFrames;captureLosses=zjPpmCaptureLosses;
 portEXIT_CRITICAL(&zjPpmMux);
 now=millis();
 const bool captureGap=captureLosses!=zjPpmSeenCaptureLosses;
 zjPpmSeenCaptureLosses=captureLosses;
 const bool continuous=newFrame&&!captureGap&&uint32_t(now-receivedAt)<=ZJ_PPM_LOST_MS;
 // Distinguish a busy consumer from an actual receiver gap. A real gap still
 // releases control even when a newer mailbox frame arrived before this loop.
 if(zjPpmInputAvailable&&(captureGap||(!zjPpmSignalFresh(now)&&!continuous))){
  zjPpmInputAvailable=false;++zjPpmLostCount;zjPpmSafeFrames=0;zjPpmReportedLost=false;
  zjPpmArm.reset();
  if(zjRcOwned&&zjRcSource=="PPM")zjRcRelease("PPM_SIGNAL_LOST");
 }
 if(newFrame&&uint32_t(now-receivedAt)>ZJ_PPM_LOST_MS)newFrame=false;
 if(newFrame){
  // Process each complete frame once. PPM has no authentication; physical
  // ownership requires consecutive low-throttle frames. ARM is diagnostic only.
  for(uint8_t i=0;i<ZJ_PPM_CHANNELS;i++){
   if(captured[i]<850||captured[i]>2150){newFrame=false;break;}
  }
  if(newFrame){
   for(uint8_t i=0;i<ZJ_PPM_CHANNELS;i++){
    zjPpmRaw[i]=captured[i];zjPpmValues[i]=zjPpmScaled(captured[i],i);
   }
   zjPpmLastFrameAt=receivedAt;zjPpmFrameSeq=capturedFrames;zjPpmInputAvailable=true;
   const int t=zjPpmValues[zjPpmMap[2]],r=zjPpmValues[zjPpmMap[0]],
    p=zjPpmValues[zjPpmMap[1]],y=zjPpmValues[zjPpmMap[3]];

   if(!zjRcSourceAllowed("PPM")){
    zjPpmSafeFrames=0;zjPpmArm.reset();
   }else if(zjRcOwned&&zjRcSource=="PPM"){
    zjPpmArm.accept(t,y,receivedAt);
    zjRcThrottle=t;zjRcRoll=r;zjRcPitch=p;zjRcYaw=y;
    zjRcInputArmed=zjPpmArm.armed;zjRcHasFrame=true;
    zjRcCh5=zjPpmValues[4];zjRcCh6=zjPpmValues[5];zjApplyPendingFlightMode();
    zjRcLast=receivedAt;zjRcLeaseAt=receivedAt;++zjRcSeq;if(!zjRcSeq)++zjRcSeq;++zjRcAccepted;
   }else if(!zjRcOwned){
    zjPpmArm.reset(); // no old ARM state crosses an RC ownership release
    if(t<=ZjPpmArmGesture::THROTTLE_LOW_US)zjPpmSafeFrames=(zjPpmSafeFrames<3?zjPpmSafeFrames+1:3);
    else zjPpmSafeFrames=0;
    if(zjPpmSafeFrames>=3){
     zjRcOwned=true;zjRcNetwork=false;zjRcSource="PPM";zjRcTransport="PPM";
     zjRcSession="";zjRcOwnerId="PPM";zjRcLast=receivedAt;zjRcLeaseAt=receivedAt;
     zjRcInputArmed=false;zjPpmArm.accept(t,y,receivedAt);
     zjRcThrottle=t;zjRcRoll=r;zjRcPitch=p;zjRcYaw=y;zjRcHasFrame=true;
     zjRcCh5=zjPpmValues[4];zjRcCh6=zjPpmValues[5];zjApplyPendingFlightMode();
     zjRcSeq=1;++zjRcAccepted;
    }
   }else {zjPpmSafeFrames=0;zjPpmArm.reset();} // Never steal a WEB/ANDROID session.
  }
 }
 if(uint32_t(now-zjPpmRateAt)>=1000){
  zjPpmCaptureHz=uint32_t(capturedFrames-zjPpmRateFrames)*1000UL/uint32_t(now-zjPpmRateAt);
  zjPpmRateFrames=capturedFrames;zjPpmRateAt=now;
 }
 if(uint32_t(now-zjPpmReportAt)>=ZJ_PPM_LOG_MS&&Serial.availableForWrite()>145){
  zjPpmReportAt=now;
  if(zjPpmSignalFresh(now)){
   zjPpmReportedLost=false;
   Serial.printf("ZJPPM,1,%s,%lu,ARM=%d",zjRcOwned&&zjRcSource=="PPM"?"ACTIVE":"LOCKED",
     (unsigned long)zjPpmFrameSeq,zjRcOwned&&zjRcSource=="PPM"&&zjRcInputArmed?1:0);
   for(uint8_t i=0;i<ZJ_PPM_CHANNELS;i++){Serial.printf(",CH%u=%u",unsigned(i+1),unsigned(zjPpmValues[i]));}
   Serial.println();
  }else if(zjPpmLostCount&&!zjPpmReportedLost){zjPpmReportedLost=true;Serial.println("ZJPPM,1,LOST,0,ARM=0");}
 }
}
static bool zjPpmSerialCommand(char* line){
 if(!strcmp(line,"ZJPPM,GET")){
  Serial.print("ZJPPM,STATUS,");Serial.println(zjPpmStatus());return true;
 }
 if(!strncmp(line,"ZJPPM,CAL,",10)){
  if(!zjAdminAuthorized()||zjRcOwned){Serial.println("ZJPPM,ERR,ADMIN_OR_OWNER_LOCKED");return true;}
  char* state=nullptr;char* ch=strtok_r(line+10,",",&state);
  char* lo=strtok_r(nullptr,",",&state),*mid=strtok_r(nullptr,",",&state),*hi=strtok_r(nullptr,",",&state);
  long c=0,l=0,m=0,h=0;
  if(!ch||!lo||!mid||!hi||strtok_r(nullptr,",",&state)||
   !parseNumber(ch,1,8,c)||!parseNumber(lo,850,1400,l)||
   !parseNumber(mid,1050,1900,m)||!parseNumber(hi,1600,2150,h)||
   m-l<120||h-m<120){Serial.println("ZJPPM,ERR,CAL_RANGE");return true;}
  const uint8_t idx=uint8_t(c-1);
  zjPpmMin[idx]=l;zjPpmMid[idx]=m;zjPpmMax[idx]=h;
  const String n=String(c);
  zjKitPrefs.putUShort(("ppm"+n+"lo").c_str(),l);
  zjKitPrefs.putUShort(("ppm"+n+"mid").c_str(),m);
  zjKitPrefs.putUShort(("ppm"+n+"hi").c_str(),h);
  Serial.printf("ZJPPM,ACK,CAL,%ld\n",c);return true;
 }
 if(!strncmp(line,"ZJPPM,MAP,",10)){
  if(!zjAdminAuthorized()||zjRcOwned){Serial.println("ZJPPM,ERR,ADMIN_OR_OWNER_LOCKED");return true;}
  char* rest=line+10;uint8_t channels[5];bool used[8]={};
  for(uint8_t i=0;i<5;i++){
   char* comma=strchr(rest,',');
   if((i<4&&!comma)||(i==4&&comma)){Serial.println("ZJPPM,ERR,MAP_COUNT");return true;}
   if(comma)*comma='\0';
   long ch=0;if(!parseNumber(rest,1,8,ch)||used[ch-1]){Serial.println("ZJPPM,ERR,MAP_VALUE");return true;}
   channels[i]=uint8_t(ch-1);used[ch-1]=true;
   if(comma)rest=comma+1;
  }
  String stored="";for(uint8_t i=0;i<5;i++){zjPpmMap[i]=channels[i];stored+=char('1'+channels[i]);}
  zjKitPrefs.putString("ppmMap",stored);
  Serial.println("ZJPPM,ACK,MAP");return true;
 }
 return false;
}
