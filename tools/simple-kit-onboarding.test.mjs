import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('MY KITS provides direct AP Wi-Fi setup and discovery without BOOT or USB pairing',()=>{
 const html=read('index.html'),source=read('js/classroom-kits.js');
 for(const id of ['kitSimpleSetup','kitSimpleHelp','kitFindAp','kitDiscover','kitWifiScan','kitWifiSave','kitHandover','kitRememberBrowser'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const obsolete of ['id="kitLabelInput"','id="kitEnrollLabel"','id="kitEnrollment"','New Kit • private label enrollment / renew setup'])
  assert.equal(html.includes(obsolete),false,obsolete);
 assert.doesNotMatch(source,/kitLabelInput|kitEnrollment|kitEnrollLabel|enrollLabel|private kit label/i);
 assert.match(source,/guardAction\('kitFindAp',findKitAp\)/);
 assert.doesNotMatch(html,/id="kitPairFirst"/);
 assert.doesNotMatch(html,/id="kitPairUsb"/);
 assert.match(source,/async function discoverBridgeHosts\(/);
 assert.match(source,/await connect\(\)/);
});

test('AP Find Kit discovers public code but never treats discovery as authorization',async()=>{
 const elements={
  kitCodeInput:{value:''},
  kitTransport:{value:'sta'},
  kitIpInput:{value:''},
 };
 let probes=0;
 const fakeFetch=async (url)=>{
  assert.equal(url,'http://192.168.4.1/api/identify');probes++;
  return {ok:true,json:async()=>({kitId:'ZFC-A1-012345ABCDEF',kitCode:'432198',board:'ZFC-A1',name:'AERION A1'})};
 };
 const window={
  ZebjusKitPairingStore:{fromSession:()=>'',restore:async()=>''},
  addEventListener(){},dispatchEvent(){}
 };
 const document={readyState:'loading',addEventListener(){},getElementById:id=>elements[id]||null,
  querySelectorAll:()=>[],querySelector:()=>null};
 const localStorage={getItem:()=>null,setItem(){}};
 vm.runInNewContext(read('js/classroom-kits.js'),{window,document,localStorage,
  fetch:fakeFetch,setTimeout,clearTimeout,AbortController,URLSearchParams,console});
 const found=await window.ZebjusKits.findKitAp();
 assert.equal(probes,1);
 assert.equal(found.kitId,'ZFC-A1-012345ABCDEF');
 assert.equal(elements.kitCodeInput.value,'432198');
 assert.equal(elements.kitTransport.value,'ap');
 assert.equal(elements.kitIpInput.value,'192.168.4.1');
 assert.equal(window.ZebjusKits.getState().connected,false,'Public identity cannot mark a secure connection');
 assert.equal(window.ZebjusKits.getState().owner,false,'No RC ownership from AP discovery');
});

test('No unsafe 6-digit key, Wi-Fi password, or AP discovery shortcut was added to firmware',()=>{
 const fw=read('FlightCore_Firmware/FlightCoreNetwork.h');
 const auth=read('FlightCore_Firmware/FlightCoreEnrollment.h');
 assert.match(fw,/zjSessionAuthenticated\(\)/);
 assert.match(fw,/if\(code!=zjKitCode\)/);
 assert.match(fw,/if\(!zjAllowSetup\(\)\)return;/);
 assert.doesNotMatch(fw,/zjPhysicalSetup|ZJ_SETUP_BUTTON_PIN/);
 assert.match(auth,/s\.local&&!s\.localSta&&String\(zjClientTransport\(\)\)=="AP"/);
 assert.match(auth,/X-ZJ-Session/);
 assert.match(read('js/classroom-kits.js'),/authenticated connection failed:/);
 assert.match(read('js/classroom-kits.js'),/state\.lastError\|\|'No authenticated status was received'/);
});

test('stale remembered key cannot override an available direct AP local session',async()=>{
 const kitId='ZFC-A1-012345ABCDEF',code='432198',ip='192.168.4.1';
 const elements={kitCodeInput:{value:''},kitTransport:{value:'sta'},kitIpInput:{value:''},kitKeyInput:{value:''}};
 let opened=0,signedRequests=0,identifies=0;
 const status={kitId,kitCode:code,kitName:'AERION A1',board:'ZFC-A1',version:'1.4.3',
  requestTransport:'AP',mode:'auto',setupAuthorized:true,otaAuthorized:false,apActive:true,
  staConnected:false,ip:'',rc:{claimed:false,motorsDisabled:true}};
 const window={
  ZebjusKitPairingStore:{fromSession:()=> 'e'.repeat(32),restore:async()=> 'e'.repeat(32)},
  ZebjusKitAuth:{http:base=>({base}),openLocal:async(_transport,id,mode)=>{
   assert.equal(id,kitId);assert.equal(mode,'ap');opened++;
   return {expiresAt:Date.now()+600000,request:async route=>{
    assert.equal(route,'/api/status');signedRequests++;return status;
   }};
  }},
  addEventListener(){},dispatchEvent(){}
 };
 const fetch=async url=>{assert.equal(url,'http://192.168.4.1/api/identify');identifies++;
  return {ok:true,json:async()=>({kitId,kitCode:code,board:'ZFC-A1',name:'AERION A1',simpleConnection:true})};
 };
 const doc={readyState:'loading',addEventListener(){},getElementById:id=>elements[id]||null,querySelectorAll:()=>[],querySelector:()=>null};
 const storage={getItem:()=> '[]',setItem(){}};
 vm.runInNewContext(read('js/classroom-kits.js'),{window,document:doc,localStorage:storage,fetch,
  setTimeout,clearTimeout,AbortController,URLSearchParams,console,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}}});
 const found=await window.ZebjusKits.findKitAp();
 assert.equal(found.kitId,kitId);assert.equal(opened,1,'only a local session opens, not obsolete saved key auth');
 assert.ok(signedRequests>=1);assert.ok(identifies>=2);
 assert.equal(window.ZebjusKits.getState().connected,true);
 assert.equal(window.ZebjusKits.getState().setupAuthorized,true);
 assert.equal(window.ZebjusKits.getState().transport,'ap');
});

