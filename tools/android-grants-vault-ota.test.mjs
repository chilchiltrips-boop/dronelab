import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
const vault=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreKitVault.java');
const client=read('companion-network.js');
const facade=read('android-native-bridge.js');
const ui=read('companion.html');
const ota=read('tools/android-ota-recovery.test.mjs');
const workflow=read('.github/workflows/build-qr-android.yml');
test('KeyStore uses nonexportable AES-GCM and Device ID as authenticated associated data',()=>{
 for(const t of ['AndroidKeyStore','AES/GCM/NoPadding','KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT',
  '.setRandomizedEncryptionRequired(true)','cipher.updateAAD(id.getBytes(StandardCharsets.UTF_8))',
  'getSharedPreferences(PREF,Context.MODE_PRIVATE)'])assert.ok(vault.includes(t),t);
 assert.match(vault,/Only per-Kit 32-hex diagnostic credentials may be saved/);
 assert.doesNotMatch(vault,/OWNER|ownerCode|otaKey/i,'Stored secret must not be OWNER/OTA material');
 assert.match(read('mobile-android/app/src/main/AndroidManifest.xml'),/android:allowBackup="false"/);
});
test('Native vault, version, screen-awake operations remain origin and main-frame scoped',()=>{
 assert.match(app,/if\(!isMainFrame\|\|origin==null/);
 assert.match(app,/WebViewCompat\.addWebMessageListener/);
 assert.doesNotMatch(app,/view\.addJavascriptInterface/);
 for(const name of ['saveDiagnostic','loadDiagnostic','forgetDiagnostic','getInstalledVersion','setOtaKeepAwake']){
  assert.ok(facade.includes(name),name);
  assert.ok(app.includes('case "'+name+'"'),name);
 }
 assert.match(app,/FLAG_KEEP_SCREEN_ON/);
 assert.match(app,/getPackageManager\(\)\.getPackageInfo\(getPackageName\(\),0\)/);
 assert.match(ui,/id="androidInstalledVersion"/);
});
test('Paired WebApp requires explicit independent grants with privileged routes separated',()=>{
 for(const id of ['kitAllowWeb','kitGrantWifi','kitGrantDiagnostic'])assert.ok(ui.includes('id="'+id+'"'),id);
 assert.match(client,/const readRoutes=new Set/);
 assert.match(client,/const wifiRoutes=new Set/);
 assert.match(client,/const diagnosticRoutes=new Set/);
 assert.match(client,/const grant=grantFor\(route,method\)/);
 assert.match(client,/if\(!grant\|\|!el\(grant\)\?\.checked\)/);
 assert.match(client,/if\(!online\|\|!onKitLink\)/);
 assert.match(client,/forgetGrants\(\);forgetNativePin\(\)/);
 assert.doesNotMatch(client,/const allowed=new Set\([^;]*firmware\/chunk/);
});
test('Preflight validates metadata + bounded header before full image allocation',()=>{
 const start=client.indexOf('const advertisedSize=Number(file.size)');
 const end=client.indexOf('bytes=new Uint8Array(buffer)',start);
 assert.ok(start>=0&&end>start);
 const pre=client.slice(start,end);
 assert.match(pre,/advertisedSize!==release.size/);
 assert.match(pre,/file.type/);
 assert.match(pre,/file.slice\(0,208\).arrayBuffer\(\)/);
 assert.match(pre,/hDescriptor!==0xabcd5432/);
 assert.match(pre,/await file.arrayBuffer\(\)/);
 assert.ok(pre.indexOf('file.slice(0,208)')<pre.indexOf('await file.arrayBuffer()'));
 assert.match(ota,/rejects oversized APP before calling file.arrayBuffer/);
 assert.match(ota,/foreground pause resumes only after verifying signed controller offset/);
});
test('Shared policy shipped in Android package and attached before signed session/OTA',()=>{
 const policy=read('js/kit-network-policy.js');
 assert.match(policy,/function otaTarget\(/);
 assert.match(policy,/function retryDisposition\(/);
 assert.match(policy,/function requestTimeout\(/);
 assert.match(client,/policy\?\.otaTarget\?\./);
 assert.match(client,/policy\?\.retryDisposition\?\./);
 assert.match(client,/policy\?\.requestTimeout\?\./);
 assert.match(ui,/js\/kit-network-policy.js.*js\/kit-auth.js/s);
 assert.match(workflow,/cp js\/kit-auth.js js\/kit-network-policy.js/);
});
