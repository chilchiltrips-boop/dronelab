import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {a2MotorFixture} from './a2-motor-host-fixture.mjs';

test('actual A2 automatic ESC commands consume once, run independently, persist results and require operator confirmation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'a2-auto-esc-'));
 try{
  const code=a2MotorFixture(dir)+String.raw`
static bool has(const String& s,const char* text){return strstr(s.c_str(),text);}
static String cmd(const char* action,const String& a="-",const String& b="-",const String& c="-",bool auth=true,const char* caller="USB"){
 return zjMotorCommand(action,caller,"",a,b,c,auth);
}
static String prepare(){return cmd("WIZARD_AUTO_ESC_PREPARE","PROPS_REMOVED:WIRING_VERIFIED:POWER_CYCLE_UNDERSTOOD",String(zjWizardSaved.revision),zjBootId);}
static void off(){for(auto d:duty)assert(d==0);}
// A real power loss resets RAM and peripherals without sending a STOP command.
static void boot(bool cold=true){
 zjAutoEscSequence=ZjAutoEscSequence{};zjMotor.disable();
 zjMotorEnabled=zjMotorSessionActive=false;zjWizardSaved=ZjWizardConfig{};zjMotorConfig=ZjMotorConfig{};
 zjWizardEscConfirmed=false;zjWizardEscOwner="";for(auto& d:duty)d=0;
 zjBootId=zjBootId+"x";zjMotorSetup();off();zjAutoEscBoot(cold);
}
static void tick(uint32_t ms){clockMs+=ms;zjMotorWatch(nullptr);}
static String attempt(){char out[9];snprintf(out,sizeof(out),"%08lX",(unsigned long)zjAutoEscRecord.attempt);return out;}
static String page(const char* scope,const char* payload,const char* caller="USB"){
 return cmd("WIZARD_SAVE_PAGE",payload,String(zjWizardSaved.revision),zjBootId+":"+scope,true,caller);
}
static void complete(){tick(5000);assert(zjAutoEscSequence.phase==ZjAutoEscSequence::LOW_PHASE);for(auto d:duty)assert(d==ZJ_ESC_PROFILE.duty(1000));tick(5000);off();zjMotorLoop();}
int main(){
 zjKitId="ZFC-A2-012345ABCDEF";clockMs=100;zjMotorSetup();off();
 assert(has(cmd("WIZARD_AUTO_ESC_PREPARE","-","0",zjBootId,false),"authorization_required"));
 assert(has(cmd("WIZARD_AUTO_ESC_PREPARE","-","0",zjBootId),"confirm_props"));
 assert(has(cmd("WIZARD_AUTO_ESC_PREPARE","PROPS_REMOVED:WIRING_VERIFIED:POWER_CYCLE_UNDERSTOOD","0","otherboot"),"restarted"));
 auto initial=zjWizardSaved;initial.esc=true;for(auto& pulse:initial.motor.minimumUs)pulse=1087;
 assert(zjPersistWizard(initial));const auto revision=zjWizardSaved.revision;
 assert(!has(prepare(),"error"));off();assert(zjMotorSessionActive);
 assert(zjAutoEscRecord.state==ZjAutoEscRecord::PENDING&&!zjMotorCalibrationSaved);
 assert(zjWizardSaved.revision==revision+1);for(auto p:zjMotorConfig.minimumUs)assert(!p);
 const auto writes=zjKitPrefs.writes;assert(!has(prepare(),"error"));assert(zjKitPrefs.writes==writes);off();
 assert(has(cmd("BEGIN","PROPS_REMOVED","PINS_VERIFIED","PWM_50HZ_1000_2000_TIMED"),"automatic_esc_calibration_pending"));
 assert(has(page("WIRING","X:0123:0101:0:0:0:0"),"automatic_esc_calibration_pending"));
 // Software/watchdog resets must not turn a prepared request into HIGH.
 boot(false);off();assert(zjAutoEscRecord.state==ZjAutoEscRecord::INTERRUPTED);
 assert(zjAutoEscRecord.reason==ZjAutoEscRecord::COLD_POWER_ON_REQUIRED);
 assert(!has(prepare(),"error"));boot();
 assert(zjAutoEscRecord.state==ZjAutoEscRecord::RUNNING&&zjAutoEscSequence.active());
 ZjAutoEscRecord consumed;assert(consumed.decode(zjKitPrefs.getString("escAuto1","").c_str()));assert(consumed.state==ZjAutoEscRecord::RUNNING);
 for(auto d:duty)assert(d==ZJ_ESC_PROFILE.duty(2000));
 // No app status, KEEP, PPM or network polling advances these phases.
 tick(4999);assert(zjAutoEscSequence.phase==ZjAutoEscSequence::HIGH_PHASE);tick(1);
 assert(zjAutoEscSequence.phase==ZjAutoEscSequence::LOW_PHASE);for(auto d:duty)assert(d==ZJ_ESC_PROFILE.duty(1000));
 tick(5000);off();assert(zjAutoEscSequence.phase==ZjAutoEscSequence::DONE);
 zjMotorLoop();assert(zjAutoEscRecord.state==ZjAutoEscRecord::COMPLETE&&!zjMotorCalibrationSaved);
 assert(has(cmd("WIZARD_STATUS"),"\"toneDetectionSupported\":false"));
 assert(has(page("ESC","TONES_CONFIRMED"),"confirm_esc"));
 assert(has(cmd("WIZARD_ESC_CONFIRM","AUTO_TONES_CONFIRMED","WRONG:BATTERY_DISCONNECTED",zjBootId),"complete_auto"));
 assert(!has(cmd("WIZARD_ESC_CONFIRM","AUTO_TONES_CONFIRMED",attempt()+":BATTERY_DISCONNECTED",zjBootId),"error"));
 assert(has(page("ESC","TONES_CONFIRMED","other-authorized-session"),"confirm_esc"));
 cmd("STOP");off();assert(!zjWizardEscConfirmed&&zjAutoEscRecord.state==ZjAutoEscRecord::CANCELLED);
 assert(has(page("ESC","TONES_CONFIRMED"),"confirm_esc"));
 assert(!has(prepare(),"error"));boot();complete();
 assert(!has(cmd("WIZARD_ESC_CONFIRM","AUTO_TONES_CONFIRMED",attempt()+":BATTERY_DISCONNECTED",zjBootId),"error"));
 zjKitPrefs.failNextWrite=true;assert(has(page("ESC","TONES_CONFIRMED"),"wizard_save_failed"));assert(!zjMotorCalibrationSaved);off();
 assert(!has(page("ESC","TONES_CONFIRMED"),"error"));assert(zjMotorCalibrationSaved);off();
 boot();off();assert(zjMotorCalibrationSaved&&zjAutoEscRecord.state==ZjAutoEscRecord::COMPLETE);
 // An explicit reset invalidates the old sequence proof too.
 assert(!has(page("RESET_ESC","CONFIRM_RESET"),"error"));assert(!zjMotorCalibrationSaved);
 assert(zjAutoEscRecord.state==ZjAutoEscRecord::CANCELLED);
 assert(has(cmd("WIZARD_ESC_CONFIRM","AUTO_TONES_CONFIRMED",attempt()+":BATTERY_DISCONNECTED",zjBootId),"complete_auto"));
 // A reboot during HIGH consumes the request permanently, never replaying HIGH.
 assert(!has(prepare(),"error"));boot();tick(1000);boot();off();
 assert(zjAutoEscRecord.state==ZjAutoEscRecord::INTERRUPTED&&zjAutoEscRecord.reason==ZjAutoEscRecord::RESET_DURING_SEQUENCE);
 boot();off();assert(!zjAutoEscSequence.active());
 // Emergency STOP and late timer dispatch both fail closed.
 assert(!has(prepare(),"error"));boot();assert(!has(cmd("STOP"),"error"));off();
 assert(zjAutoEscRecord.state==ZjAutoEscRecord::INTERRUPTED);boot();off();
 assert(!has(prepare(),"error"));boot();tick(5101);off();zjMotorLoop();
 assert(zjAutoEscRecord.state==ZjAutoEscRecord::INTERRUPTED&&zjAutoEscRecord.reason==ZjAutoEscRecord::DEADLINE_MISSED);
 // Result-write failure retains an incomplete durable result, supports an
 // explicit OFF-only retry, and never creates a saved ESC confirmation.
 assert(!has(prepare(),"error"));boot();tick(5000);tick(5000);off();
 zjKitPrefs.failNextWrite=true;zjMotorLoop();assert(zjAutoEscStorageError&&!zjMotorCalibrationSaved);
 assert(has(cmd("WIZARD_STATUS"),"\"resultPersisted\":false"));
 assert(!has(cmd("WIZARD_AUTO_ESC_RETRY",String(zjAutoEscRecord.attempt),"-",zjBootId),"error"));
 off();assert(zjAutoEscRecord.state==ZjAutoEscRecord::COMPLETE&&!zjMotorCalibrationSaved);
 // Header STOP after OFF discards an unconfirmed result instead of staging it.
 cmd("STOP");assert(zjAutoEscRecord.state==ZjAutoEscRecord::CANCELLED);off();
 assert(has(cmd("WIZARD_AUTO_ESC_RETRY",String(zjAutoEscRecord.attempt),"-",zjBootId),"completed_auto_sequence_required"));
 assert(zjAutoEscRecord.state==ZjAutoEscRecord::CANCELLED&&!zjWizardEscConfirmed);
 // A failed cancellation write must still retire the in-RAM retry proof.
 assert(!has(prepare(),"error"));boot();tick(5000);tick(5000);
 zjKitPrefs.failNextWrite=true;zjMotorLoop();assert(zjAutoEscStorageError);
 zjKitPrefs.failNextWrite=true;
 assert(has(cmd("WIZARD_AUTO_ESC_CANCEL","CONFIRM_CANCEL","-",zjBootId),"cancel_save_failed"));off();
 assert(has(cmd("WIZARD_AUTO_ESC_RETRY",String(zjAutoEscRecord.attempt),"-",zjBootId),"completed_auto_sequence_required"));
 assert(!zjMotorCalibrationSaved&&!zjWizardEscConfirmed);
 assert(!has(cmd("WIZARD_AUTO_ESC_CANCEL","CONFIRM_CANCEL","-",zjBootId),"error"));
 assert(!has(prepare(),"error"));
 zjKitPrefs.failNextWrite=true;boot();off();assert(!zjAutoEscSequence.active()); // consume readback failed
 assert(!has(cmd("WIZARD_AUTO_ESC_CANCEL","CONFIRM_CANCEL","-",zjBootId),"error"));boot();off();
 // Failure during consume/start and result persistence never certifies success.
 assert(!has(prepare(),"error"));failDuty=true;boot();failDuty=false;off();zjMotorLoop();
 assert(zjAutoEscRecord.state==ZjAutoEscRecord::INTERRUPTED&&zjAutoEscRecord.reason==ZjAutoEscRecord::DRIVER_ERROR);
 assert(!has(prepare(),"error"));boot();tick(5000);tick(5000);zjKitPrefs.failNextWrite=true;zjMotorLoop();
 boot();off();assert(zjAutoEscRecord.state==ZjAutoEscRecord::INTERRUPTED&&!zjMotorCalibrationSaved);
 assert(has(cmd("WIZARD_ESC_CONFIRM","AUTO_TONES_CONFIRMED",attempt()+":BATTERY_DISCONNECTED",zjBootId),"complete_auto"));
 // A different saved mapping or kit cannot inherit a request.
 assert(!has(prepare(),"error"));auto changed=zjWizardSaved;changed.motor.plus=true;assert(zjPersistWizard(changed));boot();off();
 assert(zjAutoEscRecord.reason==ZjAutoEscRecord::SETUP_CHANGED);
 assert(!has(prepare(),"error"));zjKitId="ZFC-A2-OTHER00000000";boot();off();assert(zjAutoEscRecord.reason==ZjAutoEscRecord::SETUP_CHANGED);
 // Deadline arithmetic across millis wrap; no catch-up after a large stall.
 ZjAutoEscSequence sequence;sequence.begin(0xfffffff0);assert(!sequence.update(0xfffffff0U+4999U));
 assert(sequence.update(0xfffffff0U+5000U)&&sequence.phase==ZjAutoEscSequence::LOW_PHASE);
 assert(sequence.update(0xfffffff0U+10000U)&&sequence.phase==ZjAutoEscSequence::DONE);
 sequence.begin(0);sequence.update(10000);assert(sequence.phase==ZjAutoEscSequence::FAILED);
 // Malformed/corrupt requests are not eligible for boot actuation.
 assert(!consumed.decode("E1|00000001|1|0|kit|X:0123:0101:0:0:0:0|tail"));
 zjKitPrefs.putString("escAuto1","corrupt");boot();off();assert(!zjAutoEscRecordVerified&&!zjAutoEscSequence.active());
 std::cout<<"PASS A2 one-use automatic ESC calibration and verified persistence\n";
}
`;
  const file=join(dir,'auto.cpp'),bin=join(dir,'auto');writeFileSync(file,code);
  const compile=spawnSync('g++',['-std=c++17','-I'+resolve('FlightCore_Firmware'),'-I'+resolve('tools'),'-I'+resolve('tools/host-stubs'),'-I'+dir,file,'-lcrypto','-o',bin],{encoding:'utf8'});
  assert.equal(compile.status,0,compile.stderr);
  const result=spawnSync(bin,[],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/PASS A2 one-use/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('boot starts the consumed ESC request before Wi-Fi and sensor tasks; ordinary boots have no new actuation path',()=>{
 const ino=readFileSync('FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino','utf8'),setup=ino.slice(ino.indexOf('void setup(){'));
 assert.ok(setup.indexOf('zjMotorSetup();')<setup.indexOf('zjAutoEscBoot('));
 assert.ok(setup.indexOf('zjAutoEscBoot(')<setup.indexOf('zjNetworkSetup();'));
 assert.match(setup,/zjAutoEscBoot\(esp_reset_reason\(\)==ESP_RST_POWERON\)/);
});
