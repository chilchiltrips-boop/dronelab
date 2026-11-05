import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('production scheduler and ESC profile math with simulated microsecond clock',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zj-timing-'));
 try{const bin=join(dir,'host');execFileSync('g++',['-std=c++17','tools/timing-foundation-host.cpp','-o',bin]);assert.match(execFileSync(bin,{encoding:'utf8'}),/PASS production scheduler/);}
 finally{rmSync(dir,{recursive:true,force:true});}
});
test('timer callbacks notify workers; the tick uses only the fenced flight driver and RAM recorder',()=>{
 const runtime=readFileSync('FlightCore_Firmware/FlightCoreControlRuntime.h','utf8');
 for(const name of ['zjControlWake','zjImuWake']){
  const body=runtime.match(new RegExp('static void '+name+'\\(void\\*\\)\\{([^}]+)\\}'))?.[1];
  assert.ok(body);assert.match(body,/xTaskNotifyGive/);assert.doesNotMatch(body,/Wire|Serial|ledc|motor|delay|String/);
 }
 const tick=runtime.slice(runtime.indexOf('static void zjControlTask('),runtime.indexOf('static ZjControlScheduler zjReadControl'));
 assert.doesNotMatch(tick,/Wire|Serial|ledc|zjMotor|zjRcFrame|String|delay/);
 assert.match(tick,/zjFlightDriverSubmit\(lease,trace.requested,control.nextDueUs\)/);
 assert.match(tick,/zjFlightLowThrottle[\s\S]*LOW_THROTTLE[\s\S]*zjStepRatePid/);
 assert.match(tick,/zjFlightTrace.freeze\(trace,zjTraceTerminalEvent\(fault\),fault\)/);
 const motor=readFileSync('FlightCore_Firmware/FlightCoreMotor.h','utf8');
 assert.match(motor,/ZJ_FLIGHT_HARDWARE_QUALIFIED&&lease&&zjFlightDriver.lease==lease/);
 assert.match(motor,/zjFlightDriverAtUs\)>=ZJ_FLIGHT_OUTPUT_LEASE_US\)[\s\S]*?zjFlightDriverStopLocked\(ZjFlightFault::DEADLINE_MISSED\)/);
 assert.match(readFileSync('FlightCore_Firmware/FlightCoreFlightOutput.h','utf8'),/ZJ_FLIGHT_HARDWARE_QUALIFIED=false/);
 assert.match(tick,/ulTaskNotifyTake\(pdTRUE/);assert.match(runtime,/skip_unhandled_events=true/);
 assert.match(runtime,/xSemaphoreTake\(zjI2cMutex,0\)/);
});
