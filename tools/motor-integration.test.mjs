import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createMotorClient,rtcBenchFrame} from '../js/motor-setup.js';
test('production motor command handler stops on expiry, loss, ownership change and STOP',()=>{
 const dir=mkdtempSync(join(tmpdir(),'a2-integration-'));
 try{const bin=join(dir,'motor');const build=spawnSync('g++',['-std=c++17','-Itools/host-stubs','tools/motor-integration-host.cpp','-lcrypto','-o',bin],{encoding:'utf8'});assert.equal(build.status,0,build.stderr);const run=spawnSync(bin,[],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/PASS production/);}finally{rmSync(dir,{recursive:true,force:true});}
});
const kit=()=>({connected:true,kitId:'ZFC-A2-012345ABCDEF',transport:'usb',bootId:'b1',generation:1});
function harness(){let k=kit(),calls=[],tick,resolveBegin;const state={kitId:k.kitId,bootId:k.bootId,supported:true,mode:'READY'};
 const client=createMotorClient({getKit:()=>k,setTimer:fn=>(tick=fn,1),clearTimer:()=>{},request:async(_,a)=>{calls.push(a);if(a.action==='BEGIN'&&resolveBegin)return await new Promise(r=>resolveBegin(r));return {...state,session:a.action==='BEGIN'?'token':undefined};}});
 return {client,calls,change:v=>k={...k,...v},state,tick:()=>tick(),delayBegin:fn=>resolveBegin=fn};}
test('client binds Kit/boot/transport and never redirects a motor operation',async()=>{
 const h=harness();await h.client.begin();h.change({bootId:'b2'});await assert.rejects(h.client.command('SINGLE',[1,1100,800]),/changed/);assert.equal(h.calls.filter(x=>x.action==='SINGLE').length,0);
 await h.client.stop().catch(()=>{});assert.equal(h.client.active,false);
});
test('a STOP racing BEGIN invalidates the returned token and issues STOP',async()=>{
 const h=harness();let resolve;h.delayBegin(r=>resolve=r);const start=h.client.begin();await new Promise(r=>setImmediate(r));await h.client.stop();resolve({...h.state,session:'token'});await assert.rejects(start,/cancelled/);assert.equal(h.client.active,false);assert.equal(h.calls.at(-1).action,'STOP');
});
test('motor session ownership is separate from input producer and expires closed',async()=>{
 const h=harness();await h.client.begin('python');await assert.rejects(h.client.command('SINGLE',[1,1100,800],'wizard'),/your motor setup/);
 h.state.mode='DISABLED';await h.tick();assert.equal(h.client.active,false);assert.equal(h.calls.at(-1).action,'KEEP');
});
test('WebRTC bridge rejects stale, changed-peer and different-kit samples',()=>{
 const s={fresh:true,ageMs:10,peer:{connected:true,approved:true,supported:true,sessionId:'p1'},sample:{seq:5,kitId:'',aux:{ch5:1000},channels:{throttle:1000,yaw:1500}}};
 assert.deepEqual(rtcBenchFrame(s,'kit').args,[5,1000,'1500:0:10']);
 for(const next of [{...s,ageMs:201},{...s,fresh:false},{...s,sample:{...s.sample,kitId:'other'}}])assert.throws(()=>rtcBenchFrame(next,'kit'));
 assert.throws(()=>rtcBenchFrame(s,'kit','p2'));
});
