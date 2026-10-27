import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const networkSource=read('companion-network.js');
const html=read('companion.html');
const css=read('companion.css');
const native=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java');
const kitId='ZFC-A1-012345ABCDEF';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function harness(){
 const handlers=new Map(),elements=new Map(),sent=[],expectedSsid='zebjus_drone_1';
 let denyMode=false,appliedLed=false;
 const element=id=>{
  if(!elements.has(id))elements.set(id,{
   value:'',checked:false,disabled:false,textContent:'',dataset:{},attrs:{},
   setAttribute(k,v){this.attrs[k]=String(v)},getAttribute(k){return this.attrs[k]??null},
   addEventListener(type,fn){handlers.set(id+':'+type,fn)},
   querySelector(){return null},replaceChildren(){},add(){},click(){handlers.get(id+':click')?.()}
  });
  return elements.get(id);
 };
 const response=(route,method,args)=>{
  sent.push({route,method,args});
  if(route==='/api/status')return {kitId,kitCode:'123456',board:'ZFC-A1',mode:'ap',
   apActive:true,staConnected:false,requestTransport:'AP',apSsid:expectedSsid,
   radioHandover:{version:1,lastStaInput:'ANDROID_WEBRTC',state:'IDLE'},rc:{claimed:false,active:false,inputArmed:false,throttle:1000},staCredentialsSaved:true,apIp:'192.168.4.1',ip:'',ledOn:appliedLed};
  if(route==='/api/wifi/saved')return {preferred:'School_Router',networks:[{ssid:'School_Router',preferred:true}]};
  if(route==='/api/command'){appliedLed=args.line.endsWith(',100');return {kitId,accepted:true,ledOn:appliedLed};}
  if(route==='/api/wifi/mode'){
   if(denyMode)throw Error('setup_authorization_required');
   return {kitId,mode:args.mode,state:'switching',radioHandover:{version:1,profileSaved:true,revision:1,state:'PREPARED',mode:args.mode,targetInput:'ANDROID_WEBRTC',lastStaInput:'ANDROID_WEBRTC'},rcAccess:{version:1,pathVersion:1,controlPath:'ANDROID_WEBRTC',selection:'ANDROID',paused:true,handoverPaused:true,maintenance:{active:false,owned:false,leaseRemainingMs:0}}};
  }
  throw Error('Unexpected authenticated route: '+route);
 };
 const win={dispatchEvent(){},addEventListener(){},ZebjusKitAuth:{
  local:async(_native,id,scope)=>{
   assert.equal(id,kitId);assert.equal(scope,'ap_diagnostics');
   return {local:true,expiresAt:Date.now()+60000,request:async(route,method,args)=>response(route,method,args||{})};
  }
 }};
 win.ZebjusNative={
  requestSecure(reqId,ip,method,route){
   assert.equal(ip,'192.168.4.1');assert.equal(route,'/api/identify');
   queueMicrotask(()=>win.zebjusNativeResult({id:reqId,ok:true,status:200,text:JSON.stringify({
    kitId,authVersion:2,simpleConnection:true})}));
  },
  requestWifiPermission(reqId){queueMicrotask(()=>win.zebjusNativeWifiPermissionResult({id:reqId,granted:true}))},
  pinSelectedNetwork(reqId,id,ip,transport,ssid){
   assert.equal(id,kitId);assert.equal(transport,'AP');assert.equal(ssid,expectedSsid);
   queueMicrotask(()=>win.zebjusNativePinResult({id:reqId,ok:true}));
  },clearSelectedNetwork(){},openWifiSettings(){}
 };
 const doc={readyState:'loading',hidden:false,getElementById:element,
  addEventListener(type,fn){handlers.set('document:'+type,fn)}};
 const later=(fn,ms)=>{const timer=setTimeout(fn,ms);if(ms>=4000)timer.unref?.();return timer};
 const policy={};runInNewContext(read('js/control-path-policy.js'),policy);win.ZebjusControlPaths=policy.ZebjusControlPaths;
 runInNewContext(networkSource,{window:win,document:doc,Date,performance,URLSearchParams,Promise,Set,Map,
  Option:class{},setTimeout:later,clearTimeout,setInterval(){},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o?.detail}}});
 handlers.get('document:DOMContentLoaded')();
 return {win,element,sent,deny:flag=>{denyMode=flag},click:id=>handlers.get(id+':click')?.()};
}

test('Home LED uses authenticated SET 100/0; saved STA SSID loads without exposing password',async()=>{
 const h=harness();
 assert.equal(h.element('flightLedToggle').disabled,true);
 h.click('kitConnect');await sleep(30);
 assert.equal(h.win.ZebjusNetwork.isConnected(),true);
 assert.equal(h.element('kitSavedStaStatus').textContent,'Saved STA: School_Router');
 assert.equal(h.element('kitSsid').value,'School_Router');
 assert.equal(h.element('kitPassword').value,'');
 assert.equal(h.element('flightLedToggle').disabled,false);
 await h.win.ZebjusNetwork.toggleLed();
 assert.equal(h.element('flightLedToggle').attrs['aria-pressed'],'true');
 assert.match(h.sent.filter(x=>x.route==='/api/command').at(-1).args.line,/^ZJLED,\d+,SET,100$/);
 await h.win.ZebjusNetwork.toggleLed();
 assert.equal(h.element('flightLedToggle').attrs['aria-pressed'],'false');
 assert.match(h.sent.filter(x=>x.route==='/api/command').at(-1).args.line,/^ZJLED,\d+,SET,0$/);
});

test('AP/STA command remains on verified AP until signed switch ACK; failures leave AP connected',async()=>{
 const h=harness();h.click('kitConnect');await sleep(30);
 h.deny(true);
 await assert.rejects(h.win.ZebjusNetwork.setMode('sta'),/setup_authorization_required/);
 assert.equal(h.win.ZebjusNetwork.selectedTransport(),'ap');
 assert.equal(h.win.ZebjusNetwork.isConnected(),true);
 h.deny(false);
 await h.win.ZebjusNetwork.setMode('sta');
 assert.equal(h.win.ZebjusNetwork.selectedTransport(),'sta');
 assert.equal(h.win.ZebjusNetwork.isConnected(),false,'Await router-side verification');
 assert.equal(h.element('flightNetworkSwitch').attrs['aria-checked'],'true');
 assert.match(h.element('kitNetStatus').textContent,/STA CONNECTING/);
 assert.ok(h.sent.some(v=>v.route==='/api/wifi/mode'&&v.args.mode==='sta'));
});

test('Home and network restrictions remain in place',()=>{
 assert.match(html,/id="flightLedToggle"/);
 assert.equal((html.match(/id="flightArm"/g)||[]).length,1);
 assert.equal((html.match(/id="flightStop"/g)||[]).length,1);
 assert.equal((html.match(/id="flightNetworkSwitch"/g)||[]).length,1);
 assert.match(css,/font-variant-numeric:tabular-nums/);
 assert.match(css,/width:7ch/);
 assert.match(native,/route.equals\("\/api\/wifi\/saved"\)/);
 assert.match(networkSource,/Fallback AP belongs to a different Kit/);
 assert.match(networkSource,/handoverExpectedKit/);
});
