import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const kit=read('js/classroom-kits.js'),update=read('firmware-updater.js');
test('live STA or AP selects verified board APP, not a destructive factory image',()=>{
 assert.match(update,/async function prepareConnectedFirmware/);
 assert.match(update,/if\(imageSelect\)imageSelect\.value='app'/);
 assert.match(update,/kit\.board/);
 assert.match(update,/fw\.boardId===kit\.board/);
 assert.match(update,/firmwareTargetMethod!=='wifi'/);
 assert.match(update,/await loadCached\(id,type\)/);
 assert.match(update,/Connecting a kit never flashes it|connecting a kit never flashes it/);
});
test('fast saved-kit discovery requires fresh Connect/Later approval and verified Device ID',()=>{
 const startup=kit.slice(kit.indexOf('async function restoreLastKit(){'),kit.indexOf('async function rebootConnectedKit(){'));
 assert.ok(startup.startsWith('async function restoreLastKit(){'));
 assert.match(kit,/localStorage\.removeItem\('zebjus\.classroom\.auto-connect-approved\.v1'\)/);
 assert.doesNotMatch(startup,/connectDiscoveredKit\(/,'A new tab must not authenticate a kit in the background');
 assert.match(startup,/pairedKeys\.get\(last\.id\)/);
 assert.match(startup,/found\?\.kitId!==last\.id\|\|found\.kitCode!==last\.code/);
 assert.match(startup,/await offerRememberedConnection\(\)/);
 assert.match(kit,/dialog\.showModal\?\.\(\)/);
 assert.match(kit,/return connectDiscoveredKit\(kit\)/,'Only the explicit Connect action may authenticate the offered kit');
 assert.match(kit,/if\(state\.owner\)throw Error\('Release diagnostic control/);
 assert.match(kit,/for\(const delay of \[250,700,1600,3000,5000\]\)/);
});
test('OTA security and proof remain mandatory while repaint and restart wait reduce',()=>{
 assert.match(kit,/pre\.rc\?\.claimed\|\|pre\.motorsArmed!==false/);
 assert.match(kit,/if\(ack\.kitId!==deviceId\|\|ack\.offset!==offset\+chunk\.length\)/);
 assert.match(kit,/if\(percent!==lastUploadPercent\)/);
 assert.match(kit,/if\(!d\.bootId\|\|d\.bootId===pre\.bootId\)/);
 assert.match(kit,/d\.appElfSha256\.toLowerCase\(\)!==expectedBuild/);
 assert.match(kit,/await sleep\(850\)/);
 assert.doesNotMatch(kit,/\b(?:staPassword|routerPassword|stationPassword)\s*=\s*['\"]12345678['\"]/);
});
