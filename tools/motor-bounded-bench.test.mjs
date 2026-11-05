import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createMotorClient,setupInputSample} from '../js/motor-setup.js';

test('production hardware watchdog enforces absolute manual deadlines during a stalled main loop',()=>{
 const source=readFileSync('FlightCore_Firmware/FlightCoreMotor.h','utf8');
 const watch=source.slice(source.indexOf('static portMUX_TYPE zjMotorMux='),source.indexOf('\n#endif',source.indexOf('static portMUX_TYPE zjMotorMux=')));
 const apply=source.slice(source.indexOf('static void zjMotorApply(){'),source.indexOf('static void zjMotorStop()'));
 const code=`#define CONFIG_IDF_TARGET_ESP32C6 1
#include <cassert>
#include <string>
#include <iostream>
#include <algorithm>
#include <atomic>
#include ${JSON.stringify(resolve('FlightCore_Firmware/FlightCoreEscProfile.h'))}
#include ${JSON.stringify(resolve('FlightCore_Firmware/FlightCoreFlightOutput.h'))}
#include ${JSON.stringify(resolve('FlightCore_Firmware/FlightCoreMotorConfig.h'))}
#include ${JSON.stringify(resolve('FlightCore_Firmware/FlightCoreMotorSafety.h'))}
#include ${JSON.stringify(resolve('FlightCore_Firmware/FlightCoreAutoEsc.h'))}
static ZjAutoEscSequence zjAutoEscSequence;static ZjAutoEscRecord zjAutoEscRecord;
static void zjAutoEscTick(uint32_t){assert(false);}
using portMUX_TYPE=int;using esp_timer_handle_t=void*;using ledc_channel_t=int;
#define portMUX_INITIALIZER_UNLOCKED 0
static void portENTER_CRITICAL(int*){}static void portEXIT_CRITICAL(int*){}
static uint32_t clockMs=0;static std::atomic<uint32_t> zjMotorUpdateMaxUs{0};static uint32_t millis(){return clockMs;}
static uint32_t micros(){return clockMs*1000;}
constexpr int LEDC_LOW_SPEED_MODE=0,ESP_OK=0;
static uint32_t duties[4];
static int ledc_stop(int,int channel,int){duties[channel]=0;return 0;}
static int ledc_set_duty(int,int channel,uint32_t duty){duties[channel]=duty;return 0;}
static int ledc_update_duty(int,int){return 0;}
${watch}
static ZjMotorSafety zjMotor;
struct Mapping {uint16_t physicalPulse(int n,const uint16_t* p) const{return p[n];}} zjMotorConfig,zjWizardBenchConfig;
static bool zjWizardBench=false,zjWizardCalSlider=false;
static bool zjMotorDriverReady=true,zjMotorEnabled=false,zjMotorArmed=false,zjMotorSessionActive=false,zjMotorInputTest=false;
static std::string zjMotorToken,zjMotorOwner;
${apply}
static void begin(){zjMotor.disable();zjMotorWatchTripped=false;assert(zjMotor.prepare(clockMs,true,true,true));zjMotorApply();}
static void off(ZjMotorSafety::Reason reason){for(auto d:duties)assert(d==0);zjMotorApply();assert(!zjMotorEnabled&&zjMotor.reason==reason);for(auto d:duties)assert(d==0);}
int main(){
 begin();clockMs+=3200;zjMotorWatch(nullptr);assert(!zjMotorWatchTripped);
 assert(zjMotor.startCalibration(clockMs,true));zjMotorApply();
 clockMs+=2800;zjMotorWatch(nullptr);assert(!zjMotorWatchTripped&&duties[0]>0);
 assert(zjMotor.calibrationLow(clockMs));zjMotorApply();
 clockMs+=3000;zjMotorWatch(nullptr);off(ZjMotorSafety::CAL_FINISHED);
 begin();assert(zjMotor.startCalibration(clockMs,true));zjMotorApply();
 clockMs+=15000;zjMotorWatch(nullptr);off(ZjMotorSafety::CAL_TIMEOUT);
 // Inject an already-owned mock lease to exercise independent flight OFF
 // without changing the compiled hardware qualification policy.
 zjFlightDriver.lease=1;zjFlightDriverAtUs=micros();zjMotorDriverOwner=ZjOutputOwner::FLIGHT;
 for(auto& duty:duties)duty=1000;
 clockMs+=7;zjMotorWatch(nullptr);assert(zjFlightDriverRead().lease==1&&duties[0]==1000);
 clockMs+=1;zjMotorWatch(nullptr);auto flight=zjFlightDriverRead();
 assert(!flight.lease&&flight.offAck&&flight.fault==ZjFlightFault::DEADLINE_MISSED);
 for(auto duty:duties)assert(!duty);
 const uint16_t stale[]={1500,1500,1500,1500};
 assert(!zjFlightDriverSubmit(1,stale,micros()+4000).lease);
 for(auto duty:duties)assert(!duty);
 begin();assert(zjMotor.startSlider(clockMs,15,30000));assert(zjMotor.slide(clockMs,1800,1));zjMotorApply();
 clockMs+=3000;zjMotorWatch(nullptr);assert(!zjMotorWatchTripped&&duties[0]>0);
 clockMs+=27000;zjMotorWatch(nullptr);off(ZjMotorSafety::TEST_FINISHED);
 begin();clockMs+=10000;zjMotorWatch(nullptr);off(ZjMotorSafety::SESSION_EXPIRED);
 begin();assert(zjMotor.startInput(clockMs,ZjMotorInput::PPM,false));zjMotorApply();
 clockMs+=100;zjMotorWatch(nullptr);off(ZjMotorSafety::DEADLINE_MISSED);
 clockMs=0xfffff000U;begin();assert(zjMotor.startCalibration(clockMs,true));zjMotorApply();
 clockMs+=15000;zjMotorWatch(nullptr);off(ZjMotorSafety::CAL_TIMEOUT);
 std::cout<<"PASS bounded production motor watchdog";
}`;
 const dir=mkdtempSync(join(tmpdir(),'zj-bounded-'));
 try{const cpp=join(dir,'watch.cpp'),bin=join(dir,'watch');writeFileSync(cpp,code);execFileSync('g++',['-std=c++17',cpp,'-o',bin],{stdio:'pipe',timeout:60000});assert.match(execFileSync(bin,{encoding:'utf8'}),/PASS bounded production motor watchdog/);}finally{rmSync(dir,{recursive:true,force:true});}
});

