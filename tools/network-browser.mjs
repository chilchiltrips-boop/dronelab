// Real WebApp + Android WebView JS + Pyodide; ESP32 radio/HTTP is simulated.
// Actual embedded RC/enrollment code is independently exercised by firmware-host.test.mjs.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import {createHmac,createDecipheriv,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';

const id='ZFC-A1-012345ABCDEF',secret='a7'.repeat(32),boot='b8'.repeat(16);
const mac=(key,msg)=>createHmac('sha256',key).update(msg).digest('hex');
const challenges=new Map(),sessions=new Map(),calls=[];
const maintenanceKey='f1'.repeat(16);
let owner='',frame=null,accepted=0,tested=false;
function snapshot(){
 const age=frame?Date.now()-frame.at:null,valid=!!owner&&age!==null&&age<=350;
 return {kitId:id,claimed:!!owner,active:valid,source:owner?'ANDROID':'NONE',ownerId:owner?'public-owner':'',seq:frame?.seq||0,
  ageMs:age,receivedAtMs:frame?.at||0,inputValid:valid,failsafe:!valid,motorsDisabled:true,responseMode:frame?.responseMode||'Medium',
  throttle:valid?frame.throttle:1000,roll:valid?frame.roll:1500,pitch:valid?frame.pitch:1500,yaw:valid?frame.yaw:1500,accepted,rejected:0};
}
function handle(host,path,method,args={},headers={}){
 const h=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
 const result=(body,status=200,key='',seq='')=>{const text=JSON.stringify(body);return {status,text,proof:key?mac(key,`response|${seq}|${status}|${text}`):''}};
 if(path==='/api/identify')return result({kitId:id,kitCode:'123456',name:'Test fixture A1',board:'ZFC-A1',authVersion:2,labelInstalled:true,simpleConnection:true});
 if(path==='/api/auth/local'){
  const sta=host==='192.168.1.42';assert.ok(sta||host==='192.168.4.1');
  assert.equal(args.deviceId,id);assert.match(args.client,/^[0-9a-f]{32}$/);
  const session=randomBytes(16).toString('hex'),key=randomBytes(32).toString('hex');
  sessions.set(session,{key,seq:0,setup:false,local:true,localSta:sta});
  return result({kitId:id,bootId:boot,session,key,scope:sta?'sta_observer':'ap_diagnostics',expiresMs:1800000,setupExpiresMs:0});
 }
 if(path==='/api/auth/challenge'){
  const nonce=randomBytes(16).toString('hex');challenges.set(nonce,args);return result({kitId:id,nonce,bootId:boot});
 }
 if(path==='/api/auth/enroll'){
  const challenge=challenges.get(args.nonce);assert.ok(challenge);challenges.delete(args.nonce);
  const credential=challenge.kind==='setup'?secret:mac(secret,'diagnostic|'+id).slice(0,32);
  const msg=['enroll',id,boot,args.nonce,challenge.kind,challenge.client].join('|');assert.equal(args.proof,mac(credential,msg));
  const session=randomBytes(16).toString('hex'),key=mac(credential,'session|'+msg+'|'+session);
  sessions.set(session,{key,seq:0,setup:challenge.kind==='setup'});
  return result({kitId:id,session,proof:mac(key,'server|'+msg),expiresMs:1800000,setupExpiresMs:challenge.kind==='setup'?300000:0});
 }
 const legacy=h['x-zj-key']===maintenanceKey;
 const s=legacy?{key:'',seq:0,setup:true}:sessions.get(h['x-zj-session']);assert.ok(s,'authenticated request required');
 const seq=h['x-zj-seq'],payload=args.payload||'';assert.equal(h['x-zj-device'],id);if(!legacy)assert.ok(Number(seq)>s.seq);
 if(!legacy)assert.equal(h['x-zj-proof'],mac(s.key,[method,path,id,boot,h['x-zj-session'],seq,payload].join('|')));s.seq=Number(seq);
 if(payload){const b=Buffer.from(payload,'hex'),dec=createDecipheriv('aes-256-gcm',Buffer.from(s.key,'hex'),b.subarray(0,12));dec.setAuthTag(b.subarray(-16));args=Object.fromEntries(new URLSearchParams(Buffer.concat([dec.update(b.subarray(12,-16)),dec.final()]).toString()))}
 calls.push({host,path,method,source:args.source});
 if(s.local&&path.startsWith('/api/wifi/')&&s.localSta)
  return result({error:'setup_authorization_required'},403,s.key,seq);
 if(s.localSta&&!['/api/status','/api/telemetry','/api/rc/snapshot'].includes(path))
  return result({error:'sta_observer_read_only'},403,s.key,seq);
 let body;
 if(path==='/api/status')body={kitId:id,kitCode:'123456',kitName:'Test fixture A1',board:'ZFC-A1',version:'1.4.4',bootId:boot,mode:'auto',phase:'ap_sta_ready',requestTransport:host==='192.168.4.1'?'AP':'STA',staConnected:true,apActive:true,apIp:'192.168.4.1',ip:'192.168.1.42',ssid:'Mock classroom',setupAuthorized:s.setup||(s.local&&!s.localSta),otaAuthorized:false,motorsDisabled:true,firmwareControl:false,motorsArmed:false,rc:snapshot(),wifiTestState:tested?'saved':'idle',staCredentialsSaved:tested};
 else if(path==='/api/wifi/scan')body={state:'ready',networks:[{ssid:'Mock classroom',rssi:-45,secure:true}]};
 else if(path==='/api/wifi/test'){assert.ok(s.setup||s.local&&!s.localSta);assert.equal(args.ssid,'Mock classroom');assert.equal(args.password,'fixture-password');tested=true;body={state:'testing'}}
 else if(path==='/api/rc/claim'){assert.equal(owner,'');assert.equal(host,'192.168.4.1');assert.equal(args.source,'ANDROID');owner=randomBytes(16).toString('hex');frame=null;body={kitId:id,session:owner};}
 else if(path==='/api/rc/preview'){
  assert.equal(args.session,owner);assert.equal(args.armed,'false');assert.ok(Number(args.seq)>(frame?.seq||0));
  for(const key of ['throttle','roll','pitch','yaw'])assert.ok(Number(args[key])>=1000&&Number(args[key])<=2000);
  frame={...Object.fromEntries(Object.entries(args).map(([k,v])=>['throttle','roll','pitch','yaw','seq'].includes(k)?[k,Number(v)]:[k,v])),at:Date.now()};accepted++;
  body={kitId:id,received:true,seq:frame.seq,receivedAtMs:frame.at,motorsDisabled:true};
 }else if(path==='/api/rc/release'||path==='/api/rc/stop'){owner='';body={released:true}}
 else if(path==='/api/rc/snapshot')body=snapshot();
 else if(path==='/api/telemetry')body={kitId:id,board:'ZFC-A1',millis:Date.now(),gyroReady:true,address:0x6a,roll:0,pitch:0,yaw:0,scanner:[],scannerRunning:false,scanSequence:1,rc:snapshot()};
 else if(path==='/api/command')body={ok:true};
 else throw Error('Unexpected route '+path);
 return result(body,200,s.key,seq);
}
const browser=await chromium.launch(browserOptions),errors=[];
const laptop=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
const android=await browser.newContext({viewport:{width:915,height:412},hasTouch:true,serviceWorkers:'block'});
await configureContext(laptop);await configureContext(android);
await laptop.route(/^http:\/\/192\.168\.(?:4\.1|1\.42)\//,async route=>{
 const r=route.request(),url=new URL(r.url());
 if(r.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET, POST'}});
 const d=handle(url.hostname,url.pathname,r.method(),Object.fromEntries(new URLSearchParams(r.postData()||'')),await r.allHeaders());
 return route.fulfill({status:d.status,body:d.text,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'X-ZJ-Response','X-ZJ-Response':d.proof}});
});
await android.exposeFunction('__nativeFixture',async(host,path,method,body,headers)=>handle(host,path,method,Object.fromEntries(new URLSearchParams(body)),JSON.parse(headers)));
await android.addInitScript(()=>{window.ZebjusNative={request(){},openWifiSettings(){},requestWifiPermission(id){queueMicrotask(()=>window.zebjusNativeWifiPermissionResult({id,granted:true}))},requestSecure(id,host,method,path,body,headers){window.__nativeFixture(host,path,method,body,headers).then(d=>window.zebjusNativeResult({id,ok:true,...d})).catch(e=>window.zebjusNativeResult({id,ok:false,error:e.message}))}}});
const web=await laptop.newPage(),phone=await android.newPage();
for(const p of [web,phone])p.on('pageerror',e=>errors.push(e.message));
const wait=(p,fn)=>p.waitForFunction(fn,null,{timeout:45000});
mkdirSync('test-output/network',{recursive:true});
try{
 await web.goto('http://127.0.0.1:8765/#settings');await wait(web,()=>!!window.ZebjusKits&&document.getElementById('app')?.dataset.ready==='true');
 assert.equal(await web.locator('#kitLabelInput').count(),0);assert.equal(await web.locator('#kitEnrollment').count(),0);
 // Legacy setup controls still exist by design, but are now an explicitly
 // disclosed Advanced section in the unified Hardware Center. Navigate as a
 // real teacher would; do not force-click invisible elements.
 await web.locator('[data-tab="firmware"]').click();
 await web.locator('[data-dw-view="connection"]').click();
 await web.locator('#dwLegacyConnection > summary').click();
 assert.equal(await web.locator('#kitAdvancedHardware').evaluate(el=>el.open),true,'The inner legacy disclosure must not hide Kit Setup after opening Advanced once');
 assert.equal(await web.locator('#kitNewSetup').isVisible(),true,'New Kit Setup must be reachable inside one Advanced disclosure');
 await web.locator('#kitNewSetup').click();await wait(web,()=>window.ZebjusKits.getState().connected);
 assert.equal(await web.locator('#kitCodeInput').inputValue(),'123456');
 assert.equal(await web.evaluate(()=>window.ZebjusKits.getState().setupAuthorized),true);
 assert.equal(await web.locator('#kitWifiScan').isDisabled(),false);
 assert.equal(await web.evaluate(()=>window.ZebjusKits.getState().owner),false);
 await web.screenshot({path:'test-output/network/simple-ap-connected.png'});
 await web.locator('[data-dw-view="wifi"]').click();
 await web.locator('#kitNetworkSettings').evaluate(e=>e.open=true);
 await web.locator('#kitWifiScan').click();await web.locator('#kitWifiNetworks').selectOption('Mock classroom');
 await web.locator('#kitRouterPass').fill('fixture-password');await web.locator('#kitWifiSave').click();
 // A previously reported STA IP is not proof that this newly tested SSID
 // was saved. Wait for the authenticated kit status to confirm association.
 await wait(web,()=>document.getElementById('kitWifiStatus')?.textContent.includes('Wi-Fi VERIFIED and saved'));
 assert.ok(calls.some(c=>c.host==='192.168.4.1'&&c.path==='/api/wifi/test'),'Wi-Fi credentials must be tested on the verified AP session');
 await web.locator('[data-dw-view="connection"]').click();
 await web.locator('#kitHandover').click();await wait(web,()=>window.ZebjusKits.getState().connected&&window.ZebjusKits.getState().transport==='sta');
 // Same-router discovery selects a verified Kit Name. Selection is NOT
 // authorization: clicking Connect Selected Kit must perform fresh identity and
 // encrypted observer-session checks before reporting connected STA.
 await web.locator('#fwKitDisconnect').click();
 await web.locator('#fwDiscoverKits').click();
 const staRow=web.locator('#fwDiscoveryResults .kit-known-item').filter({hasText:'STA'}).first();
 await staRow.waitFor({timeout:45000});await staRow.click();
 assert.equal(await web.evaluate(()=>window.ZebjusKits.getState().connected),false,'Kit selection alone must never silently connect');
 await web.locator('#fwKitConnectSelected').click();
 await wait(web,()=>window.ZebjusKits.getState().connected&&window.ZebjusKits.getState().transport==='sta');
 assert.equal(await web.evaluate(()=>window.ZebjusKits.getState().otaAuthorized),false);
 await web.locator('[data-tab=python]').click();await web.locator('#pythonMonaco .monaco-editor').waitFor({timeout:45000});
 await web.locator('#pythonTarget').selectOption('sta');
 await phone.goto('http://127.0.0.1:8765/companion.html');await phone.locator('#flightSettings').click();
 await phone.locator('#kitKey').fill(id+':'+secret);await phone.locator('#kitConnect').click();await wait(phone,()=>window.ZebjusNetwork?.isConnected());
 await phone.locator('.settings-accordion > summary').filter({hasText:'Permissions • WebApp Grants / Diagnostic Control'}).click();
 await phone.locator('#kitRcPreview').check();await wait(phone,()=>window.ZebjusNetwork.hasControl());await phone.locator('#flightBack').click();
 // Real touch-follow handlers and response mapping, with DOM pointer events.
 const beforeTouch=await phone.evaluate(()=>{
  const previous=window.ZebjusNetwork.feedback()?.seq||0;
  const pad=document.getElementById('flightRightZone'),r=pad.getBoundingClientRect();pad.setPointerCapture=()=>{};
  pad.dispatchEvent(new PointerEvent('pointerdown',{pointerId:71,pointerType:'touch',clientX:r.x+r.width/2,clientY:r.y+r.height/2,bubbles:true}));
  pad.dispatchEvent(new PointerEvent('pointermove',{pointerId:71,pointerType:'touch',clientX:r.x+r.width/2+35,clientY:r.y+r.height/2-25,bubbles:true}));
  return previous;
 });
 // Ignore neutral ACKs from before the touch, including one already in flight.
 await phone.waitForFunction(seq=>(window.ZebjusNetwork.feedback()?.seq||0)>seq+1,beforeTouch,{timeout:45000});assert.ok(frame.roll>1500);assert.ok(frame.pitch!==1500);
 // Real simulator/peer reset must not send an emergency stop from a read-only STA observer.
 await wait(web,()=>window.ZebjusTraining?.isReady?.());
 await web.evaluate(()=>window.ZebjusTraining.stop('Observer simulator reset regression'));
 assert.ok(owner,'virtual reset released independently owned AP input');
 assert.ok(!calls.some(c=>c.host==='192.168.1.42'&&c.path==='/api/rc/stop'));
 await web.evaluate(()=>{
  window.monaco.editor.getModels().find(m=>m.uri.toString().includes('main.py')).setValue("from zebjus_simple import Drone\nimport asyncio\n\ndrone = Drone()\nlive = 0\nprevious_seq = 0\nfor attempt in range(60):\n    rc = await drone.read_joystick()\n    assert rc[\"source\"] == \"ANDROID\", repr(rc)\n    assert rc[\"motors_disabled\"] is True, repr(rc)\n    if rc[\"input_valid\"]:\n        assert rc[\"roll\"] > 1500, repr(rc)\n        assert rc[\"seq\"] >= previous_seq, repr(rc)\n        previous_seq = rc[\"seq\"]\n        live += 1\n        if live >= 3:\n            break\n    else:\n        assert rc[\"throttle\"] == 1000 and rc[\"roll\"] == 1500, repr(rc)\n        assert rc[\"failsafe\"] is True, repr(rc)\n    await asyncio.sleep(0.1)\nassert live >= 3, repr(rc)\nprint(\"ESP32_RECEIVE_PYTHON_PASS\", live, rc[\"seq\"], rc[\"roll\"])\n");
  document.getElementById('runPythonBtn').click();
 });
 await wait(web,()=>document.getElementById('pythonTerminal').textContent.includes('ESP32_RECEIVE_PYTHON_PASS'));
 await phone.evaluate(()=>document.getElementById('flightStop').click());await wait(phone,()=>!window.ZebjusNetwork.hasControl());
 const stopped=await web.evaluate(()=>window.DroneLabNetwork.readJoystick());assert.equal(stopped.input_valid,false);assert.equal(stopped.throttle,1000);assert.equal(stopped.roll,1500);
 assert.equal(calls.filter(c=>c.path==='/api/rc/claim').length,1,'Python must not claim or revive control');
 assert.ok(calls.some(c=>c.host==='192.168.1.42'&&c.path==='/api/rc/snapshot'));
 assert.equal(errors.length,0,errors.join('\n'));
 await web.screenshot({path:'test-output/network/python-sta-receive.png'});await phone.screenshot({path:'test-output/network/android-diagnostic-stop.png'});
 writeFileSync('test-output/network/result.json',JSON.stringify({result:'PASS',execution:'Chromium + real Pyodide; simulated native bridge and ESP32 HTTP',accepted,requests:calls.length,errors},null,2));
 console.log('PASS simulated network integration: USB-free direct AP Wi-Fi setup → Test & Save → read-only same-ID STA handover; actual Android touch → signed AP frames → STA → actual Pyodide read_joystick; STOP neutral, no Python ownership');
}catch(e){await web.screenshot({path:'test-output/network/failure.png'}).catch(()=>{});console.error('Page errors:',errors);console.error(e);console.error('Requests:',calls.filter(c=>/rc\/(claim|release|stop)/.test(c.path)));console.error('Terminal:',await web.locator('#pythonTerminal').textContent().catch(()=>''));console.error('Web:',await web.locator('#kitMessage').textContent().catch(()=>''),'Phone:',await phone.locator('#kitNetStatus').textContent().catch(()=>''));process.exitCode=1}
finally{await browser.close()}
