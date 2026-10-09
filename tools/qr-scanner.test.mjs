import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../pairing-qr-ui.js',import.meta.url),'utf8');
function runtime(){
 const frames=new Map();let next=0,requests=0,stopped=0,resolveCamera;
 const track={readyState:'live',stop(){stopped++;this.readyState='ended'},getCapabilities:()=>({focusMode:['continuous']}),applyConstraints:async()=>{}};
 const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
 const video={hidden:true,readyState:2,videoWidth:1280,videoHeight:720,async play(){},pause(){}};
 const draws=[],ctx={drawImage(...args){draws.push(args)},getImageData:()=>({data:new Uint8ClampedArray(16)})},canvas={getContext:()=>ctx};
 const global={console,performance:{now:()=>0},navigator:{mediaDevices:{getUserMedia:()=>{requests++;return new Promise(r=>resolveCamera=r)}}},requestAnimationFrame:f=>{frames.set(++next,f);return next},cancelAnimationFrame:id=>frames.delete(id)};
 vm.runInNewContext(source,global);return {api:global.ZebjusQR,global,video,canvas,draws,frames,stream,resolve:()=>resolveCamera(stream),requests:()=>requests,stopped:()=>stopped,tick:async now=>{const callbacks=[...frames.values()];frames.clear();for(const f of callbacks)f(now);await new Promise(r=>setImmediate(r))}};
}
test('cancelled camera permission response immediately stops every late track',async()=>{
 const r=runtime(),opening=r.api.scan({video:r.video,canvas:r.canvas});r.api.stop();r.resolve();await assert.rejects(opening,/cancelled/);assert.equal(r.stopped(),1);assert.equal(r.video.srcObject,undefined);
});
test('invalid preview fails before requesting camera permission',async()=>{
 const r=runtime();await assert.rejects(r.api.scan({video:null,canvas:null}),/preview/);assert.equal(r.requests(),0);
});
test('unrelated QR does not stop scan; ZEBJUS QR stops once and releases camera',async()=>{
 const r=runtime(),found=[];let data='https://example.invalid/';r.global.jsQR=()=>({data});
 const opening=r.api.scan({video:r.video,canvas:r.canvas,onData:v=>found.push(v)});r.resolve();await opening;
 await r.tick(100);assert.equal(r.stopped(),0);assert.equal(found.length,0);
 data='zj1:0:test';await r.tick(200);await r.tick(300);
 assert.deepEqual(found,['zj1:0:test']);assert.equal(r.stopped(),1);assert.equal(r.video.hidden,true);assert.equal(r.video.srcObject,null);
});
test('center scan preserves square detail and falls back to whole frame',async()=>{
 const r=runtime();r.global.jsQR=()=>null;const opening=r.api.scan({video:r.video,canvas:r.canvas});r.resolve();await opening;
 for(const now of [100,200,300])await r.tick(now);
 assert.ok(r.draws[0][1]>0);assert.equal(r.draws[0][3],r.draws[0][4]);assert.equal(r.draws[2][1],0);assert.equal(r.draws[2][3],1280);assert.equal(r.draws[2][7],800);r.api.stop();
});
test('native QR detection works without jsQR and ignores late duplicate results',async()=>{
 const r=runtime(),found=[];r.global.BarcodeDetector=class{async detect(){return [{rawValue:'zj1:0:native'}]}};
 const opening=r.api.scan({video:r.video,canvas:r.canvas,onData:v=>found.push(v)});r.resolve();await opening;await r.tick(250);await r.tick(500);
 assert.deepEqual(found,['zj1:0:native']);assert.equal(r.stopped(),1);
});
