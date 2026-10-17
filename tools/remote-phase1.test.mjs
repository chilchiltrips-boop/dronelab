import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
async function rtcRuntime(config){
 const calls=[];
 const runtime={console,Date,AbortSignal,location:{protocol:'https:'},fetch:async (...args)=>{calls.push(args);throw Error('Network config should never be fetched by local-only ICE')}};
 runtime.window=runtime;
 vm.runInNewContext(read('remote-rtc.js'),runtime);
 return {runtime,calls};
}
test('local WebRTC is always STUN-only, even if old TURN URL is injected',async()=>{
 const config=JSON.parse(read('remote-rtc-config.json'));
 assert.equal(config.mode,'local-stun-only');
 assert.equal(config.turnCredentialsUrl,null);
 const {runtime,calls}=await rtcRuntime({turnCredentialsUrl:'https://obsolete.example.com/turn'});
 const state=await runtime.ZebjusRemoteRTC.load();
 assert.equal(state.turnReady,false);
 assert.equal(state.mode,'STUN only');
 assert.match(state.reason,/TURN relay out of scope/);
 const servers=runtime.ZebjusRemoteRTC.getIceServers();
 assert.equal(servers.length,2);
 assert.ok(servers.every(s=>String(s.urls).startsWith('stun:')));
 assert.equal(calls.length,0,'Do not fetch retired TURN configuration or credentials');
 assert.doesNotMatch(read('remote-rtc.js'),/fetch\(/);
});
test('WebRTC actual simulator DataChannel and PeerJS offer signaling use shared ICE list',()=>{
 const core=read('pairing-core.js'),code=read('pairing-code.js');
 assert.match(core,/root\.ZebjusRemoteRTC\?\.getIceServers/);
 assert.match(core,/root\.ZebjusRemoteRTC\?\.load/);
 assert.match(core,/new RTCPeerConnection\(\{iceServers,iceCandidatePoolSize:0\}\)/);
 assert.doesNotMatch(core,/new RTCPeerConnection\(\{iceServers:\[\]/);
 assert.match(code,/root\.ZebjusRemoteRTC\?\.getIceServers/);
 assert.match(core,/HEARTBEAT_MS=2000,TIMEOUT_MS=9500,RETRY_GRACE_MS=8500/);
 assert.match(core,/controller!=='mobile'/);
 const host=read('pairing-web.js');
 assert.doesNotMatch(host,/ZebjusKits\?\.ingestAndroid/,'remote simulator input cannot reach physical RC');
 assert.doesNotMatch(host,/ZebjusKits\?\.stop\?\.\(\)/,'remote simulator STOP cannot stop independent physical Kit session');
});
test('remote telemetry is read-only, identity verified, and never grants physical RC or Wi-Fi writes',()=>{
 const s=read('remote-telemetry.js');
 assert.match(s,/ZebjusDeviceRelay\.request\('\/api\/telemetry'\)/);
 assert.match(s,/root\.ZebjusDeviceRelay/);
 assert.match(s,/Pair Android and confirm its Safety PIN first/);
 assert.match(s,/data\.kitId/);
 assert.match(s,/sessionId/);
 assert.match(s,/RC_DEADMAN_MS=350/);
 assert.match(s,/STALE_MS=2800/);
 assert.match(s,/visibilitychange/);
 assert.doesNotMatch(s.replace(/^\/\*[\s\S]*?\*\//,''),/\/api\/rc\/claim|\/api\/rc\/preview|\/api\/wifi\/mode|\/api\/firmware/);
});
test('remote monitor sends only one verified GET and shuts off on disconnect',async()=>{
 const callbacks=[],elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',listeners:{},addEventListener(t,fn){this.listeners[t]=fn}});return elements.get(id)};
 const doc={readyState:'complete',hidden:false,addEventListener(t,fn){callbacks.push([t,fn])},getElementById:get};
 const ticks=[],calls=[];
 const state={connected:true,paired:true,approved:true,sessionId:'a-session'};
 const runtime={document:doc,console,Date,
  setInterval:(fn,period)=>{ticks.push({fn,period});return ticks.length},clearInterval(){},addEventListener(){},
  ZebjusDeviceRelay:{status:()=>state,request:async(route)=>{calls.push(route);return {
   kitId:'ZFC-A2-ABCDEF012345',board:'A2',gyroReady:true,millis:12000,roll:1.5,pitch:2.5,yaw:3.5,
   rc:{source:'ANDROID',seq:9,inputValid:true,failsafe:false,ageMs:25,throttle:1000,roll:1500,pitch:1500,yaw:1500}}}},
  ZebjusRemoteRTC:{status:()=>({turnReady:false})}};
 runtime.window=runtime;
 vm.runInNewContext(read('remote-telemetry.js'),runtime);
 assert.equal(get('remoteTelemetryToggle').textContent,'');
 get('remoteTelemetryToggle').listeners.click();
 for(const tick of ticks)tick.fn();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls,['/api/telemetry']);
 assert.match(get('remoteKitName').textContent,/ZFC-A2/);
 assert.match(get('remoteKitRc').textContent,/ANDROID/);
 state.connected=false;
 for(const tick of ticks)tick.fn();
 assert.match(get('remoteTelemetryStatus').textContent,/Disconnected/);
 assert.equal(get('remoteKitRc').textContent,'—');
});
test('index/lab/tripod and Android assets load remote ICE before core pairing; SW bypasses credential config',()=>{
 const index=read('index.html'),lab=read('lab.html'),tripod=read('tripod.html'),
  mobile=read('companion.html'),sw=read('sw.js'),workflow=read('.github/workflows/build-qr-android.yml');
 assert.equal(index,lab);
 for(const p of [index,tripod,mobile]){
  const ice='remote-rtc.js?v=phase1-remote-20261017';
  assert.ok(p.includes(ice));
  assert.ok(p.indexOf(ice)<p.indexOf('pairing-core.js?v=phase1-remote-20261017'));
  assert.ok(p.includes('pairing-code.js?v=phase1-remote-20261017'));
 }
 for(const p of [index,tripod]){
  for(const id of ['remoteTelemetryPanel','remoteTelemetryToggle','remoteIceStatus','remoteKitName','remoteKitGyro','remoteKitRc','remoteKitAge','remoteTelemetryStatus'])assert.ok(p.includes('id="'+id+'"'),id);
  assert.ok(p.includes('remote-telemetry.js?v=phase1-remote-20261017'));
 }
 assert.ok(sw.includes('remote-rtc.js?v=phase1-remote-20261017'));
 assert.ok(sw.includes('remote-telemetry.js?v=phase1-remote-20261017'));
 assert.ok(index.includes('pairing-web.js?v=phase1-remote-20261017'));
 assert.ok(sw.includes('pairing-web.js?v=phase1-remote-20261017'));
 assert.ok(sw.includes("url.pathname.endsWith('/remote-rtc-config.json')"));
 assert.match(workflow,/remote-rtc\.js remote-rtc-config\.json/);
 assert.match(read('docs/REMOTE_PHASE1_WEBRTC.md'),/TURN relay and internet-based physical Drone Kit control are intentionally excluded/);
});
