import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {a2MotorFixture} from './a2-motor-host-fixture.mjs';

test('actual A2 calibration starts a fresh lease, accepts SLIDE-only control and still stops on stale control, expiry and STOP',()=>{
 const dir=mkdtempSync(join(tmpdir(),'a2-output-stability-'));
 try{
  const code=a2MotorFixture(dir)+String.raw`
static String token;
static bool has(const String& s,const char* value){return strstr(s.c_str(),value);}
static String cmd(const char* action,const String& a="-",const String& b="-",const String& c="-",const char* owner="USB"){
 return zjMotorCommand(action,owner,token,a,b,c,true);
}
static void off(){for(auto d:duty)assert(!d);assert(!zjMotorEnabled);}
static void advance(uint32_t ms){
 while(ms){const uint32_t step=ms<5?ms:5;clockMs+=step;ms-=step;zjMotorLoop();zjMotorWatch(nullptr);}
}
static void begin(){
 auto wiring=zjMotorConfig;memset(wiring.minimumUs,0,sizeof(wiring.minimumUs));
 char encoded[64];wiring.encode(encoded,sizeof(encoded));
 token="";const String binding=zjBootId+"|"+String(zjWizardSaved.revision)+"|"+encoded;
 assert(!has(cmd("WIZARD_BEGIN","PROPS_REMOVED","PINS_VERIFIED",binding),"error"));token=zjMotorToken;for(auto d:duty)assert(!d);
}
int main(){
 clockMs=100;zjKitId="ZFC-A2-012345ABCDEF";zjMotorSetup();
 auto saved=zjWizardSaved;saved.esc=true;assert(zjPersistWizard(saved));
 assert(has(cmd("STATUS"),"\"calibrationSlideKeepsSession\":true"));
 // The old READY lease is ten seconds; a 1.6-second network delay must not
 // turn a valid start into an already-expired 1.5-second live session.
 begin();advance(1600);assert(!has(cmd("CAL_SLIDER","1","1000","30000"),"error"));
 assert(zjMotor.mode==ZjMotorSafety::SLIDER_TEST&&!zjMotor.timedBench);
 assert(zjMotor.sessionAt==clockMs&&zjMotor.sliderAt==clockMs);
 assert(duty[0]&&!duty[1]&&!duty[2]&&!duty[3]);
 assert(has(cmd("SLIDE","1","1087","1"),"establish_calibration_low_first"));
 assert(!has(cmd("SLIDE","1","1000","1"),"error"));
 // Forty accepted updates span twenty seconds, with no KEEP at all.
 for(int seq=2;seq<=41;seq++){
  advance(500);assert(!has(cmd("SLIDE","1","1087",String(seq)),"error"));
  assert(zjMotor.mode==ZjMotorSafety::SLIDER_TEST&&zjMotor.sessionAt==clockMs);
 }
 const uint32_t lease=zjMotor.sessionAt;advance(100);
 assert(has(cmd("SLIDE","1","1087","41"),"invalid_motor_transition"));assert(zjMotor.sessionAt==lease);
 assert(has(cmd("SLIDE","1","1087","42","OTHER"),"not_owner"));assert(zjMotor.sessionAt==lease);
 assert(has(cmd("SLIDE","1","1501","42"),"out_of_range"));assert(zjMotor.sessionAt==lease);
 // KEEP renews only the session, never the separate control freshness clock.
 advance(500);cmd("KEEP");assert(zjMotor.mode==ZjMotorSafety::SLIDER_TEST);
 advance(151);off();assert(zjMotor.reason==ZjMotorSafety::CONTROL_LOST);
 cmd("SLIDE","1","1087","42");off();
 // A timed-out READY session is not revived by the fresh-start rule.
 begin();advance(10001);cmd("CAL_SLIDER","1","1000","30000");off();assert(zjMotor.reason==ZjMotorSafety::SESSION_EXPIRED);
 // Group calibration has the same cap, ownership and hard 30-second limit.
 begin();cmd("CAL_SLIDER","15","1000","30000");
 for(int seq=1;seq<=59;seq++){
  advance(500);assert(!has(cmd("SLIDE","15","1500",String(seq)),"error"));
  for(auto d:duty)assert(d==ZJ_ESC_PROFILE.duty(1500));
 }
 advance(500);off();assert(zjMotor.reason==ZjMotorSafety::TEST_FINISHED);
 // A stalled main loop still trips the independent 100 ms output watchdog.
 begin();cmd("CAL_SLIDER","1","1000","30000");clockMs+=101;zjMotorWatch(nullptr);
 for(auto d:duty)assert(!d);zjMotorLoop();off();assert(zjMotor.reason==ZjMotorSafety::DEADLINE_MISSED);
 // Capture and page-save remain outputs-off operations with verified readback.
 begin();cmd("CAL_SLIDER","1","1000","30000");advance(501);cmd("SLIDE","1","1123","1");
 const unsigned writes=zjKitPrefs.writes;
 const String stopped=cmd("STOP","CAPTURE_OUTPUT");off();assert(has(stopped,"\"stoppedPulseUs\":1123"));
 assert(zjKitPrefs.writes==writes&&!zjWizardSaved.motor.minimumUs[0]);
 const String result=zjMotorCommand("WIZARD_SAVE_PAGE","USB","","1123",String(zjWizardSaved.revision),zjBootId+":M1",true);
 assert(!has(result,"error")&&has(result,"\"configVerified\":true"));off();
 assert(zjWizardSaved.motor.minimumUs[0]==1123);
 zjMotorSetup();off();assert(zjWizardSaved.motor.minimumUs[0]==1123);
 // Existing non-Wizard live SLIDER callers still require their own KEEP.
 token="";cmd("BEGIN","PROPS_REMOVED","PINS_VERIFIED","PWM_50HZ_1000_2000");token=zjMotorToken;
 cmd("SLIDER","1","1000","30000");
 advance(500);cmd("SLIDE","1","1100","1");advance(500);cmd("SLIDE","1","1100","2");
 advance(501);cmd("SLIDE","1","1100","3");off();assert(zjMotor.reason==ZjMotorSafety::SESSION_EXPIRED);
 std::cout<<"PASS calibration slide lease, startup, control freshness, cap, hard deadline, capture/save and legacy interlocks\n";
}
`;
  const file=join(dir,'output.cpp'),bin=join(dir,'output');writeFileSync(file,code);
  const compile=spawnSync('g++',['-std=c++17','-I'+resolve('FlightCore_Firmware'),'-I'+resolve('tools'),'-I'+resolve('tools/host-stubs'),'-I'+dir,file,'-lcrypto','-o',bin],{encoding:'utf8'});
  assert.equal(compile.status,0,compile.stderr);
  const result=spawnSync(bin,[],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/PASS calibration slide lease/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('A2 Rate Check uses the authorized bounded PWM driver and STOP reports an unverified output',()=>{
 const dir=mkdtempSync(join(tmpdir(),'a2-rate-check-'));
 try{
  const runtime=readFileSync('FlightCore_Firmware/FlightCoreControlRuntime.h','utf8');
  const arm=runtime.slice(runtime.indexOf('static ZjFlightFault zjControlReleaseReason('),runtime.indexOf('static ZjRateTraceEvent zjTraceTerminalEvent('));
  const api=readFileSync('FlightCore_Firmware/FlightCoreRateTraceApi.h','utf8');
  const serial=api.slice(api.indexOf('static bool zjFlightSerialCommand('));
  const code=a2MotorFixture(dir)+String.raw`
#include "FlightCoreTiming.h"
#include "FlightCorePidSettings.h"
#include "FlightCoreRateTrace.h"
static portMUX_TYPE zjTimingMux=0;
static ZjControlScheduler zjControl;
static ZjFlightOutputGate zjFlightOutputGate;
static ZjFlightConditions preflight,zjFlightPolicy;
static ZjRateTrace zjFlightTrace;
static ZjFlightFault zjTracePendingFault=ZjFlightFault::NONE;
static FlightReceiverSnapshot zjTraceFaultInput;
static uint32_t zjFlightLease=0,zjFlightRevokeEpoch=0,zjFlightArmAt=0,zjTraceFaultAt=0;
static bool zjFlightRateCheck=false,zjShadowRequested=false,zjControlRuntimeReady=true;
static constexpr uint32_t ZJ_PPM_LOST_MS=150;
static struct {bool gyroReady=true;ZjSampleStamp sample;} zjImuMailbox;
static ZjFlightConditions zjFlightMainConditions(){return preflight;}
static constexpr unsigned ZJ_TRACE_USB_PAGE=4;
static const char* zjFlightTracePage(const String&,const String&,const String&,unsigned,String&){return "UNSUPPORTED";}
`+arm+serial+String.raw`
static bool has(const String& value,const char* expected){return strstr(value.c_str(),expected);}
static void request(const char* line,const char* expected){
 char command[128];snprintf(command,sizeof(command),"%s",line);
 Serial.output.clear();assert(zjFlightSerialCommand(command));
 assert(Serial.output.find(expected)!=std::string::npos);
}
static void fresh(){
 preflight.input.receivedAtMs=clockMs;
 zjImuMailbox.sample.accept(micros());zjControl.start(micros()-8000);
 assert(zjControl.begin(micros()-4000));zjControl.finish(micros()-3900);
 assert(zjControl.begin(micros()));zjControl.finish(micros());
}
static void allOff(){
 for(auto value:duty)assert(!value);
 assert(zjFlightDriverRead().offAck);
}
int main(){
 clockMs=1000;zjKitId="ZFC-A2-012345ABCDEF";zjMotorSetup();Serial.capture=true;
 zjFlightRevokeHandler=zjControlRevoke;
 assert(!zjRateCheckWiringReady()&&!zjFlightDriverClaim(1,true));
 auto saved=zjWizardSaved;
 assert(saved.motor.decode("X:2103:0101:0:0:0:0")&&zjPersistWizard(saved));
 preflight.acro=preflight.wiringVerified=preflight.driverReady=true;
 auto& input=preflight.input;
 input.source=ZjReceiverSource::PPM;input.valid=input.selected=input.inputArmed=true;
 input.sequence=input.generation=1;input.availableMask=15;fresh();
 request("ZJFLIGHT,RATE_CHECK,ZFC-A2-012345ABCDEF,req,boot-1,1,PROPS_REMOVED","ADMIN_LOCKED");
 zjAdminUnlocked=true;zjAdminUnlockAt=clockMs;
 request("ZJFLIGHT,ARM,ZFC-A2-012345ABCDEF,req,boot-1,1","UNQUALIFIED");
 request("ZJFLIGHT,RATE_CHECK,ZFC-A2-012345ABCDEF,req,oldboot,2,PROPS_REMOVED","BOOT_CHANGED");
 request("ZJFLIGHT,RATE_CHECK,ZFC-A2-012345ABCDEF,req,boot-1,2","CONFIRM_PROPS_REMOVED");
 input.channels[2]=1100;
 request("ZJFLIGHT,RATE_CHECK,ZFC-A2-012345ABCDEF,req,boot-1,2,PROPS_REMOVED","THROTTLE_HIGH");
 input.channels[2]=1000;input.source=ZjReceiverSource::WEB;
 request("ZJFLIGHT,RATE_CHECK,ZFC-A2-012345ABCDEF,req,boot-1,3,PROPS_REMOVED","SOURCE_UNSUPPORTED");
 input.source=ZjReceiverSource::PPM;
 request("ZJFLIGHT,RATE_CHECK,ZFC-A2-012345ABCDEF,req,boot-1,4,PROPS_REMOVED","RATE_CHECK_ACTIVE");
 request("ZJFLIGHT,RATE_CHECK,ZFC-A2-012345ABCDEF,req,boot-1,4,PROPS_REMOVED","INVALID_OR_REPLAYED_ARM");
 const auto lease=zjFlightLease;
 const auto mix=zjRateMixQuadX(1150,80,0,0,ZJ_RATE_CHECK_MAX_PULSE_US);
 assert(mix.pulse[0]==1070&&mix.pulse[1]==1200&&mix.clipMask==6);
 uint16_t pulse[4];for(unsigned n=0;n<4;n++)pulse[n]=mix.pulse[n];
 auto result=zjFlightDriverSubmit(lease,pulse,micros()+4000);
 assert(result.rateCheck()&&result.appliedKnown&&result.applied[1]==1200);
 for(unsigned n=0;n<4;n++)assert(duty[n]==ZJ_ESC_PROFILE.duty(zjMotorConfig.physicalPulse(n,pulse)));
 failStop=true;
 assert(has(zjMotorCommand("STOP","USB","","-","-","-",true),"output_off_unverified"));
 assert(!zjFlightLease&&!zjMotorOutputsDisabled()&&!zjFlightDriverRead().offAck);
 assert(has(zjMotorStatus(),"\"motorsDisabled\":false"));
 assert(!zjFlightDriverClaim(101,true));
 assert(!zjFlightDriverSubmit(lease,pulse,micros()+4000).lease);
 failStop=false;
 assert(has(zjMotorCommand("STOP","USB","","-","-","-",true),"\"motorsDisabled\":true"));allOff();

 assert(zjFlightDriverClaim(102,true));
 for(unsigned n=0;n<1250;n++){
  result=zjFlightDriverSubmit(102,pulse,micros()+4000);assert(result.rateCheck());clockMs+=4;
 }
 zjMotorWatch(nullptr);allOff();
 assert(zjFlightDriverRead().fault==ZjFlightFault::RATE_CHECK_COMPLETE);zjMotorLoop();
 assert(zjFlightDriverClaim(103,true));
 pulse[0]=1201;result=zjFlightDriverSubmit(103,pulse,micros()+4000);
 assert(!result.lease&&result.fault==ZjFlightFault::OUTPUT_ERROR);allOff();zjMotorLoop();
 assert(zjFlightDriverClaim(104,true));
 clockMs+=8;zjMotorWatch(nullptr);allOff();
 assert(zjFlightDriverRead().fault==ZjFlightFault::DEADLINE_MISSED);
 std::cout<<"PASS bounded A2 Rate Check and authoritative STOP";
}
`;
  const file=join(dir,'rate-check.cpp'),bin=join(dir,'rate-check');writeFileSync(file,code);
  const compile=spawnSync('g++',['-std=c++17','-I'+resolve('FlightCore_Firmware'),'-I'+resolve('tools'),'-I'+resolve('tools/host-stubs'),'-I'+dir,file,'-lcrypto','-o',bin],{encoding:'utf8'});
  assert.equal(compile.status,0,compile.stderr);
  const result=spawnSync(bin,[],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/PASS bounded A2 Rate Check and authoritative STOP/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
