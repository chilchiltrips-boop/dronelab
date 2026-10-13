// Runs the real WebApp/client against a diagnostic device double. Actual radio,
// USB flashing and Local Network Access prompts need physical acceptance.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const output='test-output/legacy-connectivity';mkdirSync(output,{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
try{
 for(const {width,entry} of [{width:360,entry:'index.html'},{width:768,entry:'index.html'},{width:1366,entry:'index.html'},{width:1366,entry:'lab.html'}]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await configureContext(context);
  // Install the device response before the startup AP probe is launched.
  await context.addInitScript(()=>{
   const native=window.fetch.bind(window);
   window.fetch=async(url,options)=>{
    if(String(url)==='http://192.168.4.1/api/identify')return new Response(JSON.stringify({kitId:'ZFC-A1-012345ABCDEF',kitCode:'123456',name:'zebjus_drone_2',board:'ZFC-A1',simpleConnection:true}));
    if(/^http:\/\/(?:zebjus|192\.168\.|127\.0\.0\.1:8766)/.test(String(url)))return new Response('',{status:404});
    return native(url,options);
   };
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/'+entry);await page.waitForFunction(()=>window.ZebjusKits&&window.ZebjusFirmwareConnect);
  await page.evaluate(()=>{
   const id='ZFC-A1-012345ABCDEF',baseFetch=window.fetch;
   let owned=false,network='ap';
   const status=transport=>({kitId:id,kitCode:'123456',kitName:'zebjus_drone_2',hostname:'zebjus-drone-2.local',board:'ZFC-A1',version:'1.4.5',
    requestTransport:transport,mode:'auto',setupAuthorized:transport==='AP',otaAuthorized:false,controlAuthorized:transport==='AP',
    apActive:true,apIp:'192.168.4.1',apSsid:'zebjus_drone_2',staConnected:true,ip:'192.168.1.20',ssid:'Classroom',rssi:-51,
    firmwareBuiltAt:'Oct 13 2026 16:00:00',rc:{claimed:owned,active:owned,source:owned?'WEB':'NONE',ownerId:owned?'browser-owner':''}});
   window.fetch=async function(url,options){
    if(String(url)==='http://192.168.4.1/api/identify'&&network==='ap'||/^http:\/\/(?:192\.168\.1\.20|zebjus-drone-2\.local)\/api\/identify$/.test(String(url))&&network==='sta')return new Response(JSON.stringify({kitId:id,kitCode:'123456',name:'zebjus_drone_2',board:'ZFC-A1',simpleConnection:true}));
    if(/^http:\/\/(?:zebjus|192\.168\.|127\.0\.0\.1:8766)/.test(String(url)))return new Response('',{status:404});
    return baseFetch.call(this,url,options);
   };
   window.__testJoinRouter=()=>{network='sta'};
   window.ZebjusKitAuth.http=base=>base;
   window.ZebjusKitAuth.openLocal=async base=>{const transport=base.includes('192.168.4.1')?'AP':'STA';return {expiresAt:Date.now()+600000,request:async route=>{
    if(transport.toLowerCase()!==network)throw Error('The computer has left this Wi-Fi network');
    if(route==='/api/status')return status(transport);
    if(route==='/api/telemetry')return {kitId:id,gyroReady:true,rcAlive:owned};
    if(route==='/api/rc/claim'){owned=true;return {kitId:id,session:'browser-private-session',ownerId:'browser-owner'}}
    if(route==='/api/rc/preview')return {kitId:id,received:true};
    if(route==='/api/rc/release'){owned=false;return {released:true}}
    throw Error('Unexpected mock route '+route);
   }}};
  });
  await page.locator('[data-tab="firmware"]').click();await page.locator('#fwDiscoverKits').click();
  await page.waitForFunction(()=>document.querySelector('#fwKitNameInput').value==='zebjus_drone_2');
  await page.locator('#fwKitConnectSelected').click();await page.waitForFunction(()=>window.ZebjusKits.getState().connected);
  assert.equal(await page.locator('#fwDetailId').textContent(),'ZFC-A1-012345ABCDEF');
  assert.equal(await page.locator('#fwApIndicator').textContent(),'ACTIVE');assert.equal(await page.locator('#fwStaIndicator').textContent(),'CONNECTED');
  assert.equal(await page.locator('#fwNetworkSimple').textContent(),'AP');assert.equal(await page.locator('#fwWifiState').textContent(),'STA + AP');
  assert.match(await page.locator('#fwWifiRouteHint').textContent(),/browser still uses the kit AP.*computer Wi-Fi settings/);
  assert.equal(await page.locator('#kitTopNetworkSwitch').getAttribute('aria-checked'),'true');
  assert.equal(await page.locator('#fwNetworkFlashBtn').isDisabled(),true,'AP setup does not authorize OTA');
  assert.equal(await page.locator('#kitTopControl').isVisible(),true);assert.equal(await page.locator('#fwKitTakeControl').isDisabled(),false);
  await page.screenshot({path:`${output}/${entry.replace('.html','')}-firmware-${width}.png`,fullPage:true});
  await page.locator('#fwKitTakeControl').click();await page.waitForFunction(()=>window.ZebjusKits.getState().owner);
  assert.equal(await page.locator('#kitTopControl').getAttribute('aria-checked'),'true');
  await page.locator('#kitTopControl').click();await page.waitForFunction(()=>!window.ZebjusKits.getState().owner);
  await page.locator('#fwWifiConnectSta').click();
  await page.waitForFunction(()=>document.querySelector('#fwConnectLog').textContent.includes('STA is not reachable'));
  assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().transport),'ap','Unreachable STA leaves the AP setup link intact');
  await page.evaluate(()=>window.__testJoinRouter());await page.locator('#fwWifiConnectSta').click();
  await page.waitForFunction(()=>window.ZebjusKits.getState().connected&&window.ZebjusKits.getState().transport==='sta');
  assert.equal(await page.locator('#fwNetworkSimple').textContent(),'STA');assert.equal(await page.locator('#kitTopNetworkSwitch').getAttribute('aria-checked'),'false');
  assert.match(await page.locator('#fwWifiRouteHint').textContent(),/browser is connected through router Wi-Fi "Classroom"/);
  assert.equal(await page.locator('#fwKitTakeControl').isDisabled(),true,'STA monitoring does not grant control');
  await page.screenshot({path:`${output}/${entry.replace('.html','')}-sta-${width}.png`,fullPage:true});
  await page.locator('[data-tab="firmware"]').click();await page.locator('#fwKitDisconnect').click();
  await page.waitForFunction(()=>!window.ZebjusKits.getState().connected);
  assert.equal(await page.locator('#fwSelectedKitName').textContent(),'No kit selected');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`${width}px horizontal overflow`);
  assert.deepEqual(errors,[]);results.push({width,entry,verified:true,controlReleased:true,staRequiresRouter:true,staVerified:true,disconnected:true,overflow});
  await context.close();console.log('PASS legacy connection UI',width);
 }
}finally{writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2));await browser.close()}
