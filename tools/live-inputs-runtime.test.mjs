import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
function harness(){

 const elements=new Map(),events=new Map();
 const element=id=>{
  if(!elements.has(id))elements.set(id,{id,textContent:'',dataset:{},style:{},checked:false,
    classList:{contains:name=>id==='tab-firmware'&&name==='active'},
    addEventListener(){},setAttribute(){},removeAttribute(){}});
  return elements.get(id);
 };
 const kit={kitId:'ZFC-A2-ABCDEF123456',connected:true,transport:'usb',physicalLink:'usb',bootId:'fixture'};
 const scope={ZebjusKits:{getState:()=>kit,getMonitorPaths:()=>[{kitId:kit.kitId,transport:'usb',available:true,verified:true,lastPacketAt:Date.now()}]},
  ZebjusKitData:{selectMonitorPath:(k,p)=>({path:p[0],reason:'fixture'}),isNetwork:()=>false},
  ZebjusDevicesWorkspace:{active:()=> 'inputs'},
  document:{readyState:'complete',hidden:false,getElementById:element,addEventListener(){}},
  setInterval(){},addEventListener:(name,handler)=>events.set(name,handler)};
 scope.window=scope;
 const emit=line=>events.get('dronelab:serial-line')({detail:{line,transport:'usb'}});
 return {scope,element,emit};

}

test('actual Live Inputs serial listener resets old sequence and arm state on a new claim',()=>{
 const h=harness();
 vm.runInNewContext(source('js/serial-rc-decoder.js'),h.scope);
 vm.runInNewContext(source('js/live-inputs.js').replace(/^export /gm,''),h.scope);
 h.emit('ZJRC,AP,ANDROID,900,T=1100,R=1500,P=1500,Y=1500,ARM=1');
 assert.equal(h.element('liPacketNumber').textContent,'900');
 assert.equal(h.element('liInputArm').textContent,'ARMED');
 h.emit('ZJRC,CLAIM,AP,ANDROID');
 assert.equal(h.element('liInputArm').textContent,'DISARMED');
 h.emit('ZJRC,AP,ANDROID,1,T=1000,R=1500,P=1500,Y=1500,ARM=0');
 assert.equal(h.element('liPacketNumber').textContent,'1');
 assert.equal(h.element('liInputArm').textContent,'DISARMED');
 assert.equal(h.element('liRate').textContent,'— Hz');
});
