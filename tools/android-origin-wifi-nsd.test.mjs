import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const activity=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
const link=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreWifiLink.java');
const bridge=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java');
const shim=read('android-native-bridge.js'),page=read('companion.html'),client=read('companion-network.js');
test('WebView uses exact origin + main-frame WebMessage listener, never frame-global JS interface',()=>{
 assert.match(activity,/WebViewCompat\.addWebMessageListener\(view,"ZebjusHost"/);
 assert.match(activity,/WebViewFeature\.WEB_MESSAGE_LISTENER/);
 assert.match(activity,/if\(!isMainFrame\|\|origin==null/);
 assert.match(activity,/Collections\.singleton\(LOCAL_ORIGIN\)/);
 assert.doesNotMatch(activity,/view\.addJavascriptInterface\(/);
 assert.match(shim,/host\.postMessage\(JSON\.stringify\(\{op,args\}\)\)/);
 assert.match(page,/<script src="android-native-bridge\.js"><\/script>/);
});
test('navigation and network resources fail closed outside bundled appassets origin',()=>{
 assert.match(activity,/return !mainPage\(url\)/);
 assert.match(activity,/request\.isForMainFrame\(\)&&request\.hasGesture\(\)/);
 assert.match(activity,/if\(!officialAsset\(uri\)\)return blockedResource\(\)/);
 assert.match(activity,/return bundled==null\?blockedResource\(\):bundled/);
 assert.match(activity,/webView!=view\|\|!LOCAL_PAGE\.equals\(view\.getUrl\(\)\)/);
 assert.match(activity,/view\.getSettings\(\)\.setAllowFileAccess\(false\)/);
});
test('only selected Wi-Fi Network+SSID+BSSID carries privileged signed Kit requests',()=>{
 assert.match(link,/connectivity\.registerNetworkCallback\(new NetworkRequest\.Builder\(\)/);
 assert.doesNotMatch(activity,/registerDefaultNetworkCallback/);
 assert.match(link,/Network networkFor\(String ip,boolean bootstrap\)/);
 assert.match(link,/if\(!bootstrap\)throw new IllegalStateException/);
 assert.match(link,/if\(!pinnedIp\.equals\(ip\)\)/);
 assert.match(link,/pinnedSsid\.equals\(checkedSsid\(observed\)\)/);
 assert.match(link,/pinnedBssid\.equalsIgnoreCase\(checkedBssid\(observed\)\)/);
 assert.match(bridge,/wifiLink\.networkFor\(ip,route\.equals\("\/api\/identify"\)/);
 assert.match(client,/await pinVerifiedStatus\(data\)/);
 assert.match(client,/forgetNativePin\(\)/);
});
test('mDNS/NSD _zebjus service and TTL cached IP candidates always reauthenticate',()=>{
 assert.match(link,/nsd\.discoverServices\("_zebjus\._tcp\."/);
 assert.match(link,/info\.getAttributes\(\)\.get\("id"\)/);
 assert.match(link,/kitId\.equals\(new String\(raw,/);
 assert.match(link,/address instanceof Inet4Address/);
 assert.match(client,/const known=cachedIp\(id\),candidate=found\|\|known/);
 assert.match(client,/Date\.now\(\)-saved\.at<7\*86400000/);
 assert.match(client,/raw=await nativeTransport\('\/api\/identify'\)/);
 assert.match(client,/window\.ZebjusKitAuth\.open\(nativeTransport/);
 assert.match(page,/id="kitDiscover"/);
});
test('release diagnostics retain all assertions and retry only a cold-start focus ANR once',()=>{
 const script=read('tools/native-flight-acceptance.sh');
 assert.match(script,/diagnose_failure\(\)/);
 assert.match(script,/dumpsys activity anr/);
 assert.match(script,/\$case_name" == baseline-preference-\*/);
 assert.match(script,/attempt=2/);
 assert.match(script,/Native acceptance failed/);
});
