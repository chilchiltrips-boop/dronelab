import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('js/embedded-kit-access.js');
const official='https://chilchiltrips-boop.github.io/dronelab/index.html#firmware';

function setup({frame=true,origin='https://chilchiltrips-boop.github.io',policy='denied'}={}){
 const banners={};
 const make=()=>{
  const note={textContent:''},link={href:'',target:'',rel:''};
  return {hidden:true,note,link,querySelector:q=>q==='[data-embed-kit-explain]'?note:q==='a[data-embed-kit-open]'?link:null};
 };
 banners.fwEmbeddedKitAccess=make();
 banners.kitEmbeddedKitAccess=make();
 const policyMock=policy==='unknown'?undefined:{
  features:()=>['local-network','loopback-network'],
  allowsFeature:name=>name==='local-network'?policy!=='denied':true
 };
 const doc={readyState:'complete',permissionsPolicy:policyMock,
  getElementById:id=>banners[id]||null};
 const top={};
 const win={top,self:frame?{}:top,location:{origin},document:doc};
 vm.runInNewContext(source,{window:win,console});
 return {api:win.ZebjusEmbeddedAccess,banners};
}
test('Wix iframe without local-network delegation tells user why 0 kits and offers first-party new tab',()=>{
 const {api,banners}=setup();
 assert.equal(api.status().embedded,true);
 assert.equal(api.status().blocked,true);
 assert.equal(api.shouldSkipLocalProbe(),true);
 assert.match(api.guidance(),/embedding website did not delegate/i);
 assert.match(api.guidance(),/192\.168\.4\.1/);
 for(const b of Object.values(banners)){
  assert.equal(b.hidden,false);
  assert.equal(b.link.href,official);
  assert.equal(b.link.target,'_blank');
  assert.match(b.link.rel,/noopener/);
  assert.match(b.link.rel,/noreferrer/);
  assert.equal(b.note.textContent,api.guidance());
 }
});
test('Delegated LNA iframe is allowed to attempt discovery (not needlessly disabled)',()=>{
 const {api,banners}=setup({policy:'allowed'});
 assert.equal(api.status().embedded,true);
 assert.equal(api.status().blocked,false);
 assert.equal(api.shouldSkipLocalProbe(),false);
 assert.equal(banners.fwEmbeddedKitAccess.hidden,false,'optional top-level escape remains visible');
});
test('Unknown browser policy leaves discovery enabled but shows fallback',()=>{
 const {api,banners}=setup({policy:'unknown'});
 assert.equal(api.status().blocked,false);
 assert.equal(banners.kitEmbeddedKitAccess.hidden,false);
});
test('Standalone official app never has its hardware connection disabled by iframe guard',()=>{
 const {api,banners}=setup({frame:false,policy:'denied'});
 assert.equal(api.status().embedded,false);
 assert.equal(api.shouldSkipLocalProbe(),false);
 assert.equal(banners.fwEmbeddedKitAccess.hidden,true);
});
test('Copied WebApp on arbitrary origin cannot trigger CORS bypass or unverified host access',()=>{
 const {api,banners}=setup({frame:false,origin:'https://example-embedded-site.com'});
 assert.equal(api.status().trustedOrigin,false);
 assert.equal(api.shouldSkipLocalProbe(),false,'custom origin is not blanket-blocked by frontend; ESP32 CORS still decides');
 assert.equal(banners.fwEmbeddedKitAccess.hidden,false);
 assert.equal(banners.fwEmbeddedKitAccess.link.href,official);
 assert.ok(!/postMessage|parent\.|accessToken|sessionSecret/.test(source));
 const firmware=read('FlightCore_Firmware/FlightCoreNetwork.h');
 assert.match(firmware,/origin=="https:\/\/chilchiltrips-boop\.github\.io"/);
 assert.doesNotMatch(firmware,/Access-Control-Allow-Origin","\*"/);
});
test('Both WebApp entrypoints load embed capability before Kit scanner; no stale cache',()=>{
 const page=read('index.html'),lab=read('lab.html'),sw=read('sw.js');
 assert.equal(page,lab,'Wix embeds and standalone website share the same App DOM');
 for(const id of ['fwEmbeddedKitAccess','kitEmbeddedKitAccess'])assert.match(page,new RegExp('id="'+id+'"'));
 const script='./js/embedded-kit-access.js?v=iframe-lna-20261017';
 const kit='./js/classroom-kits.js?v=iframe-lna-20261017';
 assert.ok(page.indexOf(script)<page.indexOf(kit),'policy probe must load before discovery');
 assert.ok(sw.includes(script));assert.ok(sw.includes(kit));
 assert.match(sw,/iframe-physical-kit-access-20261017/);
 const scanner=read('js/classroom-kits.js');
 assert.match(scanner,/ZebjusEmbeddedAccess\?\.shouldSkipLocalProbe\?\.\(\)/);
 assert.match(read('js/firmware-connect.js'),/Embedded site access/);
});
