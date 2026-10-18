import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function pushPaths(text){
 const start=text.indexOf('    paths:\n'),end=text.indexOf('  workflow_dispatch:',start);
 assert.ok(start>=0&&end>start,'Missing GitHub push paths or workflow_dispatch');
 return text.slice(start,end).split('\n').map(line=>/^      - (.*)$/.exec(line)?.[1]?.replace(/^['"]|['"]$/g,'')).filter(Boolean);
}
const gates=[
 ['Android Landscape Flight WebRTC Tests','.github/workflows/android-flight-controller.yml'],
 ['QR WebRTC Browser Pairing Test','.github/workflows/qr-browser-test.yml'],
 ['Tripod PID Simulator Tests','.github/workflows/tripod-simulator.yml'],
 ['Browser Test Python Lab','.github/workflows/browser-python-lab.yml'],
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
 assert.match(release,/needs: \[android, native_touch\]/,'native touch remains a prerequisite');
});
