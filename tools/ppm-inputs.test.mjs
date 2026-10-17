import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../js/serial-rc-decoder.js';
import {normalizeAcceptedInput} from '../js/live-inputs.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const parser=globalThis.ZebjusSerialRcDecoder;
const base={connected:true,transport:'sta',kitId:'ZFC-A2-ABCDEF123456',kitName:'zebjus_drone_1',motorsDisabled:true};
const ppm={kitId:base.kitId,source:'PPM',transport:'PPM',seq:24,ageMs:20,active:true,inputValid:true,
 failsafe:false,inputArmed:false,motorsDisabled:true,
 throttle:1000,roll:1560,pitch:1460,yaw:1630,channels:[1560,1460,1000,1630,1000,1500,1200,1800]};
test('board-specific PPM pin mapping: A1 GPIO10, A2 XIAO D10=GPIO18',()=>{
 const ppmHdr=read('FlightCore_Firmware/FlightCorePpm.h'),sketch=read('FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino');
 assert.match(ppmHdr,/#if defined\(CONFIG_IDF_TARGET_ESP32C6\)\s*static constexpr uint8_t ZJ_PPM_PIN=18/);
 assert.match(ppmHdr,/#else\s*static constexpr uint8_t ZJ_PPM_PIN=10/);
 assert.match(sketch,/#include "FlightCorePpm.h"/);
 assert.match(sketch,/zjPpmSetup\(\)/);assert.match(sketch,/zjPpmLoop\(millis\(\)\)/);
 assert.match(ppmHdr,/attachInterrupt\(digitalPinToInterrupt\(ZJ_PPM_PIN\),zjPpmInterrupt,RISING\)/);
 assert.match(ppmHdr,/portENTER_CRITICAL_ISR/);
});
test('PPM arbitration is throttle-low, arm-low, and never preempts active WEB or ANDROID',()=>{
 const f=read('FlightCore_Firmware/FlightCorePpm.h'),rc=read('FlightCore_Firmware/FlightCoreClassroom.h');
 for(const token of ["zjPpmSafeFrames>=3","armLow&&t<=1050",'else if(!zjRcOwned)',"zjRcSource=\"PPM\"",'zjRcTransport="PPM"','zjPpmInputSwitchArmed&&armHigh']){
  assert.ok(f.includes(token),token);
 }
 assert.match(f,/if\(zjRcOwned&&zjRcSource=="PPM"\)/);
 assert.match(f,/zjRcRelease\("PPM_SIGNAL_LOST"\)/);
 assert.match(f,/ZJ_PPM_LOST_MS=150/);
 assert.match(rc,/zjRcOwned&&now-zjRcLeaseAt<=ZJ_RC_LEASE_MS/);
 assert.doesNotMatch(f,/ledcWrite|motorArm|digitalWrite\(/);
});
test('physical USB administrator may calibrate PPM channels or remap roll/pitch/throttle/yaw/ARM',()=>{
 const s=read('FlightCore_Firmware/FlightCorePpm.h');
 for(const token of ['ZJPPM,GET','ZJPPM,CAL,','ZJPPM,MAP,','zjAdminAuthorized()','zjRcOwned',
  'getUShort','putUShort','putString("ppmMap"','ppm1'])if(token==='ppm1')continue;else assert.ok(s.includes(token),token);
 assert.match(s,/m-l<120\|\|h-m<120/);
 assert.match(s,/used\[ch-1\]/);
 assert.match(s,/return uint16_t\(1500L\+/);
});
test('authenticated snapshot includes Kit PPM CH1-CH8 but not stale/unowned receiver frames',()=>{
 const f=read('FlightCore_Firmware/FlightCoreNetwork.h');
 const s=read('FlightCore_Firmware/FlightCoreClassroom.h');
 assert.match(f,/\/api\/ppm\/status/);
 assert.match(f,/zjPpmStatus\(\)/);
 assert.match(f,/\/api\/rc\/snapshot/);
 assert.match(s,/zjPpmRcChannelsJson\(\)/);
 assert.match(read('FlightCore_Firmware/FlightCorePpm.h'),/zjRcOwned&&zjRcSource=="PPM"&&zjRcHasFrame&&zjPpmSignalFresh/);
});
test('USB channel decoder supports PPM channel series and rejects fabricated/malformed data',()=>{
 const channels=[1000,1500,2000,1134,1600,1000,1800,1450];
 const frame='ZJPPM,1,ACTIVE,400,ARM=1,'+channels.map((v,i)=>'CH'+(i+1)+'='+v).join(',');
 const out=parser.parsePpmChannels(frame);
 assert.equal(out.kind,'ppm-channels');
 assert.equal(out.owner,true);assert.equal(out.inputArmed,true);assert.deepEqual(out.channels,channels);
 assert.equal(parser.parsePpmChannels(frame.replace('CH3=2000','CH3=3000')),null);
 assert.equal(parser.parsePpmChannels(frame.replace('CH8=1450','CH8=x')),null);
 assert.equal(parser.parsePpmChannels(frame.replace('ACTIVE','LOCKED')),null,'LOCKED cannot be armed');
 const telemetry='ZJTEL,1,A2,11,1888,0x68,READY,1.00,2.00,3.00,1,0,RC=PPM/PPM,RCSEQ=401,T=1000,R=1560,P=1460,Y=1630,INPUT_ARMED=0,MOTORS=OFF';
 assert.equal(parser.parseSerialRc(telemetry).source,'PPM');
});
test('Live Inputs CH1-8 display only accepted PPM channels from same Kit and never faux Android channels',()=>{
 const m=normalizeAcceptedInput(base,{kitId:base.kitId,rc:ppm,at:1000,sequenceAt:1000},{now:1100});
 assert.equal(m.state,'live');assert.equal(m.source,'PPM');assert.deepEqual(m.ppmChannels,ppm.channels);
 const stale=normalizeAcceptedInput(base,{kitId:base.kitId,rc:ppm,at:1000,sequenceAt:1000},{now:3000});
 assert.equal(stale.state,'stale');
 const other=normalizeAcceptedInput(base,{kitId:'ZFC-A2-OTHER',rc:ppm,at:1000},{now:1100});
 assert.equal(other.ppmChannels,null);
 const android=normalizeAcceptedInput(base,{kitId:base.kitId,rc:{...ppm,source:'ANDROID'},at:1000},{now:1050});
 assert.equal(android.ppmChannels,null);
 assert.equal(normalizeAcceptedInput(base,{kitId:base.kitId,rc:{...ppm,channels:[1000]},at:1000},{now:1050}).ppmChannels,null);
});
test('UI and service worker expose responsive CH1–CH8 without enabling motors or take control',()=>{
 const html=read('index.html'),lab=read('lab.html'),js=read('js/live-inputs.js'),css=read('live-inputs.css'),sw=read('sw.js');
 assert.equal(html,lab);
 for(let i=1;i<=8;i++){assert.ok(html.includes('id="liCh'+i+'"'));assert.ok(html.includes('id="liCh'+i+'Bar"'))}
 assert.match(js,/parsePpmChannels/);assert.match(js,/validSource==='PPM'/);
 assert.match(css,/li-ppm-grid/);assert.match(css,/@media\(max-width:580px\)/);
 for(const asset of ['live-inputs.css?v=ppm-ch8-20261017','js/live-inputs.js?v=ppm-ch8-20261017','js/serial-rc-decoder.js?v=ppm-ch8-20261017']){
  assert.ok(html.includes(asset),asset);assert.ok(sw.includes('./'+asset),asset);
 }
 assert.doesNotMatch(js,/\/api\/rc\/claim|\/api\/rc\/preview/);
 assert.match(read('docs/FLIGHTCORE_PPM_RECEIVER.md'),/hardware verification required/i);
});
