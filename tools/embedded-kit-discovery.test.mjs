import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('embedded Kit discovery explains iframe permission delegation with direct WebApp launch',()=>{
 const kit=get('js/classroom-kits.js');
 assert.match(kit,/function embeddedKitContext\(/);
 assert.match(kit,/permissionsPolicy\|\|document\.featurePolicy/);
 assert.match(kit,/allowsFeature\?\.\('local-network-access'\)/);
 assert.match(kit,/lastDiscoveryReason/);
 assert.match(kit,/guardAction\('kitOpenStandalone',openStandaloneKit\)/);
 assert.match(kit,/guardAction\('fwOpenStandalone',openStandaloneKit\)/);
 assert.match(kit,/root\.open\(STANDALONE_KIT_URL,'_blank','noopener,noreferrer'\)/);
 assert.match(kit,/if\(!\/\^ZFC-A\[12\]-/);
 const net=get('FlightCore_Firmware/FlightCoreNetwork.h');
 assert.doesNotMatch(net,/Access-Control-Allow-Origin",\s*"\*"/);
 assert.match(net,/origin=="https:\/\/chilchiltrips-boop\.github\.io"/);
});
test('Wix and independent website kit access uses explicit opt-in delegation, never silent authority',()=>{
 const pages=[get('index.html'),get('lab.html')];assert.equal(pages[0],pages[1]);
 for(const html of pages){
  assert.match(html,/id="fwOpenStandalone"/);assert.match(html,/id="kitOpenStandalone"/);
  assert.match(html,/js\/classroom-kits\.js\?v=embedded-lna-20261017/);
  assert.match(html,/delegate local-network-access/);
 }
 const sw=get('sw.js');assert.match(sw,/js\/classroom-kits\.js\?v=embedded-lna-20261017/);
 const docs=get('docs/embed-wix-kit-access.md');
 assert.match(docs,/allow="local-network-access; local-network; loopback-network; serial; usb"/);
 assert.match(docs,/all.*ancestor/i);
 assert.match(docs,/noopener noreferrer/);
});
