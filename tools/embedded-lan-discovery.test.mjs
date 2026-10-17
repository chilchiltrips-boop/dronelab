import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessEmbedEnvironment,embeddedDiscoveryHint,embedScanBlocked,initEmbedKitAccess} from '../js/embed-kit-access.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('denied Wix/third-party iframe retains safe network policy guard without inserting UI',()=>{
 const host={self:{},top:{}};
 const doc={getElementById(){throw Error('Embedded banner elements must never be mounted')},
  permissionsPolicy:{allowedFeatures:()=>['local-network','loopback-network'],
   allowsFeature:name=>name==='loopback-network'}};
 const info=initEmbedKitAccess({host,documentRef:doc});
 assert.equal(info.embedded,true);
 assert.equal(info.localNetworkAllowed,false);
 assert.equal(info.scanBlocked,true);
 assert.equal(host.ZebjusEmbedKitAccess,info);
 assert.match(info.getHint(),/blocked by the embedding site/);
 assert.equal(Object.hasOwn(info,'directUrl'),false);
 assert.equal(Object.isFrozen(info),true);
});
test('top-level WebApp does not claim scanning is blocked',()=>{
 const self={};
 const info=initEmbedKitAccess({host:{self,top:self},documentRef:{}});
 assert.equal(info.embedded,false);
 assert.equal(info.scanBlocked,false);
 assert.equal(info.localNetworkAllowed,null);
});
test('unknown iframe policy allows discovery attempts without false denial',()=>{
 const env=assessEmbedEnvironment({embedded:true,localNetworkAllowed:null});
 assert.equal(env.delegated,true);
 assert.equal(env.reason,'');
 assert.match(embeddedDiscoveryHint(env),/same STA router/);
 assert.equal(embedScanBlocked({embedded:true,localNetworkAllowed:null}),false);
 assert.equal(embedScanBlocked({embedded:false,localNetworkAllowed:false}),false);
 assert.equal(embedScanBlocked({embedded:true,localNetworkAllowed:false}),true);
});
test('remove persistent iframe banners, buttons and direct URLs on both WebApp layouts',()=>{
 const html=read('index.html'),lab=read('lab.html'),css=read('classroom-kits.css'),sw=read('sw.js');
 assert.equal(html,lab);
 for(const id of ['fwEmbeddedAccessNotice','fwEmbeddedAccessHint','fwOpenDirectKit','fwEmbeddedDirectUrl',
  'kitEmbeddedAccessNotice','kitEmbeddedAccessHint','kitOpenDirectKit','kitEmbeddedDirectUrl'])
  assert.ok(!html.includes(id),id);
 assert.doesNotMatch(html,/Embedded website • AP\/STA discovery|Open DroneLab Directly|Direct link:/);
 assert.doesNotMatch(css,/kit-embed-notice/);
 assert.doesNotMatch(read('js/embed-kit-access.js'),/getElementById|postMessage\s*\(|directUrl|pairingKey/);
 for(const name of ['js/embed-kit-access.js','js/classroom-kits.js','js/firmware-connect.js','classroom-kits.css']){
  const marker=name+'?v=embed-clean-20261017';
  assert.ok(html.includes(marker),'missing page version: '+marker);
  assert.ok(sw.includes('./'+marker),'missing offline version: '+marker);
 }
});
test('discovery denial still short-circuits scans while delegated/local scans remain enabled',()=>{
 const source=read('js/classroom-kits.js');
 assert.match(source,/if\(root\.ZebjusEmbedKitAccess\?\.scanBlocked\)/);
 assert.match(source,/const help=root\.ZebjusEmbedKitAccess\.getHint\(\)/);
 assert.match(source,/discovering=false;lastDiscoverAt=Date\.now\(\)/);
 assert.doesNotMatch(source,/Open DroneLab Directly/);
 assert.doesNotMatch(read('js/firmware-connect.js'),/Open DroneLab Directly/);
 assert.doesNotMatch(read('js/embed-kit-access.js'),/kit\.key|pairedKeys|Access-Control-Allow-Origin/);
});

test('legacy Wix iframe copies are cleaned by independently refreshed metadata helper and CSS',async()=>{
 const vm=await import('node:vm');
 const removed=[];
 const hint={textContent:'Embedded website may block AP/STA discovery. Use Open DroneLab Directly.'};
 const target={getElementById(id){
  if(id==='fwEmbeddedAccessNotice'||id==='kitEmbeddedAccessNotice')return {remove(){removed.push(id)}};
  if(id==='fwConnectionHint')return hint;
  return null;
 }};
 vm.runInNewContext(read('js/app-version.js'),{document:target,MutationObserver:class{observe(){}},console});
 assert.deepEqual(removed,['fwEmbeddedAccessNotice','kitEmbeddedAccessNotice']);
 assert.doesNotMatch(hint.textContent,/Open DroneLab Directly/);
 assert.match(read('styles.css'),/\.kit-embed-notice\{display:none!important\}/);
});
