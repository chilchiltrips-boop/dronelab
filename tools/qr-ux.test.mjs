import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('No Camera code pairing is first and selected by default on canonical Flight Training page',()=>{
 const web=read('pairing-web.js');
 assert.match(web,/pairMode='code'/);
 assert.match(web,/selectMode\('code'\)/);
 for(const p of ['tripod.html']){
  const h=read(p);
  assert.ok(h.indexOf('id="pairCodeMode"')<h.indexOf('id="pairCameraMode"'));
  assert.ok(h.includes('id="pairCameraSection" hidden'));
  assert.ok(h.includes('id="pairCodeSection"'));
  assert.ok(h.includes('id="pairScanHint"'));
  assert.ok(h.includes('id="pairConfirmPanel"'));
  assert.ok(h.includes('id="pairConfirmHint"'));
  assert.ok(h.includes('qr-step1-qr'));
 }
});
test('Laptop Step 1 stays camera-free and pairing confirmation is unmistakable',()=>{
 const web=read('pairing-web.js');
 assert.match(web,/confirm\.classList\.toggle\('ready'/);
 assert.match(web,/Confirm Pairing Now/);
 assert.match(web,/PHONE QR DETECTED/);
 assert.match(web,/scanFeedback\(/);
 assert.match(web,/if\(pairMode==='camera'\)/);
 const css=read('pairing.css');
 assert.match(css,/\.qr-step1-layout/);
 assert.match(css,/\.qr-confirm-button\.ready/);
 assert.match(css,/@keyframes qr-confirm-attention/);
});
test('Android prioritizes code and fast scanner offers hardware-aware illumination fallback',()=>{
 const html=read('companion.html');
 assert.ok(html.indexOf('class="phone-code-panel"')<html.indexOf('id="answerQrFrame"'));
 assert.ok(html.includes('id="phoneScanFeedback"'));
 assert.ok(html.includes('id="phoneTorchBtn"'));
 assert.ok(html.includes('id="phoneScanFrame"'));
 const js=read('companion.js');
 assert.match(js,/QR SCANNED/);
 assert.match(js,/ZebjusQR\.torch/);
 assert.match(js,/ZebjusQR\.canTorch/);
 const scan=read('pairing-qr-ui.js');
 assert.match(scan,/BarcodeDetector/);
 assert.match(scan,/focusMode/);
 assert.match(scan,/exposureMode/);
 assert.match(scan,/whiteBalanceMode/);
 assert.match(scan,/brightness\(1\.35\) contrast\(1\.2\)/);
 assert.match(scan,/function torch\(/);
 assert.match(scan,/function canTorch\(/);
});
