// Real browser UI, pairing vault and HMAC/AES client. Simulated physical kit
// and computer Wi-Fi changes; this is not an ESP32 radio/USB acceptance test.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import {createHmac,createDecipheriv,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const id='ZFC-A1-012345ABCDEF',key='a1'.repeat(16),oldKey='b2'.repeat(16),boot='c3'.repeat(16);
const hmac=(key,msg)=>createHmac('sha256',key).update(msg).digest('hex');
const challenges=new Map(),sessions=new Map();let mode='ap',computer='ap',proofFailures=0,adminEnrollments=0,statusRequests=0;
const result=(body,status=200,secret='',seq='')=>{const text=JSON.stringify(body);return {status,text,proof:secret?hmac(secret,['response',seq,status,text].join('|')):''}};
function device(url,options={}){
 const u=new URL(url),ap=u.hostname==='192.168.4.1';
 if(computer!==mode||ap!==(mode==='ap'))return result({error:'unreachable'},404);
 const route=u.pathname,args=Object.fromEntries(new URLSearchParams(options.body||'')),headers=options.headers||{};
 if(route==='/api/identify')return result({kitId:id,kitCode:'123456',name:'zebjus_drone_2',hostname:'zebjus-drone-2.local',board:'ZFC-A1',simpleConnection:true,adminSessions:true,exclusiveWifi:true});
 if(route==='/api/auth/local'){
  const session=randomBytes(16).toString('hex'),secret=randomBytes(32).toString('hex');
  sessions.set(session,{secret,seq:0,admin:false,mode});
  return result({kitId:id,bootId:boot,session,key:secret,scope:ap?'ap_diagnostics':'sta_observer',expiresMs:1800000,setupExpiresMs:0});
 }
 if(route==='/api/auth/challenge'){
  assert.equal(args.kind,'admin');const nonce=randomBytes(16).toString('hex');challenges.set(nonce,args);
  return result({kitId:id,nonce,bootId:boot,expiresMs:30000});
 }
 if(route==='/api/auth/enroll'){
  adminEnrollments++;const c=challenges.get(args.nonce);challenges.delete(args.nonce);
  assert.ok(c);const msg=['enroll',id,boot,args.nonce,c.kind,c.client].join('|');
  if(args.proof!==hmac(key,msg)){proofFailures++;return result({error:'enrollment_proof_invalid_or_expired'},401)}
  const session=randomBytes(16).toString('hex'),secret=hmac(key,'session|'+msg+'|'+session);
  sessions.set(session,{secret,seq:0,admin:true,mode});
  return result({kitId:id,session,proof:hmac(secret,'server|'+msg),expiresMs:1800000,setupExpiresMs:0});
 }
 const s=sessions.get(headers['X-ZJ-Session']),seq=headers['X-ZJ-Seq'],payload=args.payload||'';
 if(!s||s.mode!==mode)return result({error:'session_required_or_expired'},401);
 assert.equal(headers['X-ZJ-Device'],id);assert.ok(Number(seq)>s.seq);s.seq=Number(seq);
 assert.equal(headers['X-ZJ-Proof'],hmac(s.secret,[options.method||'GET',route,id,boot,headers['X-ZJ-Session'],seq,payload].join('|')));
 let plain={};if(payload){
  const b=Buffer.from(payload,'hex'),dec=createDecipheriv('aes-256-gcm',Buffer.from(s.secret,'hex'),b.subarray(0,12));dec.setAuthTag(b.subarray(-16));
  plain=Object.fromEntries(new URLSearchParams(Buffer.concat([dec.update(b.subarray(12,-16)),dec.final()]).toString()));
 }
 if(route==='/api/status'){
  statusRequests++;
  return result({kitId:id,kitCode:'123456',kitName:'zebjus_drone_2',hostname:'zebjus-drone-2.local',board:'ZFC-A1',version:'1.4.6',bootId:boot,
   exclusiveWifi:true,mode,requestTransport:mode.toUpperCase(),apActive:ap,apIp:ap?'192.168.4.1':'0.0.0.0',apSsid:'zebjus_drone_2',staConnected:!ap,ip:ap?'':'192.168.1.20',ssid:ap?'':'Classroom',
   setupAuthorized:s.admin||ap,controlAuthorized:s.admin||ap,otaAuthorized:s.admin,firmwareControl:false,motorsArmed:false,rc:{claimed:false,active:false,motorsDisabled:true}},200,s.secret,seq);
 }
 if(route==='/api/telemetry')return result({kitId:id,gyroReady:true},200,s.secret,seq);
 if(route==='/api/wifi/mode'){
  assert.ok(ap||s.admin);assert.ok(['ap','sta'].includes(plain.mode));
  const response=result({kitId:id,mode:plain.mode,state:'switching'},202,s.secret,seq);mode=plain.mode;return response;
 }
 throw Error('Unexpected fixture route '+route);
}
const output='test-output/exclusive-connectivity';mkdirSync(output,{recursive:true});
const browser=await chromium.launch(browserOptions),errors=[],context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
await configureContext(context);
await context.exposeFunction('__exclusiveDevice',(url,options)=>device(url,options));
await context.addInitScript(()=>{
 const native=window.fetch.bind(window);
 window.fetch=async(url,options={})=>{
  if(/^http:\/\/(?:192\.168\.|zebjus[-_]|127\.0\.0\.1:8766)/.test(String(url))){
   const d=await window.__exclusiveDevice(String(url),{...options,signal:undefined,body:options.body?.toString()});
   return new Response(d.text,{status:d.status,headers:{'X-ZJ-Response':d.proof}});
  }
  return native(url,options);
 };
});
let page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const wait=fn=>page.waitForFunction(fn,null,{timeout:45000});
try{
 await page.goto('http://127.0.0.1:8765/');await wait(()=>!!window.ZebjusKits&&!!window.ZebjusFirmwareConnect);
 await page.locator('[data-tab="firmware"]').click();
 await page.evaluate(async({id,oldKey})=>{
  await window.ZebjusKitPairingStore.remember(id,oldKey);
  await window.ZebjusKits.connectDiscoveredKit({kitId:id,kitCode:'123456',ip:'192.168.4.1',transport:'ap'});
 },{id,oldKey});
 await page.locator('#fwAuthorizeUpdates').click();await wait(()=>window.ZebjusKits.getState().authorizationNotice.includes('USB pairing'));
 assert.equal(proofFailures,1);assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().connected),true);
 // The serial bridge response represents an explicitly connected physical USB kit.
 await page.evaluate(({id,key})=>window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{transport:'usb',line:'ZJNET,PAIR,'+id+','+key}})),{id,key});
 await wait(()=>window.ZebjusKitPairingStore.fromSession('ZFC-A1-012345ABCDEF')==='a1'.repeat(16));
 await page.waitForFunction(async()=>{sessionStorage.removeItem('zebjus.kit.session.v1:ZFC-A1-012345ABCDEF');return await window.ZebjusKitPairingStore.restore('ZFC-A1-012345ABCDEF')==='a1'.repeat(16)});
 await page.locator('#kitTopNetworkSwitch').click();await wait(()=>!window.ZebjusKits.getState().connected&&window.ZebjusKits.getState().pendingNetworkMode==='sta');
 assert.equal(mode,'sta');assert.equal(await page.locator('#fwStaIndicator').textContent(),'--');
 computer='sta';await page.evaluate(()=>window.ZebjusKits.discoverKits());await page.locator('#kitReconnectDialog').waitFor({state:'visible'});
 const before=statusRequests;await page.waitForTimeout(200);assert.equal(statusRequests,before,'Discovery permission must precede authenticated reads');
 await page.locator('#kitReconnectLater').click();assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().connected),false);
 await page.evaluate(()=>window.ZebjusKits.discoverKits());assert.equal(await page.locator('#kitReconnectDialog').isVisible(),false);
 // A manual Connect action is also explicit consent.
 await page.evaluate(()=>window.ZebjusKits.connectDiscoveredKit(window.ZebjusKits.getDiscovered().find(k=>k.transport==='sta')));
 await wait(()=>window.ZebjusKits.getState().connected);assert.equal(await page.locator('#fwStaIndicator').textContent(),'CONNECTED');
 assert.equal(await page.locator('#fwApIndicator').textContent(),'OFF');assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().otaAuthorized),true);
 assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().owner),false);
 await page.screenshot({path:output+'/sta-only.png',fullPage:true});
 // New tab has no sessionStorage key; the encrypted IndexedDB pairing survives.
 await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const prior=statusRequests;await page.goto('http://127.0.0.1:8765/');await page.locator('#kitReconnectDialog').waitFor({state:'visible',timeout:45000});
 assert.equal(statusRequests,prior);await page.locator('#kitReconnectAccept').click();await wait(()=>window.ZebjusKits.getState().connected);
 assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().otaAuthorized),true);
 await page.locator('#kitTopNetworkSwitch').click();await wait(()=>window.ZebjusKits.getState().pendingNetworkMode==='ap');assert.equal(mode,'ap');
 computer='ap';await page.evaluate(()=>window.ZebjusKits.discoverKits());await page.locator('#kitReconnectDialog').waitFor({state:'visible'});
 await page.locator('#kitReconnectAccept').click();await wait(()=>window.ZebjusKits.getState().connected);
 assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().transport),'ap');assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().staConnected),false);
 await page.locator('[data-tab="firmware"]').click();await page.locator('#fwAuthorizeUpdates').click();await wait(()=>window.ZebjusKits.getState().otaAuthorized);
 assert.equal(proofFailures,1,'The rejected saved key must never be replayed');
 await page.setViewportSize({width:360,height:900});await page.screenshot({path:output+'/ap-only-360.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 assert.deepEqual(errors,[]);writeFileSync(output+'/result.json',JSON.stringify({result:'PASS',proofFailures,adminEnrollments,statusRequests,persistentPairing:true,reconnectConsent:true,exclusiveModes:true,errors},null,2));
 console.log('PASS exclusive AP/STA UI: rejected key recovery, encrypted mode commands, saved pairing across tabs, Connect/Later consent, no automatic ownership');
}catch(e){await page.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});console.error(e);console.error('Kit state',await page.evaluate(()=>window.ZebjusKits?.getState()).catch(()=>null));console.error('Page errors',errors);process.exitCode=1}
finally{await browser.close()}
