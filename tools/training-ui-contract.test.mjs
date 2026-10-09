import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('one canonical Flight Training route retains existing labs, resolves old bookmarks and contains the gear pairing UI',()=>{
 for(const path of ['index.html','lab.html']){const h=read(path);assert.equal((h.match(/href="\.\/tripod.html"/g)||[]).length,1);assert.doesNotMatch(h,/tab-led|tab-simcontrol|simRemoteFrame|ANDROID FLIGHT/);for(const id of ['tab-assembly','tab-wiring','tab-python','tab-firmware'])assert.ok(h.includes(id));}
 const h=read('tripod.html');assert.ok(h.includes('id="connectionDialog"'));assert.ok(h.includes('id="topPairMobileBtn"'));assert.doesNotMatch(h,/<iframe|embedded=1|TRIPOD PID SIM/);assert.ok(h.includes('id="simRemoteStop"'));
 assert.match(read('js/ui-controls.js'),/location\.replace\('\.\/tripod\.html/);
});
test('WebRTC LED demo is removed from active transport, Android and pairing styling; physical examples survive',()=>{
 for(const path of ['pairing-core.js','pairing-web.js','companion.js','companion-flight.js','companion.html','pairing.css'])assert.doesNotMatch(read(path),/LED_SET|commandLed|toggleWebLed|mobileLedOn|mobileLedOff|webLedOn|qr-led-|tab-led/);
 assert.match(read('index.html'),/LED Matrix/);assert.match(read('js/python-lab.js'),/LED|led/);
});
test('every rendered Flight/Android document has unique IDs and all local scripts/styles exist',()=>{
 for(const p of ['tripod.html','companion.html']){const h=read(p),ids=[...h.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,p+' duplicate IDs');for(const m of h.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g))assert.doesNotThrow(()=>read(m[1].replace(/^\.\//,'')),p+' '+m[1]);}
});
