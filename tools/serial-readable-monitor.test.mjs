import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReadableKitMonitor} from '../js/serial-readable-monitor.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const telemetry=(seq=3226)=>'ZJTEL,1,A2,'+seq+',1840448,0x68,READY,-5.68,4.29,-0.27,1,2';
const rc=(seq=8)=>'ZJRC,AP,ANDROID,'+seq+',T=1000,R=1500,P=1500,Y=1645,ARM=1';

test('idle RC can coexist with active ESC calibration and motor output expires to unknown',async()=>{
 const {parseTelemetry}=await import('../js/usb-live-diagnostic.js');
 let time=0;const p=createReadableKitMonitor({now:()=>time,intervalMs:0});
 const active=telemetry()+',RC=NONE/IDLE,RCSEQ=0,T=1000,R=1500,P=1500,Y=1500,INPUT_ARMED=0,MOTORS=ACTIVE';
 assert.equal(parseTelemetry(active).rc.motorsDisabled,false);
 assert.equal(globalThis.ZebjusSerialRcDecoder.parseSerialRc(active).motorsDisabled,false);
 assert.match(p.view(active),/RC IDLE.*MOTOR OUTPUT ENABLED/);
 time=351;assert.match(p.view(telemetry()),/MOTOR OUTPUT UNKNOWN/);
});

