import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {a2MotorFixture} from './a2-motor-host-fixture.mjs';
import '../js/kit-access-policy.js';
import {experimentalRateRelease} from '../js/firmware-image.js';

const runtime=readFileSync('FlightCore_Firmware/FlightCoreControlRuntime.h','utf8');
const section=(from,to)=>runtime.slice(runtime.indexOf(from),runtime.indexOf(to));
test('real A2 control worker drives Rate PWM only after setup and one fresh ARM; faults stop it',()=>{
 const dir=mkdtempSync(join(tmpdir(),'a2-rate-worker-'));
 try{
  const code='#define ZJ_A2_EXPERIMENTAL_RATE_FLIGHT 1\n'+a2MotorFixture(dir,{ppm:true})+String.raw`
#include "FlightCoreTiming.h"
#include "FlightCoreRateTrace.h"
#include "FlightCoreAttitude.h"
#include <functional>
constexpr uint32_t portMAX_DELAY=0xffffffff;
constexpr bool pdTRUE=true;
static ZjControlScheduler zjControl;
static int zjTimingMux=0;
static ZjRateGains zjShadowGains[ZJ_PID_GAIN_COUNT/3];
static uint32_t zjShadowRevision=1,zjShadowGeneration=1,zjFlightRevokeEpoch=1,zjFlightLease=0,zjFlightArmAt=0,zjShadowInputArmEpoch=1;
static uint32_t zjImuModelGeneration=0;
static uint8_t zjShadowProfile=0;
static bool zjShadowAngle=false,zjShadowPlus=false,zjShadowPreview=false,zjShadowRequested=true;
static ZjFlightConditions zjFlightPolicy;
static bool zjControlRuntimeReady=true;
static uint32_t zjControlTimerStartedUs=0;
static ZjFlightConditions zjFlightMainConditions(){return zjFlightPolicy;}
static ZjFlightOutputGate zjFlightOutputGate;
static ZjRateTrace zjFlightTrace;
static ZjFlightFault zjTracePendingFault=ZjFlightFault::NONE;
static uint32_t zjTraceFaultAt=0;
static FlightReceiverSnapshot zjTraceFaultInput;
static struct {ZjSampleStamp sample;bool gyroReady=true;uint32_t gyroMaxReadUs=100,maintenanceSequence=0;
 float RateRoll=0,RatePitch=0,RateYaw=0,accelG[3]={0,0,1};ZjAccelModel accelModel;} zjImuMailbox;
struct End {};
static unsigned ticks=0,limit=10;
static bool angleMode=false,mainPaused=false,ppmReceiving=true;
static std::function<void(unsigned)> inject;
static void ulTaskNotifyTake(bool,uint32_t){
 if(ticks==limit)throw End{};
 if(ticks==0)clockMs+=1; // worker creation precedes timer activation
 clockMs+=4;++ticks;
 if(!mainPaused){zjFlightPolicy.input.receivedAtMs=clockMs;++zjFlightPolicy.input.sequence;}
 zjImuMailbox.sample.accept(micros());
 inject(ticks);
 if(ppmReceiving&&(!mainPaused||ticks%5==0)){
  uint16_t raw[8];
  std::copy_n(zjFlightPolicy.input.channels,8,raw);
  if(mainPaused)raw[2]=1628;
  zjPpmPublishRmtFrame(raw,clockMs);
  if(!mainPaused)zjPpmFrameSeq=zjPpmIsrFrames;
 }
}
`+section('struct ZjRateShadowResult','\n#if defined(CONFIG_IDF_TARGET_ESP32C6)')+
section('static ZjFlightFault zjControlReleaseReason','static ZjRateTraceEvent zjTraceTerminalEvent')+
section('static ZjRateTraceEvent zjTraceTerminalEvent','static ZjRateShadowResult zjReadRateShadow')+String.raw`
static bool has(const String& s,const char* text){return strstr(s.c_str(),text);}
static void off(){for(auto d:duty)assert(d==0);assert(zjMotorOutputsDisabled());}
static ZjFlightConditions conditions(){
 ZjFlightConditions c;c.nowMs=clockMs;c.inputDeadlineMs=150;
 c.acro=!angleMode;c.angle=angleMode;c.attitudeReady=c.levelCalibrated=true;
 c.imuFresh=c.timingHealthy=c.outputOffAck=true;
 c.driverReady=c.wiringVerified=true;c.setupComplete=zjWizardSetupComplete();c.pidSaved=true;
 c.escSequenceComplete=zjAutoEscStoredResult();
 c.input.source=ZjReceiverSource::PPM;c.input.valid=c.input.selected=true;c.input.availableMask=255;
 c.input.generation=1;c.input.sequence=1;c.input.receivedAtMs=clockMs;
 return c;
}
int main(int argc,char** argv){
 const std::string scenario=argc>1?argv[1]:"normal";
 const bool isolated=scenario=="isolated-ppm",jitter=scenario=="jitter";
 if(isolated)limit=110;
 angleMode=argc>2;zjShadowAngle=angleMode;zjImuMailbox.accelModel.level=true;
 static_assert(ZJ_FLIGHT_OUTPUT_ENABLED&&!ZJ_FLIGHT_HARDWARE_QUALIFIED);
 zjKitId="ZFC-A2-012345ABCDEF";clockMs=100;zjMotorSetup();off();
 auto c=conditions();c.input.inputArmed=true;
 assert(!zjFlightOutputGate.arm(c,true,true)&&zjFlightOutputGate.reason==ZjFlightFault::SETUP_INCOMPLETE);
 // Same existing persisted Wizard fields; no new qualification checkbox.
 auto config=zjWizardSaved;for(auto& p:config.motor.minimumUs)p=1123;
 assert(zjPersistWizard(config));
 ZjAutoEscRecord esc;esc.state=ZjAutoEscRecord::COMPLETE;esc.attempt=1;
 snprintf(esc.kit,sizeof(esc.kit),"%s",zjKitId.c_str());zjAutoEscWiring(esc.wiring,sizeof(esc.wiring));
 assert(zjAutoEscStore(esc));assert(zjWizardSetupComplete()&&!zjMotorCalibrationSaved);
 zjWizardSaved={};zjMotorSetup();assert(zjWizardSetupComplete());off();
 c=conditions();c.input.inputArmed=true;c.pidSaved=false;
 assert(!zjFlightOutputGate.arm(c,true,true)&&zjFlightOutputGate.reason==ZjFlightFault::PID_NOT_SAVED);
 c.pidSaved=true;
 ZjFlightArmEdge edge;
 assert(!edge.accept(c.input,clockMs,150)); // reboot while already ARMED
 c.input.inputArmed=false;++c.input.sequence;assert(!edge.accept(c.input,clockMs,150));
 c.input.inputArmed=true;++c.input.sequence;assert(edge.accept(c.input,clockMs,150));
 assert(!edge.accept(c.input,clockMs,150));
 assert(zjFlightOutputGate.arm(c,ZJ_FLIGHT_OUTPUT_ENABLED,true));
 zjFlightOutputGate={};zjFlightPolicy=c;zjShadowRequested=false;
 zjPpmSetup();zjPpmArm.armed=true;
 for(unsigned i=0;i<ZJ_PID_GAIN_COUNT/3;i++)zjShadowGains[i]=zjPidActive.axis(i);
 zjFlightRevokeHandler=zjControlRevoke;
 zjControlTimerStartedUs=micros()+1000;
 inject=[&](unsigned n){
  if(n==2)assert(zjControl.jitterUs==0);
  if(n<=2)return; // warm scheduler before ARM, as the real firmware requires
  if(scenario=="claim-failure"){
   if(n==3){
    zjMotorWatchActive=true;
    assert(zjControlArmFlight()==ZjFlightFault::OFF_UNVERIFIED);
    zjMotorWatchActive=false;
    assert(zjFlightOutputGate.state==ZjFlightState::OUTPUT_OFF&&!zjPpmFlight.lease);
   }
   return;
  }
  if(n==3){assert(zjControlArmFlight()==ZjFlightFault::NONE);}
  n-=2;
  // Tick 1 is LOW; tick 2 computes real PID/mixer; 4 resets; 5 checks reset.
  if(n==2){for(auto d:duty)assert(d==ZJ_ESC_PROFILE.duty(1000));zjFlightPolicy.input.channels[2]=1400;zjFlightPolicy.input.channels[0]=1600;}
  if(n==3){
   assert(zjRateShadow.outputAuthorized&&zjRateShadow.actuating);
   assert(std::fabs(zjFlightTrace.last.axes[0].target-(angleMode?30:15))<.001f&&zjFlightTrace.last.axes[0].correction>0);
   assert(duty[0]<duty[1]&&duty[3]<duty[2]);
   assert(zjWizardSetupComplete()); // PWM ON must not erase setup readiness
   zjMotorLoop();assert(zjFlightDriverRead().lease==zjFlightLease&&zjFlightLease!=0); // bench loop cannot steal owner
   assert(!zjSaveFlightMode(zjKitPrefs,"angle")); // no NVS writes during flight
   if(scenario=="stop")zjControlRevoke("EMERGENCY_STOP");
   if(scenario=="disarm"){zjFlightPolicy.input.inputArmed=false;zjShadowRequested=false;}
   if(scenario=="loss")zjFlightPolicy.input.valid=false;
   if(scenario=="imu")zjImuMailbox.gyroReady=false;
   if(scenario=="timing"){clockMs+=120;zjImuMailbox.sample.accept(micros());zjFlightPolicy.input.receivedAtMs=clockMs;}
   if(scenario=="source")++zjFlightPolicy.input.generation;
   if(scenario=="pid")zjShadowGains[0].p=NAN;
   if(scenario=="watchdog"){clockMs+=9;zjMotorWatch(nullptr);off();}
   if(scenario=="driver")failDuty=true;
   if(isolated)mainPaused=true;
   if(jitter||scenario=="late-write"){clockMs+=3;zjImuMailbox.sample.accept(micros());}
   if(scenario=="late-write")motorWriteDelayMs=1;
  }
  if(isolated){
   if(n==43){
    assert(clockMs-zjFlightPolicy.input.receivedAtMs>150&&zjFlightLease&&zjRateShadow.actuating);
    assert(zjFlightTrace.last.channels[2]==1628&&zjFlightTrace.last.inputAgeMs<25);
   }
   if(n==63)ppmReceiving=false;
   if(n==104){
    off();assert(!zjFlightLease);
    assert(zjFlightTrace.terminal.reason==ZjFlightFault::PPM_SIGNAL_LOST);
    assert(zjFlightTrace.terminal.inputAgeMs>150&&(zjFlightTrace.terminal.flags&ZJ_TRACE_OFF_ACK));
   }
   return;
  }
  if(jitter){
   if(n==4)motorWriteDelayMs=1;
   if(n==5){
    assert(zjControl.deadlineMisses&&zjFlightLease&&!zjRateShadow.deadlineFault);
    motorWriteDelayMs=0;
   }
   if(n==6)assert(zjControl.missedTicks&&zjFlightLease);
   return;
  }
  if(n==4&&scenario!="normal"){off();assert(!zjFlightLease);}
  if(n==4){zjFlightPolicy.input.channels[2]=1000;zjFlightPolicy.input.channels[0]=1500;}
  if(n==5){
   if(scenario=="normal"){assert(!zjFlightTrace.last.axes[0].i);for(auto p:zjRateShadow.mix.pulse)assert(p==1000);}
   zjFlightPolicy.input.channels[2]=1400;
  }
  if(n==6&&scenario=="normal"){for(auto d:duty)assert(d==ZJ_ESC_PROFILE.duty(1400));}
 };
 try{zjControlTask(nullptr);}catch(const End&){}
 if(scenario!="normal"&&!jitter){
  off();assert(!zjFlightLease&&!zjFlightOutputGate.permit(c,true));
  ++c.input.sequence;assert(!edge.accept(c.input,clockMs,150)); // held ARM never retries
  if(isolated){
   zjControlRevoke("INPUT_DISARMED");
   assert(zjFlightOutputGate.reportedReason()==ZjFlightFault::PPM_SIGNAL_LOST);
  }
  if(scenario=="late-write")assert(zjFlightOutputGate.reportedReason()==ZjFlightFault::DEADLINE_MISSED);
  if(scenario=="source")assert(zjFlightOutputGate.reportedReason()==ZjFlightFault::SOURCE_CHANGED);
 }else{
  assert(zjFlightDriverRead().lease==zjFlightLease&&zjFlightLease!=0);
  failStop=true;
  auto result=zjMotorCommand("STOP","USB","","-","-","-",true);
  assert(has(result,"output_off_unverified")&&!zjMotorOutputsDisabled());
  assert(has(zjMotorFlags(),"\"motorsDisabled\":false"));
  failStop=false;zjMotorStop();off();
 }
 std::cout<<"PASS production worker "<<scenario<<"\n";
}
`;
  const file=join(dir,'worker.cpp'),bin=join(dir,'worker');writeFileSync(file,code);
  execFileSync('g++',['-std=c++17','-I'+dir,'-I'+resolve('tools'),'-I'+resolve('tools/host-stubs'),'-I'+resolve('FlightCore_Firmware'),file,'-lcrypto','-o',bin],{timeout:60000});
  for(const scenario of ['normal','stop','disarm','loss','imu','timing','source','pid','watchdog','driver','isolated-ppm','jitter','late-write','claim-failure']){
   for(const mode of [[],['angle']])assert.match(execFileSync(bin,[scenario,...mode],{encoding:'utf8',timeout:10000}),/PASS production worker/);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('WebApp and Android output labels follow fresh firmware state, never input ARM',()=>{
 const policy=globalThis.ZebjusKitAccessPolicy;
 const kit={connected:true,heartbeatAt:1000,outputObservedAt:1000,motorsDisabled:true,motorsArmed:false,rc:{inputArmed:true}};
 assert.equal(policy.outputLabel(kit,1001),'OUTPUT DISABLED');
 kit.motorsDisabled=false;
 assert.equal(policy.outputLabel(kit,1001),'OUTPUT ENABLED');
 kit.flight={version:1,enabled:true,authorized:true,canArm:false,state:'ARMED',inputScope:'PPM_RATE'};
 kit.motorsArmed=true;
 assert.equal(policy.outputLabel(kit,1001),'RATE FLIGHT ARMED');
 assert.equal(policy.outputLabel(kit,2501),'OUTPUT UNKNOWN');
 kit.heartbeatAt=2501;
 assert.equal(policy.outputLabel(kit,2501),'OUTPUT UNKNOWN','input ACKs must not refresh old output observations');
 kit.flight.enabled=false;
 assert.equal(policy.flightState(kit.flight),null);
 kit.flight={version:1,enabled:true,authorized:false,canArm:false,state:'FAILSAFE'};
 kit.motorsDisabled=true;kit.motorsArmed=false;
 assert.equal(policy.outputLabel(kit,1001),'FAILSAFE • OUTPUT OFF');
 kit.connected=false;
 assert.equal(policy.outputLabel(kit,1001),'OUTPUT UNKNOWN');
});

test('experimental build requires explicit A2 target and isolated output directory',()=>{
 for(const args of [[],['--board','ZFC-A1','--output-dir','/tmp/test-rate'],['--board','ZFC-A2','--output-dir','FlightCore_Firmware']]){
  assert.throws(()=>execFileSync('python3',['tools/build_scanner.py','--experimental-rate-flight',...args],{stdio:'pipe'}),/Command failed/);
 }
});

test('experimental import requires a separately pinned unqualified A2 package',()=>{
 const candidate={schema:2,product:'ZEBJUS_FLIGHTCORE',version:'1.7.20',sourceCommit:'a'.repeat(40),
  releaseScope:'EXPERIMENTAL_PPM_RATE',flightOutputEnabled:true,flightOutputQualified:false,physicalAcceptance:'NOT_RUN',
  boards:[{id:'ZFC-A2',latest:{version:'1.7.20'}}]};
 for(const kind of ['app','factory'])candidate.boards[0].latest[kind]={available:true,sha256:'b'.repeat(64),size:kind==='app'?1300000:4194304,
  file:`ZEBJUS_FLIGHTCORE_A2_${kind.toUpperCase()}_RATE_EXPERIMENTAL.bin`,builtAt:'2026-11-07T00:00:00Z',compiledAt:'2026-11-07T00:00:00Z'};
 assert.equal(experimentalRateRelease(candidate,'ZFC-A2'),candidate.boards[0].latest);
 assert.throws(()=>experimentalRateRelease(candidate,'ZFC-A1'));
 for(const change of [c=>c.flightOutputQualified=true,c=>c.physicalAcceptance='PASS',c=>c.sourceCommit='short',
  c=>c.boards.push(c.boards[0]),c=>c.boards[0].latest.app.sha256='',c=>c.boards[0].latest.app.file='published.bin',
  c=>c.boards[0].latest.version='1.7.19',c=>c.boards[0].latest.app.available=false]){
  const invalid=structuredClone(candidate);change(invalid);assert.throws(()=>experimentalRateRelease(invalid,'ZFC-A2'));
 }
});
