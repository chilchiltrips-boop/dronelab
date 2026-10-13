import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const code=readFileSync(new URL('../js/classroom-kits.js',import.meta.url),'utf8');
const id='ZFC-A1-012345ABCDEF',other='ZFC-A1-FFFFFFFFFFFF',key='a1'.repeat(16);
function fixture({mode='sta',paired=false,initialize=false,encrypted=false}={}){
 const elements=new Map(),timers=new Set(),events=[],requests=[],storage=new Map();let ready;
 const element=()=>({value:'',checked:false,textContent:'',dataset:{},style:{},disabled:false,listeners:{},children:[],
  classList:{contains:()=>true,toggle(){},add(){},remove(){}},setAttribute(){},replaceChildren(...children){this.children=children},add(item){this.children.push(item)},append(){},focus(){},
  addEventListener(type,fn){this.listeners[type]=fn},click(){this.listeners.click?.({target:this})}});
 for(const name of [...readFileSync(new URL('../index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g)].map(x=>x[1]))elements.set(name,element());
 const ip=mode==='ap'?'192.168.4.1':'192.168.1.20';
 for(const [name,value] of Object.entries({kitCodeInput:'123456',kitTransport:mode,kitIpInput:ip,kitKeyInput:''}))elements.get(name).value=value;
 let status={kitId:id,kitCode:'123456',kitName:'zebjus_drone_2',board:'ZFC-A1',version:encrypted?'1.4.5':'1.4.4',bootId:'b1'.repeat(16),encryptedOta:encrypted,appElfSha256:'0'.repeat(64),
  requestTransport:mode.toUpperCase(),mode:'auto',apActive:true,staConnected:mode==='sta',ip:mode==='sta'?ip:'',apIp:'192.168.4.1',apSsid:'zebjus_drone_2',
  hostname:'zebjus-drone-2.local',setupAuthorized:mode==='ap',otaAuthorized:false,controlAuthorized:mode==='ap',firmwareControl:false,motorsArmed:false,otaAppOnly:true,
  rc:{claimed:false,active:false,motorsDisabled:true},firmwareBuiltAt:'Oct 13 2026 16:00:00'};
 let uploaded=false,claimGate=null,identityOverride=null,offset=0,digest='';
 const handler=async(route,args={})=>{
  requests.push({route,args});
  if(route==='/api/status')return {...status,rc:{...status.rc}};
  if(route==='/api/rc/claim'){
   if(claimGate)await claimGate;
   status.rc={claimed:true,active:false,source:'WEB',ownerId:'owner-1'};
   return {kitId:id,session:'private-rc-token',ownerId:'owner-1'};
  }
  if(route==='/api/rc/preview')return {kitId:id,received:true};
  if(route==='/api/rc/release'){status.rc={claimed:false};return {released:true};}
  if(route==='/api/firmware/begin'){offset=0;digest=args.sha256;return {kitId:id,offset};}
  if(route==='/api/firmware/chunk'){assert.equal(args.offset,offset);assert.ok(args.data.length<=768);offset+=args.data.length/2;return {kitId:id,offset};}
  if(route==='/api/firmware/end'){uploaded=true;status={...status,version:'1.4.6',bootId:'c2'.repeat(16)};return {kitId:id,updated:true,sha256:digest};}
  throw Error('Unexpected request '+route);
 };
 const window={addEventListener(){},dispatchEvent:e=>events.push(e),ZebjusKitPairingStore:{fromSession:()=>paired?key:'',restore:async()=>paired?key:'',saveSession(){}},
  ZfcCrypto:{sha256:bytes=>createHash('sha256').update(bytes).digest()},
  ZebjusKitAuth:{http:base=>base,openLocal:async()=>({expiresAt:Date.now()+600000,request:route=>handler(route)}),open:async(_host,_id,_key,kind)=>{
   assert.equal(kind,'admin');status={...status,setupAuthorized:true,otaAuthorized:true,controlAuthorized:true};
   return {expiresAt:Date.now()+600000,request:(route,_method,args)=>handler(route,args)};
  }}};
 const fetch=async(url,opts={})=>{
  const u=new URL(url);requests.push({host:u.hostname,headers:opts.headers,route:u.pathname});
  if(u.pathname==='/api/identify'){
   const mismatch=identityOverride||(uploaded&&u.hostname===ip?other:id);
   return {ok:true,json:async()=>({kitId:mismatch,kitCode:'123456',name:'zebjus_drone_2',board:'ZFC-A1',simpleConnection:true,adminSessions:encrypted})};
  }
  if(opts.headers?.['X-ZJ-Key']===key)status={...status,setupAuthorized:true,otaAuthorized:true,controlAuthorized:true};
  return {ok:true,json:()=>handler(u.pathname,Object.fromEntries(new URLSearchParams(opts.body||'')))};
 };
 class XHR{
  upload={};status=200;responseText='{"updated":true}';
  open(){}setRequestHeader(){}send(){uploaded=true;status={...status,version:'1.4.6',bootId:'c2'.repeat(16)};queueMicrotask(()=>this.onload())}
 }
 const document={readyState:'loading',hidden:false,addEventListener:(type,fn)=>{if(type==='DOMContentLoaded')ready=fn},getElementById:name=>elements.get(name)||null,
  querySelectorAll:()=>[],querySelector:()=>({click(){}}),createElement:element};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const timeout=(fn,ms)=>{const t=setTimeout(fn,ms);timers.add(t);return t};
 vm.runInNewContext(code,{window,document,localStorage,fetch,URL,URLSearchParams,AbortController,XMLHttpRequest:XHR,Uint8Array,Blob,FormData,TextEncoder,Option:class{constructor(text,value){this.text=text;this.value=value}},
  setTimeout:timeout,clearTimeout,setInterval:()=>1,clearInterval(){},confirm:()=>true,console,CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail}}});
 if(initialize)ready();
 return {api:window.ZebjusKits,elements,requests,events,storage,blockClaim:p=>claimGate=p,identity:value=>identityOverride=value,
  status:patch=>status={...status,...patch},dispose:()=>{for(const t of timers)clearTimeout(t)}};
}
test('My Kits Connect and Disconnect buttons execute actual identity-bound client actions',async()=>{
 const f=fixture({initialize:true});try{
  f.elements.get('kitConnect').click();for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));
  assert.equal(f.api.getState().connected,true);assert.equal(f.api.getState().kitId,id);
  f.elements.get('kitDisconnect').click();await new Promise(r=>setImmediate(r));assert.equal(f.api.getState().connected,false);
 }finally{f.dispose()}
});
test('STA observer stays read-only; physical USB-paired STA exposes control and OTA separately',async()=>{
 for(const paired of [false,true]){const f=fixture({paired});try{
  await f.api.connect();const s=f.api.getState();assert.equal(s.connected,true);assert.equal(s.otaAuthorized,paired);assert.equal(s.controlAuthorized,paired);
  if(!paired)await assert.rejects(f.api.toggleControl(),/STA observer/);
  assert.equal(s.owner,false,'Connecting never claims RC');
 }finally{f.dispose()}}
});
test('AP remains scoped setup until a USB-paired browser explicitly authorizes updates',async()=>{
 const f=fixture({mode:'ap',paired:true});try{
  await f.api.connect();assert.equal(f.api.getState().setupAuthorized,true);assert.equal(f.api.getState().otaAuthorized,false);
  await f.api.authorizeNetwork();assert.equal(f.api.getState().otaAuthorized,true);assert.equal(f.api.getState().owner,false);
 }finally{f.dispose()}
});
test('header and Firmware page control use one grant; release neutralizes the same owner',async()=>{
 const f=fixture({paired:true});try{
  await f.api.connect();await f.api.toggleControl();assert.equal(f.api.getState().owner,true);
  assert.equal(f.elements.get('kitHardwareTarget').checked,true);
  await f.api.toggleControl();assert.equal(f.api.getState().owner,false);
  assert.ok(f.requests.some(r=>r.route==='/api/rc/release'));
 }finally{f.dispose()}
});
test('late control grant after disconnect cannot reactivate the old Kit',async()=>{
 const f=fixture({paired:true});try{
  await f.api.connect();let finish;f.blockClaim(new Promise(r=>finish=r));
  const pending=f.api.toggleControl();await new Promise(r=>setImmediate(r));await f.api.disconnect();finish();
  await assert.rejects(pending,/changed|cancelled/);assert.equal(f.api.getState().connected,false);assert.equal(f.api.getState().owner,false);
 }finally{f.dispose()}
});
test('cached metadata retains the verified STA address while AP is the live request transport',async()=>{
 const f=fixture({mode:'ap'});try{
  f.status({staConnected:true,ip:'192.168.1.41'});await f.api.connect();
  const saved=JSON.parse(f.storage.get('zebjus.classroom.last.v1'));assert.equal(saved.ip,'192.168.1.41');assert.equal(saved.id,id);
  assert.ok(!JSON.stringify(saved).includes(key));assert.equal(f.api.getState().transport,'ap');
 }finally{f.dispose()}
});
test('OTA verifies changed boot ID and same Device ID through Kit Name when DHCP reuses the old IP',async()=>{
 const f=fixture({paired:true});try{
  await f.api.connect();const bytes=new Uint8Array(32768);bytes[0]=0xe9;bytes[12]=5;
  const result=await f.api.uploadAppFirmware({bytes,name:'APP.bin',boardId:'ZFC-A1',version:'1.4.6'});
  assert.equal(result.verified,true);assert.equal(result.kitId,id);assert.equal(f.api.getState().owner,false);
  assert.equal(f.api.getState().bootId,'c2'.repeat(16));assert.equal(f.api.getState().connected,true);
  assert.ok(f.requests.some(r=>r.host==='zebjus-drone-2.local'&&r.route==='/api/status'));
  const writesAfterMismatch=f.requests.filter(r=>r.host==='192.168.1.20'&&r.route==='/api/status');
  assert.equal(writesAfterMismatch.length,3,'No credential request to the old IP after its identity changes');
 }finally{f.dispose()}
});
test('selection rejects changed hardware before trusting discovery or sending a saved key',async()=>{
 const f=fixture({paired:true});try{
  f.identity(other);
  await assert.rejects(f.api.connectDiscoveredKit({kitId:id,kitCode:'123456',ip:'192.168.1.20'}),/identity changed/);
  assert.equal(f.api.getState().connected,false);assert.ok(!f.requests.some(r=>r.headers?.['X-ZJ-Key']));
 }finally{f.dispose()}
});
test('new firmware uses ordered encrypted OTA commands and verifies full SHA-256 before reconnect',async()=>{
 const f=fixture({paired:true,encrypted:true});try{
  await f.api.connect();const bytes=new Uint8Array(32768);bytes[0]=0xe9;bytes[12]=5;
  const result=await f.api.uploadAppFirmware({bytes,name:'APP.bin',boardId:'ZFC-A1',version:'1.4.6'});
  assert.equal(result.verified,true);
  assert.equal(f.requests.filter(r=>r.route==='/api/firmware/chunk').length,Math.ceil(bytes.length/384));
  assert.equal(f.requests.find(r=>r.route==='/api/firmware/begin').args.sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.ok(!f.requests.some(r=>r.headers?.['X-ZJ-Key']),'new firmware does not send its private USB pairing key in an HTTP header');
 }finally{f.dispose()}
});
