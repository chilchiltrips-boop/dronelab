// Offline shell and all vendored Python plot dependencies. Keep binary query
// versions identical to the URLs requested by the active firmware updater.
const CACHE='dronelab-flight-training-v1.6.3';
const core=['./','./tripod.html','./tripod.css','./js/tripod-page.js','./js/tripod-physics.js','./js/training-receiver.js','./js/app-version.js','./js/tripod-audio.js','./js/tripod-realism.js','./js/tripod-assembly-model.js','./js/tripod-experiments.js','./index.html','./lab.html','./styles.css','./lab-workflow.css','./project.css','./firmware.css','./firmware-updater.js','./app-version.json','./pairing.css','./pairing-core.js','./pairing-code.js','./pairing-qr-ui.js','./pairing-web.js','./companion.html','./companion.css','./companion.js','./companion-flight.js','./flight-input.js','./vendor/qrgen.js','./vendor/jsqr.js','./js/serial-plotter.js','./python-lab.css','./python-lab-worker.js','./monaco-worker.js','./js/python-lab.js','./js/usb-i2c-bridge.js','./vendor/pyodide/pyodide.js','./vendor/pyodide/pyodide.asm.js','./vendor/pyodide/pyodide.asm.wasm','./vendor/pyodide/pyodide-lock.json','./vendor/pyodide/python_stdlib.zip','./vendor/monaco/min/vs/loader.js','./vendor/monaco/min/vs/editor/editor.main.js','./vendor/monaco/min/vs/editor/editor.main.css','./vendor/monaco/min/vs/basic-languages/python/python.js','./vendor/monaco/min/vs/base/worker/workerMain.js','./vendor/monaco/min/vs/base/browser/ui/codicons/codicon/codicon.ttf','./three.module.min.js','./glb-loader.js','./firmware-catalog.json','./firmware-latest.json','./vendor/esptool/bundle.mjs','./FlightCore_Firmware/catalog.json?v=1.0.1','./firmware-catalog.json?v=1.0.1','./js/firmware-image.js','./js/firmware-hashes.js','./vendor/crypto/zfc-crypto.js',"./vendor/pyodide/contourpy-1.3.0-cp312-cp312-pyodide_2024_0_wasm32.whl","./vendor/pyodide/cycler-0.12.1-py3-none-any.whl","./vendor/pyodide/fonttools-4.51.0-py3-none-any.whl","./vendor/pyodide/kiwisolver-1.4.5-cp312-cp312-pyodide_2024_0_wasm32.whl","./vendor/pyodide/matplotlib-3.8.4-cp312-cp312-pyodide_2024_0_wasm32.whl","./vendor/pyodide/matplotlib_pyodide-0.2.3-py3-none-any.whl","./vendor/pyodide/numpy-2.0.2-cp312-cp312-pyodide_2024_0_wasm32.whl","./vendor/pyodide/packaging-24.2-py3-none-any.whl","./vendor/pyodide/pillow-10.2.0-cp312-cp312-pyodide_2024_0_wasm32.whl","./vendor/pyodide/pyparsing-3.1.2-py3-none-any.whl","./vendor/pyodide/python_dateutil-2.9.0.post0-py2.py3-none-any.whl","./vendor/pyodide/pytz-2024.1-py2.py3-none-any.whl","./vendor/pyodide/six-1.16.0-py2.py3-none-any.whl"];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE),urls=[...core];
 try{
  const [manifest,catalog]=await Promise.all([fetch('./ASSET_MANIFEST.json'),fetch('./firmware-catalog.json')]);
  if(manifest.ok)urls.push(...Object.keys((await manifest.json()).sha256||{}).map(x=>'./'+x));
  if(catalog.ok)for(const board of (await catalog.json()).boards){
   for(const kind of ['app','factory']){
    const image=board.latest[kind];
    if(image?.available)urls.push('./FlightCore_Firmware/'+image.file+'?v='+encodeURIComponent(board.latest.version));
   }
  }
 }catch{/* Existing shell stays active if essential assets cannot be downloaded. */}
 urls.push(...['app','catalog','config','model-assets','project-state','sound-power','shared-ui','assembly-scene','wiring-renderer','wiring-validation','ui-controls'].map(x=>'./js/'+x+'.js'));
 const unique=[...new Set(urls)],results=await Promise.allSettled(unique.map(async url=>{
  const response=await fetch(url,{cache:'reload'});
  if(!response.ok)throw Error('Offline asset unavailable: '+url);
  await cache.put(url,response);
 }));
 if(results.some((r,i)=>r.status==='rejected'&&core.includes(unique[i])))throw Error('Essential offline assets unavailable; retaining previous worker');
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(/^dronelab-(firmware|scanner|flightcore|i2c-scanner|qr-pairing|android-flight|flight-training|tripod)-/.test(name)&&name!==CACHE)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/__pairing/'))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const fresh=url.pathname.endsWith('/')||/\.(?:html|js|mjs|css)$/.test(url.pathname)||/(?:firmware-(?:catalog|latest)|app-version|catalog)\.json$/.test(url.pathname);
  if(fresh){
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),2500);
   try{const response=await fetch(event.request,{signal:ctrl.signal});if(response.ok){await cache.put(event.request,response.clone());return response}return await cache.match(event.request)||response}
   catch{return await cache.match(event.request)||Response.error()}
   finally{clearTimeout(timer)}
  }
  const cached=await cache.match(event.request);if(cached)return cached;
  try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response}catch{return Response.error()}
 })());
});
