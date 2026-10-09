import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');

test('stable Android package ID and strictly monotonic release versionCode',()=>{
 const gradle=read('mobile-android/app/build.gradle');
 assert.match(gradle,/applicationId 'in\.zebjus\.dronelab\.companion'/);
 assert.match(gradle,/versionCode\s+7\b/);
 assert.match(gradle,/versionName '1\.4\.2-stable-signing'/);
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
