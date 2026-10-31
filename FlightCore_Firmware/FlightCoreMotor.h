#pragma once
#include "FlightCoreA2MotorLayout.h"
#include "FlightCoreMotorSafety.h"
#include "FlightCoreMotorConfig.h"
#if defined(CONFIG_IDF_TARGET_ESP32C6)
#include <driver/ledc.h>
#include <esp_timer.h>
#include <freertos/FreeRTOS.h>
static constexpr int ZJ_MOTOR_PINS[]={D0,D1,D2,D3};
static portMUX_TYPE zjMotorMux=portMUX_INITIALIZER_UNLOCKED;
static volatile bool zjMotorWatchActive=false,zjMotorWatchTripped=false;
static volatile uint32_t zjMotorServicedAt=0;
static esp_timer_handle_t zjMotorWatchTimer=nullptr;
static void zjMotorWatch(void*){
 portENTER_CRITICAL(&zjMotorMux);
 if(zjMotorWatchActive&&uint32_t(millis()-zjMotorServicedAt)>100){
  zjMotorWatchTripped=true;zjMotorWatchActive=false;
  for(int n=0;n<4;n++)ledc_stop(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),0);
 }
 portEXIT_CRITICAL(&zjMotorMux);
}
#endif
static ZjMotorSafety zjMotor;
static ZjMotorConfig zjMotorConfig;
static bool zjMotorConfigValid=true;
static bool zjMotorSaveConfig(const ZjMotorConfig& next){
 char encoded[64];next.encode(encoded,sizeof(encoded));const String value(encoded);
 if(zjKitPrefs.getString("motorConfig2","")!=value&&zjKitPrefs.putString("motorConfig2",value)!=value.length())return false;
 if(zjKitPrefs.getString("motorConfig2","")!=value)return false;
 zjMotorConfig=next;zjMotorConfigValid=true;return true;
}
static String zjMotorOwner,zjMotorToken,zjMotorPath,zjMotorProducer,zjMotorRadio;
static bool zjMotorDriverReady=false;
static uint32_t zjMotorCommandSeq=0,zjMotorInputDuration=0;
static ZjMotorInput zjMotorRtc;
static const char* zjMotorMode(){
 static const char* names[]={"DISABLED","READY","INPUT_TEST","SINGLE_TEST","ALL_TEST","CAL_HIGH","CAL_LOW","FAULT","SLIDER_TEST"};
 return names[zjMotor.mode];
}
static const char* zjMotorReason(){
 static const char* names[]={"NONE","USER_STOP","SESSION_EXPIRED","INPUT_LOST","INPUT_CHANGED","ARM_REQUIRED","THROTTLE_HIGH","SWITCH_REQUIRED","TEST_FINISHED","CAL_TIMEOUT","CAL_FINISHED","OUTPUT_ERROR","DEADLINE_MISSED","CONFIG_ERROR","CONTROL_LOST"};
 return names[zjMotor.reason];
}
static void zjMotorApply(){
 const bool enabled=zjMotor.benchEnabled&&zjMotor.mode!=ZjMotorSafety::FAULT;
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 portENTER_CRITICAL(&zjMotorMux);
 if(zjMotorWatchTripped&&enabled)zjMotor.fault(ZjMotorSafety::DEADLINE_MISSED);
 if(zjMotorDriverReady){
  for(int n=0;n<4;n++){
   const uint32_t duty=zjMotor.benchEnabled?uint32_t(zjMotorConfig.physicalPulse(n,zjMotor.pulses))*16384UL/20000UL:0;
   if(ledc_set_duty(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),duty)!=ESP_OK||
      ledc_update_duty(LEDC_LOW_SPEED_MODE,ledc_channel_t(n))!=ESP_OK)zjMotor.fault(ZjMotorSafety::OUTPUT_ERROR);
  }
  if(!zjMotor.benchEnabled)for(int n=0;n<4;n++)ledc_stop(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),0);
 }
 zjMotorServicedAt=millis();zjMotorWatchActive=zjMotor.benchEnabled;
 portEXIT_CRITICAL(&zjMotorMux);
