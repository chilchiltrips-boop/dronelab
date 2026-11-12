// Offline shell and all vendored Python plot dependencies. Keep binary query
// versions identical to the URLs requested by the active firmware updater.
const CACHE='dronelab-tripod-input-mirror-20261021-r13-20261103-esc-calibration-175-r2-timing-176-r1-imu-freshness-177-r1-a2-wizard-178-r1-output-only-r1-page-save-r1-auto-esc-r2-output-stability-r1-inline-ui-r1-rate-pid-r1-flight-safety-r1-aerof450-pid-r1-flightcore-1716-bench-r2-a2-auto-select-flight-trace-r1-bench-1717-acro-ready-1718-published-bench-1719-published-ppm-ota-maintenance-r1-a2-active-only-r1-rate-picker-r1-flight-data-r4-angle-telemetry-1722-ppm-monitor-header-profiles-1723-timer-recovery-1724-ppm-flight-isolation-attitude-observation-1725-working-flight-1727-sta-setup-auth-r1';
const core=['./js/flight-telemetry.js','./flight-data.css','./flight-data-pfd.css','./flight-data-health.css','./flight-data-map.css','./js/flight-data-pfd.js','./js/flight-data-health.js','./js/flight-data-map.js','./assets/flight-data-world.svg','./js/flight-data.js','./js/flight-data-model.js','./js/flight-data-vehicle.js','./js/pid-profiles.js','./js/rate-pid.js','./js/flightcore-pid-client.js','./js/inline-dialogs.js','./js/input-monitor.js','./a2-setup-wizard.css','./js/a2-setup-wizard.js','./js/setup-cues.js','./js/a2-setup-visuals.js','./js/motor-setup.js','./control-path.css','./js/control-path-policy.js','./js/control-path-ui.js','./wifi-workspace.css','./js/wifi-workspace.js','./js/kit-access-policy.js','./js/python-led-session.js','./js/smart-kit-policy.js','./js/smart-kit-setup.js','./js/simulator-input.js','./js/kit-network-policy.js?v=network-policy-20261015','./js/cloud-admin.js?v=central-admin-20261015','./v2-header.css','./','./tripod.html','./tripod.html?embedded=1','./tripod.html?standalone=1','./tripod.css','./js/tripod-page.js','./js/tripod-physics.js','./js/training-receiver.js','./js/app-version.js','./js/tripod-audio.js','./js/tripod-realism.js','./js/tripod-assembly-model.js','./js/tripod-experiments.js','./index.html','./lab.html','./styles.css','./lab-workflow.css','./project.css','./firmware.css','./devices-workspace.css?v=unified-devices-firmware-method-20261015','./js/devices-workspace.js?v=one-click-advanced-secure-ota-20261015','./js/devices-workspace.js?v=kit-live-inputs-20261017','./firmware-updater.js?v=a2-bench-1719-ppm-ota-maintenance-20261107','./firmware-updater.js','./app-version.json','./pairing.css','./remote-rtc.js?v=phase1-remote-20261017','./pairing-core.js?v=phase1-remote-20261017','./pairing-code.js?v=phase1-remote-20261017','./remote-telemetry.js?v=phase1-remote-20261017','./pairing-qr-ui.js','./pairing-web.js?v=phase1-remote-20261017','./pairing-host-bridge.js','./companion.html','./companion.css','./companion.js','./companion-network.js','./companion-pid.js','./companion-flight.js','./companion-menu.js','./flight-input.js','./vendor/qrgen.js','./vendor/jsqr.js','./vendor/peerjs.min.js','./js/serial-plotter.js','./js/serial-readable-monitor.js?v=usb-rc-shared-20261017','./js/serial-rc-decoder.js?v=ppm-ch8-20261017','./js/embed-kit-access.js?v=embed-clean-20261017','./python-lab.css','./network-lab.css','./classroom-kits.css?v=embed-clean-20261017','./js/kit-data-interface.js?v=kit-transport-unified-20261017','./js/network-lab.js?v=kit-transport-unified-20261017','./js/kit-udp-transport.js?v=udp-management-20261019','./js/kit-auth.js','./js/kit-auth.js?v=udp-management-20261019','./js/kit-ack-diagnostics.js','./js/kit-local-auth.js','./js/kit-pairing-store.js?v=1','./js/kit-ack-diagnostics.js?v=ackdiag-20261018-flight-trace','./js/classroom-kits.js?v=kit-transport-unified-20261017-udp-management-20261019-flight-trace','./js/live-inputs.js?v=ppm-ch8-20261017','./live-inputs.css?v=ppm-ch8-20261017','./js/firmware-connect.js?v=embed-clean-20261017-udp-management-20261019','./python-ide-workspace.css','./assets/python-ide-icons.svg','./js/python-ide-workspace.js','./python-lab-worker.js','./monaco-worker.js','./js/python-lab.js?v=kit-transport-unified-20261017','./js/usb-i2c-bridge.js','./js/usb-live-diagnostic.js','./vendor/pyodide/pyodide.js','./vendor/pyodide/pyodide.asm.js','./vendor/pyodide/pyodide.asm.wasm','./vendor/pyodide/pyodide-lock.json','./vendor/pyodide/python_stdlib.zip','./vendor/monaco/min/vs/loader.js','./vendor/monaco/min/vs/editor/editor.main.js','./vendor/monaco/min/vs/editor/editor.main.css','./vendor/monaco/min/vs/basic-languages/python/python.js','./vendor/monaco/min/vs/base/worker/workerMain.js','./vendor/monaco/min/vs/base/browser/ui/codicons/codicon/codicon.ttf','./three.module.min.js','./glb-loader.js','./firmware-catalog.json','./firmware-latest.json','./vendor/esptool/bundle.mjs','./FlightCore_Firmware/catalog.json?v=1.4.7','./firmware-catalog.json?v=1.4.7','./js/firmware-image.js','./js/firmware-image.js?v=compile-time-verified-20261017','./js/firmware-hashes.js','./vendor/crypto/zfc-crypto.js',"./vendor/pyodide/contourpy-1.3.0-cp312-cp312-pyodide_2024_0_wasm32.whl","./vendor/pyodide/cycler-0.12.1-py3-none-any.whl","./vendor/pyodide/fonttools-4.51.0-py3-none-any.whl","./vendor/pyodide/kiwisolver-1.4.5-cp312-cp312-pyodide_2024_0_wasm32.whl","./vendor/pyodide/matplotlib-3.8.4-cp312-cp312-pyodide_2024_0_wasm32.whl","./vendor/pyodide/matplotlib_pyodide-0.2.3-py3-none-any.whl","./vendor/pyodide/numpy-2.0.2-cp312-cp312-pyodide_2024_0_wasm32.whl","./vendor/pyodide/packaging-24.2-py3-none-any.whl","./vendor/pyodide/pillow-10.2.0-cp312-cp312-pyodide_2024_0_wasm32.whl","./vendor/pyodide/pyparsing-3.1.2-py3-none-any.whl","./vendor/pyodide/python_dateutil-2.9.0.post0-py2.py3-none-any.whl","./vendor/pyodide/pytz-2024.1-py2.py3-none-any.whl","./vendor/pyodide/six-1.16.0-py2.py3-none-any.whl","./vendor/pyodide/opencv_python-4.10.0.84-cp312-cp312-pyodide_2024_0_wasm32.whl"];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 // Install quickly even on Wix iframes: cache the WebApp shell and APP images,
 // but download huge Python runtime/WASM, plotting wheels and Factory images
 // only when the user actually opens those features.
 const essential=core.filter(path=>!/\/vendor\/pyodide\/.*\.(?:whl|wasm|zip)(?:\?|$)/.test(path)&&
   !/\/FlightCore_Firmware\/.*FACTORY\.bin(?:\?|$)/.test(path));
 const cache=await caches.open(CACHE),urls=[...essential];
 try{
  const [manifest,catalog]=await Promise.all([fetch('./ASSET_MANIFEST.json'),fetch('./firmware-catalog.json')]);
  if(manifest.ok)urls.push(...Object.keys((await manifest.json()).sha256||{}).map(x=>'./'+x));
  if(catalog.ok){const available=await catalog.json();urls.push('./FlightCore_Firmware/catalog.json?v='+encodeURIComponent(available.version));for(const board of available.boards){
   if(board.id!=='ZFC-A2')continue;
   const image=board.latest.app;
   if(image?.available)urls.push('./FlightCore_Firmware/'+image.file+'?v='+encodeURIComponent(board.latest.version));
  }}
 }catch{/* Existing shell stays active if essential assets cannot be downloaded. */}
 urls.push(...['app','catalog','config','model-assets','project-state','sound-power','shared-ui','assembly-scene','wiring-renderer','wiring-validation','ui-controls'].map(x=>'./js/'+x+'.js'));
 const unique=[...new Set(urls)],results=await Promise.allSettled(unique.map(async url=>{
  const response=await fetch(url,{cache:'reload'});
  if(!response.ok)throw Error('Offline asset unavailable: '+url);
  await cache.put(url,response);
 }));
 if(results.some((r,i)=>r.status==='rejected'&&essential.includes(unique[i])))throw Error('Essential offline assets unavailable; retaining previous worker');
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 // Also evict past Wix iframe/discovery cache generations; they can otherwise
 // outlive a published HTML update in cross-origin embedded browsers.
 for(const name of await caches.keys())if(name.startsWith('dronelab-')&&name!==CACHE)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Reachability must never succeed from the offline cache.
 if(url.searchParams.has('connectivity_probe')||url.pathname.endsWith('/remote-rtc-config.json'))return;
 // Never cache authenticated API responses, even if the user is offline.
 if(url.pathname.startsWith('/api/'))return;
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/__pairing/'))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const cachedResponse=async()=>{
   const exact=await cache.match(event.request);if(exact)return exact;
   // Static cache-busting parameters do not alter script/style resources.
   // Firmware BIN URLs keep exact version keys and SHA-256 validation.
   if(/\.(?:html|js|mjs|css)$/.test(url.pathname)){const canonical=new URL(url);canonical.search='';return cache.match(canonical.href)}
  };
  const releaseMetadata=/\/mobile-apk\/(?:ANDROID_RELEASE_META|SHA256SUMS)\.txt$/.test(url.pathname);
  const fresh=releaseMetadata||url.pathname.endsWith('/')||/\.(?:html|js|mjs|css)$/.test(url.pathname)||/(?:firmware-(?:catalog|latest)|app-version|catalog)\.json$/.test(url.pathname);
  if(fresh){
   // Navigations prioritize the live published page, not an expired Wix iframe
   // shell. Give document fetches time on school/slow Wi-Fi before offline fallback.
   const documentRequest=url.pathname.endsWith('/')||/\.html$/.test(url.pathname);
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),documentRequest?10000:2500);
   try{const response=await fetch(event.request,{signal:ctrl.signal,cache:documentRequest?'reload':releaseMetadata?'no-store':'default'});if(response.ok){await cache.put(event.request,response.clone());return response}return await cachedResponse()||response}
   catch{return await cachedResponse()||Response.error()}
   finally{clearTimeout(timer)}
  }
  const cached=await cachedResponse();if(cached)return cached;
  try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response}catch{return Response.error()}
 })());
});
