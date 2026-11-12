import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';

const source=readFileSync('FlightCore_Firmware/reference/ZebjusWorkingFlight.ino.txt','utf8');
assert.equal(createHash('sha256').update(source).digest('hex'),'f05c503dc2aa050ee864d9b7557a6d0685717c9f41c51dd4012da1b97b46e909');
function originalFunction(name){
 const start=source.indexOf('void '+name+'('),body=source.indexOf('{',start);
 assert.ok(start>=0&&body>start);
 let depth=1,end=body+1;
 while(depth){if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;}
 return source.slice(start,end);
}
test('firmware equations match the unedited working sketch over changing inputs and mode switches',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zj-working-'));
 try{
  const globals=source.slice(source.indexOf('float RateRoll'),source.indexOf('// === ESC Calibration'))
   .replace('PulsePositionInput ReceiverInput(RISING);','Receiver ReceiverInput;');
  const mixing=source.slice(source.indexOf('  // Motor mixing'),source.indexOf('  // Microseconds to duty'));
  const cpp=String.raw`
#include "FlightCoreRatePid.h"
#include "FlightCoreAttitude.h"
#include "FlightCorePpmArm.h"
#include "FlightCorePpmMode.h"
#include "FlightCoreEscProfile.h"
#include <cassert>
#include <iostream>
namespace reference {
constexpr int D0=0,D1=1,D2=2,D3=3;
uint32_t now=0;
uint32_t millis(){return now;}
struct Receiver {struct Diagnostics{bool fresh=true;};Diagnostics diagnostics(){return {};}};
float constrain(float value,int low,int high){return std::max(float(low),std::min(float(high),value));}
`+globals+['kalman_1d','pid_equation','reset_pid','flight_mode','arm_disarm'].map(originalFunction).join('\n')+
'\nvoid mix(){\n'+mixing+'\n}\n}\n'+String.raw`
int main(){
 const auto near=[](float a,float b){assert(std::fabs(a-b)<.0002f);};
 ZjRatePidState rate,angle;
 const ZjRateGains gains={.9f,15.f,.03f};
 float error=0,integral=0;
 for(unsigned n=0;n<10000;n++){
  const float target=std::sin(n*.17f)*500,measured=std::cos(n*.11f)*200;
  const float dt=.0035f+(n%11)*.0001f;
  reference::LoopDt=dt;
  reference::pid_equation(target-measured,gains.p,gains.i,gains.d,error,integral);
  const auto actual=zjStepRatePid(rate,gains,target,measured,dt,250);
  assert(actual.valid);near(actual.output,reference::PIDReturn[0]);near(actual.i,reference::PIDReturn[2]);
  const float outer=zjStepAnglePid(angle,gains,target,measured,dt);
  near(outer,reference::PIDReturn[0]);
  error=reference::PIDReturn[1];integral=reference::PIDReturn[2];
 }
 ZjAttitudeFilter attitude;
 float rates[3]={},gravity[3]={0,0,1};
 assert(attitude.step(1,4000,rates,gravity,true,false,1));
 float roll=0,pitch=0,rollVariance=4,pitchVariance=4;
 for(unsigned n=2;n<2000;n++){
  rates[0]=std::sin(n*.2f)*60;rates[1]=std::cos(n*.15f)*70;rates[2]=90;
  gravity[0]=std::sin(n*.013f)*.3f;gravity[1]=std::cos(n*.011f)*.4f;
  const float ar=std::atan2(gravity[1],std::sqrt(gravity[0]*gravity[0]+gravity[2]*gravity[2]))*57.2957795f;
  const float ap=-std::atan2(gravity[0],std::sqrt(gravity[1]*gravity[1]+gravity[2]*gravity[2]))*57.2957795f;
  reference::LoopDt=.004f;
  reference::kalman_1d(roll,rollVariance,rates[0],ar);roll=reference::Kalman1DOutput[0];rollVariance=reference::Kalman1DOutput[1];
  reference::kalman_1d(pitch,pitchVariance,rates[1],ap);pitch=reference::Kalman1DOutput[0];pitchVariance=reference::Kalman1DOutput[1];
  assert(attitude.step(n,n*4000,rates,gravity,true,false,1,.004f));
  near(attitude.value.roll,roll);near(attitude.value.pitch,pitch);
 }
 reference::Armed=true;
 for(unsigned n=0;n<2000;n++){
  reference::ReceiverValue[2]=reference::InputThrottle=1050+n%951;
  reference::InputRoll=std::sin(n*.3f)*400;reference::InputPitch=std::cos(n*.7f)*400;reference::InputYaw=std::sin(n*.2f)*200;
  const auto mixed=zjRateMixQuadX(std::min(reference::InputThrottle,1800.f),reference::InputRoll,reference::InputPitch,reference::InputYaw);
  reference::mix();
  near(mixed.pulse[0],reference::MotorInput1);near(mixed.pulse[1],reference::MotorInput2);
  near(mixed.pulse[2],reference::MotorInput3);near(mixed.pulse[3],reference::MotorInput4);
  for(float pulse:mixed.pulse)assert(ZJ_ESC_PROFILE.duty(uint16_t(pulse))==((uint32_t(pulse)*4096UL+2000UL)/4000UL));
 }
 reference::Armed=false;reference::ChannelNumber=8;
 ZjPpmArmGesture gesture;
 ZjPpmModeSwitch mode;
 for(unsigned t=0;t<45000;t+=20){
  reference::now=t;
  const uint16_t throttle=t>=6000&&t<8000?1400:1000;
  const uint16_t yaw=t<6000?2000:t>=10000&&t<12000?1000:t>=13000&&t<19000?2000:1500;
  reference::ReceiverValue[2]=throttle;reference::ReceiverValue[3]=yaw;
  reference::arm_disarm();gesture.accept(throttle,yaw,t);
  assert(gesture.armed==reference::Armed);
  reference::ReceiverValue[4]=(t/20)%3==0?1399:(t/20)%3==1?1500:1601;
  reference::flight_mode();mode.accept(reference::ReceiverValue[4],t);
  assert(mode.angle==reference::AngleMode);
 }
 assert(!zjStepRatePid(rate,gains,0,0,.12f).valid);
 assert(ZJ_ESC_PROFILE.duty(1000)==1024&&ZJ_ESC_PROFILE.duty(2000)==2048);
 std::cout<<"PASS reference equations, mixer, PWM, mode and gestures";
}
`;
  writeFileSync(join(dir,'reference.cpp'),cpp);
  execFileSync('g++',['-std=c++17','-I'+resolve('FlightCore_Firmware'),join(dir,'reference.cpp'),'-o',join(dir,'reference')]);
  assert.match(execFileSync(join(dir,'reference'),{encoding:'utf8'}),/PASS reference/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
