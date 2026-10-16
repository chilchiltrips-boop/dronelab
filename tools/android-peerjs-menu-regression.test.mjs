import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('companion.html'),css=read('companion.css'),code=read('pairing-code.js'),
  network=read('companion-network.js'),flight=read('companion-flight.js'),
  workflow=read('.github/workflows/build-qr-android.yml'),sw=read('sw.js'),
  nativeTest=read('mobile-android/app/src/androidTest/java/in/zebjus/dronelab/companion/FlightTouchInstrumentation.java');
const vendor=read('vendor/peerjs.min.js');

test('PeerJS 1.5.5 is vendored offline for both WebApp and signed Android build',()=>{
 assert.ok(vendor.length>60000&&vendor.length<150000,'real bundled PeerJS 1.5.5 client');
 assert.match(vendor,/window\.Peer=/);
 assert.match(html,/<script src="vendor\/peerjs\.min\.js"><\/script>/);
 assert.ok(html.indexOf('vendor/peerjs.min.js')<html.indexOf('pairing-code.js'));
 assert.match(code,/s\.src='vendor\/peerjs\.min\.js'/);
 assert.doesNotMatch(code,/s\.src='https:\/\/cdnjs\./);
 assert.match(workflow,/cp vendor\/qrgen\.js vendor\/jsqr\.js vendor\/peerjs\.min\.js vendor\/peerjs\.LICENSE/);
 assert.match(workflow,/test -s mobile-android\/app\/src\/main\/assets\/vendor\/peerjs\.min\.js/);
 assert.match(workflow,/unzip -l/);
 assert.match(sw,/\.\/vendor\/peerjs\.min\.js/);
 assert.ok(read('vendor/peerjs.LICENSE').includes('MIT License'));
});

test('dynamic PeerJS loader uses local asset even when Internet/CDN is unavailable',async()=>{
 const records=[];
 const doc={createElement(){return {remove(){}}},head:{append(script){records.push(script.src);ctx.Peer=class MockPeer{};queueMicrotask(()=>script.onload?.())}}};
 const ctx={document:doc,console,setTimeout,clearTimeout,Uint32Array,Uint8Array,Date};
 ctx.window=ctx;ctx.globalThis=ctx;
 vm.runInNewContext(code,ctx,{filename:'pairing-code.js'});
 const Peer=await ctx.ZebjusCodePair.loadPeer();
 assert.equal(typeof Peer,'function');
 assert.deepEqual(records,['vendor/peerjs.min.js']);
});

test('Code availability depends on PeerServer registration; offline fail closed and offline QR remains visible',()=>{
 assert.match(code,/peer\.on\('open',/);
 assert.match(code,/code=thisCode;onCode\(thisCode\)/);
 assert.match(code,/Online code service unavailable/);
 assert.match(code,/code='';onCode\(''\)/);
 assert.match(code,/registrationTimer=setTimeout/);
 assert.match(code,/18000\);/);
 assert.match(html,/Alternative • Show Phone Response QR/);
 assert.match(html,/id="copyAnswerBtn"/);
});

test('Cockpit header AP/STA is accessible and linked to the same Kit transport dropdown',()=>{
 assert.equal((html.match(/id="flightNetworkSwitch"/g)||[]).length,1);
 assert.match(html,/id="flightNetworkSwitch"[^>]*role="switch"/);
 assert.match(html,/id="kitLink"/);
 assert.match(network,/action\('flightNetworkSwitch'/);
 assert.match(network,/selectTransport\(link==='ap'\?'sta':'ap'\)/);
 assert.match(network,/zebjus:kit-transport/);
 assert.match(network,/e\.dispatchEvent\(new Event\('change'/);
 assert.match(network,/selectTransport,selectedTransport:\(\)=>link/);
 assert.match(network,/if\(otaBusy\|\|connecting\)\{el\('kitLink'\)\.value=link/);
 assert.match(network,/forgetGrants\(\);forgetNativePin\(\)/);
 assert.match(css,/\.flight-topbar\{[^\n]*grid-template-columns:auto minmax\(0,1fr\)/);
 assert.match(css,/\.flight-network-switch\[aria-checked=true\]/);
});

test('Android menu accordion and Kit grid are full width, nested actions readable and keyboard-friendly',()=>{
 assert.match(css,/\.mobile-connection main\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.mobile-connection \.pairing-settings>\.settings-accordion-body\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.actions\{display:flex;flex-wrap:wrap/);
 assert.match(css,/\.mobile-connection \.kit-net-grid\{grid-template-columns:repeat\(auto-fit/);
 assert.match(css,/\.mobile-connection \.actions button\{[^\n]*min-height:44px/);
 assert.match(css,/\.mobile-connection \.hint,\.mobile-connection label,\.mobile-connection summary\{overflow-wrap:anywhere/);
 for(const section of ['Pairing','My Kits','Wi-Fi','Firmware OTA','Permissions'])assert.ok(html.includes('<summary>'+section));
 assert.ok(html.indexOf('<details class="settings-accordion pairing-settings" open><summary>Pairing')>=0);
 assert.ok(html.indexOf('<details class="settings-accordion"><summary>Firmware OTA')>=0);
});

test('Native UI release test reacquires current WebView after HOME/Resume instead of querying destroyed view',()=>{
 assert.match(nativeTest,/callActivityOnResume\(Activity resumed\)/);
 assert.match(nativeTest,/callActivityOnDestroy\(Activity destroyed\)/);
 assert.match(nativeTest,/awaitCurrentWeb\(\)/);
 assert.match(nativeTest,/catch\(Throwable diagnosticFailure\)/);
 assert.match(nativeTest,/currentWeb\(\)\.evaluateJavascript/);
 assert.match(nativeTest,/currentView\.isAttachedToWindow\(\)/);
 assert.match(nativeTest,/previous\.recreate\(\)/);
 assert.ok(nativeTest.indexOf('Log.e("FlightTouchAcceptance","Original native acceptance failure",failure)')<nativeTest.indexOf('try{screenshot("native-failure.png");}'));
 assert.match(workflow,/python3 tools\/verify_android_assets\.py/);
});
