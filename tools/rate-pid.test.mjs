import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {RATE_DEFAULTS,stepRatePid} from '../js/rate-pid.js';
import {createPidClient,encodeRateGains,PID_CHANGED} from '../js/flightcore-pid-client.js';
import {validateEvidence,requiredIds} from './release-acceptance.mjs';

test('C++ PID storage, scheduler fault and Quad X tests, with shared JS/C++ gain vectors',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zj-rate-'));
 try{
  const bin=join(dir,'host');
  execFileSync('g++',['-std=c++17','-Itools/host-stubs','tools/rate-pid-host.cpp','-o',bin],{timeout:60000});
  const results=execFileSync(bin,{encoding:'utf8',timeout:5000}).trim().split('\n').map(line=>line.split(' ').map(Number));
  const vectors=[[20,0,.004,0],[20,2,.004,0],[-20,2,.005,0],[-20,-2,.004,-5],[500,0,.004,0],[0,0,.120629,0],[-15,0,.004,0]];
  let state={sum:0,derivative:0,ready:false};
  for(const [n,v] of vectors.entries()){
   const r=stepRatePid(state,RATE_DEFAULTS.rateRoll,...v),c=results[n];
   assert.equal(!!r,!!c[0]);
   if(!r){state={sum:0,derivative:0,ready:false};continue;}
   for(const [i,value] of [r.output,r.i,r.d].entries())assert.ok(Math.abs(value-c[i+1])<.001);
   assert.equal(r.saturated,!!c[4]);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('PID save verifies Kit, boot, exact gain readback and lost ACK without retrying',async()=>{
 let kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',bootId:'a'.repeat(32),board:'ZFC-A2',transport:'sta',
  controlAuthorized:true,motorsArmed:false,motorsDisabled:true,connectionGeneration:1};
 let config={...structuredClone(RATE_DEFAULTS),version:1,schemaVersion:1,supported:true,persisted:false,kitId:kit.kitId,bootId:kit.bootId,revision:0};
 let writes=0,lostAck=true,events=0;
 const target=new EventTarget();target.addEventListener(PID_CHANGED,()=>events++);
 const client=createPidClient({getState:()=>kit,async pidExchange(binding,action,args){
  assert.equal(binding.kitId,kit.kitId);
  if(action==='GET')return config;
  writes++;
  const axis=action==='RESET'?RATE_DEFAULTS.rateRoll:{p:1.725,i:18,d:.035};
  assert.equal(args.expectedRevision,config.revision);
  if(action==='SET')assert.equal(args.gains,encodeRateGains({...RATE_DEFAULTS,rateRoll:axis}));
  config={...config,rateRoll:axis,revision:config.revision+1,persisted:true,savedRequestId:args.requestId,requestId:args.requestId};
  if(lostAck)throw Error('timeout');
  return config;
 }},target);
 assert.equal((await client.read()).revision,0);
 const values={...RATE_DEFAULTS,rateRoll:{...RATE_DEFAULTS.rateRoll,p:1.725}};
 assert.equal((await client.save(values,0)).revision,1);
 assert.equal(writes,1);assert.equal(events,1);
 await assert.rejects(client.save(values,0),/revision or boot changed/);
 kit={...kit,controlAuthorized:false};
 await assert.rejects(client.save(values,1),/authorize/);
 kit={...kit,controlAuthorized:true,motorsArmed:true};
 await assert.rejects(client.save(values,1),/Disarm/);
 kit={...kit,motorsArmed:false};lostAck=false;
 assert.equal((await client.reset()).revision,2);
 assert.equal(writes,2);
 await assert.rejects(client.save({...values,rateRoll:{p:NaN,i:1,d:1}},2),/nine Rate gains/);
 kit={...kit,bootId:'b'.repeat(32)};
 await assert.rejects(client.read(),/identity/);
});

test('reconnect rejects queued operations and aborts only the in-flight read',async()=>{
 const context={AbortController,Error};
 vm.runInNewContext(readFileSync('js/kit-data-interface.js','utf8'),context);
 let time=0,aborted=false;
 const q=context.ZebjusKitData.createRequestScheduler({now:()=>time,limit:2});
 const slow=q.schedule('kit',signal=>new Promise((_,reject)=>{
  signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason)},{once:true});
 }),{generation:1,read:true});
 const stale=q.schedule('kit',()=>assert.fail('old write replayed'),{generation:1});
 const a=assert.rejects(slow,{code:'REQUEST_QUEUE_STALE'}),b=assert.rejects(stale,{code:'REQUEST_QUEUE_STALE'});
 await Promise.resolve();q.retire(2);await Promise.all([a,b]);assert.ok(aborted);
 assert.equal(await q.schedule('kit',()=>7,{generation:2,maxQueueMs:1}),7);
 assert.equal(q.metrics().cancelledStaleRequests,2);
});

test('strict acceptance binds the release commit, firmware APP hashes and evidence digests',()=>{
 const release={sourceCommit:'a'.repeat(40),version:'fixture',artifacts:{A1:'b'.repeat(64),A2:'c'.repeat(64)}};
 const report={schema:1,sourceCommit:release.sourceCommit,cases:requiredIds.map(id=>({
  id,status:'PASS',observedAt:'2026-01-01T00:00:00Z',operator:'fixture',deviceId:'fixture',firmwareVersion:release.version,
  evidenceRef:'fixture.md',evidenceSha256:'e'.repeat(64),artifactSha256:release.artifacts[id.slice(0,2)],notes:'synthetic unit test'
 }))};
 const valid={strict:true,release,verifyEvidence:(_path,hash)=>hash==='e'.repeat(64)};
 assert.ok(validateEvidence(report,valid).passed);
 for(const sourceCommit of ['0'.repeat(40),'d'.repeat(40)])assert.equal(validateEvidence({...report,sourceCommit},valid).passed,false);
 assert.equal(validateEvidence(report,{...valid,verifyEvidence:()=>false}).passed,false);
 report.cases.find(row=>row.id==='A2_RATE_PID_SETTINGS').artifactSha256=release.artifacts.A1;
 assert.equal(validateEvidence(report,valid).passed,false);
});
