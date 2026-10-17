import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
const root=new URL('../',import.meta.url),source=readFileSync(new URL('sw.js',root),'utf8');
function runtime(){
 const origin='https://example.test',base=origin+'/dronelab/',events={},store=new Map();let offline=false,skip=false,fail='';
 const key=x=>new URL(typeof x==='string'?x:x.url,base).href;
 const cache={async put(req,res){store.set(key(req),res.clone())},async match(req){return store.get(key(req))?.clone()}};
 const ctx={URL,Request,Response,AbortController,setTimeout,clearTimeout,caches:{open:async()=>cache,keys:async()=>['dronelab-qr-pairing-v1.4.4-smart-pair','unrelated-cache'],delete:async name=>{ctx.deleted.push(name)}},deleted:[],fetch:async(req)=>{
  if(offline)throw Error('offline');const url=new URL(key(req));if(url.pathname.endsWith(fail)&&fail)return new Response('',{status:404});
  const rel=url.pathname.slice('/dronelab/'.length)||'index.html',file=new URL(rel,root);
  if(!existsSync(file))return new Response('',{status:404});return new Response(readFileSync(file));
 },self:{location:{origin},addEventListener:(type,fn)=>events[type]=fn,skipWaiting:async()=>skip=true,clients:{claim:async()=>{}}}};
 vm.runInNewContext(source,ctx);return {store,ctx,setOffline:()=>offline=true,setFailure:f=>fail=f,skipped:()=>skip,
 install:()=>new Promise((resolve,reject)=>events.install({waitUntil:p=>p.then(resolve,reject)})),
 activate:()=>new Promise((resolve,reject)=>events.activate({waitUntil:p=>p.then(resolve,reject)})),
 request:url=>new Promise((resolve,reject)=>events.fetch({request:new Request(key(url)),respondWith:p=>p.then(resolve,reject)}))};
}
test('APP binaries precached, FACTORY images fetched only when explicitly needed',async()=>{
 const r=runtime();await r.install();r.setOffline();
 const catalog=JSON.parse(readFileSync(new URL('FlightCore_Firmware/catalog.json',root),'utf8'));
 assert.equal((await r.request('./FlightCore_Firmware/catalog.json?v='+catalog.version)).ok,true);
 for(const board of catalog.boards){
  const app=board.latest.app;
  if(app.available)assert.equal((await r.request('./FlightCore_Firmware/'+app.file+'?v='+board.latest.version)).ok,true);
  const factory=board.latest.factory;
  if(factory.available)assert.equal((await r.request('./FlightCore_Firmware/'+factory.file+'?v='+board.latest.version)).ok,false,'Factory requires an explicit online download');
 }
});
test('large Python plotting wheels and Factory images cache on first demand and remain usable offline',async()=>{
 const r=runtime();await r.install();
 const wheel='./vendor/pyodide/matplotlib-3.8.4-cp312-cp312-pyodide_2024_0_wasm32.whl';
 const factory='./FlightCore_Firmware/ZEBJUS_FLIGHTCORE_A2_FACTORY.bin?v=1.4.8';
 const key=x=>new URL(x,'https://example.test/dronelab/').href;
 assert.equal(r.store.has(key(wheel)),false,'no eager Python wheel');
 assert.equal(r.store.has(key(factory)),false,'no eager Factory image');
 assert.equal((await r.request(wheel)).ok,true);
 assert.equal((await r.request(factory)).ok,true);
 r.setOffline();
 assert.equal((await r.request(wheel)).ok,true);
 assert.equal((await r.request(factory)).ok,true);
});
test('AP-only cache-busted scripts/styles load while firmware version keys stay exact',async()=>{
 const r=runtime();await r.install();r.setOffline();
 for(const path of ['./firmware-updater.js?v=pair-138','./js/python-lab.js?v=compact-run-20261011','./python-ide-workspace.css?v=compact-run-20261011']){
  const response=await r.request(path);assert.equal(response.ok,true,path);assert.ok((await response.text()).length>100);
 }
 assert.equal((await r.request('./FlightCore_Firmware/ZEBJUS_FLIGHTCORE_A1_APP.bin?v=unpublished')).ok,false);
});
test('version metadata refreshes online and retains cache offline',async()=>{
 const r=runtime();await r.install();r.store.set('https://example.test/dronelab/app-version.json',new Response('{"version":"old"}'));
 const online=await r.request('./app-version.json'),onlineMeta=JSON.parse(await online.text());
 assert.match(onlineMeta.version,/^\d+\.\d+\.\d+\+\d+$/,'Stamped version must be valid');
 r.setOffline();const cached=JSON.parse(await (await r.request('./app-version.json')).text());
 assert.equal(cached.version,onlineMeta.version,'Offline cache must retain latest online version');
});
test('failed essential installation retains previous worker; activation preserves unrelated caches',async()=>{
 const failed=runtime();failed.setFailure('python-lab-worker.js');await assert.rejects(failed.install(),/Essential offline assets/);assert.equal(failed.skipped(),false);
 const r=runtime();await r.install();await r.activate();assert.deepEqual(r.ctx.deleted,['dronelab-qr-pairing-v1.4.4-smart-pair']);
});

test('reachability probe bypasses Service Worker even when version metadata is cached',()=>{
 const handlers={};
 vm.runInNewContext(source,{URL,self:{location:{origin:'https://example.test'},addEventListener:(kind,fn)=>handlers[kind]=fn}});
 let intercepted=false;handlers.fetch({request:{method:'GET',url:'https://example.test/dronelab/app-version.json?connectivity_probe=123'},respondWith(){intercepted=true}});
 assert.equal(intercepted,false,'Cached version must never report live Web reachability');
});

test('unified Devices & Firmware sidebar loads offline with its exact versioned script and CSS',async()=>{
 const r=runtime();await r.install();r.setOffline();
 for(const path of ['./devices-workspace.css?v=unified-devices-firmware-method-20261015','./js/devices-workspace.js?v=one-click-advanced-secure-ota-20261015']){
  const response=await r.request(path);
  assert.equal(response.ok,true,path);
  assert.ok((await response.text()).length>100,path);
 }
});

test('latest audited AP/STA, USB and WebRTC scripts are precached with the exact page versions',async()=>{
 const page=readFileSync(new URL('index.html',root),'utf8'),sw=source;
 const versions=[['pairing-web.js','connectivity-audit-20261015'],['firmware-updater.js','usb-readable-20261017'],['js/firmware-connect.js','buildtime-utc-20261016']];
 for(const [asset,version] of versions){
  assert.ok(page.includes(asset+'?v='+version),asset+' page source');
  assert.ok(sw.includes(asset+'?v='+version),asset+' offline precache');
 }
 const r=runtime();await r.install();r.setOffline();
 for(const [asset,version] of versions){
  const response=await r.request('./'+asset+'?v='+version);
  assert.equal(response.ok,true,asset+' offline');
 }
});
