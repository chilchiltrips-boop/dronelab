import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const client=read('companion-network.js');
const bridge=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java');
const activity=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
const network=read('FlightCore_Firmware/FlightCoreNetwork.h');
const id='ZFC-A1-012345ABCDEF',board='ZFC-A1',hash='11'.repeat(32),bootA='0'.repeat(32),bootB='1'.repeat(32);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function harness(mode){
 const listeners=new Map(),elements=new Map();
 const el=name=>{
  if(!elements.has(name))elements.set(name,{value:'',disabled:false,checked:false,dataset:{},textContent:'',
   addEventListener(type,fn){listeners.set(name+':'+type,fn)},replaceChildren(){},add(){},click(){}});
  return elements.get(name);
 };
 el('kitLink').value='ap';el('kitKey').value='private-label';
 const bytes=new Uint8Array(32768);bytes[0]=0xe9;bytes[1]=2;bytes[12]=5;
 bytes.set([0x32,0x54,0xcd,0xab],32);bytes.fill(0x23,176,208);
 const build=Array.from(bytes.slice(176,208),v=>v.toString(16).padStart(2,'0')).join('');
 const file={name:'official-app.bin',size:bytes.length,type:'application/octet-stream',slice:(start,end)=>({arrayBuffer:async()=>bytes.slice(start,end).buffer}),arrayBuffer:async()=>bytes.buffer};
 const ota={active:false,owned:false,offset:0,size:0,sha256:'',rebootPending:false};
 let runningBoot=bootA,runningVersion='1.7.3',runningBuild='old',calls=[],aborts=0,ends=0,losses=0;
 const currentStatus=()=>({kitId:id,board,requestTransport:'AP',bootId:runningBoot,mode:'ap',
  apActive:true,staConnected:false,rc:{claimed:false},motorsArmed:false,firmwareControl:false,
  otaAppOnly:true,partitionLayout:'ZFC_DUAL_1E0000',otaMaxBytes:1966080,otaChunkMaxBytes:2048,encryptedOta:true,
  version:runningVersion,appElfSha256:runningBuild,ota:{...ota}});
 const session={expiresAt:Date.now()+300000,async request(route,method,args={}){
  if(route==='/api/status')return currentStatus();
  if(route==='/api/firmware/begin'){
   ota.active=true;ota.owned=true;ota.offset=0;ota.size=bytes.length;ota.sha256=hash;
   return {kitId:id,offset:0};
  }
  if(route==='/api/firmware/chunk'){
   calls.push(args.offset);
   if(args.offset!==ota.offset)throw Error('Server detected duplicate/reordered write');
   if(mode==='cancel'&&calls.length===1)await wait(45);
   ota.offset+=args.data.length/2;
   if(mode==='lost-chunk'&&args.offset===0&&!losses++){throw Error('Wi-Fi dropped after flash write');}
   return {kitId:id,offset:ota.offset};
  }
  if(route==='/api/firmware/abort'){aborts++;ota.active=false;ota.owned=false;return {aborted:true}}
  if(route==='/api/firmware/end'){
   ends++;ota.active=false;ota.owned=false;ota.rebootPending=true;
   runningBoot=bootB;runningVersion='1.7.4';runningBuild=build;
   if(mode==='lost-end')throw Error('Reboot before response received');
   return {kitId:id,sha256:hash,rebooting:true};
  }
  throw Error('Unexpected route '+route);
 }};
 const window={ZfcCrypto:{sha256:()=>new Uint8Array(32).fill(0x11)},
  ZebjusKitAuth:{label:()=>({deviceId:id,secret:'private'}),diagnosticKey:()=> 'diagnostic',
   open:async()=>session},dispatchEvent(){},addEventListener(){}};
 window.ZebjusNative={requestSecure(requestId){
  queueMicrotask(()=>window.zebjusNativeResult({id:requestId,ok:true,status:200,text:JSON.stringify({kitId:id}),proof:''}));
 },cancelRequest(){},openWifiSettings(){}};
 const document={readyState:'loading',hidden:false,getElementById:el,addEventListener(name,fn){listeners.set('document:'+name,fn)}};
 const catalog={version:'1.7.4',boards:[{id:board,latest:{app:{available:true,file:file.name,size:bytes.length,sha256:hash}}}]};
 runInNewContext(client,{window,document,console,Date,Math,Number,Set,Map,Promise,Uint8Array,URLSearchParams,
  performance:{now:()=>Date.now()},setInterval(){},setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>catalog}),
  Option:class {},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}}});
 listeners.get('document:DOMContentLoaded')();
 const invoke=(name,type='click',event)=>{const fn=listeners.get(name+':'+type);assert.ok(fn,name+' '+type);return fn(event)};
 return {window,el,invoke,file,get calls(){return calls},get aborts(){return aborts},get ends(){return ends}};
}
async function connectAndUpload(h){
 h.invoke('kitConnect');
 for(let i=0;i<80&&!h.window.ZebjusNetwork.isConnected();i++)await wait(10);
 assert.equal(h.window.ZebjusNetwork.isConnected(),true,'Kit identity verified before OTA');
 h.el('kitOtaAdminKey').value='a'.repeat(32);
 h.invoke('kitOtaFile','change',{target:{files:[h.file],value:''}});
}
async function completion(h,needle){
 for(let i=0;i<1000&&!h.el('kitNetStatus').textContent.includes(needle);i++)await wait(10);
 return h.el('kitNetStatus').textContent;
}
test('lost encrypted chunk ACK is reconciled by signed offset without replay',async()=>{
 const h=harness('lost-chunk');await connectAndUpload(h);
 const final=await completion(h,'OTA VERIFIED');
 assert.match(final,/OTA VERIFIED/);
 assert.equal(h.calls.length,16);
 assert.deepEqual(h.calls,[...Array(16)].map((_,i)=>i*2048));
 assert.equal(h.ends,1);assert.equal(h.aborts,0);
});
test('unconfirmed END verifies new running build without reissuing END',async()=>{
 const h=harness('lost-end');await connectAndUpload(h);
 const final=await completion(h,'OTA VERIFIED');
 assert.match(final,/OTA VERIFIED/);
 assert.equal(h.ends,1);assert.equal(h.aborts,0);
});
test('teacher Cancel waits for current write and signed abort; never sends more chunks',async()=>{
 const h=harness('cancel');await connectAndUpload(h);
 for(let i=0;i<100&&!h.calls.length;i++)await wait(5);
 assert.equal(h.calls.length,1,'first chunk in flight');
 h.invoke('kitOtaCancel');
 const final=await completion(h,'OTA stopped:');
 assert.match(final,/OTA stopped:/);
 assert.equal(h.calls.length,1);assert.equal(h.ends,0);assert.equal(h.aborts,1);
});
test('native + JS timers, cancellation and OTA progress contract agree',()=>{
 assert.match(client,/policy\?\.requestTimeout\?\.\(route,method,link,'android'\)/);
 assert.match(client,/native\.cancelRequest\?\.\(id\)/);
 assert.match(client,/signedProgress\(\)/);
 assert.match(client,/owned\(progress,next\)/);
 assert.match(client,/endAttempted=true/);
 assert.match(bridge,/connection\.setReadTimeout\(firmwareWrite\?12000:3000\)/);
 assert.match(bridge,/elapsed>\(firmwareWrite\?1500:750\)/);
 assert.match(bridge,/@JavascriptInterface public void cancelRequest\(String id\)/);
 assert.match(activity,/nativeFlightCore\.cancelOutstanding\(\)/);
 assert.match(network,/zjAuthAdmin&&zjRequestSession>=0/);
 assert.match(network,/zjSecureOtaSession==zjSessions\[zjRequestSession\]\.id/);
 assert.match(read('companion.html'),/id="kitOtaCancel"/);
});
