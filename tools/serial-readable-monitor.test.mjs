import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReadableKitMonitor} from '../js/serial-readable-monitor.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const telemetry=(seq=3226)=>'ZJTEL,1,A2,'+seq+',1840448,0x68,READY,-5.68,4.29,-0.27,1,2';
const rc=(seq=8)=>'ZJRC,AP,ANDROID,'+seq+',T=1000,R=1500,P=1500,Y=1645,ARM=1';

test('A2 telemetry and joystick appear together in ONE readable line; firmware input arm is not motor arm',()=>{
 let time=0;const p=createReadableKitMonitor({now:()=>time});
 assert.equal(p.view(rc()),null,'diagnostic RC packets update display state, not add a second line');
 const display=p.view(telemetry());
 assert.match(display,/^A2 \| IMU READY \(0x68\)/);
 assert.match(display,/Gyro R=-5\.68 P=\+4\.29 Y=-0\.27 deg\/s/);
 assert.match(display,/RC AP\/ANDROID #8 \| THR=1000 ROLL=1500 PITCH=1500 YAW=1645/);
 assert.match(display,/INPUT ARMED \| MOTORS OFF$/);
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
 assert.match(p.view(telemetry(3227)),/RC STALE \/ FAILSAFE \| THR=1000 ROLL=1500 PITCH=1500 YAW=1500 \| INPUT OFF \| MOTORS OFF/);
 assert.match(p.view('ZJRC,FAILSAFE,INPUT_TIMEOUT'),/MOTORS OFF/);
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
 assert.match(p.view(telemetry()),/RC IDLE.*MOTORS OFF/);
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
 assert.match(html,/MOTORS remain OFF|physical motors remain OFF/);
 assert.match(sw,/serial-readable-monitor\.js\?v=readable-20261017/);
 assert.match(sw,/firmware-updater\.js\?v=usb-readable-20261017/);
});
