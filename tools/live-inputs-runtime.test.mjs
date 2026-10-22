import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createInputStore,createSimulatorInput} from '../js/simulator-input.js';
import {createSimulator} from '../js/tripod-physics.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function usbBench(){
 let at=1000;const listeners=new Map(),ticks=[],nodes=new Map();
 const mode={supported:true,stabilizationSupported:false,saved:'angle',active:'angle',pending:null};
 const kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',kitName:'Runtime fixture',transport:'usb',physicalLink:'usb',
  bootId:'boot-1',flightMode:'angle',flightModeState:mode,ledOn:true,motorsDisabled:true,motorsArmed:false};
 const store=createInputStore({now:()=>at}),s=createSimulator(),input=createSimulatorInput(s,store);
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{id,dataset:{},style:{},textContent:'',value:'',checked:false,
   classList:{contains:name=>name==='active'&&id==='tab-pid'},
   addEventListener(){},setAttribute(){},removeAttribute(){},parentElement:{setAttribute(){},removeAttribute(){}}});
  return nodes.get(id);
 };
 const context={store,console,Date:class extends Date{static now(){return at}},
  setInterval:fn=>ticks.push(fn),addEventListener:(type,fn)=>listeners.set(type,fn),
  document:{hidden:false,readyState:'complete',getElementById:node,addEventListener(){}},
  ZebjusDevicesWorkspace:{active:()=> 'inputs'},
  ZebjusKits:{getState:()=>({...kit}),getMonitorPaths:()=>kit.connected?
   [{kitId:kit.kitId,transport:'usb',verified:true,available:true,lastPacketAt:at}]:[],
   request:()=>{throw Error('USB monitor must not issue network/control requests')}}};
 context.window=context;context.globalThis=context;vm.createContext(context);
 vm.runInContext(read('js/serial-rc-decoder.js'),context);
 vm.runInContext(read('js/kit-data-interface.js'),context);
 vm.runInContext(read('js/live-inputs.js')
  .replace(/import \{sharedInputStore\} from '\.\/simulator-input.js';/,'const sharedInputStore=()=>globalThis.store;')
  .replace(/export function /g,'function '),context);
 const tick=()=>ticks.forEach(fn=>fn());
 function frame(seq){
  at+=80;
  const rc={kitId:kit.kitId,source:'ANDROID',transport:'AP',seq,accepted:seq,rejected:0,
   active:true,inputValid:true,inputArmed:false,ageMs:0,throttle:1000,roll:1500,pitch:1500,yaw:1500,
   ch5:1725,ch6:1280,motorsDisabled:true,motorsArmed:false};
  listeners.get('dronelab:serial-line')({detail:{transport:'usb',line:'ZJSTATE,1,'+JSON.stringify({kitId:kit.kitId,flightModeState:mode,ledOn:true,rc})}});
  tick();
 }
 return {kit,store,s,input,frame,tick,link:detail=>listeners.get('dronelab:kit-link')({detail})};
}
test('link notification for unchanged verified USB path cannot discard fresh input or cancel virtual Run',()=>{
 const b=usbBench();b.frame(1);assert.equal(b.input.start().accepted,true);
 b.link({connected:true,kitId:b.kit.kitId,transport:'usb'});
 assert.equal(b.s.running,true,'unchanged selected path must retain its accepted input');
 b.link({connected:false,kitId:'ZFC-A1-FFFFFFFFFFFF',transport:'sta'});
 assert.equal(b.s.running,true,'unrelated network discovery must not clear verified USB input');
 assert.equal(b.input.snapshot().seq,1);
 b.frame(2);assert.equal(b.s.running,true);assert.equal(b.input.snapshot().seq,2);
});
test('real selected USB disconnect and reboot still stop and require a new frame plus explicit Run',()=>{
 const b=usbBench();b.frame(1);b.input.start();
 b.kit.connected=false;b.kit.linkState='stale';b.tick();
 assert.equal(b.s.running,false);assert.equal(b.store.snapshot().kit.fresh,false);
 b.kit.connected=true;b.link({connected:true,kitId:b.kit.kitId,transport:'usb'});
 assert.equal(b.store.snapshot().kit.fresh,false,'reconnect must not resurrect the previous serial sample');
 b.frame(2);assert.equal(b.s.running,false);assert.equal(b.input.start().accepted,true);
 b.kit.bootId='boot-2';b.link({connected:true,kitId:b.kit.kitId,transport:'usb'});
 assert.equal(b.s.running,false);assert.equal(b.store.snapshot().kit.fresh,false);
 b.frame(1);assert.equal(b.s.running,false);assert.equal(b.input.start().accepted,true);
});