test('modern motor client selects the explicit timed profile and measures delayed BEGIN replies',async()=>{
 let at=1000,beginArgs;const records=[];
 const kit={kitId:'ZFC-A2-012345ABCDEF',bootId:'boot',connected:true,transport:'sta'};
 const client=createMotorClient({getKit:()=>kit,now:()=>at,setTimer:()=>1,clearTimer:()=>{},record:(...r)=>records.push(r),request:async(k,a)=>{
  if(a.action==='BEGIN'){beginArgs=a;at+=3100;}
  return {kitId:kit.kitId,bootId:'boot',supported:true,timedBenchSupported:true,mode:a.action==='STOP'?'DISABLED':'READY',session:a.action==='BEGIN'?'private-token':undefined};
 }});
 const result=await client.begin();assert.equal(beginArgs.c,'PWM_50HZ_1000_2000_TIMED');
 assert.equal(result.roundTripMs,3100);assert.ok(records.some(([event,d])=>event==='motor_ack'&&d.motorAction==='BEGIN'&&d.roundTripMs===3100));
 await client.stop();
});
test('PPM receiver monitor reports real channels without claiming input control or hiding signal loss',()=>{
 const state={selectedInput:'PPM',inputValid:false,inputSource:'NONE',roundTripMs:20,ppm:{present:true,ageMs:20,captureHz:50,channels:[1600,1500,1800,1500,2000,1000,1500,1500]}};
 const sample=setupInputSample(state,1000,1020);assert.equal(sample.valid,true);assert.equal(sample.controlValid,false);assert.equal(sample.channels[2],1800);assert.equal(sample.captureHz,50);
 assert.equal(setupInputSample(state,1000,1151).valid,false);
 state.ppm.present=false;state.ppm.channels=null;assert.deepEqual(setupInputSample(state,1000,1020).channels,[]);
});
