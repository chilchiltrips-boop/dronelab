import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('production A2 LED and motor setup keep separate timer frequencies, resolution and active-low OFF',()=>{
 const sketch=readFileSync(new URL('../FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino',import.meta.url),'utf8');
 const motor=readFileSync(new URL('../FlightCore_Firmware/FlightCoreMotor.h',import.meta.url),'utf8');
 const between=(src,start,end)=>{const a=src.indexOf(start),b=src.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return src.slice(a,b);};
 const ledGlobals=between(sketch,'constexpr unsigned long LED_LEASE_MS=','void printFirmwareInfo()');
 const ledSetup=between(sketch,' pinMode(LED_PIN,OUTPUT);',' // No decorative startup banner.');
 const motorTimer=/static constexpr ledc_timer_t ZJ_MOTOR_TIMER=[^;]+;/.exec(motor)?.[0];assert.ok(motorTimer);
 const motorSetup=between(motor,' ledc_timer_config_t timer={};',' esp_timer_create_args_t args={};');
 // The Arduino double models the pinned 3.3.12 allocator: the first attached
 // channel uses the first free timer (0), even when that channel number is 5.
 // Production LED and ESC setup, not a second implementation, configure it.
 const code=`#include <cstdint>
#include <cassert>
#include <iostream>
#include "FlightCoreEscProfile.h"
enum ledc_timer_t {LEDC_TIMER_0,LEDC_TIMER_1,LEDC_TIMER_2,LEDC_TIMER_3};
using ledc_channel_t=int;
constexpr int LEDC_LOW_SPEED_MODE=0,LEDC_TIMER_14_BIT=14,LEDC_AUTO_CLK=0,ESP_OK=0,OUTPUT=1,HIGH=1;
struct ledc_timer_config_t {int speed_mode=0,duty_resolution=0;ledc_timer_t timer_num=LEDC_TIMER_0;int freq_hz=0,clk_cfg=0;};
struct ledc_channel_config_t {int gpio_num=0,speed_mode=0,channel=0;ledc_timer_t timer_sel=LEDC_TIMER_0;uint32_t duty=0;};
static ledc_timer_config_t timers[4];static ledc_channel_config_t channels[6];
static int pinLevel=0;static bool attachmentWorks=true;
static void pinMode(int,int){}static void digitalWrite(int,int value){pinLevel=value;}
static int ledc_timer_config(const ledc_timer_config_t* t){timers[t->timer_num]=*t;return ESP_OK;}
static int ledc_channel_config(const ledc_channel_config_t* c){channels[c->channel]=*c;return ESP_OK;}
static bool ledcAttachChannel(int pin,int hz,int bits,int channel){if(!attachmentWorks)return false;timers[0].freq_hz=hz;timers[0].duty_resolution=bits;channels[channel].gpio_num=pin;channels[channel].timer_sel=LEDC_TIMER_0;return true;}
static void ledcWrite(int,uint32_t duty){channels[5].duty=duty>=255?256:duty;}
static int constrain(int v,int lo,int hi){return v<lo?lo:v>hi?hi:v;}
constexpr uint8_t LED_PIN=15,BUS_SDA=22,BUS_SCL=23;
static constexpr int ZJ_MOTOR_PINS[]={0,1,2,21};
${motorTimer}
${ledGlobals}
static void setupLed(){${ledSetup}}
static void setupMotors(){${motorSetup}assert(ok);}
int main(){
 setupLed();assert(ledAvailable&&ledMode==LED_OFF);
 assert(channels[5].timer_sel==LEDC_TIMER_0&&channels[5].duty==256);
 setupMotors();
 const auto ledTimer=channels[5].timer_sel;
 assert(timers[ledTimer].freq_hz==5000&&timers[ledTimer].duty_resolution==8);
 for(int n=0;n<4;n++){assert(channels[n].timer_sel!=ledTimer);assert(timers[channels[n].timer_sel].freq_hz==50);assert(timers[channels[n].timer_sel].duty_resolution==14);assert(channels[n].duty==0);}
 ledLevel(100);assert(channels[5].duty==0);
 ledLevel(50);assert(channels[5].duty==128);
 ledOff();assert(channels[5].duty==(1U<<timers[ledTimer].duty_resolution));
 for(int n=0;n<4;n++)assert(timers[channels[n].timer_sel].freq_hz==50);
 attachmentWorks=false;pinLevel=0;setupLed();assert(!ledAvailable&&pinLevel==HIGH&&ledMode==LED_OFF);
 std::cout<<"PASS independent production LED/ESC timer configuration"<<std::endl;
}`;
 const dir=mkdtempSync(join(tmpdir(),'zj-led-motor-'));
 try{const file=join(dir,'timer.cpp'),bin=join(dir,'timer');writeFileSync(file,code);execFileSync('g++',['-std=c++17','-IFlightCore_Firmware',file,'-o',bin],{stdio:'pipe',timeout:60000});assert.match(execFileSync(bin,{encoding:'utf8',timeout:10000}),/PASS independent production/);}finally{rmSync(dir,{recursive:true,force:true});}
});
