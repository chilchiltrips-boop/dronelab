import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html'),styles=read('devices-workspace.css'),workspace=read('js/devices-workspace.js');
const metadata=read('mobile-apk/ANDROID_RELEASE_META.txt');
const releaseUrl='https://github.com/chilchiltrips-boop/dronelab/raw/refs/heads/main/mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk';

test('Devices & Firmware Overview and Mobile Controller both offer the same official stable-signed APK',()=>{
 assert.equal((html.match(/class="dw-android-release"/g)||[]).length,2);
 assert.equal((html.match(/data-dw-android-version/g)||[]).length,2);
 assert.equal((html.match(/aria-label="Download latest published stable ZEBJUS Android APK"/g)||[]).length,2);
 assert.equal(html.split(releaseUrl).length-1,2,'Both controls use the production official APK URL');
 for(const id of ['dw-panel-overview','dw-panel-mobile']){
  const beginning=html.indexOf('id="'+id+'"');
  const next=html.indexOf('class="dw-android-release"',beginning);
  const close=html.indexOf('</section>',beginning);
  assert.ok(beginning>=0&&next>beginning&&next<close,id+' has visible APK download card');
 }
 assert.match(html,/not a FlightCore firmware image/);
 assert.match(styles,/\.dw-android-release-link:focus-visible/);
 assert.match(styles,/@media\(max-width:560px\)/);
});

test('The displayed Android version comes from signed published metadata, not pending app builds',()=>{
 assert.match(workspace,/fetch\('\.\/mobile-apk\/ANDROID_RELEASE_META\.txt',\{cache:'no-store'\}\)/);
 assert.match(workspace,/parsePublishedAndroidRelease\(text\)/);
 assert.match(workspace,/app!=='in\.zebjus\.dronelab\.companion'/);
 assert.match(workspace,/cert!==expectedAndroidCert/);
 assert.doesNotMatch(workspace,/fetch\(['"]\.\/mobile-android\/app\/build\.gradle/);
 const start=workspace.indexOf('function parsePublishedAndroidRelease(text){');
 const end=workspace.indexOf('function updatePublishedAndroidRelease(){',start);
 assert.ok(start>0&&end>start,'Published release parser is testable');
 const cert='F1B86575B3590734654F638E4E0D68056D37B2E8884AC7D6C24636FE9B516894';
 const parse=runInNewContext('const expectedAndroidCert='+JSON.stringify(cert)+';'+workspace.slice(start,end)+';parsePublishedAndroidRelease;', {Map,Number,Error});
 const official=parse(metadata);
 assert.match(official,/Published stable Android APK:/);
 assert.match(official,/code [1-9][0-9]*\)/);
 assert.match(official,/1\.7\./);
 assert.throws(()=>parse(metadata.replace(/^App:.*$/m,'App: example.fake.app')),/invalid/);
 assert.throws(()=>parse(metadata.replace(/^Release certificate SHA256:.*$/m,'Release certificate SHA256: 00')),/invalid/);
 assert.throws(()=>parse(metadata.replace(/^VersionCode:.*$/m,'VersionCode: 0')),/invalid/);
});

test('The Hardware Center script refreshes release details without touching Kit/OTA or pairing',()=>{
 assert.match(workspace,/name==='overview'\|\|name==='mobile'\)updatePublishedAndroidRelease\(\)/);
 assert.match(workspace,/releaseChecking\|\|Date\.now\(\)-releaseLastChecked<300000/);
 assert.match(workspace,/releaseVersion\|\|/);
 assert.match(html,/devices-workspace\.css\?v=android-stable-download-20261016/);
 assert.match(html,/devices-workspace\.js\?v=android-stable-download-20261016/);
});
