import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../js/control-path-policy.js';
import '../js/kit-access-policy.js';
import {normalizeAcceptedInput} from '../js/live-inputs.js';
const policy=globalThis.ZebjusControlPaths;
const access={version:1,pathVersion:1,controlPath:'PPM',selection:'PPM',paused:false,stationary:true,maintenance:{active:false,owned:false,leaseRemainingMs:0}};
const rc={kitId:'A2',claimed:true,active:true,inputValid:true,failsafe:false,source:'PPM',seq:1,ageMs:0,inputArmed:false,throttle:1000,roll:1500,pitch:1500,yaw:1500};
const kit={connected:true,rcAt:Date.now(),heartbeatAt:Date.now(),kitId:'A2',transport:'sta',physicalLink:'sta',staConnected:true,controlAuthorized:true,rcAccess:access,rc,ppm:{present:true}};
test('four-path availability distinguishes AP/STA, target, pairing and authorization',()=>{
 const sta=policy.describe({kit,peer:{connected:true,approved:true}});
 assert.deepEqual(sta.paths.filter(p=>p.selectable).map(p=>p.id),['ANDROID_WEBRTC','PPM','WEB_STA']);
 const ap=policy.describe({kit:{...kit,staConnected:false,apActive:true,transport:'ap',physicalLink:'ap'}});
 assert.deepEqual(ap.paths.filter(p=>p.selectable).map(p=>p.id),['ANDROID_AP','PPM']);
 assert.equal(sta.active,'PPM');assert.equal(sta.joystickLocked,true);
 assert.equal(policy.describe({kit,peer:{connected:true,approved:false}}).paths[1].selectable,false);
 assert.equal(policy.describe({kit:{...kit,controlAuthorized:false}}).paths.some(p=>p.selectable),false);
 assert.equal(policy.describe({kit:{...kit,rcAccess:{...access,controlPath:'AUTO',selection:'AUTO'}}}).capable,true);
});
test('selection is not activation; WebRTC activity cannot imply physical Kit input',()=>{
 const selected={...kit,rcAccess:{...access,selection:'ANDROID',controlPath:'ANDROID_WEBRTC'},rc:{...rc,claimed:false,active:false,source:'NONE'}};
 const idle=policy.describe({kit:selected,peer:{connected:true,paired:true}});
 assert.equal(idle.selected,'ANDROID_WEBRTC');assert.equal(idle.active,null);assert.equal(idle.target,'Simulator');
 assert.equal(policy.describe({kit:selected,virtual:{running:true,origin:'webrtc',fresh:true}}).active,'ANDROID_WEBRTC');
 assert.equal(policy.describe({kit:selected,virtual:{running:true,origin:'webrtc',fresh:false}}).active,null);
});
test('one read delay retains connection health; authentication and expired heartbeat fail closed',()=>{
 assert.equal(policy.failureState({error:Error('timeout'),heartbeatAt:1000,now:2000}).state,'delayed');
 assert.equal(policy.failureState({error:Error('timeout'),heartbeatAt:1000,now:9000}).state,'stale');
 for(const error of [Object.assign(Error('denied'),{status:403}),Error('Device ID mismatch'),Error('Invalid signature')]){
  const r=policy.failureState({error,heartbeatAt:1000,now:2000});assert.equal(r.fatal,true);assert.equal(r.state,'stale');
 }
});
test('fresh idle telemetry never becomes stale merely because no RC sequence advances',()=>{
 const sample={kitId:kit.kitId,at:10000,sequenceAt:9000,rc:{...rc,source:'NONE',active:false,inputValid:false,seq:0}};
 assert.equal(normalizeAcceptedInput(kit,sample,{now:10000}).state,'idle');
 assert.equal(normalizeAcceptedInput(kit,{...sample,rc},{now:10000}).state,'stale');
 assert.equal(normalizeAcceptedInput(kit,{...sample,historicalOnly:true,rc},{now:10000}).state,'stale');
});
test('Overview rejects a late telemetry response from the previous Device ID, boot or connection',async()=>{
 const source=readFileSync(new URL('../js/firmware-connect.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function sampleHealth(){'),source.indexOf('function init(){'));
 for(const change of [{kitId:'A1'},{bootId:'new-boot'},{connectionGeneration:2}]){
  let current={...kit,bootId:'boot',connectionGeneration:1};let resolve;
  const request=new Promise(r=>{resolve=r});
  const context=vm.createContext({Date,state:()=>current,kit:()=>({request:()=>request}),root:{ZebjusControlPaths:policy,ZebjusDevicesWorkspace:{active:()=> 'overview'}},$:id=>id==='tab-firmware'?{classList:{contains:()=>true}}:null,line:()=>{}});
  vm.runInContext('let telemetry=null,telemetryBinding=null,telemetryTime=0,healthAt=0;'+fn,context);
  const pending=vm.runInContext('sampleHealth()',context);current={...current,...change};resolve({kitId:kit.kitId,gyroReady:true});await pending;
  assert.equal(vm.runInContext('telemetry',context),null);
 }
});

test('cached, unknown-age or invalid RC cannot be advertised active by the shared header',()=>{
 const now=kit.rcAt;
 assert.equal(policy.describe({kit,now}).active,'PPM');
 for(const changed of [{rcAt:now-1000},{rc:{...rc,ageMs:null}},{rc:{...rc,ageMs:-1}},{rc:{...rc,seq:0}},{connected:false}])
  assert.equal(policy.describe({kit:{...kit,...changed},now}).active,null);
 const usb={...kit,transport:'usb',adminUnlocked:false};
 assert.equal(policy.describe({kit:usb,now}).paths.some(p=>p.selectable),false);
 assert.match(policy.describe({kit:usb,now}).paths[2].reason,/Unlock teacher/);
});
