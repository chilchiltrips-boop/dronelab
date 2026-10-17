import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,readFileSync as readOut,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('signed APK public metadata is generated from checked Gradle code/name, never stale hardcoding',()=>{
 const directory=mkdtempSync(join(tmpdir(),'zebjus-release-meta-'));
 try{
  const gradle=join(directory,'build.gradle'),out=join(directory,'release.txt');
  writeFileSync(gradle,"defaultConfig {\n   versionCode 31\n   versionName '1.7.15-live-link-recovery'\n}\n");
  const sourceId='a'.repeat(40);
  const process=spawnSync('python3',['tools/write_android_release_metadata.py',gradle,out,sourceId],{encoding:'utf8'});
  assert.equal(process.status,0,process.stderr);
  const text=readOut(out,'utf8');
  for(const expected of ['Version: 1.7.15-live-link-recovery','VersionCode: 31','Source commit: '+sourceId,
    'Release certificate SHA256: F1:B8:65:75:'])assert.ok(text.includes(expected),expected);
  assert.ok(text.endsWith('\n'));
  const bad=join(directory,'bad.gradle');writeFileSync(bad,"defaultConfig { versionCode unknown }");
  const fail=spawnSync('python3',['tools/write_android_release_metadata.py',bad,out,sourceId],{encoding:'utf8'});
  assert.notEqual(fail.status,0,'missing release version must fail closed');
  const invalid=spawnSync('python3',['tools/write_android_release_metadata.py',gradle,out,'untrusted'],{encoding:'utf8'});
  assert.notEqual(invalid.status,0,'untrusted source ID must be rejected');
 }finally{rmSync(directory,{recursive:true,force:true})}
});
test('signed release gate verifies APK, pinned signer and native touch before publishing metadata',()=>{
 const wf=read('.github/workflows/build-qr-android.yml');
 assert.match(wf,/verify_signed_android_release\.py "\$RELEASE_APK"/);
 assert.match(wf,/Package exact-source signed native test bundle/);
 assert.match(wf,/needs: \[android, native_touch\]/);
 assert.match(wf,/Verify exact APK source and prepare native upgrade fixture/);
 assert.match(wf,/write_android_release_metadata\.py mobile-android\/app\/build\.gradle/);
 assert.match(wf,/sha256sum -c mobile-apk\/SHA256SUMS\.txt/);
 assert.doesNotMatch(wf,/Version: 1\.7\.13-direct-kit-control/);
});
