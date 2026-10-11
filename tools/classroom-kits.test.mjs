import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const kit=read('js/classroom-kits.js'),html=read('index.html'),fw=read('FlightCore_Firmware/FlightCoreNetwork.h'),cl=read('FlightCore_Firmware/FlightCoreClassroom.h');
test('MY KITS script is parseable and exposes a single verified device session API',()=>{
 const win={},doc={readyState:'loading',addEventListener:()=>{}};
 vm.runInNewContext(kit,{window:win,document:doc,URLSearchParams,Promise,Error});
 for(const name of ['connect','disconnect','read','claim','releaseRc','stop','sendFrame','ingestAndroid','getState','targetHardware','view'])assert.equal(typeof win.ZebjusKits[name],'function',name);
 const s=win.ZebjusKits.getState();
 assert.equal(s.connected,false);assert.equal(s.owner,false);
});
test('MY KITS navigation, pairing and admin controls appear without removing existing tabs',()=>{
 for(const id of ['kitTopStatus','kitTopConnect','kitTopNetworkSwitch','kitCenter','kitCodeInput','kitTransport','kitIpInput','kitKeyInput','kitSelectedId','kitTakeControl','kitReleaseControl','kitStop','kitAdmin','kitAdminRead','kitAdminApply','kitFactoryReset','kitHardwareTarget','kitPidMonitor','kitMobilePairDetails','connectionDialog','fwUsbFlashBtn','pythonTarget'])assert.ok(html.includes('id="'+id+'"'),id);
 for(const n of ['ASSEMBLY LAB','2D WIRING','PYTHON LAB','PID TUNING','MY KITS','FIRMWARE &amp; USB'])assert.ok(html.includes(n),n);
 const css=read('classroom-kits.css');
 for(const t of ['.kit-top-status','.kit-center','.kit-connect-grid','@media(max-width:520px)','prefers-reduced-motion',':focus-visible'])assert.ok(css.includes(t),t);
});
test('Public kit codes are selectors, authentication is per-device and admin is physical USB only',()=>{
 for(const t of ['kitCode','kitId','zjRcClaim','X-ZJ-Key','zjAuthenticated()','zjCorsAllowed','Access-Control-Allow-Origin','Access-Control-Allow-Private-Network','HTTP_OPTIONS','origin_denied'])assert.ok(fw.includes(t),t);
 assert.ok(fw.includes('origin=="https://chilchiltrips-boop.github.io"')&&!fw.includes('"Access-Control-Allow-Origin","*"'));
 for(const t of ['ZJADMIN,GET','ZJADMIN,NAME,','ZJADMIN,APNAME,','ZJADMIN,APPASS,','ZJADMIN,ROTATE_KEY,CONFIRM','ZJADMIN,FACTORY_RESET,CONFIRM','CONTROLLER_ACTIVE','zjKitPrefs.putString("apName"'])assert.ok(cl.includes(t),t);
 assert.ok(!fw.includes('/api/admin/'),'remote AP password/key rotation must not be exposed over HTTP');
});
test('WebRTC input and PID input use the same kit lease; Android AP direct is not echoed',()=>{
 for(const s of ["state.transport==='ap'","state.physicalLink==='ap'","state.owner","state.rcSource","kitHardwareTarget","armed:'false'","350","targetAddressSpace:'local'"])assert.ok(kit.includes(s),s);
 const pairing=read('pairing-web.js'),host=read('pairing-host-bridge.js'),pid=read('js/tripod-page.js');
 assert.ok(pairing.includes('window.ZebjusKits?.ingestAndroid?.(m)'));
 assert.ok(pairing.includes("host.status().controller==='mobile'"));
 assert.ok(host.includes('hardwareInput(){'));
 assert.ok(pid.includes('hardwareInput:()=>'));
 assert.ok(pid.includes('window.parent?.ZebjusKits?.stop?.()'));
});
test('Network/session changes cannot silently reassign firmware control',()=>{
 for(const t of ['kitId!==state.kitId','kitCode!==state.kitCode','state.owner=false','releaseRc()','RC frame rejected:','state.rcSession','ZJRC,CLAIM,','ZJRC,SET,','ZJRC,RELEASE','ZJRC,STOP'])assert.ok(kit.includes(t),t);
 assert.ok(!kit.includes('localStorage.setItem(key,')||kit.includes('localStorage.setItem(key,JSON.stringify(next))'),'only public verified kit registry may persist');
 assert.ok(kit.includes("state.key=''"),'control keys cleared on disconnect');
});
test('Offline bundle includes new UI so an AP-only classroom can reuse the cached shell',()=>{
 const sw=read('sw.js');
 for(const u of ['./classroom-kits.css?v=1.3.8-sta1','./js/classroom-kits.js?v=1.3.8-sta1'])assert.ok(sw.includes(u),u);
});
