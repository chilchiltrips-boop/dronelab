import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const source=readFileSync(new URL('../pairing-core.js',import.meta.url),'utf8');
function runtime(){
 let now=1000,next=0;const intervals=new Map(),timeouts=new Map(),pcs=[];
 class Clock extends Date{static now(){return now}}
 class PC{
  iceGatheringState='complete';signalingState='stable';connectionState='new';listeners=new Map();
  constructor(){pcs.push(this)}
  createDataChannel(){return this.dc={readyState:'connecting',bufferedAmount:0,sent:[],send(value){this.sent.push(JSON.parse(value))},close(){this.readyState='closed';this.onclose?.()}}}
  async createOffer(){return {type:'offer',sdp:'v=0\r\na=candidate:test'}}
  async createAnswer(){return {type:'answer',sdp:'v=0\r\na=candidate:test'}}
  async setLocalDescription(d){this.localDescription=d;this.signalingState='have-local-offer'}
  async setRemoteDescription(d){this.remoteDescription=d;this.signalingState='stable'}
  close(){this.connectionState='closed';this.onconnectionstatechange?.()}
  removeEventListener(){} addEventListener(){}
 }
 const ctx={console,Date:Clock,crypto:webcrypto,TextEncoder,TextDecoder,Blob,Response,DecompressionStream,Uint8Array,Uint32Array,btoa,atob,RTCPeerConnection:PC,setInterval:f=>{intervals.set(++next,f);return next},clearInterval:id=>intervals.delete(id),setTimeout:f=>{timeouts.set(++next,f);return next},clearTimeout:id=>timeouts.delete(id)};
 vm.runInNewContext(source,ctx);return {api:ctx.ZebjusP2P,pcs,intervals,timeouts,advance:ms=>now+=ms};
}
async function connectedHost(r){const host=r.api.session('host');await host.makeOffer();const pc=host.peer;pc.dc.readyState='open';pc.dc.onopen();host.approvePairing();assert.equal(host.grantMobileControl(),true);return {host,pc}}
test('cancel during asynchronous offer cannot recreate a discarded session',async()=>{
 const r=runtime(),host=r.api.session('host');let resolve;
 r.pcs.length=0;
 const creating=host.makeOffer();const pc=r.pcs[0];
 // createOffer resolved but setLocalDescription has not resumed.
 host.close('Cancelled');await assert.rejects(creating,/cancelled/);
 assert.equal(host.status().sessionId,null);assert.equal(host.peer,null);
});
test('heartbeat expiry closes peer and revokes pairing/controller lease',async()=>{
 const r=runtime(),{host,pc}=await connectedHost(r);
 r.advance(10000);for(const f of [...r.intervals.values()])f();
 assert.equal(host.status().controller,null);assert.equal(host.status().approved,false);assert.equal(host.status().connected,false);
 assert.equal(pc.connectionState,'closed');assert.equal(r.intervals.size,0);
});
test('temporary network loss drops ownership and never restores previous grant',async()=>{
 const r=runtime(),{host,pc}=await connectedHost(r);
 pc.connectionState='disconnected';pc.onconnectionstatechange();
 assert.equal(host.status().connected,false);assert.equal(host.status().controller,null);assert.equal(host.grantMobileControl(),false);
 pc.connectionState='connected';pc.onconnectionstatechange();
 assert.equal(host.status().connected,true);assert.equal(host.status().controller,null);
 assert.equal(host.grantMobileControl(),true); // explicit fresh grant only
});
test('old disconnect callbacks cannot close a new session',async()=>{
 const r=runtime(),{host,pc}=await connectedHost(r);const oldCallback=pc.onconnectionstatechange;
 await host.makeOffer();const current=host.peer;
 pc.connectionState='failed';oldCallback();assert.equal(host.peer,current);
 host.close();
});
test('closed channel cannot be approved or granted and send failure is contained',async()=>{
 const r=runtime(),{host,pc}=await connectedHost(r);
 pc.dc.readyState='closed';assert.equal(host.grantMobileControl(),false);assert.throws(()=>host.approvePairing(),/connection first/);
 pc.dc.readyState='open';pc.dc.send=()=>{throw Error('transport closing')};assert.doesNotThrow(()=>host.releaseControl());host.close();
});
test('fresh pairing discards old grant and rejects wrong response session',async()=>{
 const r=runtime(),{host}=await connectedHost(r);await host.makeOffer();assert.equal(host.status().controller,null);assert.equal(host.status().approved,false);
 const other=r.api.session('host'),offer=await other.makeOffer(),phone=r.api.session('mobile'),answer=await phone.makeAnswer(offer.qr);
 await assert.rejects(host.receiveAnswer(answer.qr),/does not match/);host.close();other.close();phone.close();
});

