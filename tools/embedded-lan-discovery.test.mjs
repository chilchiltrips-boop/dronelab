import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessEmbedEnvironment,embeddedDiscoveryHint,readableDirectUrl,initEmbedKitAccess} from '../js/embed-kit-access.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Wix/third-party cross-origin iframe denied local-network delegates direct-tab fallback',()=>{
 const docEls=new Map();
 for(const prefix of ['fw','kit'])for(const suffix of ['EmbeddedAccessNotice','EmbeddedAccessHint','OpenDirectKit','EmbeddedDirectUrl'])
  docEls.set(prefix+suffix,{hidden:true,dataset:{},textContent:'',href:''});
 const doc={getElementById:id=>docEls.get(id),permissionsPolicy:{
  allowedFeatures:()=>['local-network','loopback-network'],allowsFeature:name=>name==='loopback-network'}};
 const host={self:{},top:{}};
 const info=initEmbedKitAccess({host,documentRef:doc,moduleUrl:'https://example.org/dronelab/js/embed-kit-access.js?v=1#secret'});
 assert.equal(info.embedded,true);
 assert.equal(info.localNetworkAllowed,false);
 assert.equal(host.ZebjusEmbedKitAccess.directUrl,'https://example.org/dronelab/index.html');
 for(const prefix of ['fw','kit']){
  assert.equal(docEls.get(prefix+'EmbeddedAccessNotice').hidden,false);
  assert.equal(docEls.get(prefix+'EmbeddedAccessNotice').dataset.lanPolicy,'blocked');
  assert.match(docEls.get(prefix+'EmbeddedAccessHint').textContent,/not delegated/);
  assert.equal(docEls.get(prefix+'OpenDirectKit').href,'https://example.org/dronelab/index.html');
  assert.equal(docEls.get(prefix+'EmbeddedDirectUrl').textContent,'https://example.org/dronelab/index.html');
 }
 assert.match(info.getHint(),/same STA router/);
});
test('top-level page leaves embedded warnings hidden and does not claim LAN blocked',()=>{
 const notices=[{hidden:true,dataset:{}},{hidden:true,dataset:{}}];
 let n=0;
 const self={};const result=initEmbedKitAccess({host:{self,top:self},documentRef:{getElementById(id){if(id.endsWith('EmbeddedAccessNotice'))return notices[n++];return null;}},moduleUrl:'https://example.net/js/embed-kit-access.js'});
 assert.equal(result.embedded,false);assert.equal(notices.every(x=>x.hidden),true);
});
test('unknown iframe permission remains diagnostic, not a false claim of blocked access',()=>{
 const state=assessEmbedEnvironment({embedded:true,localNetworkAllowed:null});
 assert.equal(state.delegated,true);
 assert.match(state.reason,/may block/);
 assert.match(embeddedDiscoveryHint(state),/0 verified kits/);
 assert.equal(assessEmbedEnvironment().embedded,false);
});
test('direct link is derived from verified WebApp code origin without forwarding query tokens or Wix parent URL',()=>{
 assert.equal(readableDirectUrl('https://my-kit-app.example/flight/js/embed-kit-access.js?v=1&pairing=secret#key'),
  'https://my-kit-app.example/flight/index.html');
 assert.throws(()=>readableDirectUrl('http://external-plain-http.example/js/embed-kit-access.js'),/HTTPS/);
});
test('WebApp iframe fallback links are user-initiated, blank-target and no permission bypass/proxy',()=>{
 const a=read('index.html'),lab=read('lab.html'),sw=read('sw.js'),classroom=read('js/classroom-kits.js'),firmware=read('js/firmware-connect.js');
 assert.equal(a,lab);
 for(const id of ['fwEmbeddedAccessNotice','fwOpenDirectKit','kitEmbeddedAccessNotice','kitOpenDirectKit'])
  assert.ok(a.includes('id="'+id+'"'),id);
 assert.equal((a.match(/target="_blank" rel="noopener noreferrer"/g)||[]).length>=2,true);
 assert.match(a,/js\/embed-kit-access\.js\?v=embedded-lan-20261017/);
 assert.match(sw,/js\/embed-kit-access\.js\?v=embedded-lan-20261017/);
 assert.match(classroom,/ZebjusEmbedKitAccess\?\.embedded/);
 assert.match(firmware,/ZebjusEmbedKitAccess\?\.embedded/);
 assert.match(classroom,/targetAddressSpace:'local'/);
 assert.doesNotMatch(read('js/embed-kit-access.js'),/postMessage\s*\(/);
 assert.doesNotMatch(read('js/embed-kit-access.js'),/kit\.key|pairedKeys|Access-Control-Allow-Origin/);
});
