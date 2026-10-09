import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,base),'utf8');

test('camera request checks exact HTTPS appasset host, not WebView origin string',()=>{
 const java=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
 const method=java.slice(java.indexOf('private void cameraPermission('),java.indexOf('@Override public void onRequestPermissionsResult'));
 assert.ok(method.includes('!isLocalOrigin(request)'), 'cameraPermission must validate host + scheme');
 assert.ok(!method.includes('LOCAL_ORIGIN.equals(request.getOrigin().toString())'),'old trailing-slash bug must be gone');
 assert.ok(java.includes('"https".equals(origin.getScheme())'));
 assert.ok(java.includes('"appassets.androidplatform.net".equals(origin.getHost())'));
 assert.ok(java.includes('checkSelfPermission(Manifest.permission.CAMERA)'));
 assert.ok(java.includes('requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST)'));
 assert.ok(java.includes('onRequestPermissionsResult'));
 assert.ok(java.includes('request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE})'));
 assert.ok(!java.includes('grant(request.getResources())'), 'do not grant unrequested media');
});

test('Android permission denial offers user direct app-settings recovery',()=>{
 const java=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
 assert.ok(java.includes('explainDeniedCameraPermission()'));
 assert.ok(java.includes('Settings.ACTION_APPLICATION_DETAILS_SETTINGS'));
 assert.ok(java.includes('new AlertDialog.Builder(this)'));
 assert.ok(java.includes('onPermissionRequestCanceled'));
 const manifest=read('mobile-android/app/src/main/AndroidManifest.xml');
 assert.ok(manifest.includes('android.permission.CAMERA'));
 assert.ok(!manifest.includes('android.permission.RECORD_AUDIO'));
});

test('APK increments version code to allow upgrade and companion UI explains permissions',()=>{
 const build=read('mobile-android/app/build.gradle');
 assert.ok(build.includes('versionCode 3'));
 assert.ok(build.includes("versionName '1.2.0-one-scan'"));
 const html=read('companion.html'),js=read('companion.js');
 assert.ok(html.includes('id="cameraPermissionHelp"'));
 assert.ok(html.includes('Allow only while using the app.'));
 assert.ok(js.includes("e?.name==='NotAllowedError'"));
 assert.ok(js.includes("message('QR scanner: '+text)"));
});
