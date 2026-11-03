import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

test('actual A2 Wizard command handler stages and atomically verifies setup across simulated boots',()=>{
 const dir=mkdtempSync(join(tmpdir(),'a2-wizard-'));
 try{
  mkdirSync(join(dir,'driver'));mkdirSync(join(dir,'freertos'));
  for(const name of ['driver/ledc.h','esp_timer.h','freertos/FreeRTOS.h'])writeFileSync(join(dir,name),'');
  const integration=readFileSync('tools/motor-integration-host.cpp','utf8');
  const common=integration.slice(0,integration.indexOf('#define DISABLED'));
  const code=common+`
#define CONFIG_IDF_TARGET_ESP32C6 1
#include "FlightCoreAccelCalibration.h"
using portMUX_TYPE=int;using esp_timer_handle_t=void*;using ledc_channel_t=int;using ledc_timer_t=int;
#define portMUX_INITIALIZER_UNLOCKED 0
static void portENTER_CRITICAL(int*){}static void portEXIT_CRITICAL(int*){}
constexpr int D0=0,D1=1,D2=2,D3=3,LEDC_LOW_SPEED_MODE=0,ESP_OK=0,LEDC_TIMER_3=3,LEDC_TIMER_14_BIT=14,LEDC_AUTO_CLK=0;
struct ledc_timer_config_t {int speed_mode,duty_resolution,timer_num,freq_hz,clk_cfg;};
struct ledc_channel_config_t {int gpio_num,speed_mode,channel,timer_sel,duty;};
struct esp_timer_create_args_t {void (*callback)(void*);const char* name;};
static uint32_t duty[4];
static int ledc_timer_config(ledc_timer_config_t*){return 0;}
static int ledc_channel_config(ledc_channel_config_t*){return 0;}
static int esp_timer_create(esp_timer_create_args_t*,void**){return 0;}
static int esp_timer_start_periodic(void*,int){return 0;}
static int ledc_stop(int,int n,int){duty[n]=0;return 0;}
static int ledc_set_duty(int,int n,uint32_t d){duty[n]=d;return 0;}
static int ledc_update_duty(int,int){return 0;}
enum class ZjImuAction {NONE,GYRO,CANCEL_GYRO,LEVEL,FACE,CLEAR_ACCEL};
static ZjAccelModel applied;
static ZjImuAction queued=ZjImuAction::NONE;
static struct {bool gyroConfigured=true;ZjAccelCapture accelCapture;} imu;
static auto zjReadImu(uint32_t){return imu;}
static String zjImuStatus(){return "{}";}
static void zjSetAccelModel(const ZjAccelModel& m){applied=m;}
static bool zjImuMaintenanceBusy(){return false;}
static bool zjQueueImuAction(ZjImuAction a,uint8_t){queued=a;return true;}
#include "FlightCoreMotor.h"
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
 zjKitPrefs.putString("wizardSetup1","corrupt");reboot();assert(!zjMotorConfigValid&&!applied.six);
}
`;
  const cpp=join(dir,'wizard.cpp'),bin=join(dir,'wizard');writeFileSync(cpp,code);
  const build=spawnSync('g++',['-std=c++17','-I'+dir,'-I'+resolve('tools'),'-I'+resolve('tools/host-stubs'),'-I'+resolve('FlightCore_Firmware'),cpp,'-lcrypto','-o',bin],{encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);
  const run=spawnSync(bin,[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
