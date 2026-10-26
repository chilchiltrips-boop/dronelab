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
 assert.match(html,/Android APK • Checking version/);
 assert.equal((html.match(/<span>Download APK<\/span>/g)||[]).length,2);
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
 assert.match(official,/Android APK • /);
 assert.match(official,/code [1-9][0-9]*\)/);
 const publishedVersion=metadata.match(/^Version:\s*(\S+)/m)?.[1];
 assert.ok(publishedVersion&&official.includes(publishedVersion.split('-')[0]),'No hardcoded release version');
 assert.throws(()=>parse(metadata.replace(/^App:.*$/m,'App: example.fake.app')),/invalid/);
 assert.throws(()=>parse(metadata.replace(/^Release certificate SHA256:.*$/m,'Release certificate SHA256: 00')),/invalid/);
 assert.throws(()=>parse(metadata.replace(/^VersionCode:.*$/m,'VersionCode: 0')),/invalid/);
});

test('The Hardware Center script refreshes release details without touching Kit/OTA or pairing',()=>{
 assert.match(workspace,/name==='overview'\|\|name==='mobile'\)updatePublishedAndroidRelease\(\)/);
 assert.match(workspace,/releaseChecking\|\|Date\.now\(\)-releaseLastChecked<300000/);
 assert.match(workspace,/releaseVersion\|\|/);
 assert.match(html,/devices-workspace\.css\?v=compact-scroll-header-20261016/);
 assert.match(html,/devices-workspace\.js\?v=kit-live-inputs-20261017/);
});

test('Android download occupies one small row, not the old full marketing card',()=>{
 assert.doesNotMatch(html,/dw-android-release-kicker|dw-android-release-copy/);
 assert.match(styles,/#tab-firmware \.dw-android-release\{[\s\S]*?width:fit-content/);
 assert.match(styles,/#tab-firmware \.dw-android-release-link\{[\s\S]*?min-height:30px/);
 assert.match(html,/v2-header\.css\?v=aerion-spacious-header-20261027/);
});
