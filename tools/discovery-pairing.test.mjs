import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('reference-inspired discovery probes bounded kit names and AP, deduplicates verified Device IDs',async()=>{
 const source=read('js/classroom-kits.js'),calls=[];
 const reply=(kitId,kitCode,board,name)=>({ok:true,json:async()=>({kitId,kitCode,board,name})});
 const fetch=async url=>{
  calls.push(url);
  if(url==='http://192.168.4.1/api/identify')return reply('ZFC-A2-ABCDEF123456','526624','ZFC-A2','AERION A2');
  if(url==='http://zebjus-drone-2.local/api/identify')return reply('ZFC-A1-FEDCBA987654','136625','ZFC-A1','AERION A1');
  return {ok:false};
 };
 const win={addEventListener(){},dispatchEvent(){},DroneLabSerial:null};
 const doc={readyState:'loading',addEventListener(){},getElementById(){return null}};
 const context={window:win,document:doc,fetch,AbortController,URLSearchParams,
  localStorage:{getItem(){return '[]'},setItem(){}},
  setTimeout(){return 1},clearTimeout(){},console};
 vm.runInNewContext(source,context);
 const items=await win.ZebjusKits.discoverKits();
 assert.equal(items.length,2);
 assert.equal(items.find(x=>x.kitCode==='526624').transport,'ap');
 assert.equal(items.find(x=>x.kitCode==='136625').transport,'sta');
 assert.ok(calls.some(url=>url.includes('zebjus-drone-1.local')));
 assert.ok(calls.length<=60,'No unbounded LAN scan');
 assert.equal(win.ZebjusKits.getState().connected,false,'Discovery never grants control');
});
test('physical USB pairing and real radio status never leak credentials into cached metadata',()=>{
 const kit=read('js/classroom-kits.js'),firmware=read('FlightCore_Firmware/FlightCoreNetwork.h');
 const updater=read('firmware-updater.js'),page=read('index.html');
 assert.match(firmware,/if\(!strcmp\(line,"ZJNET,PAIR"\)\)/);
 assert.match(firmware,/Serial\.println\(zjNetKey\)/);
 assert.match(firmware,/zjStaDisconnectReason/);
 assert.match(firmware,/MDNS\.begin\(host\.c_str\(\)\)/);
 assert.match(kit,/pairedKeys=new Map/);
 assert.match(kit,/if\(!safeKitHost\(ip\)\)/);
 assert.match(kit,/recoverVerifiedLink\(old\)/);
 assert.match(kit,/headerNetworkChoice=state\.transport/);
 assert.match(kit,/if\(d\.rc\?\.claimed\)throw Error/);
 assert.match(updater,/Private controller credentials received \(redacted\)/);
 for(const id of ['kitDiscover','fwDiscoverKits','kitPairUsb','kitDiscoveryResults','fwDiscoveryResults','kitSelectedMode','kitSelectedSta','kitSelectedAp','kitSelectedReason'])
  assert.ok(page.includes('id="'+id+'"'),id);
});
test('firmware release metadata and Service Worker cache version are aligned with source',()=>{
 const sketch=read('FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino');
 const version=read('VERSION.txt').trim(),sw=read('sw.js'),page=read('index.html');
 assert.equal(version,'1.3.9');
 assert.ok(sketch.includes('FW_VERSION="1.3.9"'));
 assert.ok(sw.includes('classroom-kits.css?v=1.3.9-sta1'));
 assert.ok(page.includes('classroom-kits.css?v=1.3.9-sta1'));
});
