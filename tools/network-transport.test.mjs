import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
test('FlightCore A1/A2 firmware advertises bench AP/STA and persists Wi-Fi only after association',()=>{
 const f=read('FlightCore_Firmware/FlightCoreNetwork.h'),ino=read('FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino');
 for(const expected of ['#include <WiFi.h>','#include <Preferences.h>','WiFi.scanNetworks(true,false)','WiFi.begin(','zjPrefs.putString("ssid"','sta_test_pass_saved','sta_failed_ap_fallback','sta_connecting','/api/wifi/test','/api/wifi/mode','/api/telemetry','/api/command','/api/status'])assert.ok(f.includes(expected),expected);
 assert.ok(ino.includes('#include "FlightCoreNetwork.h"'));
 assert.ok(ino.includes('zjNetworkSetup();')&&ino.includes('zjNetworkLoop(now);'));
 assert.ok(!f.includes('WiFi.begin("')&&!f.includes('SSID="'),'No hard-coded router credentials');
});
test('Network operations are authenticated and flight outputs remain disabled',()=>{
 const f=read('FlightCore_Firmware/FlightCoreNetwork.h');
 for(const text of ['X-ZJ-Key','zjAuthenticated()','access_key_required','hardware_arming_disabled','motorsArmed\\":false','/api/rc/claim','/api/rc/release','/api/rc/preview','zjRcState()','/api/ota','U_FLASH','u.buf[0]!=0xe9','chip!=13','chip!=5'])assert.ok(f.includes(text),text);
 assert.ok(!f.includes('ledcWrite(ESC'),'No motor mixer on diagnostics API');
});
test('Android local HTTP is isolated from bundled HTTPS WebView and public sites',()=>{
 const n=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/FlightCoreNativeBridge.java');
 const m=read('mobile-android/app/src/main/java/in/zebjus/dronelab/companion/MainActivity.java');
 assert.ok(n.includes('@JavascriptInterface public void request('));
 assert.ok(n.includes('privateIp(')&&n.includes('allowed(method,route)'));
 assert.ok(n.includes('wifi.openConnection(target)'));
 assert.ok(n.includes('otaReply(')&&n.includes('OTA_DOCUMENT_PICKER'));
 assert.ok(m.includes('MIXED_CONTENT_NEVER_ALLOW'));
 assert.ok(m.includes('view.addJavascriptInterface(nativeFlightCore,"ZebjusNative")'));
 assert.ok(!n.includes('http://"+ip+form'),'Only fixed local path requests');
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
 for(const t of ['zjKitPrefs.getString("code"','zjKitPrefs.putString("code"','ZJKIT,CODE,','ZJKIT,ID,','ZJRC,CLAIM,','ZJRC,SET,','ZJRC,STOP','ZJ_RC_DEADMAN_MS=350','ZJ_RC_LEASE_MS=1800','ZJRC,FAILSAFE,INPUT_TIMEOUT','zjRcFrame(','zjRcClaim(','zjRcRelease(','zjRcOwned','zjRcSession','Serial.availableForWrite()>100'])assert.ok(k.includes(t),t);
 for(const t of ['zjKitPrefs.getString("apPass","12345678")','ZEBJUS-AERION-','/api/identify','MDNS.addService','MDNS.addServiceTxt','zjClientTransport','zjRcClaim(','zjRcFrame(','zjRcRelease("NETWORK_MODE_CHANGED")'])assert.ok(f.includes(t),t);
 assert.ok(ino.includes('zjKitSetup();')&&ino.includes('zjRcLoop(now);'));
 assert.ok(ino.includes('ZEBJUS AERION A1')&&ino.includes('ZEBJUS AERION A2'));
 assert.ok(!k.includes('ledcWrite(')&&!k.includes('digitalWrite('),'Joystick diagnostic handler must never activate motors');
});
