import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');

test('stable Android source matches the published release or advances its versionCode',()=>{
 const gradle=read('mobile-android/app/build.gradle');
 assert.match(gradle,/applicationId 'in\.zebjus\.dronelab\.companion'/);
 const code=Number(/versionCode\s+(\d+)/.exec(gradle)?.[1]||0);
 const metadata=read('mobile-apk/ANDROID_RELEASE_META.txt');
 const published=Number(/VersionCode:\s*(\d+)/.exec(metadata)?.[1]||0);
 assert.ok(code>=33&&code>=published,'stable source cannot regress the published version code');
 if(code===published)assert.equal(/versionName '([^']+)'/.exec(gradle)?.[1],/^Version:\s*(.+)$/m.exec(metadata)?.[1],
  'equal codes are valid only for the already published version, not a new upgrade');
 // A new APK build must still strictly advance the installed/published code.
 assert.ok(read('tools/verify_signed_android_release.py').includes('int(version_code) > int(old_package[2])'));
 assert.match(gradle,/versionName '1\.8\.13-flight-mode'/);
 assert.match(gradle,/signingConfig signingConfigs\.zebjusRelease/);
 assert.match(gradle,/debuggable false/);
 assert.match(gradle,/storeType 'pkcs12'/);
 assert.match(gradle,/ZEBJUS_ANDROID_RELEASE_KEYSTORE_FILE/);
 assert.match(gradle,/ZEBJUS_ANDROID_SIGNING_PASSWORD/);
});
test('release workflow only distributes certificate-pinned signed release APKs',()=>{
 const yaml=read('.github/workflows/build-qr-android.yml');
 assert.match(yaml,/assembleRelease/);
 assert.match(yaml,/verify_signed_android_release\.py/);
 assert.match(yaml,/ZEBJUS_ANDROID_KEYSTORE_B64/);
 assert.match(yaml,/ZEBJUS_ANDROID_SIGNING_PASSWORD/);
 assert.match(yaml,/ZEBJUS_DroneLab_ANDROID_RELEASE\.apk/);
 assert.doesNotMatch(yaml,/cp mobile-android\/app\/build\/outputs\/apk\/debug\/app-debug\.apk mobile-apk\//);
 const verify=read('tools/verify_signed_android_release.py');
 assert.match(verify,/EXPECTED_CERT_SHA256 = "[0-9a-f]{64}"/);
 assert.match(verify,/Signer #/);
 assert.match(verify,/application-debuggable/);
 const ignore=read('.gitignore');
 assert.match(ignore,/\*\.p12/);
});

test('production web version stamping derives release version from package metadata',()=>{
 const workflow=read('.github/workflows/version-stamp.yml');
 assert.match(workflow,/Path\('package.json'\)/);assert.doesNotMatch(workflow,/meta\['version'\]='1\.4\.4/);
});

test('API30 SDK mirror retry verifies a real image and retains mandatory signed native instrumentation',()=>{
 const yaml=read('.github/workflows/build-qr-android.yml');
 assert.match(yaml,/Install and verify Android 11 system image \(retry corrupt downloads\)/);
 assert.match(yaml,/for attempt in 1 2 3/);
 assert.match(yaml,/test -s "\$folder\/system\.img"/);
 assert.match(yaml,/test -s "\$folder\/package\.xml"/);
 assert.match(yaml,/Android 11 system image could not be verified; block APK publication/);
 assert.match(yaml,/adb shell am instrument -w -r -e legacyReaderOnly true/);
 assert.match(yaml,/grep -F 'PASS API30 network response compatibility'/);
 assert.match(yaml,/grep -F 'INSTRUMENTATION_CODE: -1'/);
 assert.match(yaml,/needs: \[android, native_touch, legacy_api30\]/);
});