#endif
 zjMotorEnabled=zjMotorDriverReady&&zjMotor.benchEnabled;
 zjMotorArmed=zjMotorEnabled&&zjMotor.armed;
 zjMotorSessionActive=zjMotor.benchEnabled;
 zjMotorInputTest=zjMotor.mode==ZjMotorSafety::INPUT_TEST;
 if(!zjMotor.benchEnabled){zjMotorToken="";zjMotorOwner="";}
}
static void zjMotorStop(){zjMotor.disable();zjMotorApply();}
static ZjMotorInput zjMotorReadInput(){
 if(zjRcControlPath=="ANDROID_WEBRTC"){
  auto i=zjMotorRtc;i.selected=zjControlRadio()=="STA"&&!zjRcPaused;return i;
 }
 ZjMotorInput i;
 i.source=zjRcSource=="PPM"?ZjMotorInput::PPM:zjRcSource=="WEB"?ZjMotorInput::WEB:
  zjRcSource=="ANDROID"&&String(zjRcTransport)=="AP"?ZjMotorInput::ANDROID_AP:ZjMotorInput::NONE;
 i.selected=zjRcSourceAllowed(zjRcSource)&&i.source!=ZjMotorInput::NONE;
 i.valid=zjRcOwned&&zjRcHasFrame;i.inputArmed=zjRcInputArmed;i.safetySwitch=zjRcCh5>1700;
 i.throttle=zjRcThrottle;i.yaw=zjRcYaw;i.sequence=zjRcSeq;i.receivedMs=zjRcLast;
 return i;
}
static void zjMotorLoop(){
 const uint32_t now=millis();
 if(zjMotor.benchEnabled){
  if(zjMotor.mode==ZjMotorSafety::INPUT_TEST&&
    (zjMotorPath!=zjRcControlPath||zjMotorProducer!=zjRcOwnerId||zjMotorRadio!=zjControlRadio()))zjMotor.disable(ZjMotorSafety::INPUT_CHANGED);
  if(zjMotor.mode==ZjMotorSafety::INPUT_TEST&&uint32_t(now-zjMotor.modeAt)>=zjMotorInputDuration)zjMotor.disable(ZjMotorSafety::TEST_FINISHED);
  if(zjAccessBusy()||zjMaintenanceActive)zjMotor.disable(ZjMotorSafety::USER_STOP);
  const auto i=zjMotorReadInput();
  // Remote input ARM is still gated by a fresh, low-throttle explicit bench session.
  if(zjMotor.mode==ZjMotorSafety::INPUT_TEST&&!zjMotor.armed&&i.source!=ZjMotorInput::PPM)zjMotor.armRemote(now,i);
  zjMotor.update(now,i);
 }
 zjMotorApply();
}
static String zjMotorStatus(){
 zjMotorLoop();
 const auto input=zjMotorReadInput();const bool rtc=zjRcControlPath=="ANDROID_WEBRTC";
 const bool fresh=input.valid&&input.selected&&uint32_t(millis()-input.receivedMs)<=(input.source==ZjMotorInput::PPM?ZjMotorSafety::INPUT_PPM_MS:ZjMotorSafety::INPUT_NETWORK_MS);
 String out="{\"version\":2,\"kitId\":"+zjJson(zjKitId)+",\"bootId\":"+zjJson(zjBootId)+",\"supported\":"+(zjMotorDriverReady?String("true"):String("false"))+
  ",\"mode\":"+zjJson(zjMotorMode())+",\"reason\":"+zjJson(zjMotorReason())+","+zjMotorFlags()+
  ",\"layout\":"+zjJson(zjMotorConfig.layout())+",\"configValid\":"+(zjMotorConfigValid?"true":"false")+
  ",\"profile\":\"PWM_50HZ_1000_2000\",\"physicalVerified\":false,\"maxTestPulseUs\":2000,\"maxInputPulseUs\":1200,\"sliderDurationMaxMs\":30000,\"inputDurationMaxMs\":30000,\"commandSequence\":"+String(zjMotorCommandSeq)+
  ",\"selectedInput\":"+zjJson(zjRcControlPath)+",\"inputSource\":"+zjJson(rtc?(input.valid?String("ANDROID_WEBRTC"):String("NONE")):zjRcSource)+
  ",\"inputAgeMs\":"+(input.valid?String(uint32_t(millis()-input.receivedMs)):String("null"))+
  ",\"inputValid\":"+(fresh?"true":"false")+",\"throttle\":"+String(input.throttle)+",\"inputArmed\":"+(input.inputArmed?"true":"false")+",\"channels\":";
 if(!fresh)out+="null";
 else if(!rtc&&zjRcSource=="PPM")out+=zjPpmRcChannelsJson();
 else if(rtc)out+="[null,null,"+String(input.throttle)+","+String(input.yaw)+","+String(input.inputArmed?2000:1000)+",null,null,null]";
 else out+="["+String(zjRcRoll)+","+String(zjRcPitch)+","+String(input.throttle)+","+String(input.yaw)+","+String(zjRcCh5)+","+String(zjRcCh6)+",null,null]";
 out+=",\"pulseUs\":[";
 for(int n=0;n<4;n++){if(n)out+=',';out+=String(zjMotorEnabled?zjMotor.pulses[n]:0);}
 out+="],\"layoutPins\":[";
 for(int n=0;n<4;n++){if(n)out+=',';out+=zjJson(String("D")+String(zjMotorConfig.pins[n]));}
 out+="],\"rotations\":[";
 for(int n=0;n<4;n++){if(n)out+=',';out+=zjJson(zjMotorConfig.rotation[n]?"CCW":"CW");}
 out+="],\"observedMinimumUs\":[";
 for(int n=0;n<4;n++){if(n)out+=',';out+=String(zjMotorConfig.minimumUs[n]);}
 out+="],\"sliderMask\":"+String(zjMotor.mode==ZjMotorSafety::SLIDER_TEST?zjMotor.sliderMask:0)+",\"sessionRemainingMs\":"+
  String(zjMotor.benchEnabled?ZjMotorSafety::SESSION_MS-uint32_t(millis()-zjMotor.sessionAt):0);
 const uint32_t limit=zjMotor.mode==ZjMotorSafety::CAL_HIGH?ZjMotorSafety::CAL_HIGH_MAX_MS:zjMotor.mode==ZjMotorSafety::CAL_LOW?ZjMotorSafety::CAL_LOW_MS:
  zjMotor.mode==ZjMotorSafety::SLIDER_TEST?zjMotor.sliderDuration:zjMotor.mode==ZjMotorSafety::INPUT_TEST?zjMotorInputDuration:(zjMotor.mode==ZjMotorSafety::SINGLE_TEST||zjMotor.mode==ZjMotorSafety::ALL_TEST)?zjMotor.lastInputAt:0;
 out+=",\"remainingMs\":"+String(limit&&uint32_t(millis()-zjMotor.modeAt)<limit?limit-uint32_t(millis()-zjMotor.modeAt):0)+"}";
 return out;
}
// A single handler serves USB and authenticated network requests. Tokens never
// appear in broadcast status. STOP invalidates the token before any new output.
static String zjMotorCommand(const String& action,const String& caller,const String& token,const String& a,const String& b,const String& c,bool authorized){
 zjMotorLoop();
 auto error=[](const char* e){return String("{\"error\":\"")+e+"\"}";};
 if(action=="STATUS")return zjMotorStatus();
 if(action=="STOP"){if(!authorized&&!(token==zjMotorToken&&caller==zjMotorOwner&&token.length()))return error("authorization_required");zjMotorStop();return zjMotorStatus();}
 if(!zjMotorDriverReady)return error("a2_motor_driver_required");
 const uint32_t now=millis();
 if(action=="BEGIN"){
  if(!authorized)return error("unlock_usb_teacher_or_authorize_network_control");
  if(!zjMotorConfigValid)return error("saved_motor_config_invalid_factory_reset_required");
  if(zjMotor.benchEnabled)return error("motor_setup_already_owned");
  if(a!="PROPS_REMOVED"||b!="PINS_VERIFIED"||c!="PWM_50HZ_1000_2000")return error("confirm_props_pins_and_esc_profile");
  if(zjAccessBusy()||zjMaintenanceActive||zjRcInputArmed||zjRcThrottle>1050||!zjPpmAccessSafe())return error("stop_maintenance_lower_throttle_and_disarm_input");
#if defined(CONFIG_IDF_TARGET_ESP32C6)
  portENTER_CRITICAL(&zjMotorMux);zjMotorWatchTripped=false;portEXIT_CRITICAL(&zjMotorMux);
#endif
  zjMotor.disable();zjMotorRtc=ZjMotorInput();if(!zjMotor.prepare(now,true,true))return error("setup_rejected");
  zjMotorOwner=caller;zjMotorToken=zjRcNewSession();zjMotorCommandSeq=0;zjMotorApply();
  String result=zjMotorStatus();return result.substring(0,result.length()-1)+",\"session\":"+zjJson(zjMotorToken)+"}";
 }
 // An operation deadline invalidates its token. KEEP may read the terminal
 // result but must never resurrect that expired session or reset its deadline.
 if(action=="KEEP"&&!zjMotor.benchEnabled)return zjMotorStatus();
 if(!token.length()||token!=zjMotorToken||caller!=zjMotorOwner||!zjMotor.benchEnabled)return error("motor_session_expired_or_not_owner");
 if(action=="KEEP"){zjMotor.keep(now);zjMotorApply();return zjMotorStatus();}
 bool ok=false;long n=0,p=0,d=0;
 if(action=="RTC"){
  if(zjRcControlPath!="ANDROID_WEBRTC"||zjControlRadio()!="STA"||
    (zjMotor.mode!=ZjMotorSafety::READY&&zjMotor.mode!=ZjMotorSafety::INPUT_TEST))return error("explicit_webrtc_bench_required");
  const int colon=c.indexOf(':');const int second=colon>=0?c.indexOf(':',colon+1):-1;long yaw=0,arm=0,age=0;
  if(!parseNumber(a.c_str(),1,2147483647L,n)||!parseNumber(b.c_str(),1000,2000,p)||colon<0||second<0||
    !parseNumber(c.substring(0,colon).c_str(),1000,2000,yaw)||!parseNumber(c.substring(colon+1,second).c_str(),0,1,arm)||
    !parseNumber(c.substring(second+1).c_str(),0,200,age)||uint32_t(n)<=zjMotorRtc.sequence)return error("invalid_or_repeated_webrtc_frame");
  zjMotorRtc.source=ZjMotorInput::ANDROID_WEBRTC;zjMotorRtc.valid=true;zjMotorRtc.selected=true;
  zjMotorRtc.sequence=n;zjMotorRtc.throttle=p;zjMotorRtc.yaw=yaw;zjMotorRtc.inputArmed=arm;zjMotorRtc.receivedMs=now-age;
  return zjMotorStatus();
 }else if(action=="LAYOUT"){
  if(zjMotor.mode!=ZjMotorSafety::READY)return error("stop_outputs_before_saving_layout");
  ZjMotorConfig next=zjMotorConfig;
  char pins[5],rotations[5];for(int i=0;i<4;i++){pins[i]='0'+next.pins[i];rotations[i]='0'+next.rotation[i];}pins[4]=rotations[4]=0;
  if(!next.configure(a.c_str(),b=="-"?pins:b.c_str(),c=="-"?rotations:c.c_str()))return error("invalid_layout_or_duplicate_pin");
  if(!zjMotorSaveConfig(next))return error("layout_save_failed");ok=true;
 }else if(action=="MINIMUM"){
  if(zjMotor.mode!=ZjMotorSafety::READY)return error("stop_outputs_before_saving_minimum");
  if(c!="OBSERVED_SPIN"||!parseNumber(a.c_str(),1,4,n)||!parseNumber(b.c_str(),1000,2000,p))return error("confirm_observed_minimum_pulse");
  ZjMotorConfig next=zjMotorConfig;next.setMinimum(n,p);
  if(!zjMotorSaveConfig(next))return error("minimum_save_failed");ok=true;
 }else if(action=="SLIDER"){
  if(b!="1000"||!parseNumber(a.c_str(),1,15,n)||!parseNumber(c.c_str(),1,30000,d))return error("start_slider_at_1000_with_valid_selection");
  ok=zjMotor.startSlider(now,n,d);
 }else if(action=="SLIDE"){
  if(!parseNumber(a.c_str(),1,15,n)||n!=zjMotor.sliderMask||!parseNumber(b.c_str(),1000,2000,p)||!parseNumber(c.c_str(),1,2147483647L,d))return error("invalid_slider_pulse_selection_or_sequence");
  ok=zjMotor.slide(now,p,d);
 }else if(action=="SINGLE"||action=="ALL"){
  if(!parseNumber(a.c_str(),1,4,n)||!parseNumber(b.c_str(),1000,2000,p)||!parseNumber(c.c_str(),1,2000,d)||(p-1000)%10)return error("invalid_motor_pulse_or_duration");
  ok=action=="SINGLE"?zjMotor.startSingle(now,n,(p-1000)/10,d):zjMotor.startAll(now,(p-1000)/10,d);
 }else if(action=="CAL_HIGH")ok=zjMotor.startCalibration(now,a=="POWER_DISCONNECTED");
 else if(action=="CAL_LOW")ok=zjMotor.calibrationLow(now);
 else if(action=="INPUT"){
  const auto i=zjMotorReadInput();
  if(a!="selected"||!parseNumber(b.c_str(),100,30000,d)||c!="CONFIRM_ALL_MOTORS"||!i.valid||!i.selected||i.throttle>1050||i.inputArmed)return error("fresh_selected_low_disarmed_input_required");
  zjMotorPath=zjRcControlPath;zjMotorProducer=zjRcOwnerId;zjMotorRadio=zjControlRadio();zjMotorInputDuration=d;
  ok=zjMotor.startInput(now,i.source,false);
 }else return error("unsupported_motor_operation");
 if(!ok)return error("invalid_motor_transition");
 ++zjMotorCommandSeq;zjMotorApply();return zjMotorStatus();
}
static bool zjMotorSerial(char* line){
 if(strncmp(line,"ZJMOTOR,",8))return false;
 char* save=nullptr;char* id=strtok_r(line+8,",",&save),*request=strtok_r(nullptr,",",&save),*action=strtok_r(nullptr,",",&save),*token=strtok_r(nullptr,",",&save),
  *a=strtok_r(nullptr,",",&save),*b=strtok_r(nullptr,",",&save),*c=strtok_r(nullptr,",",&save);
 if(!id||String(id)!=zjKitId||!request||!zjAdminValue(request,1,24,false)||!action||!token||!a||!b||!c||strtok_r(nullptr,",",&save)){Serial.println("ZJMOTOR,ERR,INVALID_REQUEST");return true;}
 const String out=zjMotorCommand(action,"USB",String(token)=="-"?String(""):String(token),a,b,c,zjAdminAuthorized());
 Serial.print("ZJMOTOR,ACK,");Serial.print(zjKitId);Serial.print(',');Serial.print(request);Serial.print(',');Serial.println(out);return true;
}
static void zjMotorSetup(){
 zjMotorStopHandler=zjMotorStop;
 const String saved=zjKitPrefs.getString("motorConfig2","");
 zjMotorConfigValid=!saved.length()||zjMotorConfig.decode(saved.c_str());
#if defined(CONFIG_IDF_TARGET_ESP32C6)
 ledc_timer_config_t timer={};timer.speed_mode=LEDC_LOW_SPEED_MODE;timer.duty_resolution=LEDC_TIMER_14_BIT;timer.timer_num=LEDC_TIMER_0;timer.freq_hz=50;timer.clk_cfg=LEDC_AUTO_CLK;
 bool ok=ledc_timer_config(&timer)==ESP_OK;
 for(int n=0;n<4;n++){
  ledc_channel_config_t channel={};channel.gpio_num=ZJ_MOTOR_PINS[n];channel.speed_mode=LEDC_LOW_SPEED_MODE;channel.channel=ledc_channel_t(n);channel.timer_sel=LEDC_TIMER_0;channel.duty=0;
  ok=(ledc_channel_config(&channel)==ESP_OK)&&ok;
 }
 esp_timer_create_args_t args={};args.callback=zjMotorWatch;args.name="motor_deadline";
 ok=(esp_timer_create(&args,&zjMotorWatchTimer)==ESP_OK)&&ok;
 if(ok)ok=esp_timer_start_periodic(zjMotorWatchTimer,5000)==ESP_OK;
 zjMotorDriverReady=ok;
 if(!ok){for(int n=0;n<4;n++)ledc_stop(LEDC_LOW_SPEED_MODE,ledc_channel_t(n),0);zjMotor.fault(ZjMotorSafety::OUTPUT_ERROR);}
#endif
 zjHttp.on("/api/motor",HTTP_POST,[](){
  if(!zjAllow())return;
  const bool permitted=zjRequestSession>=0&&!zjSessions[zjRequestSession].localSta;
  const String out=zjMotorCommand(zjArg("action"),zjRequestSession>=0?zjSessions[zjRequestSession].id:String(""),zjArg("session"),zjArg("a"),zjArg("b"),zjArg("c"),permitted);
  zjReply(out.startsWith("{\"error\"")?409:200,out);
 });
}
