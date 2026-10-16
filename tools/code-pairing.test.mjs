import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');

function peerSimulator(delayMs=0){
 const peers=new Map();let generated=0;
 class Channel{
  listeners=new Map();other=null;closed=false;
  on(n,handler){let l=this.listeners.get(n)||[];l.push(handler);this.listeners.set(n,l);return this}
  emit(n,value){for(const cb of this.listeners.get(n)||[])cb(value)}
  send(msg){if(!this.closed&&!this.other.closed)queueMicrotask(()=>this.other.emit('data',structuredClone(msg)))}
  close(){if(this.closed)return;this.closed=true;queueMicrotask(()=>this.emit('close'))}
 }
 return class Peer{
  listeners=new Map();destroyed=false;
  constructor(id,config){this.id=id||'test-peer-'+(++generated);this.config=config;if(peers.has(this.id)){queueMicrotask(()=>this.emit('error',{type:'unavailable-id'}))}else{peers.set(this.id,this);queueMicrotask(()=>this.emit('open',this.id))}}
  on(n,cb){const l=this.listeners.get(n)||[];l.push(cb);this.listeners.set(n,l);return this}
  emit(n,v){for(const cb of this.listeners.get(n)||[])cb(v)}
  connect(id){const p=peers.get(id),local=new Channel(),remote=new Channel();local.other=remote;remote.other=local;
   if(!p){queueMicrotask(()=>this.emit('error',{type:'peer-unavailable',message:'Peer not registered'}));return local}
   queueMicrotask(()=>{p.emit('connection',remote);setTimeout(()=>{remote.emit('open');local.emit('open')},delayMs)});
   return local;
  }
  destroy(){this.destroyed=true;peers.delete(this.id)}
 };
}
function createRuntime(delayMs=0){
 const context={crypto:webcrypto,TextEncoder,Uint8Array,console,setTimeout,clearTimeout,Peer:peerSimulator(delayMs),URL};
 context.globalThis=context;vm.runInNewContext(read('pairing-code.js'),context,{filename:'pairing-code.js'});return context.ZebjusCodePair;
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('6-digit code advertises only answer, authenticates via Web QR secret and expires',async()=>{
 const app=createRuntime();
 const offer='zj1:1:AAAA'+'a'.repeat(300),answer='zj1:1:BBBB'+'b'.repeat(300),sid='0123456789abcdef01234567';
 let code='',status='';
 const phone=app.beginPhone({offer,answer,expires:Date.now()+120000,onCode:v=>code=v,onStatus:v=>status=v});
 try{
  await phone.start();await wait(20);
  assert.match(code,/^[1-9]\d{5}$/);
  assert.match(status,/Code ready|code ready/i);
  assert.equal(app.validCode(code),true);
  const result=await app.resolveAnswer({offer,code,sid,expires:Date.now()+120000});
  assert.equal(result,answer);
  assert.notEqual(await app.digest(offer,code),await app.digest(offer+'modified',code));
  await assert.rejects(app.resolveAnswer({offer,code:'000000',sid,expires:Date.now()+120000}),/six-digit/);
  await assert.rejects(app.resolveAnswer({offer,code,sid,expires:Date.now()-1}),/expired/);
  console.log('PASS authenticated six-digit code -> WebRTC answer, expired code and invalid code rejected');
 }finally{phone.stop()}
});
test('College network ICE negotiation > 6 seconds does not prematurely close Android answer',async()=>{
 const app=createRuntime(6700);
 const offer='zj1:1:'+('A'.repeat(400)),answer='zj1:1:'+('B'.repeat(450)),sid='0123456789abcdef01234567';
 let current='',status='';
 const phone=app.beginPhone({offer,answer,expires:Date.now()+90000,onCode:c=>current=c,onStatus:m=>status=m});
 try{
  await phone.start();await wait(50);
  assert.match(current,/^[1-9]\d{5}$/);
  const received=await app.resolveAnswer({offer,code:current,sid,expires:Date.now()+90000});
  assert.equal(received,answer);
  assert.ok(/answer sent securely|Android/i.test(status),status);
  console.log('PASS slow PeerJS ICE > 6s reaches answer without premature auth-timeout');
 }finally{phone.stop()}
},{timeout:15000});

test('both QR pairing and code pairing scripts and UI remain available',()=>{
 const web=read('pairing-web.js'),html=read('tripod.html'),mobile=read('companion.js'),app=read('companion.html'),css=read('pairing.css');
 assert.ok(web.includes('ZebjusCodePair.resolveAnswer'));
 assert.ok(web.includes("pairMode==='camera'"));
 assert.ok(web.includes("$('pairCameraMode').onclick"));
 assert.ok(html.includes('id="pairCameraSection"')&&html.includes('id="pairCodeSection"'));
 assert.ok(html.includes('id="pairScanAnswerBtn"'));
 assert.ok(html.includes('id="pairPhoneCode"'));
 assert.ok(app.includes('id="phoneShortCode"'));
 assert.ok(mobile.includes('ZebjusCodePair.beginPhone'));
 assert.ok(mobile.includes('void createPhoneCode()'));
 assert.ok(css.includes('#pairPhoneCode'));
 assert.ok(!read('pairing-code.js').includes('LED_SET'),'public signaling must not control LED');
 console.log('PASS camera/no-camera UI integration and no LED commands via public server');
});

test('cancelling code lookup rejects promptly without a stale answer',async()=>{
 const app=createRuntime(200),offer='zj1:1:'+('A'.repeat(400)),answer='zj1:1:'+('B'.repeat(450)),sid='0123456789abcdef01234567';
 let code='';const phone=app.beginPhone({offer,answer,expires:Date.now()+60000,onCode:c=>code=c});
 try{
  await phone.start();await wait(20);const controller=new AbortController();
  const lookup=app.resolveAnswer({offer,code,sid,expires:Date.now()+60000,signal:controller.signal});
  await wait(30);controller.abort();await assert.rejects(lookup,/cancelled/);
  await assert.rejects(app.resolveAnswer({offer,code,sid,expires:Date.now()+60000,signal:controller.signal}),/cancelled/);
 }finally{phone.stop()}
});

test('phone advertises only a registered code and clears it on signaling failure',async()=>{
 const peers=[],timers=new Map();let timerId=0,code='',status='';
 class Peer{
  handlers=new Map();destroyed=false;
  constructor(){peers.push(this)}
  on(type,handler){this.handlers.set(type,handler);return this}
  emit(type,value){this.handlers.get(type)?.(value)}
  destroy(){this.destroyed=true}
 }
 const context={crypto:webcrypto,TextEncoder,Uint8Array,Peer,console,
  setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)}};
 context.globalThis=context;vm.runInNewContext(read('pairing-code.js'),context);
 const start=()=>context.ZebjusCodePair.beginPhone({offer:'zj1:offer',answer:'zj1:answer',expires:Date.now()+120000,onCode:c=>code=c,onStatus:s=>status=s});
 const first=start();await first.start();
 assert.equal(code,'','do not show an unregistered local random number');
 peers[0].emit('open');assert.match(code,/^[1-9]\d{5}$/);
 peers[0].emit('disconnected');assert.equal(code,'');assert.equal(first.getCode(),'');assert.ok(peers[0].destroyed);
 peers[0].emit('open');assert.equal(code,'','stale callbacks cannot restore an invalid code');first.stop();
 const second=start();await second.start();
 const registration=[...timers.values()].find(x=>x.ms===18000);assert.ok(registration);registration.fn();
 assert.match(status,/Online code service unavailable/);assert.equal(code,'');assert.ok(peers[1].destroyed);
 peers[1].emit('open');assert.equal(code,'','late signaling after timeout is ignored');second.stop();
 const third=start();await third.start();peers[2].emit('error',{type:'network',message:'server blocked'});
 assert.match(status,/Online code service unavailable: server blocked/);assert.doesNotMatch(status,/load PeerJS/);assert.equal(code,'');third.stop();
});
