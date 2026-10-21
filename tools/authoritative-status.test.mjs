import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createInputStore,createSimulatorInput,validMirrorFrame} from '../js/simulator-input.js';
import {createSimulator} from '../js/tripod-physics.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const context={};vm.runInNewContext(read('js/serial-rc-decoder.js'),context);
vm.runInNewContext(read('js/kit-data-interface.js'),context);
const kitId='ZFC-A2-012345ABCDEF';
const mode={supported:true,stabilizationSupported:false,saved:'acro',active:'angle',pending:'acro'};
const rc={kitId,source:'WEB',transport:'USB',seq:1,active:true,inputValid:true,inputArmed:false,
 throttle:1000,roll:1600,pitch:1400,yaw:1500,ch5:1725,ch6:1280,ageMs:12,motorsArmed:false,motorsDisabled:true};
const record={kitId,flightModeState:mode,ledOn:true,ledEffect:2,rc};
test('versioned USB extension preserves actual auxiliary, mode and motor state; malformed/foreign records are rejected',()=>{
 const decode=context.ZebjusSerialRcDecoder.parseSerialStatus;
 const d=decode('ZJSTATE,1,'+JSON.stringify(record));
 const compact=decode('ZJSTATE,1,'+kitId+',acro,angle,acro,1000,1600,1400,1500,1725,1280,2,1,12,22,3,0,WEB,USB,1');
 assert.equal(compact.rc.ch5,1725);assert.equal(compact.flightModeState.pending,'acro');assert.equal(compact.rc.accepted,22);assert.equal(compact.ledEffect,2);
 assert.equal(d.rc.ch5,1725);assert.equal(d.rc.inputArmed,false);assert.equal(d.rc.motorsArmed,false);
 assert.equal(d.flightModeState.active,'angle');assert.equal(d.flightModeState.pending,'acro');
 for(const bad of [{...record,rc:{...rc,ch6:2001}}, {...record,kitId:'OTHER'},
  {...record,rc:{...rc,kitId:'ZFC-A1-FFFFFFFFFFFF'}}, {...record,rc:{...rc,motorsArmed:true}},
  {...record,flightModeState:{...mode,pending:null}}])assert.equal(decode('ZJSTATE,1,'+JSON.stringify(bad)),null);
 assert.equal(decode('ZJSTATE,2,'+JSON.stringify(record)),null);
 assert.equal(decode('ZJSTATE,1,{'),null);
});
function packet(seq=1,transport='usb',source='WEB',values={}){
 return {kit:{connected:true,kitId,transport,flightModeState:{...mode},flightMode:mode.active},
  input:{state:'live',source,seq,ageMs:0,values:{throttle:1000,roll:1500,pitch:1500,yaw:1500,...values},
   aux:{ch5:1725,ch6:1280},inputArm:'DISARMED',flightMode:'angle'}};
}
test('simulator Auto prefers verified USB, locks the producer, and source loss requires explicit Run',()=>{
 let at=0;const store=createInputStore({now:()=>at}),s=createSimulator(),input=createSimulatorInput(s,store);
 store.setPeer({connected:true,approved:true,supported:true,sessionId:'paired-session-0123',deviceId:'phone'});
 assert.equal(store.accept({mirrorVersion:1,sessionId:'paired-session-0123',seq:1,transport:'ap',kind:'android-preview',kitId:'',inputAgeMs:0,channels:{throttle:1000,roll:1500,pitch:1500,yaw:1500}}),true);
 assert.equal(store.acceptKit(packet()),true);assert.equal(input.snapshot().activeSource,'usb');
 assert.equal(input.snapshot().input.aux.ch5,1725);assert.equal(input.snapshot().input.inputArm,'DISARMED');
 assert.equal(input.start().accepted,true);assert.equal(input.setChoice('web'),false);
 store.acceptKit(packet(2,'usb','WEB',{throttle:1750}));assert.equal(s.throttle,1750);
 const c=input.snapshot().sticks.left.y;assert.ok(c<0,'1750 µs is above the stick center');
 at=1001;input.tick();assert.equal(s.running,false);assert.equal(s.throttle,1000);
 store.acceptKit(packet(3));assert.equal(s.running,false);assert.equal(input.start().accepted,true);
});
test('idle verified Kit mode remains available with WebApp input independently of RC input and virtual Run',()=>{
 const store=createInputStore(),s=createSimulator(),input=createSimulatorInput(s,store);
 input.setChoice('web');const p=packet();p.input.state='idle';p.input.source='NONE';
 assert.equal(store.acceptKit(p),false);assert.equal(input.snapshot().kitMode.active,'angle');
 assert.equal(input.snapshot().kitMode.pending,'acro');assert.equal(input.snapshot().input,null);
 input.start();p.kit.flightModeState={...mode,active:'acro',pending:null};store.acceptKit(p);
 assert.equal(s.mode,'angle','a running loop must not be reconfigured by telemetry');
 assert.equal(input.snapshot().kitMode.active,'acro');assert.equal(s.running,true);
});
test('native Android explicitly admits the authenticated flight-mode route',()=>{
 assert.match(read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java'),/route.equals\("\/api\/flight\/mode"\)/);
});

test('paired Android auxiliary channels stay optional and are strictly validated',()=>{
 const m={mirrorVersion:1,sessionId:'paired-session-0123',seq:1,transport:'preview',kind:'android-preview',kitId:'',inputAgeMs:0,
  channels:{throttle:1000,roll:1500,pitch:1500,yaw:1500},aux:{ch5:1725,ch6:1280}};
 assert.equal(validMirrorFrame(m),true);assert.equal(validMirrorFrame({...m,aux:{ch5:2001,ch6:1280}}),false);
 const store=createInputStore();store.setPeer({connected:true,approved:true,supported:true,sessionId:m.sessionId});store.accept(m);
 m.aux.ch5=2000;assert.equal(store.snapshot().sample.aux.ch5,1725);
});
