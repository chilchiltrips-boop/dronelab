// Render every existing screen; physical cameras/USB are replaced only in
// cancellation/permission checks. No hardware writes are executed.
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {browserOptions,configureContext} from './browser-harness.mjs';
const dir='test-output/after';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});await configureContext(context);
await context.addInitScript(()=>{
 const original=EventTarget.prototype.addEventListener;
 EventTarget.prototype.addEventListener=function(type,...args){if(this instanceof Element){this.__auditEvents??=[];this.__auditEvents.push(type)}return original.call(this,type,...args)};
});
if(process.env.DRONELAB_TEST_SIMULATED_ICE==='1')await context.addInitScript(()=>{
 const Native=window.RTCPeerConnection;
 window.RTCPeerConnection=function(options){const pc=new Native(options);Object.defineProperty(pc,'iceGatheringState',{get:()=> 'complete'});return pc};
});
const page=await context.newPage(),errors=[],failed=[],metrics=[],controls=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().includes('127.0.0.1'))failed.push({url:r.url(),status:r.status()})});
const base='http://127.0.0.1:8765/';
function check(value,message){if(!value)throw Error(message)}
async function inventory(screen){
 controls.push(...await page.evaluate(screen=>[...document.querySelectorAll('button,input,select,textarea,summary,a[href],[role=button],[role=switch]')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({screen,id:e.id||'',type:e.tagName.toLowerCase(),label:(e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||'').trim().slice(0,100),disabled:!!e.disabled,events:[...new Set([...(e.__auditEvents||[]),...['click','change','input','keydown','pointerdown'].filter(t=>typeof e['on'+t]==='function')])],width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height),verification:['SUMMARY','A','INPUT','TEXTAREA','SELECT'].includes(e.tagName)?'native behavior plus source review':'handler/state inspection; selected interactions below'})),screen));
}
try{
 await page.goto(base+'#settings');await page.waitForFunction(()=>document.getElementById('app').dataset.ready==='true');
 check(await page.locator('[data-tab=settings]').getAttribute('class').then(x=>x.includes('active')),'Settings deep link ignored');
 for(const [width,height] of [[1920,1080],[1366,768],[1280,720],[1024,768],[390,844],[844,390],[915,412]]){
  await page.setViewportSize({width,height});
  for(const tab of ['assembly','wiring','python','settings','firmware']){
   await page.locator('[data-tab='+tab+']').click();await page.screenshot({mask:[page.locator('#pairOfferCanvas,#pairCode,#pairVerifyPin,#pairOfferText,#pairAnswerText')],path:`${dir}/${tab}-${width}x${height}.png`,fullPage:true});
   const metric=await page.evaluate(({tab,width,height})=>({tab,width,height,scrollWidth:document.documentElement.scrollWidth,bodyHeight:document.documentElement.scrollHeight,panelHeight:document.querySelector('#tab-'+tab).getBoundingClientRect().height}),{tab,width,height});
   metrics.push(metric);check(metric.scrollWidth<=width,'Horizontal overflow '+tab+' '+width);
   if(tab==='wiring')check(await page.evaluate(()=>[...document.querySelectorAll('.wiring-card .toolbar-row button')].every(b=>{const r=b.getBoundingClientRect(),p=b.parentElement.getBoundingClientRect();return r.right<=p.right+1})), 'Clipped wiring toolbar '+width);
   if(tab==='firmware'&&width===390)check(await page.locator('#fwReconnectBtn').evaluate(b=>b.getBoundingClientRect().height<80),'Oversized firmware recovery button');
   if(width===1366)await inventory(tab);
  }
 }
 await page.setViewportSize({width:1366,height:768});await page.goto(base+'tripod.html');await page.locator('#topPairMobileBtn').click();
 check((await page.locator('#pairStep1').getAttribute('open'))!==null,'Step 1 must be open');
 check((await page.locator('#pairStep2').getAttribute('open'))===null,'Step 2 opens prematurely');
 check(await page.locator('#pairStep1NextBtn').isDisabled(),'Next enabled before offer');
 await page.evaluate(()=>{window.__cameraCalls=0;window.__nativeGetUserMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async()=>{window.__cameraCalls++;throw new DOMException('Permission denied for test','NotAllowedError')}});
 await page.locator('#pairCreateBtn').click();await page.waitForFunction(()=>document.getElementById('pairOfferText').value.startsWith('zj1:'));
 check(await page.evaluate(()=>window.__cameraCalls===0),'Step 1 starts laptop webcam');

 await page.locator('#pairStep1NextBtn').click();check(await page.locator('#pairStep1').getAttribute('open')===null,'Step 1 not collapsed on Next');
 await page.screenshot({mask:[page.locator('#pairOfferCanvas,#pairCode,#pairVerifyPin,#pairOfferText,#pairAnswerText')],path:dir+'/settings-step2-code-1366x768.png',fullPage:true});await inventory('pair-step2-code');
 await page.locator('#pairCameraMode').click();await page.locator('#pairScanAnswerBtn').click();
 await page.waitForFunction(()=>document.getElementById('pairAnswerState').textContent.includes('denied')||document.getElementById('pairAnswerState').textContent.includes('Permission'));
 check(await page.locator('#pairScanAnswerBtn').isEnabled(),'Denied camera leaves Start disabled');
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>{window.__cameraCalls++;return new Promise(r=>window.__cameraResolve=r)}});
 await page.locator('#pairScanAnswerBtn').click();await page.locator('#pairStopScanBtn').click();
 await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=80;window.__lateStream=c.captureStream(1);window.__cameraResolve(window.__lateStream)});
 await page.waitForFunction(()=>window.__lateStream.getTracks().every(t=>t.readyState==='ended'));
 check(await page.locator('#pairScanAnswerBtn').isEnabled(),'Cancelled pending camera leaves Start disabled');
 await page.evaluate(()=>{HTMLMediaElement.prototype.play=async()=>{};navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;window.__reopenStream=c.captureStream(1);return window.__reopenStream}});
 await page.locator('#pairScanAnswerBtn').click();await page.locator('#pairStopScanBtn').waitFor({state:'visible'});
 await page.screenshot({mask:[page.locator('#pairOfferCanvas,#pairCode,#pairVerifyPin,#pairOfferText,#pairAnswerText')],path:dir+'/settings-step2-camera-1366x768.png',fullPage:true});await inventory('pair-step2-camera');
 await page.locator('#connectionClose').click();await page.waitForFunction(()=>window.__reopenStream.getTracks().every(t=>t.readyState==='ended'));
 await page.locator('#topPairMobileBtn').click();await page.locator('#pairStep2BackBtn').click();await page.locator('#pairCancelBtn').click();check(await page.locator('#pairStep1NextBtn').isDisabled(),'Cancel retains old offer');
 await page.goto(base+'#firmware');await page.waitForFunction(()=>document.getElementById('app').dataset.ready==='true');
 await page.locator('[data-tab=firmware]').click();check(await page.locator('#fwUsbFlashBtn').isDisabled(),'Flash enabled before USB connection');check(await page.locator('#fwReconnectBtn').isDisabled(),'Unavailable kit reconnect enabled');
 await page.locator('#fwSerialTabPlotter').click();check(await page.locator('#fwSerialPlotterPane').isVisible(),'Plotter tab failed');await page.locator('#fwPlotClearBtn').click();await page.locator('#fwSerialTabMonitor').click();await page.locator('#fwSerialClearBtn').click();
 await page.evaluate(()=>{location.hash='wiring'});await page.locator('#tab-wiring.active').waitFor();
 await page.goto(base+'companion.html');await page.locator('#flightSettings').click();check((await page.locator('#appConnection').getAttribute('class')).includes('disconnected'),'Disconnected Android indicator shown connected');
 check(await page.locator('#copyAnswerBtn').isDisabled(),'Copy response enabled without response');
 for(const [width,height] of [[390,844],[844,390],[915,412]]){
  await page.setViewportSize({width,height});await page.screenshot({mask:[page.locator('#pairOfferCanvas,#pairCode,#pairVerifyPin,#pairOfferText,#pairAnswerText')],path:`${dir}/companion-${width}x${height}.png`,fullPage:true});
  const m=await page.evaluate(({width,height})=>({tab:'companion',width,height,scrollWidth:document.documentElement.scrollWidth,bodyHeight:document.documentElement.scrollHeight}),{width,height});metrics.push(m);check(m.scrollWidth<=width,'Companion overflow');
 }
 await inventory('companion');
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Permission denied for test','NotAllowedError')}});
 await page.locator('#scanOfferBtn').click();await page.waitForFunction(()=>document.getElementById('offerState').textContent==='CAMERA PERMISSION DENIED');
 check(await page.locator('#scanOfferBtn').isEnabled(),'Phone denied camera remains disabled');
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(r=>window.__phoneCameraResolve=r)});
 await page.locator('#scanOfferBtn').click();await page.locator('#stopCameraBtn').click();
 await page.evaluate(()=>{const c=document.createElement('canvas');window.__phoneLateStream=c.captureStream(1);window.__phoneCameraResolve(window.__phoneLateStream)});
 await page.waitForFunction(()=>window.__phoneLateStream.getTracks().every(t=>t.readyState==='ended'));
 check(await page.locator('#scanOfferBtn').isEnabled(),'Phone cancelled camera remains disabled');
 await page.locator('#offerInput').fill('not-a-pairing-qr');await page.locator('#useOfferBtn').click();
 await page.waitForFunction(()=>document.getElementById('offerState').textContent==='Invalid or expired QR');
 await page.locator('#resetPairBtn').click();check(await page.locator('#useOfferBtn').isDisabled(),'Reset retains manual offer');
 check(!errors.length,'JavaScript errors: '+errors.join('; '));check(!failed.length,'Failed local assets: '+JSON.stringify(failed));
 console.log('PASS: viewport screenshots, compact steps, hashes, permission denied/cancel/reopen, camera dialog cleanup, Flight Training, unavailable firmware controls; 0 JS errors/failed local assets');
}finally{
 writeFileSync(dir+'/metrics.json',JSON.stringify({environment:process.env.DRONELAB_TEST_FILE_ROUTES==='1'?'file-route sandbox; ICE timing simulated for QR rendering':'HTTP Chromium',errors,failed,data:metrics},null,2));
 writeFileSync(dir+'/controls.json',JSON.stringify(controls,null,2));
 const csv=[['Screen','ID','Type','Label','Disabled','Handlers','Width','Height','Verification'],...controls.map(c=>[c.screen,c.id,c.type,c.label,c.disabled,c.events.join('|'),c.width,c.height,c.verification])].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');writeFileSync(dir+'/controls.csv',csv);
 await browser.close();
}
