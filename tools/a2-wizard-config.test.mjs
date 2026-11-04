import {a2MotorFixture} from './a2-motor-host-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

test('actual A2 Wizard verifies full and per-page setup saves across simulated boots',()=>{
 const dir=mkdtempSync(join(tmpdir(),'a2-wizard-'));
 try{
  const code=a2MotorFixture(dir)+`
static bool has(const String& s,const char* needle){return strstr(s.c_str(),needle)!=nullptr;}
static String token;
static String cmd(const char* action,const char* a="-",const char* b="-",const char* c="-",const char* owner="USB",bool auth=true){
 return zjMotorCommand(action,owner,token,a,b,c,auth);
}
static void begin(const char* config){
 token="";assert(!has(cmd("WIZARD_BEGIN","PROPS_REMOVED","PINS_VERIFIED",config),"error"));
 token=zjMotorToken;assert(token.length()>0);
 for(auto d:duty)assert(!d);
}
static String page(const char* scope,const char* payload,const char* owner="USB"){
 return zjMotorCommand("WIZARD_SAVE_PAGE",owner,"",payload,String(zjWizardSaved.revision),zjBootId+":"+scope,true);
}
static void beginCurrent(){
 auto wiring=zjMotorConfig;memset(wiring.minimumUs,0,sizeof(wiring.minimumUs));
 char encoded[64];wiring.encode(encoded,sizeof(encoded));
 const String binding=zjBootId+"|"+String(zjWizardSaved.revision)+"|"+encoded;
 begin(binding.c_str());
}
static void reboot(){
 zjMotorStop();zjWizardSaved=ZjWizardConfig{};zjMotorConfig=ZjMotorConfig{};
 zjWizardEscOwner="";zjWizardEscConfirmed=false;token="";zjMotorSetup();
 for(auto d:duty)assert(!d);
}
int main(){
 const char* mapping="boot-1|0|P:2103:0101:0:0:0:0";
 const char* valid="P:2103:0101:1087:1101:1150:1500";
 zjKitId="ZFC-A2-012345ABCDEF";zjKitPrefs.begin("test",false);
 zjKitPrefs.putString("motorConfig2","X:0123:0101:1510:0:0:0");
 zjKitPrefs.putString("motorCal1",ZJ_ESC_CALIBRATION_RECORD);zjKitPrefs.putString("wifiOther","preserved");
 reboot();assert(zjMotorCalibrationSaved&&zjMotorConfig.minimumUs[0]==1510);
 assert(has(cmd("WIZARD_STATUS"),"configRevision"));
 assert(has(cmd("WIZARD_BEGIN","PROPS_REMOVED","PINS_VERIFIED",mapping,"USB",false),"unlock_usb"));
 assert(has(cmd("WIZARD_SAVE",valid,"1","boot-1:1:KEEP"),"configuration_changed"));
 begin(mapping);cmd("CAL_HIGH","POWER_DISCONNECTED");assert(zjMotor.pulses[0]==2000);
 assert(!zjMotorCalibrationSaved&&zjKitPrefs.getString("motorCal1","").isEmpty());
 clockMs+=1501;assert(has(cmd("KEEP"),"SESSION_EXPIRED"));assert(!zjMotorCalibrationPending);
 reboot();assert(!zjMotorCalibrationSaved&&zjWizardSaved.revision==0);
 begin(mapping);cmd("CAL_HIGH","POWER_DISCONNECTED");cmd("CAL_LOW");
 assert(zjMotor.pulses[0]==1000&&zjMotorEnabled);
 for(int i=0;i<8;i++){clockMs+=400;cmd("KEEP");}
 assert(zjMotorCalibrationPending&&!zjMotorEnabled&&zjMotor.reason==ZjMotorSafety::CAL_FINISHED);
 assert(has(cmd("WIZARD_SAVE",valid,"0","boot-1:1:KEEP"),"confirm_esc"));
 assert(has(cmd("WIZARD_ESC_CONFIRM","TONES_CONFIRMED","BATTERY_DISCONNECTED","boot-1","other"),"complete_low"));
 assert(!has(cmd("WIZARD_ESC_CONFIRM","TONES_CONFIRMED","BATTERY_DISCONNECTED","boot-1"),"error"));
 const unsigned writes=zjKitPrefs.writes;
 begin(mapping);cmd("CAL_SLIDER","1","1000","30000");
 assert(duty[2]>0&&!duty[0]&&!duty[1]&&!duty[3]);
 assert(has(cmd("SLIDE","1","1087","1"),"establish_calibration_low_first"));
 clockMs+=501;assert(has(cmd("SLIDE","1","1501","1"),"out_of_range"));
 assert(!has(cmd("SLIDE","1","1087","1"),"error"));
 assert(has(cmd("WIZARD_SAVE",valid,"0","boot-1:1:KEEP"),"stop_maintenance"));
 assert(has(cmd("STOP"),"stoppedPulseUs"));assert(!zjMotorEnabled&&zjKitPrefs.writes==writes);
 assert(has(cmd("SLIDE","1","1500","2"),"USER_STOP"));assert(!zjMotorEnabled);
 begin(mapping);cmd("CAL_SLIDER","15","1000","30000");clockMs+=510;cmd("SLIDE","15","1500","1");
 for(auto d:duty)assert(d==ZJ_ESC_PROFILE.duty(1500));
 clockMs+=751;assert(!has(cmd("STOP"),"stoppedPulseUs"));assert(zjKitPrefs.writes==writes);
 zjKitPrefs.failNextWrite=true;assert(has(cmd("WIZARD_SAVE",valid,"0","boot-1:1:KEEP"),"wizard_save_failed"));
 assert(zjWizardSaved.revision==0&&zjMotorConfig.minimumUs[0]==1510&&!zjMotorEnabled);
 const unsigned afterFailure=zjKitPrefs.writes;
 assert(has(cmd("WIZARD_SAVE",valid,"0","boot-1:1:KEEP","USB",false),"authorization_required"));
 assert(!has(cmd("WIZARD_SAVE",valid,"0","boot-1:1:KEEP"),"error"));
 assert(zjKitPrefs.writes==afterFailure+1);reboot();assert(zjWizardSaved.revision==1&&zjMotorCalibrationSaved&&zjMotorConfig.minimumUs[0]==1087&&zjMotorConfig.pins[0]==2);
 begin("boot-1|1|P:2103:0101:0:0:0:0");cmd("CAL_HIGH","POWER_DISCONNECTED");cmd("STOP");reboot();
 assert(zjWizardSaved.revision==1&&!zjMotorCalibrationSaved&&zjMotorConfig.minimumUs[0]==1087);
 assert(!has(cmd("WIZARD_SAVE","X:0123:0101:0:0:0:0","1","boot-1:0R:RESET"),"error"));
 reboot();assert(zjWizardSaved.revision==2&&!zjMotorCalibrationSaved&&!zjMotorConfig.plus&&!zjMotorConfig.minimumUs[0]&&!applied.six);
 assert(zjKitPrefs.getString("wifiOther","")=="preserved");
 assert(!has(cmd("WIZARD_IMU","GYRO","4","boot-1"),"error")&&queued==ZjImuAction::GYRO);
 assert(has(cmd("WIZARD_IMU","FACE","4","previous-boot"),"wizard_board_restarted"));
 // A page save migrates and preserves every other saved section.
 assert(has(cmd("WIZARD_SAVE_PAGE","P:2103:0101:0:0:0:0","2","boot-1:WIRING","USB",false),"authorization_required"));
 assert(!has(page("WIRING","P:2103:0101:0:0:0:0"),"error"));
 assert(zjMotorConfig.plus&&zjMotorConfig.pins[0]==2&&!zjMotorCalibrationSaved&&!zjMotorConfig.minimumUs[0]);
 assert(has(cmd("WIZARD_SAVE_PAGE","P:2103:0101:0:0:0:0","2","boot-1:WIRING"),"configuration_changed"));
 assert(has(page("WIRING","P:2103:0101:1087:0:0:0"),"exclude_minimum"));
 imu.accelCapture.ready=true;imu.accelCapture.result.level=true;imu.accelCapture.result.trim[0]=42;zjWizardImuOwner="USB";
 assert(has(page("ACCEL","CAPTURED:0:1:0:0:0:1000:1000:1000:43:0:0"),"capture_changed"));
 assert(!has(page("ACCEL","CAPTURED:0:1:0:0:0:1000:1000:1000:42:0:0"),"error"));
 assert(applied.trim[0]==42&&zjMotorConfig.plus&&!zjMotorCalibrationSaved&&!zjMotorConfig.minimumUs[0]);
 // Additional manual delta is independent of the captured level/6-position fit.
 assert(has(page("ACCEL_MANUAL","MANUAL:251:0:0"),"invalid_accel_manual_offset"));
 assert(has(page("ACCEL_MANUAL","MANUAL:30:-10:80:9"),"invalid_accel_manual_offset"));
 assert(has(page("ACCEL_MANUAL","MANUAL:30:1:080"),"invalid_accel_manual_offset"));
 zjKitPrefs.failNextWrite=true;
 assert(has(page("ACCEL_MANUAL","MANUAL:30:-10:80"),"wizard_save_failed"));
 assert(applied.manualOffset[0]==0&&applied.trim[0]==42);
 assert(!has(page("ACCEL_MANUAL","MANUAL:30:-10:80"),"error"));
 assert(applied.manualOffset[0]==30&&applied.manualOffset[1]==-10&&applied.manualOffset[2]==80);
 assert(fabs(applied.correct(0.1f,0)-0.07f)<1e-4f);
 assert(!has(page("ACCEL_MANUAL","MANUAL:30:-10:80"),"error"));
 assert(strstr(zjKitPrefs.getString("wizardSetup1","").c_str(),":M:30:-10:80")!=nullptr);
 reboot();assert(applied.trim[0]==42&&applied.manualOffset[0]==30&&applied.manualOffset[1]==-10&&applied.manualOffset[2]==80);
 assert(has(page("ACCEL_MANUAL","MANUAL:30:-10:80:9"),"invalid_accel_manual_offset"));
 assert(!has(page("ACCEL_MANUAL","MANUAL:0:0:0"),"error"));
 assert(applied.manualOffset[0]==0&&applied.trim[0]==42);
 assert(strstr(zjKitPrefs.getString("wizardSetup1","").c_str(),":M:")==nullptr); // legacy record remains canonical
 assert(has(page("ESC","TONES_CONFIRMED"),"confirm_esc"));
 beginCurrent();cmd("CAL_HIGH","POWER_DISCONNECTED");cmd("STOP");
 assert(has(page("ESC","TONES_CONFIRMED"),"confirm_esc"));
 beginCurrent();cmd("CAL_HIGH","POWER_DISCONNECTED");cmd("CAL_LOW");
 for(int i=0;i<8;i++){clockMs+=400;cmd("KEEP");}
 cmd("WIZARD_ESC_CONFIRM","TONES_CONFIRMED","BATTERY_DISCONNECTED","boot-1");
 zjKitPrefs.failNextWrite=true;assert(has(page("ESC","TONES_CONFIRMED"),"save_failed"));
 assert(!zjMotorCalibrationSaved&&zjWizardEscConfirmed&&!zjMotorEnabled);
 assert(!has(page("ESC","TONES_CONFIRMED"),"error"));
 assert(zjMotorCalibrationSaved&&applied.trim[0]==42&&!zjMotorConfig.minimumUs[1]);
 assert(has(page("M1","1087"),"confirmed_output_capture_required"));
 beginCurrent();cmd("CAL_SLIDER","1","1000","30000");clockMs+=501;cmd("SLIDE","1","1087","1");
 assert(has(cmd("STOP","CAPTURE_OUTPUT"),"stoppedPulseUs"));
 assert(has(page("M2","1087"),"confirmed_output_capture_required"));
 assert(has(page("M1","1501"),"pulse_out_of_range"));
 zjKitPrefs.failNextWrite=true;assert(has(page("M1","1087"),"save_failed"));
 assert(!zjMotorConfig.minimumUs[0]&&!zjMotorEnabled);
 assert(!has(page("M1","1087"),"error"));
 assert(zjMotorConfig.minimumUs[0]==1087&&!zjMotorConfig.minimumUs[1]&&zjMotorCalibrationSaved&&applied.trim[0]==42);
 reboot();assert(zjMotorConfig.minimumUs[0]==1087&&applied.trim[0]==42&&zjMotorCalibrationSaved);
 assert(has(page("M2","1100"),"confirmed_output_capture_required"));
 beginCurrent();cmd("CAL_SLIDER","15","1000","30000");clockMs+=501;cmd("SLIDE","15","1200","1");cmd("STOP");
 assert(has(page("ALL","1200"),"confirmed_output_capture_required"));
 beginCurrent();cmd("CAL_SLIDER","15","1000","30000");clockMs+=501;cmd("SLIDE","15","1200","1");cmd("STOP","CAPTURE_OUTPUT");
 zjKitPrefs.failNextWrite=true;assert(has(page("ALL","1200"),"save_failed"));
 assert(zjMotorConfig.minimumUs[0]==1087&&!zjMotorConfig.minimumUs[1]&&!zjMotorConfig.minimumUs[2]&&!zjMotorConfig.minimumUs[3]);
 assert(!has(page("ALL","1200"),"error"));reboot();
 for(auto pulse:zjMotorConfig.minimumUs)assert(pulse==1200);
 beginCurrent();cmd("CAL_SLIDER","15","1000","30000");clockMs+=501;cmd("SLIDE","15","1300","1");cmd("STOP");
 assert(has(page("ALL","1300"),"confirmed_output_capture_required"));
 assert(!has(page("RESET_ACCEL","CONFIRM_RESET"),"error"));assert(!applied.level&&zjMotorCalibrationSaved&&zjMotorConfig.minimumUs[0]==1200);
 assert(!has(page("RESET_ESC","CONFIRM_RESET"),"error"));assert(!zjMotorCalibrationSaved&&zjMotorConfig.minimumUs[0]==0);
 assert(!has(page("RESET_OUTPUT","CONFIRM_RESET"),"error"));assert(!zjMotorConfig.minimumUs[0]&&zjMotorConfig.plus);
 assert(has(page("RESET_ALL","-"),"confirm_wizard_reset"));
 assert(has(page("UNKNOWN","-"),"unsupported_wizard_save_scope"));
 assert(!has(page("RESET_ALL","CONFIRM_RESET"),"error"));reboot();
 const unsigned defaultsWrites=zjKitPrefs.writes;
 assert(!has(page("RESET_ALL","CONFIRM_RESET"),"error")&&zjKitPrefs.writes==defaultsWrites);
 assert(!zjMotorConfig.plus&&!zjMotorCalibrationSaved&&!applied.level&&!zjMotorConfig.minimumUs[0]&&!zjMotorEnabled);
 assert(zjKitPrefs.getString("wifiOther","")=="preserved");
 zjKitPrefs.putString("wizardSetup1","corrupt");reboot();assert(!zjMotorConfigValid&&!applied.six);
 assert(has(page("RESET_ESC","CONFIRM_RESET"),"reset_all_setup_required"));
 zjKitPrefs.failNextWrite=true;assert(has(page("RESET_ALL","CONFIRM_RESET"),"wizard_save_failed"));
 assert(zjWizardRecordVerified&&!zjMotorConfigValid);
 assert(!has(page("RESET_ALL","CONFIRM_RESET"),"error"));reboot();assert(zjMotorConfigValid);
}
`;
  const cpp=join(dir,'wizard.cpp'),bin=join(dir,'wizard');writeFileSync(cpp,code);
  const build=spawnSync('g++',['-std=c++17','-I'+dir,'-I'+resolve('tools'),'-I'+resolve('tools/host-stubs'),'-I'+resolve('FlightCore_Firmware'),cpp,'-lcrypto','-o',bin],{encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  const run=spawnSync(bin,[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