test('one signed 401 can reverify kit identity and renew the local AP session',async()=>{
 const kitId='ZFC-A1-012345ABCDEF',code='432198';
 const elements={kitCodeInput:{value:''},kitTransport:{value:'sta'},kitIpInput:{value:''},kitKeyInput:{value:''}};
 let opened=0,identifies=0;
 const status={kitId,kitCode:code,kitName:'AERION A1',board:'ZFC-A1',version:'1.4.3',
  requestTransport:'AP',mode:'auto',setupAuthorized:true,otaAuthorized:false,apActive:true,staConnected:false,
  ip:'',rc:{claimed:false,motorsDisabled:true}};
 const window={
  ZebjusKitPairingStore:{fromSession:()=>'',restore:async()=>''},
  ZebjusKitAuth:{http:base=>({base}),openLocal:async()=>{opened++;
   const first=opened===1;
   return {expiresAt:Date.now()+600000,request:async()=>{
    if(first){const e=Error('session_required_or_expired');e.status=401;throw e}
    return status;
   }};
  }},addEventListener(){},dispatchEvent(){}
 };
 const fetch=async url=>{assert.equal(url,'http://192.168.4.1/api/identify');identifies++;
  return {ok:true,json:async()=>({kitId,kitCode:code,board:'ZFC-A1',simpleConnection:true})};
 };
 const doc={readyState:'loading',addEventListener(){},getElementById:id=>elements[id]||null,querySelectorAll:()=>[],querySelector:()=>null};
 vm.runInNewContext(read('js/classroom-kits.js'),{window,document:doc,localStorage:{getItem:()=> '[]',setItem(){}},fetch,
  setTimeout,clearTimeout,AbortController,URLSearchParams,console,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}}});
 await window.ZebjusKits.findKitAp();
 assert.equal(opened,2,'one and only one renewed session');
 assert.ok(identifies>=3,'full Device ID reverified before renewing');
 assert.equal(window.ZebjusKits.getState().connected,true);
});
