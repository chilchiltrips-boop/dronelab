import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeAcceptedInput,createInputRateTracker} from '../js/live-inputs.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const kit={connected:true,kitId:'ZFC-A2-ABCDEF123456',kitName:'zebjus_drone_1',transport:'sta',
 ledOn:true,motorsDisabled:true,motorsArmed:false};
const rc=(source='ANDROID',seq=88)=>({kitId:kit.kitId,source,transport:'STA',seq,active:true,inputValid:true,failsafe:false,
 throttle:1250,roll:1535,pitch:1450,yaw:1720,inputArmed:true,accepted:80,rejected:2,ageMs:25,motorsArmed:false,motorsDisabled:true});
const snap=(source='ANDROID',time=1000)=>({kitId:kit.kitId,at:time,rc:rc(source),motorsOff:true,ledOn:true,rateHz:19.8});

test('calibration and single-motor output remain enabled while input ARM is false',()=>{
 const report={...snap(),rc:{...rc(),inputArmed:false,motorsArmed:false,motorsDisabled:false}};
 assert.equal(normalizeAcceptedInput(kit,report,{now:1100}).motors,'ENABLED');
 assert.equal(normalizeAcceptedInput({...kit,motorsDisabled:null},null,{now:1100}).motors,'NOT REPORTED');
});

