import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const src=read('companion-network.js');
const activity=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
const wifi=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreWifiLink.java');
const html=read('companion.html');
const id='ZFC-A1-012345ABCDEF';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function harness(){
 const listeners=new Map(),elements=new Map(),requests=[],permissions=[];
 const el=name=>{
  if(!elements.has(name))elements.set(name,{value:'',checked:false,disabled:false,textContent:'',dataset:{},
   addEventListener(type,fn){listeners.set(name+':'+type,fn)},replaceChildren(){},add(){}});
  return elements.get(name);
 };
 const win={dispatchEvent(){},addEventListener(){},ZebjusKitAuth:{
  label:()=>({deviceId:id,secret:'private-secret'}),diagnosticKey:()=> 'diagnostic',
  open:async()=>({expiresAt:Date.now()+60000,request:async route=>route==='/api/status'?{
    kitId:id,board:'ZFC-A1',mode:'ap',requestTransport:'AP',apActive:true,staConnected:false,
    apSsid:'ZEBJUS-test',ip:'',rc:{claimed:false},motorsArmed:false,firmwareControl:false
   }:{}})
 }};
 win.ZebjusNative={
  requestWifiPermission:requestId=>permissions.push(requestId),
  requestSecure:(requestId,ip,method,route)=>{
   requests.push(route);
   queueMicrotask(()=>win.zebjusNativeResult({id:requestId,ok:true,status:200,text:JSON.stringify({kitId:id}),proof:''}));
  },clearSelectedNetwork(){},cancelRequest(){},openWifiSettings(){}
 };
 const doc={readyState:'loading',hidden:false,getElementById:el,addEventListener(name,fn){listeners.set('document:'+name,fn)}};
 runInNewContext(src,{window:win,document:doc,Date,Math,Number,Set,Map,Promise,URLSearchParams,
  performance:{now:()=>Date.now()},setTimeout,clearTimeout,setInterval(){},Option:class {},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}}});
 listeners.get('document:DOMContentLoaded')();
 el('kitKey').value='private-label';
 return {win,el,requests,permissions,click:key=>listeners.get(key+':click')()};
}
test('first Location prompt blocks identify/auth until explicit result, denial is fail closed',async()=>{
 const h=harness();h.click('kitConnect');
 await sleep(15);
 assert.equal(h.permissions.length,1);
 assert.deepEqual(h.requests,[],'no identify or authentication while Android permission is pending');
 h.win.zebjusNativeWifiPermissionResult({id:h.permissions[0],granted:false,error:'Precise Location denied'});
 await sleep(20);
 assert.deepEqual(h.requests,[]);
 assert.match(h.el('kitNetStatus').textContent,/Precise Location denied/);
 assert.equal(h.win.ZebjusNetwork.isConnected(),false);
 h.click('kitConnect');
 await sleep(15);
 assert.equal(h.permissions.length,2);
 assert.deepEqual(h.requests,[]);
 h.win.zebjusNativeWifiPermissionResult({id:h.permissions[1],granted:true});
 await sleep(25);
 assert.ok(h.requests.includes('/api/identify'));
 assert.equal(h.win.ZebjusNetwork.isConnected(),true);
});
test('Saved ID drives NSD without requiring private label, with transient cached fallback',()=>{
 assert.match(src,/const savedId=\(el\('kitSavedId'\)/);
 assert.match(src,/await discoverKit\(id\)/);
 assert.match(src,/const candidates=\[found,known,oldInput!=='192\.168\.4\.1'\?oldInput:''\]/);
 assert.match(src,/raw=await nativeTransport\('\/api\/identify'\)/);
 assert.match(src,/identified\.kitId!==id/);
 assert.match(src,/await status\(\);reconnectEnabled=true/);
 assert.match(src,/if\(el\('kitSavedId'\)&&verifiedKitId\)/);
});
test('Android 12+ uses per-Network unredacted WifiInfo after runtime approval',()=>{
 assert.match(activity,/WIFI_LOCATION_REQUEST = 702/);
 assert.match(activity,/pendingWifiPermissionRequestId/);
 assert.match(activity,/requestWifiPermission\(arg\(args,0\)\)/);
 assert.match(activity,/wifiLink\.refreshLocationIdentity\(\)/);
 assert.match(activity,/postDelayed\(\(\)->reportWifiPermission\(id,true\),350\)/);
 assert.match(wifi,/FLAG_INCLUDE_LOCATION_INFO/);
 assert.match(wifi,/observedWifi\.get\(network\)/);
 assert.match(wifi,/matchingWifi\(expectedSsid\)/);
 assert.match(wifi,/pinnedSsid\.equals\(checkedSsid\(observed\)\)/);
 assert.match(wifi,/Build\.VERSION\.SDK_INT>=31/);
 assert.match(wifi,/return wifi==null\?null:wifi\.getConnectionInfo\(\)/);
});
test('Keystore opt-in has no 5-second dialog timer and cancel settles promise',()=>{
 assert.match(src,/op==='forgetDiagnostic'\?setTimeout/);
 assert.match(activity,/setOnCancelListener\(dialog->respondVault/);
 assert.match(activity,/setNegativeButton\("Cancel"/);
});
test('Accessible settings groups and live signed OTA outcomes are visible',()=>{
 for(const group of ['Pairing','My Kits','Wi-Fi','Firmware OTA','Permissions'])
  assert.ok(html.includes('<summary>'+group),group);
 for(const id of ['appBuildVersion','kitOtaProgress','kitOtaPhase','kitSavedId','kitGrantDiagnostic'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(src,/OTA ABORT CONFIRMED/);
 assert.match(src,/OTA STATE UNCONFIRMED/);
 assert.match(src,/OTA PAUSED/);
 assert.match(src,/waiting for verified controller reboot/);
});
