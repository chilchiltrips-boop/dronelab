import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
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
