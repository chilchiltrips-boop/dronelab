import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateEvidence,requiredIds} from './release-acceptance.mjs';
import {requirePublicHttps,probeAdminDeployment} from './remote-deployment-smoke.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('canonical release labels and binary date come from independent sources',()=>{
 const cat=JSON.parse(read('firmware-catalog.json')),a=JSON.parse(read('app-version.json'));
 assert.equal(cat.product,'ZEBJUS_FLIGHTCORE');
 for(const f of ['firmware-latest.json','FlightCore_Firmware/latest.json']){
  const x=JSON.parse(read(f));assert.equal(x.product,cat.product);assert.equal(x.version,cat.version);
 }
 assert.ok(a.features.some(v=>v.includes('FlightCore '+cat.version)));
 assert.ok(!a.features.some(v=>v.includes('FlightCore 1.4.6')));
 const fw=read('firmware-updater.js'),firmware=read('FlightCore_Firmware/FlightCoreNetwork.h');
 assert.match(fw,/fw\.compiledAt\?formatBuildTime\(fw\.compiledAt\)/);
 assert.match(fw,/usbRuntimeInfo\.buildStamp/);
 assert.match(fw,/kit\?\.firmwareBuiltAt/);
 assert.match(firmware,/firmwareBuiltAt/);
 for(const page of ['index.html','lab.html']){
  const html=read(page);
  assert.match(html,/LOADED FW BUILT<\/span><b id="fwBuildTime"/);
  assert.match(html,/Running FW built<\/span><b id="fwCurrentBuildTime"/);
  assert.match(html,/not flash\/upload time/);
 }
 assert.equal(read('index.html'),read('lab.html'));
});
test('manual evidence starts NOT_RUN and strict mode cannot pass without operator proof',()=>{
 const e=JSON.parse(read('docs/release-acceptance.evidence.json'));
 assert.equal(e.cases.length,requiredIds.length);
 assert.ok(e.cases.every(x=>x.status==='NOT_RUN'));
 assert.deepEqual(validateEvidence(e).totals,{PASS:0,FAIL:0,NOT_RUN:requiredIds.length});
 assert.equal(validateEvidence(e,{strict:true}).passed,false);
 const f=structuredClone(e);f.cases[0].status='PASS';
 assert.equal(validateEvidence(f).passed,false,'unsubstantiated PASS rejected');
});
test('optional Admin HTTPS only; TURN and internet Kit control are excluded',async()=>{
 for(const x of ['http://example.com','https://localhost:4173','https://user:password@example.com','https://example.com/?token=x'])
  assert.throws(()=>requirePublicHttps(x,'admin'));
 const ok=await probeAdminDeployment({adminOrigin:'https://admin.example.org',
 fetcher:async()=>({ok:true,json:async()=>({available:true,user:null})})});
 assert.equal(ok.turnRelay,'OUT OF SCOPE');
 await assert.rejects(probeAdminDeployment({adminOrigin:'https://admin.example.org',
 fetcher:async()=>({ok:true,json:async()=>({available:true,user:{role:'admin'}})})}),/must not disclose/);
 const config=JSON.parse(read('remote-rtc-config.json'));
 assert.equal(config.turnCredentialsUrl,null);
 assert.match(config.note,/out of project scope/);
 assert.doesNotMatch(read('remote-rtc.js'),/fetch\(/);
 assert.match(read('remote-telemetry.js'),/STUN ONLY • LOCAL P2P/);
});
