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
 assert.match(read('js/classroom-kits.js'),/authenticated Device ID verification failed/);
});
