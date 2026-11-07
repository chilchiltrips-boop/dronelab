import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

test('measured-dt attitude fusion, ±tilt, repeated samples, calibration changes and dropouts', () => {
 const dir=mkdtempSync(join(tmpdir(),'a2-attitude-'));
 try {
  writeFileSync(join(dir,'test.cpp'),String.raw`
#include "FlightCoreAttitude.h"
#include "FlightCoreFlightOutput.h"
#include <cassert>
#include <iostream>
int main(){
 float zero[3]={},gravity[3]={0,0,1},rate[3]={20,0,0};
 for(float roll:{-45.f,0.f,45.f})for(float pitch:{-35.f,0.f,35.f}){
  const float r=roll*.01745329252f,p=pitch*.01745329252f;
  float g[3]={-std::sin(p),std::sin(r)*std::cos(p),std::cos(r)*std::cos(p)};
  ZjAttitudeFilter filter;
  assert(filter.step(1,4000,zero,g,true,true,1));
  assert(std::fabs(filter.value.roll-roll)<.001&&std::fabs(filter.value.pitch-pitch)<.001);
 }
 ZjAttitudeFilter f;assert(f.step(1,4000,zero,gravity,true,true,1));
 uint32_t at=4000;float actual=0;
 for(unsigned n=2;n<252;n++){
  const uint32_t dt=n%2?3900:4100;at+=dt;actual+=20*dt*.000001f;
  float g[3]={0,std::sin(actual*.01745329252f),std::cos(actual*.01745329252f)};
  assert(f.step(n,at,rate,g,true,true,1));
 }
 assert(std::fabs(f.value.roll-actual)<.02);
 const auto previous=f.value;
 assert(f.step(previous.sequence,at+4000,rate,gravity,true,true,1));
 assert(f.value.roll==previous.roll&&f.value.atUs==previous.atUs); // no replay/invented freshness
 assert(!f.step(previous.sequence-1,at,zero,gravity,true,true,1));
 assert(f.step(1,4000,zero,gravity,true,true,2));
 assert(!f.step(2,124600,zero,gravity,true,true,2)); // observed boot-sized spike
 assert(f.step(3,128600,zero,gravity,true,true,2));
 float acceleration[3]={0,0,2}; // reject acceleration as gravity, bounded gyro coast
 for(unsigned n=4;n<129;n++)assert(f.step(n,128600+(n-3)*4000,zero,acceleration,true,true,2));
 assert(!f.step(129,632600,zero,acceleration,true,true,2));
 assert(f.step(130,636600,zero,gravity,true,true,2));
 assert(!f.step(131,640600,zero,gravity,false,true,2));
 rate[0]=NAN;assert(!f.step(132,644600,rate,gravity,true,true,2));
 float tilt[3]={0,.5f,.8660254f};
 assert(f.step(133,648600,zero,tilt,true,true,2));
 assert(f.step(134,652600,zero,gravity,true,true,3));
 assert(f.value.roll==0); // saved level calibration re-seeds, no old tilt memory
 assert(zjAngleStick(1500)==0&&zjAngleStick(1515)==0&&zjAngleStick(1485)==0);
 assert(zjAngleStick(1000)==-50&&zjAngleStick(2000)==50&&zjAngleStick(1516)>0);
 ZjFlightConditions c;c.angle=true;c.levelCalibrated=false;
 assert(ZjFlightOutputGate{}.fault(c,true)==ZjFlightFault::LEVEL_REQUIRED);
 c.levelCalibrated=true;
 assert(ZjFlightOutputGate{}.fault(c,true)==ZjFlightFault::ATTITUDE_INVALID);
 std::cout<<"PASS attitude";
}
`);
  const bin=join(dir,'test');
  execFileSync('g++',['-std=c++17','-I'+resolve('FlightCore_Firmware'),join(dir,'test.cpp'),'-o',bin]);
  assert.match(execFileSync(bin,{encoding:'utf8'}),/PASS attitude/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
