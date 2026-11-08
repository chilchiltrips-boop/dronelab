#include "../FlightCore_Firmware/FlightCoreTiming.h"
#include "../FlightCore_Firmware/FlightCoreEscProfile.h"
#include "../FlightCore_Firmware/FlightCoreFlightOutput.h"
#include "../FlightCore_Firmware/FlightCoreRateTrace.h"
#include "../FlightCore_Firmware/FlightCoreRatePid.h"
#include "../FlightCore_Firmware/FlightCorePpmFallback.h"
#include <cassert>
#include <cmath>
#include <iostream>
int main(){
 ZjControlScheduler c;c.start(0);
 for(uint32_t i=1;i<=500;i++){
  assert(!c.begin(i*4000-1));assert(c.begin(i*4000));c.finish(i*4000+20);
 }
 assert(c.ticks==500&&c.missedTicks==0&&c.overruns==0);
 assert(c.minIntervalUs==4000&&c.maxIntervalUs==4000&&c.maxExecutionUs==20);
 assert(c.rate.known&&std::fabs(c.rate.actual(2000020)-250)<0.01);
 assert(c.healthy(2000030)&&!c.healthy(2020000));
 // Delayed notification: one current observation, skipped deadlines counted,
 // no backlog replay; an expensive shadow operation is separately an overrun.
 c.start(0);assert(c.begin(4100));c.finish(4120);
 assert(c.jitterUs==100&&c.maxJitterUs==100);
 assert(c.begin(20000));assert(c.missedTicks==3&&c.nextDueUs==24000);
 c.finish(24500);assert(c.overruns==1&&c.executionUs==4500&&c.deadlineMisses==4);
 assert(!c.healthy(24501));assert(c.begin(24501));c.finish(24520);
 assert(c.missedTicks==3&&c.jitterUs==501&&c.maxJitterUs==12000);
 assert(!c.begin(24521));assert(c.ticks==3);
 // Replay the measured 6,433 us wake interval and 1,120 us work window.
 // Model a 900 us gap between worker creation and timer activation.
 for(const uint32_t epoch:{0u,900u}){
  c.start(epoch);
  assert(c.begin(4953));c.finish(5353);
  assert(c.begin(11386)&&c.intervalUs==6433&&c.missedTicks==0);
  assert(c.nextDueUs-11386==614+epoch);
  c.finish(12506);
  assert(c.deadlineMisses==(epoch==0?1u:0u));
 }
 assert(c.begin(13200));
 c.finish(c.nextDueUs);
 assert(c.deadlineMisses==1); // an actual deadline still trips
 // An isolated 120.6 ms interval drops ticks and revokes a mocked flight owner.
 c.start(0);assert(c.begin(4000));c.finish(4020);
 ZjFlightConditions flight;
 flight.input.source=ZjReceiverSource::PPM;
 flight.input.availableMask=0xff;flight.input.valid=flight.input.selected=flight.input.inputArmed=true;
 flight.input.sequence=1;flight.input.generation=1;flight.input.receivedAtMs=1;
 flight.nowMs=2;flight.inputDeadlineMs=150;
 flight.acro=flight.imuFresh=flight.timingHealthy=flight.outputOffAck=true;
 flight.setupComplete=flight.pidSaved=true;
 flight.driverReady=flight.wiringVerified=flight.escOperatorConfirmed=true;
 ZjFlightOutputGate gate;
 assert(!gate.arm(flight,ZJ_FLIGHT_HARDWARE_QUALIFIED,true));
 assert(!gate.arm(flight,true,false)&&gate.reason==ZjFlightFault::EXPLICIT_ARM_REQUIRED);
 flight.benchActive=true;assert(!gate.arm(flight,true,true));
 flight.benchActive=false;
 flight.input.source=ZjReceiverSource::WEB;assert(!gate.arm(flight,true,true)&&gate.reason==ZjFlightFault::SOURCE_UNSUPPORTED);
 flight.input.source=ZjReceiverSource::PPM;
 flight.outputOffAck=false;assert(!gate.arm(flight,true,true)&&gate.reason==ZjFlightFault::OFF_UNVERIFIED);
 flight.outputOffAck=true;
 flight.input.channels[2]=1051;assert(!gate.arm(flight,true,true)&&gate.reason==ZjFlightFault::THROTTLE_HIGH);
 flight.input.channels[2]=1050;assert(gate.arm(flight,true,true)&&gate.permit(flight,true));
 assert(c.begin(124600)&&c.intervalUs==120600&&c.missedTicks==29);
 flight.timingHealthy=false;
 assert(!gate.permit(flight,true)&&gate.reason==ZjFlightFault::DEADLINE_MISSED);
 assert(gate.state==ZjFlightState::FAILSAFE);
 flight.timingHealthy=true;assert(!gate.permit(flight,true));
 assert(gate.arm(flight,true,true));
 ++flight.input.generation;assert(!gate.permit(flight,true)&&gate.reason==ZjFlightFault::SOURCE_CHANGED);
 assert(gate.arm(flight,true,true));flight.imuFresh=false;
 assert(!gate.permit(flight,true)&&gate.reason==ZjFlightFault::IMU_STALE);
 assert(zjFlightLowThrottle(1050)&&!zjFlightLowThrottle(1051));
 assert(zjFlightMixThrottle(1750)==1750&&zjFlightMixThrottle(2000)==1800);
 assert(zjRateMixQuadX(1800,300,0,0).clipMask==6);
 assert(zjRateMixQuadPlus(1800,300,0,0).clipMask==2);

 // 250 Hz tick jitter does not drift the 50 Hz sample grid or replay a stall.
 ZjRateTrace trace;
 ZjRateTraceSample sample;
 const uint32_t start=0xffff0000;
 sample.atUs=start;trace.begin(sample,false);
 for(unsigned tick=0;tick<3000;tick++){
  sample.atUs=start+tick*4000+(tick%2?30:0);
  sample.inputSeq=tick;sample.requested[0]=1320;
  if(tick==499)trace.flightArm(sample);
  trace.observe(sample);
 }
 sample.atUs+=120600;sample.dtUs=120600;sample.triggerUs=sample.atUs;
 sample.flags=ZJ_TRACE_OFF_ACK|ZJ_TRACE_APPLIED_KNOWN;
 trace.freeze(sample,ZjRateTraceEvent::FAILSAFE,ZjFlightFault::DEADLINE_MISSED);
 assert(trace.size()==503&&trace.capture==1&&!trace.active);
 assert(trace.read(0,sample)&&sample.event==ZjRateTraceEvent::INPUT_ARM);
 assert(trace.read(1,sample)&&sample.event==ZjRateTraceEvent::FLIGHT_ARM);
 assert(trace.read(2,sample)&&sample.inputSeq==500&&sample.atUs==uint32_t(start+2000000));
 assert(trace.read(501,sample)&&sample.inputSeq==2995&&sample.requested[0]==1320);
 assert(trace.read(502,sample)&&sample.reason==ZjFlightFault::DEADLINE_MISSED&&sample.dtUs==120600);
 assert((sample.flags&ZJ_TRACE_OFF_ACK)&&sample.applied[0]==0&&!trace.read(503,sample));
 trace.freeze({},ZjRateTraceEvent::STOP,ZjFlightFault::EMERGENCY_STOP);
 assert(trace.read(502,sample)&&sample.reason==ZjFlightFault::DEADLINE_MISSED);
 trace.begin(sample,true);assert(trace.capture==2&&trace.size()==0);
 trace.observe(sample);sample.atUs+=120600;trace.observe(sample);
 trace.freeze(sample,ZjRateTraceEvent::EXPORT,ZjFlightFault::NONE);
 assert(trace.size()==4&&trace.read(0,sample)&&sample.event==ZjRateTraceEvent::PREVIEW_START);
 assert(zjDecidePpmFallback(349,false,true,true,false)==ZjPpmFallbackDecision::WAIT);
 assert(zjDecidePpmFallback(349,true,true,true,false)==ZjPpmFallbackDecision::CANCEL);
 assert(zjDecidePpmFallback(350,false,true,true,false)==ZjPpmFallbackDecision::START_AP);
 assert(zjDecidePpmFallback(4999,false,true,false,false)==ZjPpmFallbackDecision::WAIT);
 assert(zjDecidePpmFallback(5000,false,true,false,false)==ZjPpmFallbackDecision::BLOCKED);
 assert(zjDecidePpmFallback(5000,false,false,true,false)==ZjPpmFallbackDecision::CANCEL);
 // Unsigned microsecond rollover is crossed by scheduler, sensors and rates.
 const uint32_t at=0xfffff000U;c.start(at);
 for(uint32_t i=1;i<=500;i++){assert(c.begin(uint32_t(at+i*4000)));c.finish(uint32_t(at+i*4000+10));}
 assert(c.missedTicks==0&&c.minIntervalUs==4000&&std::fabs(c.rate.hz-250)<0.01);
 ZjSampleStamp stamp;stamp.expectedHz=50;stamp.accept(at);const auto seq=stamp.sequence;
 for(int i=0;i<5;i++){auto held=stamp;assert(held.sequence==seq);}
 assert(stamp.fresh(uint32_t(at+20000),20000)&&!stamp.fresh(uint32_t(at+20001),20000));
 stamp.valid=false;assert(!stamp.fresh(at,20000));
 ZjRateCounter rate;rate.reset(at);
 for(uint32_t i=1;i<=50;i++)rate.event(uint32_t(at+i*20000));
 assert(rate.known&&std::fabs(rate.actual(uint32_t(at+1000000))-50)<0.01);
 assert(rate.actual(uint32_t(at+2000000))==0);
 for(uint16_t hz:{50,250}){
  ZjEscProfile p{hz,14};assert(p.valid());assert(p.deployable()==(hz==50));
  for(uint16_t pulse:{1000,1500,2000}){
   const auto duty=p.duty(pulse);const double actualUs=double(duty)*1000000/(16384*hz);
   assert(actualUs<=pulse&&pulse-actualUs<1000000.0/(16384*hz));
  }
  assert(!p.duty(999)&&!p.duty(2001));
 }
 assert(ZJ_ESC_PROFILE.deployable()&&ZJ_ESC_PROFILE.hz==50);
 assert(ZjEscProfile({50,14}).duty(1000)==819);
 assert(ZjEscProfile({50,14}).duty(2000)==1638);
 assert(ZjEscProfile({250,14}).duty(1000)==4096);
 assert(ZjEscProfile({250,14}).duty(2000)==8192);
 assert(!ZjEscProfile({60,14}).duty(1000)&&!ZjEscProfile({250,32}).duty(1000));
 std::cout<<"PASS production scheduler nominal 250Hz, jitter, overload/coalescing, rollover, held sensors, measured rates; 50/250Hz ESC profiles (250Hz disabled)\n";
}
