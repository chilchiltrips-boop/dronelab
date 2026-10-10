import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('single PID Tuning tab uses permanent shell, inline Settings and one header Grant switch',()=>{
 const index=read('index.html'),legacy=read('lab.html'),sim=read('tripod.html'),bridge=read('pairing-host-bridge.js');
 assert.ok(index.includes('data-tab="pid"')&&index.includes('PID TUNING'));
 assert.ok(index.includes('id="tab-pid"')&&index.includes('id="pidFrame"'));
 assert.ok(index.includes('id="tab-settings"')&&index.includes('data-inline="true"')&&index.includes('id="connectionFlow"'));
 assert.equal((index.match(/id="topGrantMobileSwitch"/g)||[]).length,1);
 assert.doesNotMatch(index,/tab-led|tab-simcontrol|simRemoteFrame|ANDROID FLIGHT/);
 for(const id of ['tab-assembly','tab-wiring','tab-python','tab-firmware'])assert.ok(index.includes(id));
 assert.ok(legacy.includes('href="./tripod.html"')); // historic standalone bookmark maintained
 assert.ok(sim.includes('id="connectionDialog"')&&sim.includes('pid-embedded'));
 assert.ok(bridge.includes('ZebjusTraining')&&bridge.includes('ensureSimulator'));
 assert.doesNotMatch(read('js/ui-controls.js'),/location\.replace\('\.\/tripod\.html/);
});
test('WebRTC LED demo is removed from active transport, Android and pairing styling; physical examples survive',()=>{
 for(const path of ['pairing-core.js','pairing-web.js','companion.js','companion-flight.js','companion.html','pairing.css'])assert.doesNotMatch(read(path),/LED_SET|commandLed|toggleWebLed|mobileLedOn|mobileLedOff|webLedOn|qr-led-|tab-led/);
 assert.match(read('index.html'),/LED Matrix/);assert.match(read('js/python-lab.js'),/LED|led/);
});
test('every rendered Flight/Android document has unique IDs and all local scripts/styles exist',()=>{
 for(const p of ['tripod.html','companion.html']){const h=read(p),ids=[...h.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,p+' duplicate IDs');for(const m of h.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g))assert.doesNotThrow(()=>read(m[1].replace(/^\.\//,'')),p+' '+m[1]);}
});
