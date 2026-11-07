import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../js/flight-telemetry.js';

const source=readFileSync('js/classroom-kits.js','utf8');
const client=source.slice(source.indexOf('let nextFlightDataReadAt='),source.indexOf('async function observeFlightData()'));
function fixture(transport='sta',boot='a'.repeat(32)){
 const state={kitId:'ZFC-A2-012345ABCDEF',bootId:boot,transport,owner:false};
 const packet={version:1,kitId:state.kitId,bootId:'a'.repeat(32),sequence:1,sampleSequence:1,atUs:4000,ageUs:0,
  valid:true,rates:[0,0,0],gravity:[0,0,1],attitude:[0,0],attitudeValid:true,levelCalibrated:true,accelUsed:true,
  offAck:true,authorized:false,deadlineFault:false,owner:0,state:'DISARMED',reason:'NONE',applied:[0,0,0,0],
  dtUs:4000,measuredHz:250,missedTicks:0,flightModeState:{supported:true,saved:'angle',active:'angle',pending:null}};
 let reply,delay,events=0;const calls=[];
 const context=vm.createContext({state,Date:{now:()=>1000},CustomEvent,
  root:{ZebjusFlightTelemetry:globalThis.ZebjusFlightTelemetry,dispatchEvent:()=>events++},
  clearImuObservation:()=>{},
  waitSerial:()=>new Promise(resolve=>{reply=resolve;}),
  usbWrite:async line=>{calls.push(line);reply('ZJFD,ACK,'+state.kitId+','+line.split(',')[3]+','+JSON.stringify(packet));},
  deviceRequest:async(route,method,args,guard)=>{calls.push([route,method]);guard();if(delay)await delay;return packet;}
 });
 vm.runInContext('let reconnectTicket=1,controlTicket=0,ownOwnerId="",adminUnlockedUntil=9999,lastRecoveryReason="";function advanceConnectionGeneration(){return ++reconnectTicket;}'+client,context);
 return {state,packet,calls,context,events:()=>events,read:()=>vm.runInContext('readFlightTelemetry()',context),
  hold:()=>{let done;delay=new Promise(resolve=>{done=resolve});return done;}};
}
test('USB learns a fully validated boot; network observations remain GET-only',async()=>{
 for(const transport of ['usb','ap','sta']){
  const f=fixture(transport,transport==='usb'?'':'a'.repeat(32));await f.read();
  assert.equal(f.state.flightTelemetry.sampleSequence,1);assert.equal(f.state.bootId,'a'.repeat(32));
  assert.equal(f.events(),1);
  if(transport==='usb')assert.match(f.calls[0],/^ZJFD,GET,ZFC-A2-/);
  else assert.deepEqual(f.calls,[['/api/flight/telemetry','GET']]);
 }
});
test('malformed USB packet cannot establish a boot or refresh the view',async()=>{
 for(const change of [{kitId:'wrong'},{owner:20},{bootId:'invalid'},{rates:[NaN,0,0]}]){
  const f=fixture('usb','');Object.assign(f.packet,change);await f.read();
  assert.equal(f.state.bootId,'');assert.equal(f.state.flightTelemetry,undefined);assert.equal(f.events(),0);
 }
});
test('USB boot change retires control generation and teacher unlock; stale network responses are discarded',async()=>{
 const f=fixture('usb','b'.repeat(32));f.state.owner=true;await f.read();
 assert.equal(f.state.owner,false);assert.equal(f.state.flightTelemetry.generation,2);
 assert.equal(vm.runInContext('adminUnlockedUntil',f.context),0);
 assert.equal(vm.runInContext('lastRecoveryReason',f.context),'BOOT_CHANGED');
 for(const change of ['reconnectTicket++','state.kitId="other"','state.bootId="other"','state.transport="ap"']){
  const f=fixture();const release=f.hold();const pending=f.read();vm.runInContext(change,f.context);release();await pending;
  assert.equal(f.state.flightTelemetry,undefined);assert.equal(f.events(),0);
 }
});
test('candidate version metadata cannot drift away from the compiled source version',()=>{
 const version=readFileSync('VERSION.txt','utf8').trim();
 for(const name of ['bench-release-policy.json','publication-hold.json'])
  assert.equal(JSON.parse(readFileSync('FlightCore_Firmware/'+name,'utf8')).candidateVersion,version);
});