test('compressed untrusted QR is bounded while reading, before JSON allocation',async()=>{
 const r=runtime(),payload='zj1:1:'+gzipSync('x'.repeat(2_000_000)).toString('base64url');
 await assert.rejects(r.api.unpack(payload),/too large/);
});

test('authenticated simulator ACK follows application; host refuses role escalation, replay, wrong session and duplicate ownership',async()=>{
 const r=runtime(),calls=[],host=r.api.session('host',{simControl:m=>{calls.push(m);return {accepted:true,applied:{mode:m.mode,armed:m.armed,throttle:m.throttle,axes:m.axes}}}});
 await host.makeOffer();const pc=host.peer,dc=pc.dc;dc.readyState='open';dc.onopen();host.setSimulatorReady(true);
 const input=(seq,changes={})=>({v:1,type:'SIM_CONTROL',seq,sessionId:host.status().sessionId,mode:'angle',armed:false,throttle:1000,axes:{roll:0,pitch:0,yaw:0},...changes});
 const deliver=m=>dc.onmessage({data:JSON.stringify(m)});
 deliver({v:1,type:'PAIR_APPROVED'});assert.equal(host.status().approved,false);
 deliver(input(1));assert.equal(calls.length,0);assert.equal(dc.sent.at(-1).accepted,false);
 host.approvePairing();host.grantMobileControl();assert.equal(host.takeWebControl(),false);
 deliver(input(1));await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);assert.equal(dc.sent.at(-1).accepted,true);assert.equal(dc.sent.at(-1).applied.throttle,1000);
 for(const m of [input(1),input(2,{sessionId:'wrong'}),input(2,{axes:{roll:5,pitch:0,yaw:0}}),input(2,{sticks:{left:{x:1,y:1},right:{x:0,y:0}}})])deliver(m);
 deliver(null);assert.equal(calls.length,1);
 host.setSimulatorReady(false);deliver(input(2));assert.equal(calls.length,1);assert.equal(dc.sent.at(-1).accepted,false);
 host.close();
});
test('late asynchronous receiver application cannot ACK a replacement session',async()=>{
 const r=runtime();let resolve;const host=r.api.session('host',{simControl:()=>new Promise(r=>resolve=r)});
 await host.makeOffer();const old=host.peer.dc;old.readyState='open';old.onopen();host.approvePairing();host.setSimulatorReady(true);host.grantMobileControl();
 old.onmessage({data:JSON.stringify({v:1,type:'SIM_CONTROL',seq:1,sessionId:host.status().sessionId,mode:'angle',armed:false,throttle:1000,axes:{roll:0,pitch:0,yaw:0}})});
 await host.makeOffer();const dc=host.peer.dc;dc.readyState='open';dc.onopen();host.approvePairing();host.grantMobileControl();
 resolve({accepted:true,applied:{throttle:1900}});await new Promise(r=>setImmediate(r));assert.ok(!dc.sent.some(m=>m.type==='SIM_ACK'));host.close();
});
test('paired telemetry and control queues are bounded; critical STOP uses existing encrypted channel',async()=>{
 const r=runtime(),host=r.api.session('host');await host.makeOffer();const dc=host.peer.dc;dc.readyState='open';dc.onopen();assert.equal(host.sendTelemetry({throttle:1000}),false);
 host.approvePairing();assert.equal(host.sendTelemetry({throttle:1000}),true);assert.equal(dc.sent.at(-1).type,'SIM_TELEMETRY');assert.equal(dc.sent.at(-1).sessionId,host.status().sessionId);
 dc.bufferedAmount=32769;assert.equal(host.sendTelemetry({throttle:1000}),false);dc.bufferedAmount=0;host.emergencyStop('Test STOP');assert.equal(dc.sent.at(-1).type,'SIM_STOP');host.close();
});
