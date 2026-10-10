import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('PID TUNING uses one persistent DroneLab header and button navigation',()=>{
 const html=get('index.html'),ui=get('js/ui-controls.js'),pid=get('tripod.html');
 assert.match(html,/<button class="tab" data-tab="pid"[^>]*>PID TUNING<\/button>/);
 assert.match(html,/id="pidFrame"[^>]*data-src="\.\/tripod\.html\?embedded=1"/);
 assert.match(pid,/pid-embedded/);
 assert.match(ui,/\$\$\('\.tab-panel'\)\.forEach\(p=>p\.classList\.toggle\('active'/);
 assert.doesNotMatch(html,/<a[^>]*>FLIGHT TRAINING<\/a>/i);
 assert.match(get('styles.css'),/#app \.tabs \.tab\[data-tab="pid"\]\.active/);
});
test('Mobile grant switch and WebRTC status remain in the shared top header',()=>{
 const html=get('index.html'),pair=get('pairing-web.js');
 assert.equal((html.match(/id="topGrantMobileSwitch"/g)||[]).length,1);
 assert.equal((html.match(/id="mobileHeaderStatus"/g)||[]).length,1);
 assert.match(html,/class="qr-header-switch top-grant-control"/);
 assert.match(pair,/toggle\.disabled=!s\.connected\|\|!s\.approved/);
 assert.match(get('styles.css'),/\.topbar-main \.top-grant-control\{display:flex!important/);
});
test('Settings embeds QR/code/PIN controls, no external redirect and stage layout is compact',()=>{
 const html=get('index.html'),css=get('pairing.css'),pair=get('pairing-web.js');
 assert.match(html,/id="tab-settings"/);
 assert.match(html,/id="connectionDialog" data-inline="true"/);
 for(const id of ['pairOfferCanvas','pairPhoneCode','pairConnectCodeBtn','pairScanAnswerBtn','pairVerifyPin','pairConfirmBtn','connectionClose'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(css,/\.settings-workspace #connectionFlow \.qr-step-one \.qr-step1-layout\{display:grid/);
 assert.match(pair,/const inlineSettings=\(\)=>/);
 assert.match(pair,/document\.querySelector\('\[data-tab="settings"\]'\)\?\.click\(\)/);
 assert.doesNotMatch(pair.slice(pair.indexOf('function openSettings()'),pair.indexOf('function openStep(')),/host\.close\(|host\.releaseControl\(|disconnect\(/);
});
test('Tab switching is UI-only and does not close P2P session or disable controls',()=>{
 const ui=get('js/ui-controls.js'),pair=get('pairing-web.js');
 const action=ui.slice(ui.indexOf('ctx.setActiveTab=name=>'),ui.indexOf("$$('.tab').forEach(b=>b.onclick"));
 assert.match(action,/classList\.toggle\('active'/);
 assert.match(action,/ZebjusPairingBridge\?\.ensureSimulator/);
 assert.doesNotMatch(action,/location\.(assign|replace|href)|host\.(close|releaseControl)|window\.location\.reload/);
 const close=pair.slice(pair.indexOf('function closeSettings()'),pair.indexOf('function openStep('));
 assert.doesNotMatch(close,/host\.close\(|host\.releaseControl\(|disconnect\(/);
});
