import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
test('FlightCore A1/A2 firmware advertises bench AP/STA and persists Wi-Fi only after association',()=>{
 const f=read('FlightCore_Firmware/FlightCoreNetwork.h')+read('FlightCore_Firmware/FlightCoreWifiPolicy.h'),ino=read('FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino');
 for(const expected of ['#include <WiFi.h>','#include <Preferences.h>','WiFi.scanNetworks(true,false)','WiFi.begin(','zjRememberProfile(','sta_test_pass_saved','sta_failed_ap_fallback','sta_connecting','/api/wifi/test','/api/wifi/mode','/api/telemetry','/api/command','/api/status'])assert.ok(f.includes(expected),expected);
 assert.ok(ino.includes('#include "FlightCoreNetwork.h"'));
 assert.ok(ino.includes('zjNetworkSetup();')&&ino.includes('zjNetworkLoop(now);'));
 assert.ok(!f.includes('WiFi.begin("')&&!f.includes('SSID="'),'No hard-coded router credentials');
});
test('Network operations use signed sessions and retired multipart route cannot update firmware',()=>{
 const f=read('FlightCore_Firmware/FlightCoreNetwork.h'),ota=read('FlightCore_Firmware/FlightCoreOta.h');
 for(const word of ['X-ZJ-Session','X-ZJ-Proof','zjAuthenticated()','legacy_ota_disabled_use_encrypted_session','hardware_arming_disabled','/api/rc/claim','/api/rc/release','/api/rc/preview','zjRcState()','/api/ota'])assert.ok(f.includes(word),word);
 assert.match(ota,/zjSecureOtaAccess\(true\)/);
 assert.match(ota,/Update\.begin\(size,U_FLASH\)/);
 assert.ok(!f.includes('ledcWrite(ESC'),'No motor mixer on diagnostics API');
});
test('Android UDP management uses verified Wi-Fi and signed AES-GCM session requests',()=>{
 const n=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java');
 const m=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
 assert.ok(n.includes('@JavascriptInterface public void requestSecure('));
 assert.ok(n.includes('Legacy raw-key requests are disabled.'));
 assert.ok(n.includes('privateIp(')&&n.includes('allowed(method,route)'));
 assert.ok(n.includes('FlightCoreUdpRpc.exchange(ip,envelope'));
 assert.doesNotMatch(n,/HttpURLConnection|wifi\.openConnection/);
 assert.ok(n.includes('"/api/firmware/chunk"'));
 assert.doesNotMatch(n,/multipart\/form-data/);
 assert.ok(m.includes('MIXED_CONTENT_NEVER_ALLOW'));
 assert.ok(m.includes('WebViewCompat.addWebMessageListener(view,"ZebjusHost"'));
 assert.ok(m.includes('Collections.singleton(LOCAL_ORIGIN)'));
 assert.doesNotMatch(m,/view\.addJavascriptInterface\(/,'frame-global JS bridge is forbidden');
 assert.ok(read('android-native-bridge.js').includes('host.postMessage(JSON.stringify({op,args}))'));
 assert.ok(m.includes('onShowFileChooser'));
});
test('WebRTC kit management needs verified pairing and Android operator opt-in',()=>{
 const p=read('pairing-core.js'),a=read('companion-network.js'),w=read('pairing-web.js');
 assert.ok(p.includes("type:'NET_REQUEST'")&&p.includes("type:'NET_RESPONSE'"));
 assert.ok(p.includes('approved&&connected'));
 assert.ok(a.includes('kitAllowWeb')&&a.includes('peer?.status()?.paired'));
 assert.ok(a.includes("armed:'false'"));
 assert.ok(w.includes('window.ZebjusDeviceRelay'));
});
test('Web and Python expose distinct USB/AP/STA paths without claiming motor support',()=>{
 const html=read('index.html'),app=read('js/python-lab.js'),firmware=read('FlightCore_Firmware/FlightCoreNetwork.h');
 for(const v of ['value="usb"','value="ap"','value="sta"','id="netScan"','id="netSave"','id="netSwitch"'])assert.ok(html.includes(v),v);
 assert.ok(app.includes('wifiPythonSelected()')&&app.includes('DroneLabNetwork.writeLine'));
 assert.ok(firmware.includes('motorControl\\":false')||firmware.includes('motorControl":false'));
});

test('AERION classroom six-digit code persists and never acts as the control password',()=>{
 const k=read('FlightCore_Firmware/FlightCoreClassroom.h'),f=read('FlightCore_Firmware/FlightCoreNetwork.h');
 const ino=read('FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino');
 for(const t of ['zjKitPrefs.getString("code"','zjKitPrefs.putString("code"','ZJKIT,CODE,','ZJKIT,ID,','ZJRC,CLAIM,','ZJRC,SET,','ZJRC,STOP','ZJ_RC_DEADMAN_MS=500','ZJ_RC_LEASE_MS=1800','ZJRC,FAILSAFE,INPUT_TIMEOUT','zjRcFrame(','zjRcClaim(','zjRcRelease(','zjRcOwned','zjRcSession','Serial.availableForWrite()>100'])assert.ok(k.includes(t),t);
 for(const t of ['zjApPass=zjEffectiveApPassword()','ZEBJUS-AERION-','/api/identify','MDNS.addService','MDNS.addServiceTxt','zjClientTransport','zjRcClaim(','zjRcFrame(','zjRcRelease("NETWORK_MODE_CHANGED")'])assert.ok(f.includes(t),t);
 assert.ok(ino.includes('zjKitSetup();')&&ino.includes('zjRcLoop(now);'));
 assert.ok(ino.includes('ZEBJUS AERION A1')&&ino.includes('ZEBJUS AERION A2'));
 assert.ok(!k.includes('ledcWrite(')&&!k.includes('digitalWrite('),'Joystick diagnostic handler must never activate motors');
});


test('AERION 1.4.0 USB-only provisioning and browser origin restrictions remain motor-disabled',()=>{
 const net=read('FlightCore_Firmware/FlightCoreNetwork.h'),c=read('FlightCore_Firmware/FlightCoreClassroom.h');
 for(const k of ['zjCorsAllowed()','Access-Control-Allow-Private-Network','origin_denied','zjApPass=zjEffectiveApPassword()','zjKitPrefs.getString("apName"','rssi\\":'])assert.ok(net.includes(k),k);
 for(const k of ['ZJADMIN,GET','ZJADMIN,NAME,','ZJADMIN,APNAME,','ZJADMIN,APPASS,','ZJADMIN,ROTATE_KEY,CONFIRM','ZJADMIN,FACTORY_RESET,CONFIRM'])assert.ok(c.includes(k),k);
 assert.ok(!net.includes('/api/admin/'),'remote admin and key changes must not be exposed');
});

test('Android encrypted APP chunks are bound to Wi-Fi, never cellular/system network',()=>{
 const n=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java');
 const js=read('companion-network.js');
 const body=n.slice(n.indexOf('private void submit('),n.indexOf('@JavascriptInterface public void openWifiSettings'));
 assert.match(body,/Network wifi=wifiLink\.networkFor\(ip,/);
 const pin=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreWifiLink.java');
 assert.match(pin,/if\(!bootstrap\)throw new IllegalStateException/);
 assert.match(pin,/pinnedSsid\.equals\(ssid\)/);
 assert.match(pin,/pinnedBssid\.equalsIgnoreCase/);
 assert.doesNotMatch(body,/connectivity\.getActiveNetwork\(\)/,'never use default/cellular network');
 assert.match(body,/wifi::bindSocket/);
 assert.ok(js.includes("ZebjusKitAuth.open(nativeTransport,id,credential,'admin')"));
 assert.ok(js.includes("'/api/firmware/chunk'"));
 assert.ok(read('FlightCore_Firmware/FlightCoreOta.h').includes('zjSecureOtaAccess(true)'));
});
test('Python Network Lab reports actual authenticated AP request even while STA is online',async()=>{
 const {runInNewContext}=await import('node:vm');
 const id='ZFC-A1-012345ABCDEF',state={connected:true,transport:'ap',kitId:id};
 const response={kitId:id,board:'ZFC-A1',version:'1.4.0',phase:'sta_connected',mode:'auto',requestTransport:'AP',staConnected:true,ip:'192.168.0.11',apIp:'192.168.4.1'};
 const els={netResult:{textContent:'',dataset:{}},netRuntime:{textContent:''}};
 const window={ZebjusKits:{getState:()=>state,request:async()=>response},addEventListener(){},dispatchEvent(){}};
 const document={readyState:'loading',addEventListener(){},getElementById:id=>els[id]||null};
 const transport={};runInNewContext(read('js/kit-data-interface.js'),transport);
 window.ZebjusKitData=transport.ZebjusKitData;
 runInNewContext(read('js/network-lab.js'),{window,document,Date,performance:{now:()=>1},setTimeout,clearTimeout,setInterval,clearInterval,CustomEvent:class {}});
 await window.DroneLabNetwork.read();
 assert.match(els.netResult.textContent,/AP$/,'AP request must not be relabelled STA merely because STA interface is connected');
 assert.equal(window.DroneLabNetwork.mode(),'ap');
 assert.equal(window.DroneLabNetwork.isConnected(),true);
 state.connected=false;
 assert.equal(window.DroneLabNetwork.isConnected(),false,'old Network Lab timestamp cannot override loss of verified kit');
 state.connected=true;response.kitId='ZFC-A2-FFFFFFFFFFFF';
 await assert.rejects(window.DroneLabNetwork.read(),/Device ID mismatch/);
 response.kitId=undefined;
 await assert.rejects(window.DroneLabNetwork.read(),/Device ID mismatch/);
});