test('A2 telemetry and joystick appear together in ONE readable line; firmware input arm is not motor arm',()=>{
 let time=0;const p=createReadableKitMonitor({now:()=>time});
 assert.equal(p.view(rc()),null,'diagnostic RC packets update display state, not add a second line');
 const display=p.view(telemetry());
 assert.match(display,/^A2 \| IMU READY \(0x68\)/);
 assert.match(display,/Gyro R=-5\.68 P=\+4\.29 Y=-0\.27 deg\/s/);
 assert.match(display,/RC AP\/ANDROID #8 \| THR=1000 ROLL=1500 PITCH=1500 YAW=1645/);
 assert.match(display,/INPUT ARMED \| MOTOR OUTPUT UNKNOWN$/);
 assert.equal(display.includes('MOTORS ON'),false);
});
test('fast sensor updates are capped at 5 Hz; serial data remains independent',()=>{
 let time=500;const p=createReadableKitMonitor({now:()=>time});
 assert.ok(p.view(telemetry(3220)));time+=50;
 assert.equal(p.view(telemetry(3221)),null);
 assert.equal(p.view(rc(2)),null);
 time+=150;assert.match(p.view(telemetry(3222)),/RC AP\/ANDROID #2/);
});
test('missing frames and failsafe cannot leave a stale ARMED or elevated throttle status',()=>{
 let time=0;const p=createReadableKitMonitor({now:()=>time,intervalMs:0});
 p.view('ZJRC,AP,ANDROID,12,T=1154,R=1500,P=1500,Y=1623,ARM=1');
 assert.match(p.view(telemetry()),/THR=1154.*INPUT ARMED/);
 time=351;
 assert.match(p.view(telemetry(3227)),/RC STALE \/ FAILSAFE \| THR=1000 ROLL=1500 PITCH=1500 YAW=1500 \| INPUT OFF \| MOTOR OUTPUT UNKNOWN/);
 assert.match(p.view('ZJRC,FAILSAFE,INPUT_TIMEOUT'),/MOTOR OUTPUT UNKNOWN/);
 assert.match(p.view(telemetry(3228)),/RC IDLE/);
});
test('USB serial monitor always exposes acknowledgments and diagnostic system events',()=>{
 const p=createReadableKitMonitor({now:()=>100,intervalMs:0});
 assert.equal(p.view('ZJTEL,ACK,RATE,20'),'ZJTEL,ACK,RATE,20');
 assert.match(p.view('ZJRC,CLAIM,AP,ANDROID'),/waiting for input/);
 assert.match(p.view('ZJRC,RELEASE,LEASE_TIMEOUT'),/input reset/);
 assert.equal(p.view('ZJNET,MODE,ap'),'ZJNET,MODE,ap');
});
test('malformed frames are not impersonated as verified gyro or diagnostic RC',()=>{
 let time=0;const p=createReadableKitMonitor({now:()=>time,intervalMs:0});
 const bad='ZJTEL,1,A2,0,0,0x68,READY,-5.68,4.29,-0.27,1,2,INJECT=1';
 assert.equal(p.view(bad),bad);
 assert.equal(p.view('ZJRC,AP,ANDROID,1,T=0,R=1500,P=1500,Y=1500,ARM=1'),null);
 assert.match(p.view(telemetry()),/RC IDLE.*MOTOR OUTPUT UNKNOWN/);
});
test('WebApp only transforms display; raw telemetry, Web Serial event, plotter, copy and offline cache retained',()=>{
 const code=read('firmware-updater.js'),html=read('index.html'),lab=read('lab.html'),sw=read('sw.js');
 assert.equal(html,lab);
 assert.match(code,/readUsbTelemetry\(line\);serialPlotter\?\.pushLine\(line\)/);
 assert.match(code,/CustomEvent\('dronelab:serial-line',\{detail:\{line,at:Date\.now\(\)\}\}/);
 assert.match(code,/lines\.map\(serialVisibleLine\)\.map\(line=>/);
 assert.match(code,/rawView=\$\('#fwSerialRawFrames'\)\?\.checked===true/);
 assert.match(code,/readableKitMonitor\?\.clear\(\)/);
 assert.match(html,/id="fwSerialRawFrames"/);
 assert.match(html,/Motor output status is reported separately by firmware/);
 assert.match(sw,/serial-readable-monitor\.js\?v=usb-rc-shared-20261017/);
 assert.match(sw,/firmware-updater\.js\?v=compile-time-verified-20261017/);
});

test('new native combined frame retains gyro and joystick values as one serial line',async()=>{
 const {parseTelemetry}=await import('../js/usb-live-diagnostic.js');
 const {parseSerialPlotLine}=await import('../js/serial-plotter.js');
 const {createGyroParser}=await import('../js/usb-i2c-bridge.js');
 const frame=telemetry(3230)+',RC=AP/ANDROID,RCSEQ=32,T=1063,R=1500,P=1500,Y=1645,INPUT_ARMED=1,MOTORS=OFF';
 const parsed=parseTelemetry(frame);
 assert.equal(parsed.board,'A2');assert.equal(parsed.rc.throttle,1063);assert.equal(parsed.rc.yaw,1645);
 assert.equal(parsed.rc.inputArmed,true);
 assert.equal(parsed.deviceDrops,2);
 const plotted=parseSerialPlotLine(frame);
 assert.equal(plotted.GyroX,-5.68);assert.equal(plotted.Throttle,1063);assert.equal(plotted.Yaw,1645);
 const p=createReadableKitMonitor({now:()=>1000});
 assert.match(p.view(frame),/RC AP\/ANDROID #32.*THR=1063.*YAW=1645.*INPUT ARMED.*MOTORS OFF/);
 const original=telemetry(3230);
 assert.ok(parseTelemetry(original),'legacy 12-column telemetry stays supported');
 assert.equal(parseSerialPlotLine(original).GyroX,-5.68);
 const gyro=createGyroParser();
 assert.ok(gyro.acceptLine(frame),'Python/gyro parsing reads the combined extended frame');
});
test('combined IDLE and malformed arm metadata cannot silently display input armed',async()=>{
 const {parseTelemetry}=await import('../js/usb-live-diagnostic.js');
 const base=telemetry(3235);
 const neutral=base+',RC=NONE/IDLE,RCSEQ=0,T=1000,R=1500,P=1500,Y=1500,INPUT_ARMED=0,MOTORS=OFF';
 const parser=createReadableKitMonitor({now:()=>500});
 assert.match(parser.view(neutral),/RC IDLE.*INPUT OFF.*MOTORS OFF/);
 assert.equal(parseTelemetry(neutral).rc.link,'NONE/IDLE');
 assert.equal(parseTelemetry(neutral.replace('INPUT_ARMED=0','INPUT_ARMED=1')),null,'idle cannot contain armed claim');
 assert.equal(parseTelemetry(neutral.replace('MOTORS=OFF','MOTORS=ON')),null,'unsafe device output is rejected');
});
test('firmware defaults to COMBINED and supports explicit RAW without weakening RC deadman or telemetry schema',()=>{
 const firmware=read('FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino');
 const rc=read('FlightCore_Firmware/FlightCoreClassroom.h');
 assert.match(rc,/bool zjTelemetryRaw=false/);
 assert.match(firmware,/ZJTEL,FORMAT,/);
 assert.match(firmware,/ACK,FORMAT,/);
 assert.match(firmware,/MOTORS=OFF/);
 assert.match(firmware,/INPUT_ARMED=/);
 assert.match(firmware,/if\(!zjTelemetryRaw\)/);
 assert.match(rc,/if\(zjTelemetryRaw&&now-zjRcLastLog/);
 assert.match(rc,/ZJ_RC_DEADMAN_MS/);
 assert.match(firmware,/Serial\.print\("ZJTEL,1,"\)/);
 assert.match(read('sw.js'),/serial-readable-monitor\.js\?v=usb-rc-shared-20261017/);
});
