import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {parseNetworkGyroTelemetry,readNetworkGyro,createGyroBridge} from '../js/usb-i2c-bridge.js';
import {parseTelemetry,formatDiagnostic} from '../js/usb-live-diagnostic.js';
import {parseSerialPlotLine} from '../js/serial-plotter.js';
import {createReadableKitMonitor} from '../js/serial-readable-monitor.js';
const base={version:1,board:'A2',enabled:true,attempt:1,state:'CALIBRATING',samples:100,target:2000,durationMs:350,startedMs:100,restarts:0,bias:[0,0,0],raw:[1.25,-2.5,0.75],corrected:[0,0,0],error:'NONE',readFailures:0,writeFailures:0,whoAmI:104,configValid:true,dataReady:false,sampleSequence:0,sampleAgeMs:null};
const ready={...base,state:'READY',samples:2000,durationMs:2500,bias:[1.25,-2.5,0.75],dataReady:true,sampleSequence:1,sampleAgeMs:20};
const kit={kitId:'PRIVATE-KIT',bootId:'PRIVATE-BOOT',connected:true,board:'ZFC-A2',transport:'sta',version:'1.5.14',connectionGeneration:1};
test('calibration never hides valid PPM RC or plots uncalibrated gyro readings',()=>{
 const frame='ZJTEL,1,A2,3,500,0x68,CALIBRATING,1.25,-2.5,0.75,1,0,RC=PPM/PPM,RCSEQ=7,T=1000,R=1500,P=1500,Y=1620,INPUT_ARMED=1,MOTORS=OFF';
 const rc=globalThis.ZebjusSerialRcDecoder.parseSerialRc(frame);
 assert.equal(rc.kind,'frame');assert.equal(rc.transport,'PPM');assert.equal(rc.yaw,1620);
 const sample=parseTelemetry(frame);assert.equal(sample.rc.link,'PPM/PPM');
 const diag=formatDiagnostic({sample,connected:true,now:600,lastAt:590});
 assert.equal(diag.state,'CALIBRATING');assert.equal(diag.error,'NONE');
 assert.match(diag.text,/roll_dps=--\|pitch_dps=--\|yaw_dps=--/);
 const monitor=createReadableKitMonitor({now:()=>600,intervalMs:0});
 assert.match(monitor.view(frame),/IMU CALIBRATING.*Gyro waiting.*RC PPM\/PPM #7.*YAW=1620/);
 const channels={Throttle:1000,Roll:1500,Pitch:1500,Yaw:1620};
 assert.deepEqual(parseSerialPlotLine(frame),channels);
 assert.equal(parseSerialPlotLine(frame.split(',').slice(0,12).join(',')),null);
 assert.deepEqual(parseSerialPlotLine(frame.replace('CALIBRATING','READY')),{GyroX:1.25,GyroY:-2.5,GyroZ:0.75,...channels});
 const failed=formatDiagnostic({sample:parseTelemetry(frame.replace('CALIBRATING','CALIBRATION_FAILED')),connected:true,now:600,lastAt:590});
 assert.equal(failed.state,'ERROR');assert.equal(failed.error,'GYRO_CALIBRATION_FAILED');
});
function diagnostics(){
 let now=10000;const storage=new Map();
 const win={addEventListener(){},ZebjusNative:null},doc={readyState:'loading',addEventListener(){},getElementById(){return null}};
 vm.runInNewContext(readFileSync('js/kit-ack-diagnostics.js','utf8'),{window:win,document:doc,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Date:class extends Date{static now(){return now}},setTimeout(){return 1},clearTimeout(){},console});
 return {d:win.ZebjusAckDiagnostics,advance:ms=>now+=ms};
}
test('calibration diagnostics record progress/result/errors, preserve fractional rates and exclude private fields',()=>{
 const {d,advance}=diagnostics();
 for(let i=0;i<2000;i++){advance(1);d.observeImu({...base,samples:i,ssid:'SECRET-SSID',session:'SECRET-TOKEN'},kit);}
 assert.ok(d.getEvents().length<10,'do not dump 2000 calibration frames into the 350-event buffer');
 d.observeImu(ready,kit);advance(2000);d.observeImu({...ready,readFailures:1,failures:1,lastFailure:'I2C_ERROR',lastFailureMs:123,lastFailureAttempt:1},kit);
 const exported=d.exportData('json');assert.doesNotMatch(exported,/PRIVATE-KIT|PRIVATE-BOOT|SECRET-SSID|SECRET-TOKEN/);
 const events=JSON.parse(exported).events;
 assert.ok(events.some(e=>e.event==='imu_progress'));
 assert.ok(events.some(e=>e.event==='imu_state'&&e.data.imuDataReady));
 assert.ok(events.some(e=>e.event==='imu_i2c_error'));
 assert.ok(events.some(e=>e.event==='imu_calibration_error'&&e.data.imuLastFailure==='I2C_ERROR'));
 assert.ok(events.some(e=>e.data.gyroBiasX===1.25&&e.data.gyroBiasY===-2.5));
 assert.equal(d.observeImu({...ready,board:'A1'},kit),null,'wrong-board observations are ignored');
 assert.equal(d.normalizeImu({...ready,samples:1999}),null,'READY must prove completed calibration');
});
test('late connection retains firmware calibration summary and bounded export samples',()=>{
 const {d,advance}=diagnostics();d.observeImu(ready,kit);
 assert.equal(d.getEvents()[0].event,'imu_summary');assert.equal(d.getEvents()[0].data.imuDurationMs,2500);
 for(let i=0;i<500;i++){advance(2000);d.observeImu({...ready,sampleSequence:i+2},kit);}
 assert.equal(d.getEvents().length,350);assert.match(d.exportData('csv'),/gyroBiasX/);
});
test('USB IMU extensions preserve canonical ZJTEL and reject cross-attempt or malformed records',()=>{
 const {d}=diagnostics();
 const meta='ZJIMU,1,A2,1,CALIBRATING,123,2000,400,0,0,0,0,NONE,0,0,104,1,0';
 const parsed=d.parseImuLine(meta);assert.equal(parsed.samples,123);assert.equal(parsed.dataReady,false);
 const sample=d.parseImuLine('ZJIMUS,1,A2,1,1.25,-2.5,0.75,0,0,0,0,-1,20000,1000,0',parsed);
 assert.equal(sample.raw[0],1.25);assert.equal(sample.bias[0],0);
 const failure=d.parseImuLine('ZJIMUE,1,A2,1,I2C_ERROR,123,1',sample);assert.equal(failure.failures,1);assert.equal(failure.lastFailure,'I2C_ERROR');
 const reboot=d.parseImuLine('ZJIMUS,1,A2,1,1,2,3,0,0,0,1,20,20000,1000,0',{...ready,sampleSequence:1000,failures:3,lastFailure:'I2C_ERROR'});assert.equal(reboot.failures,0);
 assert.equal(d.parseImuLine(meta.replace('2000','3000')),null);
 assert.equal(d.parseImuLine('ZJIMUS,1,A2,2,1,2,3,0,0,0,0,-1,0,0,0',parsed),null);
});
const telemetry=imu=>({kitId:'KIT',board:'A2',address:104,millis:1000,gyroReady:imu.dataReady,imu,roll:0.125,pitch:-0.25,yaw:0.375,sampleValid:imu.dataReady,sampleAgeMs:20});
test('Python waits through calibration, returns corrected firmware rates unchanged and preserves identity/freshness checks',async()=>{
 let calls=0;
 const result=await readNetworkGyro(async()=>telemetry(++calls===1?base:ready),'KIT',500);
 assert.equal(calls,2);assert.equal(result.RateRoll,0.125);assert.equal(result.units,'deg/s');
 await assert.rejects(readNetworkGyro(async()=>telemetry(base),'KIT',200),/GyroCalibrationTimeoutError/);
 let wrong=false;
 await assert.rejects(readNetworkGyro(async()=>{const d=telemetry(wrong?ready:base);if(wrong)d.kitId='OTHER';wrong=true;return d;},'KIT',500),/Device ID/);
 assert.throws(()=>parseNetworkGyroTelemetry({...telemetry(ready),sampleAgeMs:1001},'KIT'),/stale/);
 assert.throws(()=>parseNetworkGyroTelemetry(telemetry({...ready,samples:1999}),'KIT'),/completed gyro calibration/);
 assert.throws(()=>parseNetworkGyroTelemetry(telemetry({...ready,board:'A1'}),'KIT'),/Invalid A2/);
 let changed=false;
 await assert.rejects(readNetworkGyro(async()=>{changed=true;return telemetry(base);},'KIT',500,()=>{if(changed)throw Error('NetworkDisconnectedError: session changed');}),/session changed/);
});
test('USB Python reader waits through CALIBRATING without a false sensor failure',async()=>{
 const callbacks=new Map(),host={addEventListener:(n,f)=>callbacks.set(n,f),removeEventListener:n=>callbacks.delete(n)};
 const bridge=createGyroBridge({host});
 const send=line=>callbacks.get('dronelab:serial-line')({detail:{line}});
 send('ZJGYRO,STATUS,A2,MPU6050,0x68,CALIBRATING');
 const reading=bridge.readGyro(500);
 send('ZJTEL,1,A2,1,100,0x68,CALIBRATING,0,0,0,1,0');
 send('ZJTEL,1,A2,2,200,0x68,READY,0.12,-0.34,0.56,1,0');
 assert.equal((await reading).RatePitch,-0.34);
 send('ZJGYRO,STATUS,A2,MPU6050,0x68,CALIBRATING');
 await assert.rejects(bridge.readGyro(200),/GyroCalibrationTimeoutError/);bridge.close();
});
test('desktop Python reads 12/20-field frames and startup progress without double-calibrating',()=>{
 const code=`import runpy,sys,types\nsys.modules['serial']=types.SimpleNamespace()\nd=runpy.run_path('FlightCore_Firmware/PC_GYRO_SERIAL_EXAMPLE.py')['decode_gyro']\nraw='ZJTEL,1,A2,1,100,0x68,READY,0.12,-0.34,0.56,1,0'\nassert d(raw)['RateRoll']==0.12\nassert d(raw+',RC=NONE/IDLE,RCSEQ=0,T=1000,R=1500,P=1500,Y=1500,INPUT_ARMED=0,MOTORS=OFF')['RateYaw']==0.56\nassert d(raw.replace('0.12','NaN')) is None\nassert d('ZJIMU,1,A2,1,CALIBRATING,123,2000,400,0,0,0,0,NONE,0,0,104,1,0')['samples']==123\nassert d('ZJIMU,1,A2,1,READY,2000,2000,2500,0,1,-2,0.5,NONE,0,0,104,1,1') is None\nprint('PASS desktop gyro parser')\n`;
 const r=spawnSync('python3',['-c',code],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/PASS/);
});
