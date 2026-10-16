import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const network=read('companion-network.js');
const native=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreWifiLink.java');
const kitId='ZFC-A1-012345ABCDEF';
const flush=()=>new Promise(resolve=>setTimeout(resolve,25));
function harness(){
 const listeners=new Map(),elements=new Map(),intervals=new Map(),state={statusFailures:0,identifyFailures:0,identifyCount:0,sessionCount:0,pinCount:0,switchTransitions:[],cancels:0};
 const element=id=>{
  if(!elements.has(id)){
   const e={value:'',checked:false,textContent:'',dataset:{},attrs:{},_disabled:false,
    setAttribute(key,value){this.attrs[key]=String(value)},getAttribute(key){return this.attrs[key]??null},
    addEventListener(type,cb){listeners.set(id+':'+type,cb)},querySelector(){return null},replaceChildren(){},add(){},click(){listeners.get(id+':click')?.()}};
   Object.defineProperty(e,'disabled',{get(){return this._disabled},set(next){this._disabled=next;if(id==='flightNetworkSwitch')state.switchTransitions.push(next)}});
   elements.set(id,e);
  }
  return elements.get(id);
 };
 const win={dispatchEvent(){},addEventListener(){},ZebjusKitAuth:{
  local:async(_request,id,scope)=>{
   assert.equal(id,kitId);assert.equal(scope,'ap_diagnostics');state.sessionCount++;
   return {local:true,expiresAt:Date.now()+60000,request:async route=>{
    if(route!=='/api/status')throw Error('Unexpected status route: '+route);
    if(state.statusFailures>0){state.statusFailures--;throw Error('Native Wi-Fi deadline exceeded')}
    return {kitId,kitCode:'123456',mode:'ap',apActive:true,requestTransport:'AP',
     apSsid:'zebjus_drone_1',staConnected:false,staCredentialsSaved:false};
   }};
  }
 }};
 win.ZebjusNative={
  requestSecure(id,ip,method,route){
   assert.equal(route,'/api/identify');assert.equal(ip,'192.168.4.1');state.identifyCount++;
   queueMicrotask(()=>{
    if(state.identifyFailures>0){state.identifyFailures--;win.zebjusNativeResult({id,ok:false,error:'Wi-Fi device unavailable: SocketTimeoutException'});return;}
    win.zebjusNativeResult({id,ok:true,status:200,text:JSON.stringify({kitId,authVersion:2,simpleConnection:true})});
   });
  },
  requestWifiPermission(id){queueMicrotask(()=>win.zebjusNativeWifiPermissionResult({id,granted:true}))},
  pinSelectedNetwork(id,device,ip,mode,ssid){
   assert.equal(device,kitId);assert.equal(mode,'AP');assert.equal(ssid,'zebjus_drone_1');
   state.pinCount++;queueMicrotask(()=>win.zebjusNativePinResult({id,ok:true}));
  },
  clearSelectedNetwork(){state.cancels++},openWifiSettings(){}
 };
 const doc={readyState:'loading',hidden:false,getElementById:element,addEventListener(name,cb){listeners.set('document:'+name,cb)}};
 const timeouts=[];
 const queueTimeout=(cb,delay)=>{const handle={cb,delay,cancelled:false};timeouts.push(handle);return handle};
 const cancelTimeout=handle=>{if(handle)handle.cancelled=true};
 runInNewContext(network,{window:win,document:doc,Date,performance,URLSearchParams,Promise,Set,Map,
  Option:class{},setTimeout:queueTimeout,clearTimeout:cancelTimeout,
  setInterval:(cb,ms)=>intervals.set(ms,cb),CustomEvent:class{constructor(type,args){this.type=type;this.detail=args?.detail}}});
 listeners.get('document:DOMContentLoaded')();
 return {win,state,element,intervals,
  click:id=>listeners.get(id+':click')?.(),
  timers:()=>timeouts.filter(x=>!x.cancelled),
  runTimer:async delay=>{const item=timeouts.find(x=>!x.cancelled&&x.delay===delay);assert.ok(item,'Missing timer '+delay);item.cancelled=true;item.cb();await flush()}
 };
}
test('every healthy signed health poll leaves AP/STA toggle enabled and stays AP',async()=>{
 const h=harness();h.click('kitConnect');await flush();
 assert.equal(h.win.ZebjusNetwork.isConnected(),true);
 const before=h.state.switchTransitions.length;
 await h.intervals.get(3500)();await flush();
 assert.equal(h.win.ZebjusNetwork.isConnected(),true);
 assert.equal(h.win.ZebjusNetwork.selectedTransport(),'ap');
 assert.deepEqual(h.state.switchTransitions.slice(before),[],'health polling must not disable the switch on each tick');
});
test('one transient status miss shows verifying; a second failure disarms and reconnects only verified AP',async()=>{
 const h=harness();h.click('kitConnect');await flush();
 h.state.statusFailures=2;
 const before=h.state.switchTransitions.length;
 h.intervals.get(3500)();await flush();
 assert.equal(h.win.ZebjusNetwork.isConnected(),true);
 assert.match(h.element('kitNetStatus').textContent,/AP LINK VERIFYING/);
 assert.deepEqual(h.state.switchTransitions.slice(before),[]);
 h.intervals.get(3500)();await flush();
 assert.equal(h.win.ZebjusNetwork.isConnected(),false);
 assert.equal(h.win.ZebjusNetwork.selectedTransport(),'ap');
 assert.match(h.element('kitNetStatus').textContent,/AP DISCONNECTED.*fresh Kit identity/);
 assert.ok(h.timers().some(x=>x.delay===1000),'must schedule identity re-verification');
 await h.runTimer(1000);
 assert.equal(h.win.ZebjusNetwork.isConnected(),true);
 assert.ok(h.state.identifyCount>=2,'must identify Kit again');
});
test('a temporary failed automatic AP association retries at a bounded interval',async()=>{
 const h=harness();
 h.state.identifyFailures=1;
 await h.runTimer(1000); // Initial background AP association.
 assert.equal(h.win.ZebjusNetwork.isConnected(),false);
 assert.match(h.element('kitNetStatus').textContent,/AP RECONNECTING/);
 assert.ok(h.timers().some(x=>x.delay===12000));
 await h.runTimer(12000);
 assert.equal(h.win.ZebjusNetwork.isConnected(),true);
 assert.equal(h.state.identifyCount,2);
});
test('Android capability redaction cannot clear a trusted pin or trigger synthetic network loss',()=>{
 assert.match(native,/if\(!\(caps\.getTransportInfo\(\) instanceof WifiInfo\)\)\{\s*observedWifi\.remove\(network\);\s*return;/);
 assert.match(native,/catch\(IllegalStateException redacted\)/);
 assert.match(native,/observedWifi\.remove\(network\)/);
 assert.match(native,/private void handleLost\(Network network\)\{/);
 assert.match(native,/if\(matches\(network\)\)\{clear\(\);listener\.linkChanged\(\);\}/);
 assert.match(native,/pinnedBssid\.equalsIgnoreCase\(checkedBssid\(snapshot\)\)/);
 assert.match(native,/Network networkFor\(String ip,boolean bootstrap\)/);
});
