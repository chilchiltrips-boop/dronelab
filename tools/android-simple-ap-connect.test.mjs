import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHmac} from 'node:crypto';

const source=readFileSync(new URL('../js/kit-auth.js',import.meta.url),'utf8');
const java=readFileSync(new URL('../mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java',import.meta.url),'utf8');
const sessionKey='ab'.repeat(32),kitId='ZFC-A1-012345ABCDEF',bootId='cc'.repeat(16),sid='dd'.repeat(16);
const hmac=(key,message)=>createHmac('sha256',Buffer.from(key,'utf8')).update(message).digest('hex');

test('native bridge accepts only explicit public local enrollment and signed access for subsequent routes',()=>{
 assert.match(java,/route.equals\("\/api\/auth\/local"\)/);
 assert.match(java,/boolean publicRoute=.*\/api\/auth\/local/);
 assert.match(java,/if\(!publicRoute\)/);
 assert.match(java,/headers.length\(\)!=4/);
 assert.match(java,/route.startsWith\("\/api\/firmware\/"\)/);
});

test('joining Kit AP yields label-free signed local session, no OWNER/OTA authority',async()=>{
 const requested=[];
 let mismatch=false;
 const root={ZfcCrypto:{
   hmac256:(key,body)=>new Uint8Array(createHmac('sha256',Buffer.from(key)).update(Buffer.from(body)).digest()),
   encryptGCM:()=>new Uint8Array(20)
  },crypto:{getRandomValues:a=>a.fill(7)},sessionStorage:{getItem:()=>null,setItem(){}}};
 runInNewContext(source,{...root,TextEncoder,Uint8Array,URLSearchParams,Date,Promise,AbortController,setTimeout,clearTimeout});
 // globalThis in the VM is the context; retrieve the bound library separately.
 const context={...root,TextEncoder,Uint8Array,URLSearchParams,Date,Promise,AbortController,setTimeout,clearTimeout};
 runInNewContext(source,context);
 const kitAuth=context.ZebjusKitAuth;
 const transport=async(route,method,args,headers)=>{
  requested.push({route,method,args,headers});
  if(route==='/api/auth/local'){
   assert.equal(method,'POST');assert.equal(args.deviceId,kitId);
   assert.match(args.client,/^[a-f0-9]{32}$/);assert.equal(Object.keys(headers).length,0);
   return {status:200,text:JSON.stringify({kitId,bootId,session:sid,key:sessionKey,scope:'ap_diagnostics',expiresMs:1800000})};
  }
  if(route==='/api/status'){
   assert.equal(method,'GET');
   assert.equal(headers['X-ZJ-Device'],kitId);
   assert.equal(headers['X-ZJ-Seq'],'1');
   assert.match(headers['X-ZJ-Proof'],/^[a-f0-9]{64}$/);
   const body=JSON.stringify({kitId,requestTransport:'AP',apActive:true,apSsid:'zebjus_drone_1'});
   return {status:200,text:body,proof:mismatch?'0'.repeat(64):hmac(sessionKey,'response|1|200|'+body)};
  }
  throw Error('Unexpected local session route '+route);
 };
 const session=await kitAuth.local(transport,kitId,'ap_diagnostics');
 assert.equal(session.local,true);assert.equal(session.scope,'ap_diagnostics');
 assert.equal((await session.request('/api/status')).requestTransport,'AP');
 await assert.rejects(session.request('/api/firmware/begin','POST',{size:1}),/OWNER/);
 assert.deepEqual(requested.map(x=>x.route),['/api/auth/local','/api/status']);
 const other=await kitAuth.local(transport,kitId,'ap_diagnostics');
 mismatch=true;
 await assert.rejects(other.request('/api/status'),/Unsigned or mismatched/);
 await assert.rejects(kitAuth.local(async()=>({status:200,text:JSON.stringify({kitId,bootId,session:sid,key:sessionKey,scope:'sta_observer',expiresMs:1800000})}),kitId,'ap_diagnostics'),/scope invalid/);
});

test('Android auto-connects after joining Wi-Fi; private label and OWNER not requested',async()=>{
 const source=readFileSync(new URL('../companion-network.js',import.meta.url),'utf8');
 const listeners=new Map(),elements=new Map(),calls=[];
 const element=id=>{
  if(!elements.has(id))elements.set(id,{value:'',checked:false,textContent:'',dataset:{},disabled:false,
   attrs:{},setAttribute(k,v){this.attrs[k]=String(v)},getAttribute(k){return this.attrs[k]??null},
   addEventListener(type,fn){listeners.set(id+':'+type,fn)},replaceChildren(){},add(){}});
  return elements.get(id);
 };
 let localSessions=0;
 const window={dispatchEvent(){},addEventListener(){},ZebjusKitAuth:{
  local:async(_transport,id,scope)=>{
   assert.equal(id,kitId);assert.equal(scope,'ap_diagnostics');localSessions++;
   return {local:true,deviceId:id,expiresAt:Date.now()+60000,request:async route=>{
    if(route==='/api/status')return {kitId,requestTransport:'AP',apActive:true,staConnected:false,
      apSsid:'zebjus_drone_1',apIp:'192.168.4.1',board:'ZFC-A1',kitCode:'123456',mode:'ap'};
    throw Error('Unexpected route '+route);
   }};
  }
 }};
 window.ZebjusNative={
  requestSecure(id,ip,method,route){
   calls.push(route);assert.equal(ip,'192.168.4.1');
   queueMicrotask(()=>window.zebjusNativeResult({id,ok:true,status:200,
    text:JSON.stringify({kitId,authVersion:2,simpleConnection:true}),proof:''}));
  },
  requestWifiPermission(id){queueMicrotask(()=>window.zebjusNativeWifiPermissionResult({id,granted:true}))},
  pinSelectedNetwork(id,kit,ip,transport,ssid){
   assert.equal(kit,kitId);assert.equal(transport,'AP');assert.equal(ssid,'zebjus_drone_1');
   queueMicrotask(()=>window.zebjusNativePinResult({id,ok:true}));
  },clearSelectedNetwork(){},openWifiSettings(){}
 };
 const document={readyState:'loading',hidden:false,getElementById:element,
  addEventListener(type,fn){listeners.set('document:'+type,fn)}};
 runInNewContext(source,{window,document,Date,performance,URLSearchParams,Promise,Set,Map,
  Option:class {},setInterval(){},setTimeout,clearTimeout,
  CustomEvent:class {constructor(type,opts){this.type=type;this.detail=opts?.detail}}});
 listeners.get('document:DOMContentLoaded')();
 // No label, and no manual Connect button: this simulates Android Wi-Fi joining AP.
 window.ZebjusNetwork.networkChanged();
 await new Promise(resolve=>setTimeout(resolve,950));
 assert.equal(window.ZebjusNetwork.isConnected(),true);
 assert.equal(localSessions,1);
 assert.equal(element('kitKey').value,'');
 assert.equal(element('kitSavedId').value,kitId);
 assert.deepEqual(calls,['/api/identify']);
 assert.match(element('kitNetStatus').textContent,/AP-LOCAL/);
});
