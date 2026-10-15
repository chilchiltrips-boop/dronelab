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
test('first offline visit can load the exact active flasher catalog and binary URLs',async()=>{
 const r=runtime();await r.install();r.setOffline();
 const catalog=JSON.parse(readFileSync(new URL('FlightCore_Firmware/catalog.json',root),'utf8'));
 const required=['./FlightCore_Firmware/catalog.json?v='+catalog.version];
 for(const board of catalog.boards)for(const kind of ['app','factory']){
  const pkg=board.latest[kind];
  if(pkg.available)required.push('./FlightCore_Firmware/'+pkg.file+'?v='+board.latest.version);
 }
 for(const path of required){
  const response=await r.request(path);assert.equal(response.ok,true,path);assert.ok((await response.arrayBuffer()).byteLength>100);
 }
});
test('Matplotlib and OpenCV wheels and validation dependencies are cached without first running a plot',async()=>{
 const r=runtime();await r.install();r.setOffline();
 for(const path of ['./vendor/pyodide/matplotlib-3.8.4-cp312-cp312-pyodide_2024_0_wasm32.whl','./js/firmware-image.js','./js/firmware-hashes.js','./vendor/crypto/zfc-crypto.js'])assert.equal((await r.request(path)).ok,true,path);
 for(const wheel of readdirSync(new URL('vendor/pyodide/',root)).filter(x=>x.endsWith('.whl')))assert.equal((await r.request('./vendor/pyodide/'+wheel)).ok,true,wheel);
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
 for(const path of ['./devices-workspace.css?v=unified-devices-compact-20261015','./js/devices-workspace.js?v=unified-devices-compact-20261015']){
  const response=await r.request(path);
  assert.equal(response.ok,true,path);
  assert.ok((await response.text()).length>100,path);
 }
});

test('latest audited AP/STA, USB and WebRTC scripts are precached with the exact page versions',async()=>{
 const page=readFileSync(new URL('index.html',root),'utf8'),sw=source;
 for(const asset of ['pairing-web.js','firmware-updater.js','js/firmware-connect.js']){
  assert.ok(page.includes(asset+'?v=connectivity-audit-20261015'),asset+' page source');
  assert.ok(sw.includes(asset+'?v=connectivity-audit-20261015'),asset+' offline precache');
 }
 const r=runtime();await r.install();r.setOffline();
 for(const path of ['./pairing-web.js','./firmware-updater.js','./js/firmware-connect.js']){
  const response=await r.request(path+'?v=connectivity-audit-20261015');
  assert.equal(response.ok,true,path+' offline');
 }
});