test('Android accepted RC renders exact kit channels, LINK, packet age and diagnostic safety',()=>{
 const m=normalizeAcceptedInput(kit,snap(),{now:1100});
 assert.equal(m.state,'live');assert.equal(m.source,'ANDROID');assert.equal(m.transport,'STA');
 assert.deepEqual(m.values,{throttle:1250,roll:1535,pitch:1450,yaw:1720});
 assert.equal(m.ageMs,125);assert.equal(m.rateHz,19.8);assert.equal(m.seq,88);
 assert.equal(m.inputArm,'ARMED');assert.equal(m.led,'ON');assert.equal(m.motors,'DISABLED');
 assert.equal(m.accepted,80);assert.equal(m.rejected,2);
});
test('WEB and future PPM are display-only, never synthetic accepted control',()=>{
 for(const source of ['WEB','PPM'])assert.equal(normalizeAcceptedInput(kit,snap(source),{now:1000}).source,source);
 const awaiting=normalizeAcceptedInput(kit,null,{now:1000});
 assert.equal(awaiting.state,'waiting');assert.equal(awaiting.values,null);
 const unsupported=normalizeAcceptedInput(kit,{...snap(),rc:rc('FAKE')},{now:1100});
 assert.equal(unsupported.source,'NONE');assert.equal(unsupported.state,'idle');
});
test('snapshot from a different physical Kit is rejected; disconnect wipes channels',()=>{
 const foreign=normalizeAcceptedInput(kit,{...snap(),kitId:'ZFC-A2-000000000000'},{now:1000});
 assert.equal(foreign.state,'waiting');assert.equal(foreign.values,null);
 const disconnected=normalizeAcceptedInput({...kit,connected:false},snap(),{now:1100});
 assert.equal(disconnected.state,'offline');assert.equal(disconnected.values,null);
 assert.equal(disconnected.led,'NOT REPORTED');assert.equal(disconnected.motors,'NOT REPORTED');
});
test('timed-out snapshots are STALE, never LIVE; failsafe neutral reports IDLE',()=>{
 const stale=normalizeAcceptedInput(kit,snap(),{now:4000});
 assert.equal(stale.state,'stale');assert.equal(stale.source,'ANDROID');
 const idleRc={...rc(),active:false,inputValid:false,seq:0,throttle:1000,roll:1500,pitch:1500,yaw:1500,inputArmed:false};
 const idle=normalizeAcceptedInput(kit,{...snap(),rc:idleRc},{now:1200});
 assert.equal(idle.state,'idle');assert.equal(idle.inputArm,'DISARMED');assert.equal(idle.values.throttle,1000);
});
test('out-of-range and missing pulse values never display as kit-accepted inputs',()=>{
 for(const bad of [0,999,2001,NaN,null,'1500']){
  const m=normalizeAcceptedInput(kit,{...snap(),rc:{...rc(),yaw:bad}},{now:1010});
  assert.equal(m.state,'waiting',String(bad));assert.equal(m.values,null);
 }
});
test('USB uses verified status extensions for LED/motor state and preserves unknown legacy status',()=>{
 const usb={...kit,transport:'usb',ledOn:true,motorsDisabled:true,motorsArmed:false};
 const m=normalizeAcceptedInput(usb,{...snap('WEB'),rc:{...rc('WEB'),transport:'USB'},motorsOff:true},{now:1100});
 assert.equal(m.state,'live');assert.equal(m.transport,'USB');assert.equal(m.led,'ON');assert.equal(m.motors,'DISABLED');
 const raw=normalizeAcceptedInput({...usb,ledOn:undefined,motorsDisabled:null,motorsArmed:undefined},{...snap('WEB'),rc:{...rc('WEB'),motorsDisabled:undefined},motorsOff:undefined},{now:1100});
 assert.equal(raw.motors,'NOT REPORTED','legacy RAW USB does not report physical motor state');
});
test('a current HTTP reply cannot resurrect a stale firmware RC packet or frozen sequence',()=>{
 const staleHardware=normalizeAcceptedInput(kit,{...snap(),rc:{...rc(),ageMs:950}},{now:1000});
 assert.equal(staleHardware.state,'stale');
 assert.equal(staleHardware.inputArm,'STALE');
 assert.equal(staleHardware.rateHz,null);
 const seqFrozen=normalizeAcceptedInput(kit,{...snap(),sequenceAt:10},{now:1000});
 assert.equal(seqFrozen.state,'stale');
 assert.equal(seqFrozen.inputArm,'STALE');
 const resumed=normalizeAcceptedInput(kit,{...snap(),sequenceAt:1000},{now:1000});
 assert.equal(resumed.state,'live');
 const linkDown=normalizeAcceptedInput({...kit,connected:false,linkState:'stale'},snap(),{now:1000});
 assert.equal(linkDown.state,'offline');
 assert.equal(linkDown.values,null);
});
test('visible polling is 5-10Hz capped, single-flight, and exponential backoff on failures',()=>{
 const js=read('js/live-inputs.js');
 const period=Number(/NETWORK_POLL_MS=(\d+)/.exec(js)?.[1]);
 assert.ok(period>=100&&period<=200,'fast monitor poll cap expected 5-10Hz');
 assert.match(js,/!inFlight&&Date\.now\(\)>=nextPollAt/);
 assert.match(js,/current\.physicalLink!==physicalLink/);
 assert.match(js,/token!==requestGeneration/);
 assert.match(js,/Math\.min\(MAX_RETRY_BACKOFF_MS,NETWORK_POLL_MS\*2\*\*readFailures\)/);
 assert.doesNotMatch(js,/if\(document\.hidden\)wipe\(\)/);
 assert.match(js,/\+\+requestGeneration;nextPollAt=0;readFailures=0;rate\.reset\(\);display\(\)/);
 assert.match(js,/sequenceAt:seqChanged\?at:prev\.sequenceAt\?\?prev\.at/);
 assert.doesNotMatch(js,/\/api\/rc\/claim|\/api\/rc\/preview/);
});
test('monitor can display accepted RC from a newer verified status without claiming input',()=>{
 const display=read('js/live-inputs.js'),kits=read('js/classroom-kits.js');
 assert.match(display,/function reuseVerifiedStatus\(kit\)/);
 assert.match(display,/rc\.kitId!==kit\.kitId/);
 assert.match(display,/now-at>SNAPSHOT_TTL_MS/);
 assert.match(display,/at<=Number\(sample\?\.at\|\|0\)/);
 assert.match(kits,/state\.rcObservedAt=Date\.now\(\)/);
 assert.match(kits,/rcAt:state\.transport==='usb'\|\|state\.owner\?state\.ackAt:state\.rcObservedAt/);
 assert.doesNotMatch(display,/\/api\/rc\/claim|\/api\/rc\/preview/);
});
test('packet-rate tracker uses accepted counters and ignores polling without new accepted RC frames',()=>{
 const tracker=createInputRateTracker();const a=rc();
 assert.equal(tracker.observe(kit.kitId,a,1000),null);
 assert.equal(tracker.observe(kit.kitId,{...a,seq:108,accepted:100},2000),20);
 assert.equal(tracker.observe(kit.kitId,{...a,seq:108,accepted:100},2300),20);
 assert.equal(tracker.observe(kit.kitId,{...a,active:false},2400),null);
 assert.equal(tracker.observe(kit.kitId,{...a,seq:1,accepted:101,source:'WEB'},3000),null);
});
test('Live Inputs is a standalone workspace, read-only, responsive and reachable in Wix offline shell',()=>{
 const html=read('index.html'),lab=read('lab.html'),workspace=read('js/devices-workspace.js'),
  script=read('js/live-inputs.js'),style=read('live-inputs.css'),sw=read('sw.js');
 assert.equal(html,lab);
 for(const id of ['fwLiveInputs','liKitName','liInputSource','liKitTransport','liLiveState',
  'liLeftDot','liRightDot','liThrottle','liRoll','liPitch','liYaw','liRate','liAge','liCounts',
  'liInputArm','liLed','liMotors','liHelp'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(workspace.includes("relocate('.fw-live-inputs-card','inputs')"));
 assert.ok(workspace.includes("relocate('#kitAckDiagnostics','diagnostics')"));
 assert.match(script,/request\('\/api\/rc\/snapshot'\)/);
 assert.match(script,/reply\?\.kitId!==id/);
 assert.match(script,/ZebjusSerialRcDecoder/);
 assert.doesNotMatch(script,/\.claim\(|\.sendFrame\(|\/api\/rc\/preview|\.toggleControl\(/);
 assert.match(style,/@media\(max-width:580px\)/);
 for(const asset of ['live-inputs.css?v=ppm-ch8-20261017','js/live-inputs.js?v=ppm-ch8-20261017']){
  assert.ok(html.includes(asset),asset+' HTML');assert.ok(sw.includes('./'+asset),asset+' offline');
 }
 assert.match(html,/INPUT ARM is diagnostic only/);
});
