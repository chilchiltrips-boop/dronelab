import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function pushPaths(text){
 const lines=text.split('\n'),start=lines.findIndex(line=>line==='  push:');
 assert.ok(start>=0,'Missing GitHub push trigger');
 const next=lines.findIndex((line,i)=>i>start&&/^  [A-Za-z_]+:/.test(line));
 const push=lines.slice(start+1,next<0?lines.length:next),paths=push.findIndex(line=>line==='    paths:');
 assert.ok(paths>=0,'Missing GitHub push paths');
 const end=push.findIndex((line,i)=>i>paths&&/^    [A-Za-z_]+:/.test(line));
 return push.slice(paths+1,end<0?push.length:end).map(line=>/^      - (.*)$/.exec(line)?.[1]?.replace(/^['"]|['"]$/g,'')).filter(Boolean);
}
const gates=[
 ['Authoritative status integration','.github/workflows/authoritative-status.yml'],
 ['Android Landscape Flight WebRTC Tests','.github/workflows/android-flight-controller.yml'],
 ['QR WebRTC Browser Pairing Test','.github/workflows/qr-browser-test.yml'],
 ['Tripod PID Simulator Tests','.github/workflows/tripod-simulator.yml'],
 ['Browser Test Python Lab','.github/workflows/browser-python-lab.yml'],
 ['Verify UDP management, IMU and Python bridge','.github/workflows/udp-management.yml'],
 ['Verify DroneLab FlightCore Firmware Center','.github/workflows/validate-flightcore.yml'],
 ['Unified PID Tuning Shell & Persistent WebRTC','.github/workflows/pid-shell.yml']
];
test('every mandatory exact-source signed APK gate fires on every APK source trigger',()=>{
 const release=read('.github/workflows/build-qr-android.yml');
 const apkPaths=pushPaths(release);
 assert.ok(apkPaths.length>35,'APK source list changed unexpectedly');
 assert.ok(apkPaths.includes('.github/workflows/build-qr-android.yml'));
 for(const [name,path] of gates){
  const yaml=read(path);
  assert.equal(yaml.split('\n')[0],'name: '+name,'release check name must match exactly');
  assert.match(yaml,/    branches: \[[^\n]*main[^\n]*\]/,'main must be enabled');
  const paths=new Set(pushPaths(yaml));
  for(const p of apkPaths)assert.ok(paths.has(p),name+' would be missing on APK source path '+p);
 }
 const gate=read('tools/wait-release-checks.mjs');
 for(const [name] of gates)assert.ok(gate.includes("'"+name+"'"),'release gate must require '+name);
 assert.match(gate,/x\.head_sha===GITHUB_SHA&&x\.event==='push'/,'no branch/SHA bypass');
 assert.match(release,/verify_signed_android_release\.py/,'signer verification required');
 assert.match(release,/sha256sum -c mobile-apk\/SHA256SUMS\.txt/,'artifact checksum required');
 assert.match(release,/needs: \[android, native_touch, legacy_api30\]/,'native touch remains a prerequisite');
});
