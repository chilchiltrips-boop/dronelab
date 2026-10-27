import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import '../js/control-path-policy.js';
const policy=globalThis.ZebjusControlPaths;
test('production firmware commits mode/input together and never restores an armed controller',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zj-handover-'));
 try{
  const file=join(dir,'host'),build=spawnSync('g++',['-std=c++17','-Itools/host-stubs','tools/radio-handover-host.cpp','-lcrypto','-o',file],{encoding:'utf8'});
  assert.equal(build.status,0,build.stderr);const run=spawnSync(file,[],{encoding:'utf8'});
  assert.equal(run.status,0,run.stdout+run.stderr);assert.match(run.stdout,/PASS production coordinated handover/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('AP chooses Android; STA restores the remembered compatible input and ACK must prove the saved profile',()=>{
 const kit={staConnected:true,rcAccess:{controlPath:'AUTO'},rc:{source:'PPM'}};
 const ap=policy.radioTarget(kit,'ap');assert.deepEqual(ap,{mode:'ap',targetInput:'ANDROID_AP',lastStaInput:'PPM'});
 const sta=policy.radioTarget({apActive:true,radioHandover:{lastStaInput:'PPM'}},'sta');assert.equal(sta.targetInput,'PPM');
 const reply={radioHandover:{version:1,profileSaved:true,revision:1,state:'PREPARED',...ap},rcAccess:{version:1,pathVersion:1,controlPath:'ANDROID_AP',selection:'ANDROID',paused:true,handoverPaused:true,maintenance:{active:false,owned:false,leaseRemainingMs:0}}};
 assert.equal(policy.confirmedHandover(reply,ap),true);
 for(const change of [{profileSaved:false},{targetInput:'WEB_STA'},{state:'WAITING_CONTROLLER'},{revision:0}])assert.equal(policy.confirmedHandover({...reply,radioHandover:{...reply.radioHandover,...change}},ap),false);
});
test('fresh observer samples keep PPM stable across the slow status poll, without weakening RC expiry',()=>{
 const at=10000,kit={connected:true,transport:'sta',staConnected:true,heartbeatAt:at,rcAccess:{pathVersion:1,controlPath:'AUTO',selection:'AUTO'},rc:{active:true,inputValid:true,seq:1,source:'PPM',ageMs:25}};
 for(let t=0;t<=2200;t+=100){const observed=at+Math.floor(t/250)*250;const d=policy.describe({kit:{...kit,rcAt:observed},now:at+t});assert.equal(d.active,'PPM');assert.equal(d.selectedLabel,'Auto');assert.equal(d.telemetryLabel,'Telemetry fresh');}
 assert.equal(policy.describe({kit:{...kit,rcAt:at},now:at+500}).active,null,'a genuinely unrefreshed RC sample still expires');
});
test('PPM reacquisition with a reset sequence requires a newer boot-wide accepted counter',()=>{
 const old={source:'PPM',ownerId:'PPM',active:true,seq:16000,accepted:18000};
 assert.equal(policy.acceptRcObservation(old,{...old,seq:3,accepted:18003}),true);
 assert.equal(policy.acceptRcObservation({...old,seq:3,accepted:18003},old),false,'a delayed pre-loss high sequence cannot overwrite recovered input');
 for(const accepted of [17999,18000,undefined])assert.equal(policy.acceptRcObservation(old,{...old,seq:3,accepted}),false);
 assert.equal(policy.acceptRcObservation({...old,accepted:0xffffffff},{...old,seq:3,accepted:2}),true);
 assert.equal(policy.acceptRcObservation({...old,source:'WEB'},{...old,source:'WEB',seq:3,accepted:18003}),false);
});
