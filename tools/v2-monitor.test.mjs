import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture(){
 let usbOpen=true,usbIdentity='ZFC-A1-012345ABCDEF';
 let now=10000,transport='AP',identity='ZFC-A1-012345ABCDEF',gate=null,calls=0;
 const elements=new Map();
 for(const [id,value] of Object.entries({kitCodeInput:'123456',kitTransport:'ap',kitIpInput:'192.168.4.1',kitKeyInput:'ab'.repeat(16)}))elements.set(id,{value});
 const document={readyState:'loading',hidden:false,addEventListener(){},getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[]};
 const window={dispatchEvent(){},ZebjusKitPairingStore:{saveSession(){}},DroneLabSerial:{isOpen:()=>usbOpen,isFlashing:()=>false,writeLine:async line=>{if(line.trim()==='ZJKIT,GET')window.testSerial('ZJKIT,ID,'+usbIdentity)}}};
 const fetch=async url=>{
  if(url.endsWith('/api/identify'))return {ok:true,json:async()=>({kitId:identity,kitCode:'123456',board:'ZFC-A1'})};
  calls++;if(gate)await gate;
  return {ok:true,json:async()=>({kitId:identity,kitCode:'123456',board:'ZFC-A1',version:'1.4.0',requestTransport:transport,staConnected:true,apActive:true,rc:{claimed:false}})};
 };
 vm.runInNewContext(readFileSync(new URL('../js/classroom-kits.js',import.meta.url),'utf8').replace('function read(){',"root.testOnSerial=onSerial;root.testUSB=()=>{state.transport='usb'};root.testSerial=line=>{for(const p of serialClaims.slice())if(p.pattern.test(line)){serialClaims=serialClaims.filter(x=>x!==p);p.resolve(line)}};function read(){"),{window,document,fetch,localStorage:{getItem:()=>null,setItem(){}},AbortController,URLSearchParams,setTimeout,clearTimeout,CustomEvent:class{},Date:class extends Date{static now(){return now}}});
 return {serial:line=>window.testOnSerial({detail:{line,transport:'usb'}}),usb:window.testUSB,closeUSB:()=>usbOpen=false,usbIdentity:id=>usbIdentity=id,api:window.ZebjusKits,advance:n=>now+=n,setTransport:t=>transport=t,setIdentity:id=>identity=id,block:p=>gate=p,calls:()=>calls};
}
test('authenticated AP request remains AP while STA interface is active; refresh observes changed request transport',async()=>{
 const f=fixture();await f.api.connect();assert.equal(f.api.getState().connected,true);assert.equal(f.api.getState().transport,'ap');
 f.setTransport('STA');await f.api.read();assert.equal(f.api.getState().transport,'sta');assert.equal(f.api.getState().owner,false);
});
test('expired heartbeat disables connection and hardware claim without cached status turning green',async()=>{
 const f=fixture();await f.api.connect();f.advance(6501);assert.equal(f.api.isConnected(),false);
 await assert.rejects(f.api.claim(),/Refresh/);await f.api.read();assert.equal(f.api.isConnected(),true);
});
test('manual and timer reads share one pending authenticated status request',async()=>{
 const f=fixture();await f.api.connect();let done;f.block(new Promise(r=>done=r));const count=f.calls();
 const a=f.api.read(),b=f.api.read();assert.equal(a,b);assert.equal(f.calls(),count+1);done();await a;
});
test('disconnect invalidates late responses instead of restoring status or ownership',async()=>{
 const f=fixture();await f.api.connect();let done;f.block(new Promise(r=>done=r));const pending=f.api.read();
 await f.api.disconnect();done();await assert.rejects(pending,/Selected kit changed/);assert.equal(f.api.getState().connected,false);assert.equal(f.api.getState().owner,false);
});
test('missing request transport is rejected at initial authenticated connection',async()=>{
 const f=fixture();f.setTransport('');await f.api.connect();assert.equal(f.api.isConnected(),false);
});

test('user disconnect during a connection cannot be undone by the late authenticated response',async()=>{
 const f=fixture();let done;f.block(new Promise(r=>done=r));const pending=f.api.connect();
 await new Promise(r=>setImmediate(r));await f.api.disconnect();done();await pending;
 assert.equal(f.api.getState().connected,false);assert.equal(f.api.getState().kitId,'');
});

test('open USB port cannot keep an expired identity heartbeat connected; verified refresh restores it',async()=>{
 const f=fixture();await f.api.connect();f.usb();f.advance(6501);
 assert.equal(f.api.isConnected(),false);await assert.rejects(f.api.claim(),/Refresh/);
 await f.api.read();assert.equal(f.api.isConnected(),true);
 f.closeUSB();assert.equal(f.api.isConnected(),false);
});
test('USB refresh refuses a different device identity and cannot renew expired heartbeat',async()=>{
 const f=fixture();await f.api.connect();f.usb();f.advance(6501);f.usbIdentity('ZFC-OTHER');
 await assert.rejects(f.api.read(),/USB identity changed/);assert.equal(f.api.isConnected(),false);
});

test('automatic USB discovery cannot combine an old identity with later board telemetry',()=>{
 const f=fixture();f.serial('ZJKIT,ID,ZFC-A1-012345ABCDEF');f.serial('ZJKIT,CODE,123456');
 f.advance(6501);f.serial('ZJINFO,FW,ZFC-A1,1.4.0');assert.equal(f.api.isConnected(),false);
});
test('disconnect clears USB discovery identity so subsequent telemetry cannot reconnect cached hardware',async()=>{
 const f=fixture();f.serial('ZJKIT,ID,ZFC-A1-012345ABCDEF');f.serial('ZJKIT,CODE,123456');
 await f.api.disconnect();f.serial('ZJINFO,FW,ZFC-A1,1.4.0');assert.equal(f.api.isConnected(),false);
});

test('manual disconnect suppresses a complete late USB handshake',async()=>{
 const f=fixture();await f.api.disconnect();
 f.serial('ZJKIT,ID,ZFC-A1-012345ABCDEF');f.serial('ZJKIT,CODE,123456');f.serial('ZJINFO,FW,ZFC-A1,1.4.5');
 assert.equal(f.api.isConnected(),false,'Late serial responses cannot undo an explicit Disconnect');
});
