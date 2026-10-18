import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const script=new URL('./android_release_needed.py',import.meta.url).pathname;
function scenario(change){
 const root=mkdtempSync(join(tmpdir(),'zebjus-release-needed-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const put=(path,text)=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),text)};
 const commit=()=>{git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture')};
 try{
  git('init','-q');put('mobile-android/app/build.gradle',"versionCode 37\nversionName '1.7.21-secure-udp-diagnostics'\n");put('companion-network.js','original');commit();
  const source=git('rev-parse','HEAD');
  put('mobile-apk/ANDROID_RELEASE_META.txt','App: in.zebjus.dronelab.companion\nVersion: 1.7.21-secure-udp-diagnostics\nVersionCode: 37\nRelease certificate SHA256: F1B86575B3590734654F638E4E0D68056D37B2E8884AC7D6C24636FE9B516894\nSource commit: '+source+'\n');
  put('mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk','signed-fixture');
  put('mobile-apk/SHA256SUMS.txt',createHash('sha256').update('signed-fixture').digest('hex')+'  mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk\n');commit();
  change(put);commit();
  return spawnSync('python3',[script],{cwd:root,encoding:'utf8'});
 }finally{rmSync(root,{recursive:true,force:true})}
}
test('WebApp/test-only updates retain the unchanged published APK without a duplicate build',()=>{
 const r=scenario(put=>{put('js/classroom-kits.js','STA fix');put('tools/release-signing.test.mjs','source contract fix')});
 assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).build,false);
});
test('changed Android/native or packaged JS inputs cannot reuse the installed versionCode',()=>{
 for(const file of ['companion-network.js','mobile-android/app/src/main/java/Main.java','js/kit-auth.js','firmware-catalog.json']){
  const r=scenario(put=>put(file,'changed'));assert.notEqual(r.status,0);assert.match(r.stderr,/increment versionCode/);
 }
});
test('higher Android versionCode schedules the complete existing release pipeline',()=>{
 const r=scenario(put=>put('mobile-android/app/build.gradle',"versionCode 38\nversionName '1.7.22'\n"));
 assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).build,true);
});
test('version regressions, mismatched version names and damaged published artifacts fail closed',()=>{
 for(const change of [put=>put('mobile-android/app/build.gradle',"versionCode 36\nversionName '1.7.20'\n"),
  put=>put('mobile-android/app/build.gradle',"versionCode 37\nversionName '1.7.22'\n"),
  put=>put('mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk','damaged')]){
  const r=scenario(change);assert.notEqual(r.status,0);
 }
});
