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
test('recorded evidence may progress, but strict mode cannot pass without complete operator proof',()=>{
 const e=JSON.parse(read('docs/release-acceptance.evidence.json'));
 assert.equal(e.cases.length,requiredIds.length);
 assert.equal(validateEvidence(e).passed,true,'recorded results must retain valid evidence metadata');
 // Exercise incomplete evidence independently of the real ledger, which an
 // operator must be able to update after performing physical tests.
 const empty={...e,sourceCommit:null,cases:e.cases.map(c=>({...c,status:'NOT_RUN',
  observedAt:null,operator:null,deviceId:null,firmwareVersion:null,evidenceRef:null,notes:null}))};
 assert.deepEqual(validateEvidence(empty).totals,{PASS:0,FAIL:0,NOT_RUN:requiredIds.length});
 assert.equal(validateEvidence(empty,{strict:true}).passed,false);
 // Production tagging must fail closed on this still-unwitnessed evidence set.
 const commands=JSON.parse(read('package.json')).scripts;
 assert.equal(commands['verify:acceptance:strict'],'node tools/release-acceptance.mjs --strict');
 const productionGate=read('.github/workflows/school-production-physical-gate.yml');
 assert.match(productionGate,/school-production-\*/);
 assert.match(productionGate,/npm run verify:acceptance:strict/);
 const f=structuredClone(empty);f.cases[0].status='PASS';
 assert.equal(validateEvidence(f).passed,false,'unsubstantiated PASS rejected');
 Object.assign(f.cases[0],{observedAt:'2026-01-01T00:00:00Z',operator:'UNIT FIXTURE',
  deviceId:'UNIT FIXTURE',firmwareVersion:'fixture',evidenceRef:'fixture://local-test',notes:'Synthetic metadata unit test only'});
 assert.equal(validateEvidence(f).passed,true,'schema checks must allow evidenced progress');
 assert.equal(validateEvidence(f,{strict:true}).passed,false,'partial progress cannot unlock production');
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
