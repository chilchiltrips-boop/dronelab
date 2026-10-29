#include <cassert>
#include <cstring>
#include <iostream>
#include "../FlightCore_Firmware/FlightCoreMotorSafety.h"

using M=ZjMotorSafety;
static void min(const M& m){for(auto p:m.pulses)assert(p==1000);}
static ZjMotorInput input(ZjMotorInput::Source s,uint32_t t,uint32_t seq,uint16_t thr=1000,uint16_t yaw=1500,bool sw=true){
 ZjMotorInput i;i.source=s;i.selected=i.valid=true;i.inputArmed=true;i.safetySwitch=sw;i.sequence=seq;i.receivedMs=t;i.throttle=thr;i.yaw=yaw;return i;
}
static void begin(M& m,uint32_t t,ZjMotorInput::Source s=ZjMotorInput::PPM,bool sw=false){assert(m.prepare(t,true,true));assert(m.startInput(t,s,sw));}
static void ppmArm(M& m,uint32_t start,bool sw=true){
 auto i=input(ZjMotorInput::PPM,start,1,1000,1500,sw);m.update(start,i);assert(!m.armed);
 for(uint32_t n=1;n<=102;n++){const uint32_t t=start+n*20;m.keep(t);i=input(ZjMotorInput::PPM,t,n+1,1000,1950,sw);m.update(t,i);}
 assert(m.armed);
}
int main(int argc,char**argv){
 assert(argc==2);const char* c=argv[1];M m;auto i=input(ZjMotorInput::PPM,0,1);
 if(!strcmp(c,"boot")){assert(m.mode==M::DISABLED&&!m.armed&&!m.benchEnabled);min(m);assert(!m.prepare(0,false,true));assert(!m.prepare(0,true,false));assert(!m.startCalibration(0,true));}
 else if(!strcmp(c,"gesture")){begin(m,0);ppmArm(m,0);i=input(ZjMotorInput::PPM,2080,104,1700,1500);m.keep(2080);m.update(2080,i);assert(m.armed);for(auto p:m.pulses)assert(p==1200);
  i=input(ZjMotorInput::PPM,2100,105,1000,1500);m.keep(2100);m.update(2100,i);for(uint32_t n=1;n<=102;n++){uint32_t t=2100+n*20;m.keep(t);i=input(ZjMotorInput::PPM,t,105+n,1000,1050);m.update(t,i);}assert(m.mode==M::DISABLED&&!m.armed);min(m);}
 else if(!strcmp(c,"gesture_needs_neutral")){begin(m,0);for(uint32_t n=1;n<=110;n++){uint32_t t=n*20;m.keep(t);i=input(ZjMotorInput::PPM,t,n,1000,1950);m.update(t,i);}assert(!m.armed);min(m);}
 else if(!strcmp(c,"throttle_gate")){begin(m,0);i=input(ZjMotorInput::PPM,0,1);m.update(0,i);for(uint32_t n=1;n<=110;n++){uint32_t t=n*20;m.keep(t);i=input(ZjMotorInput::PPM,t,n+1,1300,1950);m.update(t,i);}assert(!m.armed);min(m);}
 else if(!strcmp(c,"switch")){begin(m,0,ZjMotorInput::PPM,true);for(uint32_t n=1;n<110;n++){uint32_t t=n*20;m.keep(t);i=input(ZjMotorInput::PPM,t,n,1000,1950,false);m.update(t,i);}assert(!m.armed);ppmArm(m,2200,true);i=input(ZjMotorInput::PPM,4280,105,1600,1500,false);m.keep(4280);m.update(4280,i);assert(m.mode==M::DISABLED&&m.reason==M::SWITCH_REQUIRED);min(m);}
 else if(!strcmp(c,"ppm_loss")){begin(m,0);ppmArm(m,0);m.keep(2300);i=input(ZjMotorInput::PPM,2040,103,1700,1500);m.update(2300,i);assert(m.mode==M::DISABLED&&m.reason==M::INPUT_LOST);min(m);m.keep(2310);i=input(ZjMotorInput::PPM,2310,104,1800,1500);m.update(2310,i);assert(!m.armed);min(m);}
 else if(!strcmp(c,"missing_frames")){begin(m,0);i=input(ZjMotorInput::PPM,0,1);m.update(0,i);i=input(ZjMotorInput::PPM,20,2,1000,1950);m.update(20,i);for(uint32_t t=40;t<=160;t+=20)m.update(t,i);assert(!m.armed);m.keep(180);m.update(180,i);assert(m.mode==M::DISABLED);}
 else if(!strcmp(c,"source_changed")){begin(m,0,ZjMotorInput::ANDROID_AP);auto a=input(ZjMotorInput::ANDROID_AP,10,1);assert(m.armRemote(10,a));auto other=input(ZjMotorInput::WEB,20,2);m.update(20,other);assert(m.mode==M::DISABLED&&m.reason==M::INPUT_CHANGED);min(m);}
 else if(!strcmp(c,"network_arm")){begin(m,0,ZjMotorInput::WEB);auto a=input(ZjMotorInput::WEB,10,1,1600);assert(!m.armRemote(10,a));a.throttle=1000;a.inputArmed=false;assert(!m.armRemote(10,a));a.inputArmed=true;assert(m.armRemote(10,a));a.throttle=1150;m.update(10,a);for(auto p:m.pulses)assert(p==1150);a.inputArmed=false;m.update(10,a);assert(m.mode==M::DISABLED);min(m);}
 else if(!strcmp(c,"manual")){assert(m.prepare(0,true,true));assert(!m.startSingle(10,0,5,500));assert(!m.startSingle(10,1,21,500));assert(!m.startSingle(10,1,5,2001));assert(m.startSingle(10,2,15,500));assert(m.pulses[0]==1000&&m.pulses[1]==1150&&m.pulses[2]==1000);m.update(509,i);assert(m.mode==M::SINGLE_TEST);m.update(510,i);assert(m.mode==M::DISABLED&&m.reason==M::TEST_FINISHED);min(m);}
 else if(!strcmp(c,"all")){assert(m.prepare(0,true,true));assert(m.startAll(10,10,100));for(auto p:m.pulses)assert(p==1100);m.update(110,i);assert(m.mode==M::DISABLED);min(m);}
 else if(!strcmp(c,"calibration")){assert(m.prepare(0,true,true));assert(!m.startCalibration(0,false));assert(m.startCalibration(0,true));for(auto p:m.pulses)assert(p==2000);assert(m.calibrationLow(100));min(m);for(uint32_t t=500;t<3100;t+=500){m.keep(t);m.update(t,i);}m.keep(3100);m.update(3100,i);assert(m.mode==M::DISABLED&&m.reason==M::CAL_FINISHED);min(m);}
 else if(!strcmp(c,"cal_timeout")){assert(m.prepare(0,true,true));assert(m.startCalibration(0,true));for(uint32_t t=500;t<15000;t+=500){m.keep(t);m.update(t,i);}m.keep(15000);m.update(15000,i);assert(m.mode==M::DISABLED&&m.reason==M::CAL_TIMEOUT);min(m);}
 else if(!strcmp(c,"session_loss")){assert(m.prepare(0,true,true));assert(m.startCalibration(0,true));m.update(1500,i);assert(m.mode==M::DISABLED&&m.reason==M::SESSION_EXPIRED);min(m);}
 else if(!strcmp(c,"late_keep")){assert(m.prepare(0,true,true));assert(m.startCalibration(0,true));assert(!m.keep(1500));assert(m.mode==M::DISABLED&&m.reason==M::SESSION_EXPIRED);min(m);}
 else if(!strcmp(c,"old_sequence")){begin(m,0);i=input(ZjMotorInput::PPM,20,100);m.update(20,i);i=input(ZjMotorInput::PPM,40,99,1000,1950);m.update(40,i);assert(m.mode==M::DISABLED&&m.reason==M::INPUT_LOST);min(m);}
 else if(!strcmp(c,"rollover")){const uint32_t start=0xfffffc00U;begin(m,start);ppmArm(m,start);i=input(ZjMotorInput::PPM,start+2060,104,1700,1500);m.keep(start+2060);m.update(start+2060,i);assert(m.armed&&m.pulses[0]==1200);m.keep(start+2300);m.update(start+2300,i);assert(m.mode==M::DISABLED);min(m);}
 else if(!strcmp(c,"fault")){assert(m.prepare(0,true,true));m.fault(M::OUTPUT_ERROR);assert(m.mode==M::FAULT);min(m);assert(!m.prepare(1,true,true));assert(!m.keep(1));}
 else return 2;
 std::cout<<"PASS "<<c<<"\n";
}
