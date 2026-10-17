import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Firmware & Connect reference panel retains existing flashing controls',()=>{
 const html=read('index.html'),css=read('firmware.css');
 for(const id of ['fwConnectionWorkspace','fwKitNameInput','fwKitCachedIp','fwKitSelect','fwKitConnectSelected',
  'fwDiscoverKits','fwKitDisconnect','fwDiscoveryResults','fwSelectedKitName','fwHealthCommand','fwHealthImu',
  'fwHealthBaro','fwHealthLidar','fwHealthReceiver','fwKitTakeControl','fwKitPing','fwRenameInput','fwRenameSave',
  'fwRenameReset','fwKitDemoMode','fwUsbFlashBtn','fwNetworkFlashBtn','fwSourceBadge','fwSerialOutput'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('js/firmware-connect.js?v=embed-clean-20261017'));
 assert.ok(css.includes('.fw-connection-workspace'));
 assert.ok(read('sw.js').includes('./js/firmware-connect.js?v=embed-clean-20261017'));
});
test('Firmware connection JS is valid and exposes kit-select-only controls',()=>{
 const code=read('js/firmware-connect.js'),kit=read('js/classroom-kits.js');
 const sandbox={window:{},document:{readyState:'loading',addEventListener(){}},console};
 new vm.Script(code).runInNewContext(sandbox);
 assert.equal(typeof sandbox.window.ZebjusFirmwareConnect.renderAvailable,'function');
 assert.equal(typeof sandbox.window.ZebjusFirmwareConnect.scan,'function');
 assert.equal(typeof sandbox.window.ZebjusFirmwareConnect.select,'function');
 assert.match(code,/connectDiscoveredKit\(choice\)/);
 assert.match(code,/connectNamedKit\(name\)/);
 assert.match(code,/renameConnectedKit\(newName,reset\)/);
 assert.match(kit,/found\.kitId!==kit\.kitId/);
 assert.match(kit,/const results=\[\]/);
 assert.match(kit,/zebjus_drone_.*\.local/);
});
test('Kit Name change uses scoped signed AP firmware route and keeps immutable Device ID',()=>{
 const fw=read('FlightCore_Firmware/FlightCoreNetwork.h'),auth=read('FlightCore_Firmware/FlightCoreEnrollment.h');
 const kit=read('js/classroom-kits.js');
 assert.match(fw,/zjHttp\.on\("\/api\/kit\/name",HTTP_POST/);
 assert.match(fw,/zjHttp\.on\("\/api\/kit\/name\/reset",HTTP_POST/);
 assert.match(fw,/if\(!zjAllowSetup\(\)\)return/);
 assert.match(fw,/String\(zjClientTransport\(\)\)!="AP"/);
 assert.match(fw,/zjKitPrefs\.putString\("name",name\)/);
 assert.match(fw,/zjKitPrefs\.putString\("name",autoName\)/);
 assert.match(auth,/path=="\/api\/kit\/name\/reset"/);
 assert.match(kit,/if\(!linkFresh\(\)\|\|!\['ap','sta'\]\.includes\(state\.transport\)\|\|!state\.setupAuthorized\)/);
 assert.match(fw,/zjMdnsKitHostname\(\)/);
 assert.match(fw,/host\.replace\("_","-"\)/);
 assert.match(fw,/if\(zjMdnsReady\)\{MDNS\.end\(\);zjMdnsReady=false;\}/);
 assert.ok(!fw.includes('zjKitId=name;'));
});
