import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
const browser=await chromium.launch(browserOptions);
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}});await configureContext(context);
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.ZebjusDevicesWorkspace&&window.ZebjusKitData&&window.ZebjusKits);
 await page.evaluate(()=>{
  window.__kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',kitName:'Bench Kit',board:'ZFC-A2',version:'1.5.6',transport:'ap',physicalLink:'ap',motorsDisabled:true};
  window.__monitor='ap';window.__seq=100;window.__requests=[];
  window.ZebjusKits={getState:()=>window.__kit,getDiscovered:()=>[],getMonitorPaths:()=>[{kitId:window.__kit.kitId,transport:window.__monitor,available:true,verified:true,fresh:true,lastPacketAt:Date.now()}],
   request:async route=>{window.__requests.push(route);return {kitId:window.__kit.kitId,source:'ANDROID',transport:'AP',seq:window.__seq++,active:true,inputValid:true,failsafe:false,throttle:1000,roll:1600,pitch:1500,yaw:1550,inputArmed:true,accepted:window.__seq,rejected:0,ageMs:0,motorsDisabled:true}}};
  window.ZebjusDevicesWorkspace.open('live');
 });
 assert.equal(await page.locator('#dw-body-live #fwLiveInputs').count(),1);
 assert.equal(await page.locator('#dw-body-diagnostics #kitAckDiagnostics').count(),1);
 assert.equal(await page.locator('#dw-body-diagnostics>section[id^="diagSection"]').count(),7);
 assert.equal(await page.locator('#dw-body-connection #kitSourceSelect, #dw-body-connection #kitValThrottle').count(),0);
 assert.equal(await page.locator('#diagSectionExports [data-diag-export]').count(),2);
 assert.equal(await page.locator('#diagSectionHistory [data-diag-events]').count(),1);
 assert.equal(await page.locator('#diagSectionSerial #fwSerialMonitorPane').count(),1);
 assert.deepEqual(await page.locator('.dw-nav[data-dw-view]').evaluateAll(nodes=>nodes.map(n=>n.dataset.dwView)),['overview','connection','wifi','firmware','mobile','live','diagnostics','security']);
 await page.waitForFunction(()=>document.getElementById('liLiveState').textContent==='LIVE');
 assert.equal(await page.locator('#liInputSource').textContent(),'ANDROID');
 assert.equal(await page.locator('#liInputTransport').textContent(),'AP');
 await page.evaluate(()=>{window.__monitor='usb';window.dispatchEvent(new CustomEvent('dronelab:kit-link'));window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{transport:'usb',line:'ZJRC,AP,ANDROID,900,T=1000,R=1700,P=1500,Y=1550,ARM=1'}}));});
 await page.waitForFunction(()=>document.getElementById('liKitTransport').textContent==='USB'&&document.getElementById('liRoll').textContent==='1700');
 assert.equal(await page.locator('#liInputTransport').textContent(),'AP');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{transport:'usb',line:'ZJRC,AP,ANDROID,899,T=1000,R=1800,P=1500,Y=1550,ARM=1'}})));
 assert.equal(await page.locator('#liRoll').textContent(),'1700');
 await page.waitForFunction(()=>document.getElementById('liLiveState').textContent==='STALE');
 await page.evaluate(()=>{
  const line=value=>window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{transport:'usb',line:value}}));
  line('ZJRC,CLAIM,AP,ANDROID');line('ZJRC,AP,ANDROID,1,T=1000,R=1650,P=1500,Y=1500,ARM=1');
 });
 await page.waitForFunction(()=>document.getElementById('liRoll').textContent==='1650');
 await page.evaluate(()=>{
  const line=value=>window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{transport:'usb',line:value}}));
  line('ZJPPM,1,ACTIVE,4,ARM=1,CH1=1000,CH2=1500,CH3=1500,CH4=1500,CH5=1800,CH6=1000,CH7=1000,CH8=1000');
  line('ZJRC,PPM,PPM,4,T=1000,R=1500,P=1500,Y=1500,ARM=1');
 });
 await page.waitForFunction(()=>document.getElementById('liCh8').textContent==='1000');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{transport:'usb',line:'ZJPPM,1,LOST,0,ARM=0'}})));
 assert.equal(await page.locator('#liPpmHealth').textContent(),'RECEIVER SIGNAL LOST');
 assert.equal(await page.locator('#liCh8').textContent(),'—');
 assert.equal(await page.locator('#liInputArm').textContent(),'DISARMED');

 await page.selectOption('#liMonitorSelect','sta');assert.equal(await page.locator('#liLiveState').textContent(),'UNVERIFIED');
 await page.evaluate(()=>window.ZebjusDevicesWorkspace.open('diagnostics'));
 const count=await page.evaluate(()=>window.__requests.length);await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>window.__requests.length),count);
 await page.evaluate(()=>window.ZebjusAckDiagnostics.record('udp_error',{reason:'UDP_ACK_TIMEOUT',diagnosticId:'ABCD1234ABCD1234',key:'secret-key',ip:'192.168.4.1'}));
 await page.waitForTimeout(2200);
 const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('zebjus-diagnostics-v2',1);r.onsuccess=()=>{const get=r.result.transaction('recordings').objectStore('recordings').get('web');get.onsuccess=()=>resolve(get.result);get.onerror=reject};r.onerror=reject}));
 assert.ok(saved.incidents.some(i=>i.events.some(e=>e.event==='udp_error')));
 assert.ok(!JSON.stringify(saved).includes('secret-key'));assert.ok(!JSON.stringify(saved).includes('192.168.4.1'));
 for(const format of ['json','csv']){
  const downloaded=page.waitForEvent('download');await page.locator('[data-diag-export="'+format+'"]').click();
  const download=await downloaded,stream=await download.createReadStream();let exported='';for await(const chunk of stream)exported+=chunk.toString();
  assert.ok(exported.includes('UDP_ACK_TIMEOUT'));assert.ok(!exported.includes('secret-key'));assert.ok(!exported.includes('192.168.4.1'));assert.ok(!exported.includes('ZFC-A2-012345ABCDEF'));
 }
 await page.locator('#kitAckDiagnostics').evaluate(e=>{e.open=true});
 await page.locator('[data-diag-search]').fill('UDP_ACK_TIMEOUT');
 await page.waitForFunction(()=>document.querySelector('#diagSectionHistory [data-diag-events]').textContent.includes('UDP_ACK_TIMEOUT'));
 assert.ok((await page.locator('.diag-session-heading').count())>0);

 for(const width of [768,390]){await page.setViewportSize({width,height:850});await page.evaluate(()=>window.ZebjusDevicesWorkspace.open('live'));assert.equal(await page.locator('#fwLiveInputs').isVisible(),true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2))}
 assert.deepEqual(await page.evaluate(()=>window.__requests.filter(r=>/claim|preview|stop|release/.test(r))),[]);
 assert.deepEqual(errors,[]);await context.close();
 console.log('PASS Chromium: navigation, AP/USB source isolation, stale/replay, IndexedDB incident, privacy, responsive, read-only');
}finally{await browser.close()}
