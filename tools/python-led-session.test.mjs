import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createPythonLedSession} from '../js/python-led-session.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fixture(board='A1'){
 const scope={};vm.runInNewContext(read('js/kit-data-interface.js'),scope);const contract=scope.ZebjusKitData;
 const original={connected:true,linkVerified:true,connectionGeneration:9,kitId:'ZFC-'+board+'-012345ABCDEF',board:'ZFC-'+board,transport:'sta',physicalLink:'sta',ip:'192.168.1.20',ssid:'Classroom router',bootId:'boot-one',relaySessionId:'',controlAuthorized:true};
 const f={kit:{...original},writes:[],reads:0,statusFailures:0,commandFailures:0,clock:100,health:[],maxConcurrent:0,inFlight:0,gate:null};
 const bound={kitId:original.kitId,transport:'sta',physicalLink:'sta',bootId:'boot-one',relaySessionId:'',connectionGeneration:9};
 const kits={getState:()=>({...f.kit}),read:async()=>{
  ++f.reads;if(f.statusFailures-- >0)throw Error('Kit did not respond within 4.2 s');
  f.kit.connected=true;return {...f.kit,requestTransport:'STA'};
 },request:async(route,method,args)=>{
  if(route!=='/api/command')throw Error('Unexpected route '+route);
  f.writes.push({kitId:f.kit.kitId,line:args.line});
  ++f.inFlight;f.maxConcurrent=Math.max(f.maxConcurrent,f.inFlight);
  try{if(f.gate)await f.gate.promise;if(f.commandFailures-- >0)throw Error('Temporary network request failed');return {kitId:f.kit.kitId,accepted:true}}
  finally{--f.inFlight}
 }};
 kits.requestBound=async(b,route,method,args)=>{contract.assertBoundSession(b,kits.getState());return kits.request(route,method,args)};
 const window={ZebjusKits:kits,ZebjusKitData:contract};
 vm.runInNewContext(read('js/network-lab.js'),{window,document:{readyState:'loading',getElementById:()=>null,addEventListener(){}},setInterval,clearInterval,Date,performance});
 f.led=createPythonLedSession({write:(p,b)=>window.DroneLabNetwork.writeLine(p,b),verify:(b,{freshOnly=false}={})=>{
  contract.assertBoundSession(b,kits.getState(),{allowDelayed:true});
  return freshOnly&&f.kit.connected&&f.kit.controlAuthorized?Promise.resolve():window.DroneLabNetwork.verifyBinding(b);
 },onHealth:h=>f.health.push(h),now:()=>f.clock});
 return {...f,raw:f,bound,contract,kits,network:window.DroneLabNetwork};
}
for(const board of ['A1','A2']){
 test(board+' temporary polling/LED failures pause only LEDs, then re-verify and restore the original STA Kit',async()=>{
  const {raw:f,led,bound}=fixture(board);f.commandFailures=1;
  led.set('ZJLED,1,SET,100\n',bound);await settle();
  assert.equal(led.snapshot().phase,'paused');assert.equal(led.snapshot().failures,1);
  f.kit.connected=false;f.statusFailures=1;
  for(let n=0;n<10;n++)led.keep();await settle();assert.equal(f.writes.length,1,'No writes during retry backoff');
  f.clock+=1000;led.keep();await settle();assert.equal(led.snapshot().phase,'paused');assert.equal(f.reads,2);
  f.clock+=1000;led.keep();await settle();assert.equal(led.snapshot().phase,'healthy');
  assert.equal(f.reads,3);assert.deepEqual(f.writes.map(x=>x.line),['ZJLED,1,SET,100','ZJLED,1,SET,100','ZJLED,0,KEEP']);
  assert.ok(f.writes.every(x=>x.kitId===bound.kitId));assert.equal(f.maxConcurrent,1);
 });
 test(board+' and another board on the same STA router cannot receive an existing script\'s LED commands',async()=>{
  const {raw:f,led,bound}=fixture(board);led.set('ZJLED,1,SET,100\n',bound);await settle();
  const writes=f.writes.length;f.kit={...f.kit,ip:'192.168.1.21',kitId:'ZFC-'+(board==='A1'?'A2':'A1')+'-FFFFFFFFFFFF'};
  led.keep();await settle();assert.equal(led.snapshot().phase,'blocked');
  f.clock+=10000;led.keep();await settle();assert.equal(f.writes.length,writes);
  assert.match(led.snapshot().lastError,/session changed/);
 });
}
test('SET / KEEP / STOP serialize; STOP cancels unsent work and precedes a new LED session',async()=>{
 const {raw:f,led,bound}=fixture();f.gate=deferred();
 led.set('ZJLED,1,SET,100\n',bound);await settle();
 led.keep();led.set('ZJLED,2,SET,50\n',bound);led.stop();led.set('ZJLED,3,SET,75\n',bound);
 f.gate.resolve();await settle();await settle();
 assert.deepEqual(f.writes.map(x=>x.line),['ZJLED,1,SET,100','ZJLED,0,STOP','ZJLED,3,SET,75']);
 assert.equal(f.maxConcurrent,1);assert.equal(led.snapshot().phase,'healthy');
});
test('a slow KEEP is single-flight and a failed explicit STOP remains visible',async()=>{
 const {raw:f,led,bound}=fixture();led.set('ZJLED,1,SET,100\n',bound);await settle();
 f.gate=deferred();for(let n=0;n<12;n++)led.keep();await settle();
 assert.equal(f.writes.filter(x=>x.line.endsWith('KEEP')).length,1);
 f.gate.resolve();await settle();f.gate=null;f.commandFailures=1;led.stop();await settle();
 assert.equal(led.snapshot().phase,'stop-failed');assert.equal(led.snapshot().active,false);
 assert.equal(f.writes.at(-1).line,'ZJLED,0,STOP');
});
for(const change of [{transport:'ap'},{bootId:'boot-two'},{connectionGeneration:10},{connected:false,linkVerified:false},{controlAuthorized:false}]){
 test('LED session rejects confirmed change '+JSON.stringify(change),async()=>{
  const {raw:f,led,bound}=fixture();led.set('ZJLED,1,SET,100\n',bound);await settle();
  Object.assign(f.kit,change);const prior=f.writes.length;led.keep();await settle();
  assert.equal(led.snapshot().phase,'blocked');assert.equal(f.writes.length,prior);
 });
}
test('an authenticated reply arriving during a heartbeat delay is not an identity change',()=>{
 const {contract,kits,bound}=fixture();const before=kits.getState(),delayed={...before,connected:false,linkVerified:true};
 assert.equal(contract.validateReply(before,delayed,{kitId:bound.kitId}).kitId,bound.kitId);
 assert.throws(()=>contract.assertBoundSession(bound,delayed),e=>e.code==='KIT_DELAYED');
 assert.doesNotThrow(()=>contract.assertBoundSession(bound,delayed,{allowDelayed:true}));
 assert.throws(()=>contract.validateReply(before,{...delayed,linkVerified:false},{kitId:bound.kitId}),e=>e.code==='KIT_DISCONNECTED');
});
test('a late failed STOP is reported without overwriting a newer session health',async()=>{
 const gate=deferred(),failures=[],writes=[];let holdStop=true;
 const led=createPythonLedSession({verify:async()=>{},write:async packet=>{writes.push(packet);if(holdStop&&packet.includes(',STOP'))await gate.promise},onObsoleteFailure:e=>failures.push(e)});
 const bound={kitId:'ZFC-A1-012345ABCDEF',transport:'sta'};
 led.set('ZJLED,1,SET,100\n',bound);await settle();led.stop();await settle();
 led.set('ZJLED,2,SET,50\n',bound);holdStop=false;gate.reject(Error('STOP response lost'));await settle();
 assert.equal(failures.length,1);assert.equal(failures[0].command,'STOP');assert.match(failures[0].error.message,/response lost/);
 assert.equal(led.snapshot().phase,'healthy');assert.equal(led.snapshot().failures,0);
 assert.equal(writes.at(-1),'ZJLED,2,SET,50\n');
});
