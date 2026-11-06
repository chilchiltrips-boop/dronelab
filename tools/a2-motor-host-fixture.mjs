import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
// Hardware doubles shared by the actual C6 command-header integration tests.
export function a2MotorFixture(dir){
 mkdirSync(join(dir,'driver'));mkdirSync(join(dir,'freertos'));
 for(const name of ['driver/ledc.h','esp_timer.h','freertos/FreeRTOS.h'])writeFileSync(join(dir,name),'');
 const integration=readFileSync('tools/motor-integration-host.cpp','utf8');
 const common=integration.slice(0,integration.indexOf('#define DISABLED'));
 return '#define CONFIG_IDF_TARGET_ESP32C6 1\n'+common+String.raw`
#define HIGH 1
#define LOW 0
#include "FlightCoreAccelCalibration.h"
using portMUX_TYPE=int;using esp_timer_handle_t=void*;using ledc_channel_t=int;using ledc_timer_t=int;
#define portMUX_INITIALIZER_UNLOCKED 0
static void portENTER_CRITICAL(int*){}static void portEXIT_CRITICAL(int*){}
constexpr int D0=0,D1=1,D2=2,D3=3,LEDC_LOW_SPEED_MODE=0,ESP_OK=0,LEDC_TIMER_3=3,LEDC_TIMER_14_BIT=14,LEDC_AUTO_CLK=0;
struct ledc_timer_config_t {int speed_mode,duty_resolution,timer_num,freq_hz,clk_cfg;};
struct ledc_channel_config_t {int gpio_num,speed_mode,channel,timer_sel,duty;};
struct esp_timer_create_args_t {void (*callback)(void*);const char* name;};
static uint32_t duty[4];static bool failDuty=false,failStop=false;
static int ledc_timer_config(ledc_timer_config_t*){return 0;}
static int ledc_channel_config(ledc_channel_config_t*){return 0;}
static int esp_timer_create(esp_timer_create_args_t*,void**){return 0;}
static int esp_timer_start_periodic(void*,int){return 0;}
static int ledc_stop(int,int n,int){if(failStop)return 1;duty[n]=0;return 0;}
static int ledc_set_duty(int,int n,uint32_t d){if(failDuty)return 1;duty[n]=d;return 0;}
static int ledc_update_duty(int,int){return 0;}
static uint32_t ledc_get_duty(int,int n){return duty[n];}
enum class ZjImuAction {NONE,GYRO,CANCEL_GYRO,LEVEL,FACE,CLEAR_ACCEL};
static ZjAccelModel applied;
static ZjImuAction queued=ZjImuAction::NONE;
static struct {bool gyroConfigured=true;uint32_t maintenanceSequence=0;ZjAccelCapture accelCapture;} imu;
static auto zjReadImu(uint32_t){return imu;}
static String zjImuStatus(){return "{}";}
static void zjSetAccelModel(const ZjAccelModel& m){applied=m;}
static bool zjImuMaintenanceBusy(){return false;}
static uint32_t zjQueueImuAction(ZjImuAction a,uint8_t){queued=a;return ++imu.maintenanceSequence;}
#include "FlightCoreMotor.h"
`;
}
