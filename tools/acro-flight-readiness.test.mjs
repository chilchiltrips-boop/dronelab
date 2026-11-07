import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Acro physical ARM has independent prerequisites and immutable hardware block',()=>{
 const tmp=mkdtempSync(join(tmpdir(),'zj-acro-'));
 try{
  const cpp=`#include <cassert>
#include <iostream>
#include "${process.cwd()}/FlightCore_Firmware/FlightCoreFlightOutput.h"
#include "${process.cwd()}/FlightCore_Firmware/FlightCoreRatePid.h"
int main(){
 assert(!ZJ_FLIGHT_HARDWARE_QUALIFIED);
 ZjFlightConditions c;
 c.nowMs=1000;c.inputDeadlineMs=150;c.acro=true;c.imuFresh=true;c.timingHealthy=true;
 c.setupComplete=c.pidSaved=true;
 c.outputOffAck=true;c.wiringVerified=true;c.driverReady=true;c.escOperatorConfirmed=true;
 c.input.source=ZjReceiverSource::PPM;c.input.sequence=3;c.input.selected=true;c.input.valid=true;
 c.input.inputArmed=true;c.input.generation=1;c.input.availableMask=15;c.input.receivedAtMs=990;
 c.input.channels[2]=1000;
 ZjFlightOutputGate gate;
 assert(gate.fault(c,false)==ZjFlightFault::UNQUALIFIED);
 assert(gate.fault(c,true)==ZjFlightFault::NONE);
 assert(!gate.arm(c,true,false)&&gate.reason==ZjFlightFault::EXPLICIT_ARM_REQUIRED);
 c.escOperatorConfirmed=false;
 assert(gate.fault(c,true)==ZjFlightFault::ESC_UNCONFIRMED);
 c.escOperatorConfirmed=true;c.imuFresh=false;
 assert(gate.fault(c,true)==ZjFlightFault::IMU_STALE);
 c.imuFresh=true;c.timingHealthy=false;
 assert(gate.fault(c,true)==ZjFlightFault::DEADLINE_MISSED);
 c.timingHealthy=true;c.input.receivedAtMs=800;
 assert(gate.fault(c,true)==ZjFlightFault::INPUT_STALE);
 c.input.receivedAtMs=990;c.input.source=ZjReceiverSource::WEB;
 assert(gate.fault(c,true)==ZjFlightFault::SOURCE_UNSUPPORTED);
 c.input.source=ZjReceiverSource::PPM;c.input.inputArmed=false;
 assert(gate.fault(c,true)==ZjFlightFault::INPUT_DISARMED);
 c.input.inputArmed=true;c.input.channels[2]=1200;
 assert(!gate.arm(c,true,true)&&gate.reason==ZjFlightFault::THROTTLE_HIGH);
 c.input.channels[2]=1000;c.outputOffAck=false;
 assert(!gate.arm(c,true,true)&&gate.reason==ZjFlightFault::OFF_UNVERIFIED);
 c.outputOffAck=true;
 assert(gate.arm(c,true,true)&&gate.state==ZjFlightState::ARMED);
 assert(gate.permit(c,true));
 c.input.generation=2;
 assert(!gate.permit(c,true)&&gate.reason==ZjFlightFault::SOURCE_CHANGED);
 gate={};c.input.generation=1;assert(gate.arm(c,true,true));
 gate.revoke(ZjFlightFault::INPUT_DISARMED);
 assert(gate.state==ZjFlightState::OUTPUT_OFF);
 gate={};assert(gate.arm(c,true,true));
 gate.revoke(ZjFlightFault::EMERGENCY_STOP);
 assert(gate.state==ZjFlightState::FAILSAFE);
 assert(zjFlightArmedLowPulse(1000)==1000&&zjFlightArmedLowPulse(1050)==1000&&zjFlightArmedLowPulse(1051)==0);
 assert(zjFlightMixThrottle(1900)==1800);
 const auto roll=zjRateMixQuadX(1500,-40,0,0);
 assert(roll.pulse[0]>1500&&roll.pulse[3]>1500&&roll.pulse[1]<1500&&roll.pulse[2]<1500);
 const auto pitch=zjRateMixQuadX(1500,0,-40,0);
 assert(pitch.pulse[0]>1500&&pitch.pulse[1]>1500&&pitch.pulse[2]<1500&&pitch.pulse[3]<1500);
 const auto yaw=zjRateMixQuadX(1500,0,0,-40);
 assert(yaw.pulse[0]>1500&&yaw.pulse[2]>1500&&yaw.pulse[1]<1500&&yaw.pulse[3]<1500);
 std::cout<<"PASS Acro readiness/mixer contract"; }
`;
  const main=join(tmp,'acro.cpp'),bin=join(tmp,'acro');
  writeFileSync(main,cpp);
  execFileSync('g++',['-std=c++17',main,'-o',bin],{timeout:45000});
  assert.match(execFileSync(bin,{encoding:'utf8'}),/PASS Acro readiness/);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
test('Firmware and WebApp expose read-only Acro readiness while preserving actuator lockout',()=>{
 const firmware=source('FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino');
 const api=source('FlightCore_Firmware/FlightCoreRateTraceApi.h');
 const fw=source('firmware-updater.js');
 const markup=source('index.html');
 assert.match(firmware,/static String zjFlightReadinessJson\(\)/);
 assert.match(firmware,/geometryPredictionUs/);
 assert.match(firmware,/escOperatorConfirmed=zjMotorCalibrationSaved/);
 assert.match(api,/api\/flight\/readiness/);
 assert.match(api,/ZJFLIGHT,STATUS/);
 assert.match(fw,/checkAcroReadiness/);
 assert.match(markup,/fwAcroCheckBtn/);
 assert.match(markup,/fwAcroSetup/);
 assert.match(fw,/data\.setupComplete===true/);
 assert.match(source('FlightCore_Firmware/FlightCoreMotor.h'),/static bool zjWizardSetupComplete\(\)/);
 assert.match(firmware,/setupComplete/);
 assert.match(source('FlightCore_Firmware/FlightCoreFlightOutput.h'),/ZJ_FLIGHT_HARDWARE_QUALIFIED=false/);
 assert.match(source('FlightCore_Firmware/FlightCoreFlightOutput.h'),/ZJ_A2_EXPERIMENTAL_RATE_FLIGHT/);
 assert.match(source('FlightCore_Firmware/FlightCoreControlRuntime.h'),/static void zjControlPpmArmEdge\(\)/);
 assert.match(source('FlightCore_Firmware/FlightCoreControlRuntime.h'),/zjFlightPpmArmEdge.accept\(input,millis\(\),ZJ_PPM_LOST_MS\)/);
 assert.match(source('FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino'),/zjControlPpmArmEdge\(\)/);
 assert.match(source('FlightCore_Firmware/FlightCorePpm.h'),/zjFlightRevoke\("INPUT_DISARMED"\)/);
 assert.match(source('FlightCore_Firmware/FlightCoreMotor.h'),/ledc_stop\(LEDC_LOW_SPEED_MODE,ledc_channel_t\(n\),0\)/);
 assert.match(markup,/fwAcroArmState/);
 assert.match(markup,/fwAcroFailsafe/);
 assert.match(markup,/fwAcroLoop/);
 assert.match(markup,/Advanced Acro diagnostics/);
 assert.match(fw,/ppmSelected=data\.inputSource/);
 assert.match(fw,/controlMissedTicks/);
 assert.match(fw,/ZebjusKits\.request\('\/api\/flight\/readiness'/);
 assert.doesNotMatch(fw,/writePythonSerialLine\('ZJFLIGHT,ARM/);
 assert.match(source('FlightCore_Firmware/FlightCoreFlightOutput.h'),/ZJ_FLIGHT_HARDWARE_QUALIFIED=false/);
});

test('acceptance-gated A2 ARM permits outputs only after valid PPM ARM and DISARM revokes output',()=>{
 const tmp=mkdtempSync(join(tmpdir(),'zj-flight-acceptance-'));
 try{
  const cpp=`#include <cassert>
#define CONFIG_IDF_TARGET_ESP32C6 1
#define ZJ_A2_EXPERIMENTAL_RATE_FLIGHT 1
#include "${process.cwd()}/FlightCore_Firmware/FlightCoreFlightOutput.h"
int main(){
 static_assert(ZJ_FLIGHT_OUTPUT_ENABLED,"opt-in experimental build expected");
 static_assert(!ZJ_FLIGHT_HARDWARE_QUALIFIED,"build flag is not physical evidence");
 ZjFlightConditions c;
 c.nowMs=1000;c.inputDeadlineMs=150;
 c.acro=c.imuFresh=c.timingHealthy=c.outputOffAck=true;
 c.setupComplete=c.pidSaved=true;
 c.wiringVerified=c.driverReady=c.escOperatorConfirmed=true;
 c.input.source=ZjReceiverSource::PPM;c.input.sequence=1;c.input.selected=c.input.valid=true;
 c.input.inputArmed=true;c.input.generation=5;c.input.availableMask=15;c.input.receivedAtMs=990;
 c.input.channels[2]=1000;
 ZjFlightOutputGate gate;
 assert(!gate.arm(c,false,true)&&gate.reason==ZjFlightFault::UNQUALIFIED);
 assert(gate.arm(c,ZJ_FLIGHT_OUTPUT_ENABLED,true));
 assert(gate.permit(c,ZJ_FLIGHT_OUTPUT_ENABLED));
 c.input.inputArmed=false;
 assert(!gate.permit(c,ZJ_FLIGHT_OUTPUT_ENABLED));
 assert(gate.state==ZjFlightState::OUTPUT_OFF);
 assert(gate.reason==ZjFlightFault::INPUT_DISARMED);
 gate={};c.input.inputArmed=true;
 assert(gate.arm(c,ZJ_FLIGHT_OUTPUT_ENABLED,true));
 c.input.receivedAtMs=800;
 assert(!gate.permit(c,ZJ_FLIGHT_OUTPUT_ENABLED));
 assert(gate.state==ZjFlightState::FAILSAFE);
 assert(gate.reason==ZjFlightFault::INPUT_STALE);
 return 0;
}`;
  const main=join(tmp,'accepted.cpp'),bin=join(tmp,'accepted');
  writeFileSync(main,cpp);
  execFileSync('g++',['-std=c++17',main,'-o',bin],{timeout:45000});
  execFileSync(bin,{timeout:45000});
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
