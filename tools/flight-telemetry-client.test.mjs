import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../js/flight-telemetry.js';

const source=readFileSync('js/classroom-kits.js','utf8');
const client=source.slice(source.indexOf('let nextFlightDataReadAt='),source.indexOf('async function observeFlightData()'));
test('periodic flight, RC and status observations share a 100 ms read slot',()=>{
 const code=source.slice(source.indexOf('let nextMonitorReadAt='),source.indexOf('async function observeController()'));
 let now=1000;
 const starts=[];
 const ctx=vm.createContext({FC_MONITOR_INTERVAL_MS:100,statusPending:null,rcReadPending:false,flightTelemetryPending:false,
  observeFlightData:()=>take('flight'),observeController:()=>take('rc')});
 vm.runInContext(code,ctx);
 function take(stream){if(ctx.beginMonitorRead(stream,now))starts.push([now,stream]);}
 ctx.observeMonitor();
 now+=99;take('status');ctx.observeMonitor();
 now+=1;ctx.observeMonitor();
 now+=100;ctx.rcReadPending=true;take('status');ctx.observeMonitor();
 now+=200;ctx.rcReadPending=false;take('status');ctx.observeMonitor();
 now+=100;ctx.observeMonitor();
 assert.deepEqual(starts,[[1000,'flight'],[1100,'rc'],[1400,'status'],[1500,'flight']]);
});
function fixture(transport='sta',boot='a'.repeat(32)){
 const state={kitId:'ZFC-A2-012345ABCDEF',bootId:boot,transport,owner:false};
 const packet={version:1,kitId:state.kitId,bootId:'a'.repeat(32),sequence:1,sampleSequence:1,atUs:4000,ageUs:0,
  valid:true,rates:[0,0,0],gravity:[0,0,1],attitude:[0,0],attitudeValid:true,levelCalibrated:true,accelUsed:true,
  offAck:true,authorized:false,deadlineFault:false,owner:0,state:'DISARMED',reason:'NONE',applied:[0,0,0,0],
  dtUs:4000,measuredHz:250,missedTicks:0,flightModeState:{supported:true,saved:'angle',active:'angle',pending:null}};
 let reply,delay,failure,events=0;const calls=[];
 const context=vm.createContext({state,Date:{now:()=>1000},CustomEvent,
  root:{ZebjusFlightTelemetry:globalThis.ZebjusFlightTelemetry,dispatchEvent:()=>events++},
  clearImuObservation:()=>{},
  waitSerial:()=>new Promise(resolve=>{reply=resolve;}),
  usbWrite:async line=>{calls.push(line);reply('ZJFD,ACK,'+state.kitId+','+line.split(',')[3]+','+JSON.stringify(packet));},
  deviceRequest:async(route,method,args,guard)=>{calls.push([route,method]);guard();if(failure)throw failure;if(delay)await delay;return packet;}
 });
 vm.runInContext('let reconnectTicket=1,controlTicket=0,ownOwnerId="",adminUnlockedUntil=9999,lastRecoveryReason="";function advanceConnectionGeneration(){return ++reconnectTicket;}'+client,context);
 return {state,packet,calls,context,events:()=>events,read:()=>vm.runInContext('readFlightTelemetry()',context),
  fail:error=>{failure=error;},
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
test('duplicates, dropped telemetry and STOP preemption leave the last observation and control state intact',async()=>{
 const f=fixture();f.state.owner=true;f.state.rcSession='diagnostic';
 await f.read();const first=f.state.flightTelemetry;
 await f.read();assert.equal(f.events(),1);
 f.fail(Object.assign(Error('STOP has priority'),{code:'SAFETY_CANCELLED'}));await f.read();
 assert.equal(vm.runInContext('nextFlightDataReadAt',f.context),0);
 f.fail(Error('telemetry request timed out'));await f.read();
 assert.equal(vm.runInContext('nextFlightDataReadAt',f.context),2500);
 assert.equal(f.events(),1);assert.equal(f.state.flightTelemetry,first);
 assert.equal(f.state.owner,true);assert.equal(f.state.rcSession,'diagnostic');
 assert.ok(f.calls.every(([route,method])=>route==='/api/flight/telemetry'&&method==='GET'));
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
