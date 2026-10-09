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
  createDataChannel(){return this.dc={readyState:'connecting',sent:[],send(value){this.sent.push(JSON.parse(value))},close(){this.readyState='closed';this.onclose?.()}}}
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
