import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {setTimeout as sleep} from 'node:timers/promises';

const port=8769,base='http://127.0.0.1:'+port,origin='http://localhost:'+port;
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sid='0123456789abcdef01234567',secret='ab'.repeat(24);
let server;
async function request(path,method='GET',json){
 const res=await fetch(base+path,{method,headers:{Origin:origin,...(json?{'Content-Type':'application/json'}:{})},body:json?JSON.stringify(json):undefined});
 return {status:res.status,body:await res.json()};
}
test('one-scan signaling service is local, ephemeral, authenticated and one-time',async()=>{
 server=spawn('python3',['tools/local_pair_server.py','--port',String(port),'--lan-ip','127.0.0.1'],{stdio:['ignore','pipe','pipe']});
 let ready=false;
 try{
  for(let i=0;i<45;i++){
   try{const r=await request('/__pairing/info');if(r.status===200){ready=true;assert.equal(r.body.bridge,base);break}}catch{}
   await sleep(160);
  }
  assert.ok(ready,'Python local pairing bridge failed to start');
  const expires=Date.now()+90000;
  let r=await request('/__pairing/register','POST',{sid,secret,expires});
  assert.equal(r.status,200);
  r=await request('/__pairing/answer','POST',{sid,secret:'00'.repeat(24),answer:'zj1:fake-answer'});
  assert.equal(r.status,403,'wrong QR secret must never publish an answer');
  r=await request('/__pairing/answer','POST',{sid,secret,answer:'zj1:fake-answer'});
  assert.equal(r.status,200,'Android answer must deliver without cloud');
  r=await request('/__pairing/poll?sid='+sid+'&secret='+secret);
  assert.equal(r.status,200);assert.equal(r.body.answer,'zj1:fake-answer');
  r=await request('/__pairing/poll?sid='+sid+'&secret='+secret);
  assert.equal(r.body.answer,null,'answer must be consumed once');
  r=await request('/__pairing/close','POST',{sid,secret});
  assert.equal(r.status,200);
  r=await request('/__pairing/poll?sid='+sid+'&secret='+secret);
  assert.equal(r.status,404,'refresh must invalidate session');
  r=await request('/__pairing/register','POST',{sid,secret,expires:Date.now()-100});
  assert.equal(r.status,400,'expired QR must be rejected');
  console.log('PASS local QR bridge register, secure LAN answer, one-time poll, revoke and expiry');
 }finally{server.kill('SIGTERM')}
},{timeout:20000});

test('Android private IPv4-only native response and network reset guards',()=>{
 const java=source('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
 assert.match(java,/@JavascriptInterface public void sendAnswer/);
 assert.match(java,/privateIpv4\(host\)/);
 assert.match(java,/uri\.getPort\(\) != 8765/);
 assert.match(java,/conn\.setInstanceFollowRedirects\(false\)/);
 assert.match(java,/new ConnectivityManager\.NetworkCallback\(\)/);
 assert.match(java,/window\.zebjusNetworkChanged/);
 const js=source('companion.js');
 assert.match(js,/window\.ZebjusNativeBridge\.sendAnswer/);
 assert.match(js,/window\.zebjusNetworkChanged/);
 assert.match(js,/scan a NEW Web QR/);
 const qr=source('pairing-qr-ui.js');
 assert.match(qr,/getCapabilities/);
 assert.match(qr,/applyConstraints/);
 const web=source('pairing-web.js');
 assert.match(web,/topGrantMobileSwitch/);
 assert.match(web,/bridgeCall\('register'/);
 assert.match(web,/pollAnswer/);
});

test('Android app remains kit-free and explicitly declares Wi-Fi state and camera',()=>{
 const manifest=source('mobile-android/app/src/main/AndroidManifest.xml');
 assert.match(manifest,/android\.permission\.CAMERA/);
 assert.match(manifest,/android\.permission\.INTERNET/);
 assert.match(manifest,/android\.permission\.ACCESS_NETWORK_STATE/);
 assert.doesNotMatch(manifest,/android\.permission\.RECORD_AUDIO/);
 const gradle=source('mobile-android/app/build.gradle');
 assert.match(gradle,/versionCode\s+3/);
 assert.match(gradle,/versionName '1\.2\.0-one-scan'/);
 const html=source('companion.html');
 assert.doesNotMatch(html,/answerCanvas|Scan Response QR/);
});
