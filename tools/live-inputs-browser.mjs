import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
const browser=await chromium.launch(browserOptions),results=[],errors=[];
mkdirSync('test-output',{recursive:true});
const id='ZFC-A2-012345ABCDEF';
async function seed(context){
 await context.addInitScript(({id})=>{
  const original=window.fetch.bind(window);
  const model=window.inputTest={mode:'ap',emit:true,seq:32,age:5,reads:0,writes:[],deny:false};
  const rc=()=>({kitId:id,ownerId:'phone-session',source:'ANDROID',transport:model.mode.toUpperCase(),
   seq:model.emit?++model.seq:model.seq,throttle:1300,roll:1600,pitch:1400,yaw:1550,
   inputArmed:true,inputValid:true,active:true,claimed:true,failsafe:false,ageMs:model.age,
   motorsDisabled:true,motorsArmed:false});
  window.fetch=async(input,options={})=>{
   const url=new URL(typeof input==='string'?input:input.url,location.href);
   if(url.hostname!=='192.168.4.1')return original(input,options);
   let body;
   if(url.pathname==='/api/identify')body={kitId:id,kitCode:'123456',board:'ZFC-A2'};
   else if(url.pathname==='/api/status')body={kitId:id,kitCode:'123456',board:'ZFC-A2',kitName:'zebjus_drone_1',
    version:'1.4.11',bootId:'boot-one',mode:model.mode,requestTransport:model.mode.toUpperCase(),
    apActive:model.mode==='ap',staConnected:model.mode==='sta',ledOn:true,rc:rc()};
   else if(url.pathname==='/api/telemetry')body={kitId:id,board:'A2',millis:1000,address:104,gyroReady:true,roll:0,pitch:0,yaw:0,scanner:[],rc:rc()};
   else if(url.pathname==='/api/rc/snapshot'){model.reads++;if(model.deny)throw Error('Simulated link loss');body=rc();}
   else{model.writes.push([url.pathname,options.method||'GET']);throw Error('Unexpected Kit request '+url.pathname);}
   return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
  };
 },{id});
}
async function connect(frame,mode){
 await frame.evaluate(async mode=>{
  window.inputTest.mode=mode;
  document.getElementById('kitTransport').value=mode;
  document.getElementById('kitCodeInput').value='123456';
  document.getElementById('kitIpInput').value='192.168.4.1';
  document.getElementById('kitKeyInput').value='ab'.repeat(16);
  await window.ZebjusKits.connect();
 },mode);
 await frame.waitForFunction(()=>window.ZebjusKits.isConnected());
}
async function openInputs(frame){
 await frame.waitForFunction(()=>document.getElementById('app')?.dataset.ready==='true',null,{timeout:60000});
 await frame.evaluate(()=>window.ZebjusDevicesWorkspace.open('inputs'));
 await frame.locator('#liveInputStatus').waitFor({state:'visible'});
}
try{
 for(const [name,width,height] of [['desktop',1366,900],['mobile',390,844]]){
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',acceptDownloads:true});await configureContext(context);await seed(context);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(name+': '+e.message));
  await page.goto('http://127.0.0.1:8765/');await openInputs(page);
  assert.equal(await page.locator('#liveInputStatus').textContent(),'OFFLINE');
  await connect(page,'ap');await page.waitForFunction(()=>document.getElementById('liveInputStatus').textContent==='LIVE');
  assert.equal(await page.locator('#liveValue-throttle').textContent(),'1300 µs');
  assert.equal(await page.locator('#liveInputArm').textContent(),'ARMED');
  assert.equal(await page.locator('#liveInputMotors').textContent(),'OFF • disabled');
  assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().owner),false);
  const bounds=await page.locator('#dw-body-inputs').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));
  assert.ok(bounds.scroll<=bounds.width+2,name+' receiver panel must not overflow horizontally');
  await page.screenshot({path:'test-output/live-inputs-'+name+'.png',fullPage:true});
  await page.evaluate(()=>{window.inputTest.emit=false;window.inputTest.deny=true;});
  await page.waitForFunction(()=>document.getElementById('liveInputStatus').textContent==='STALE');
  assert.equal(await page.locator('#liveValue-throttle').textContent(),'1000 µs');
  assert.equal(await page.locator('#liveInputArm').textContent(),'DISARMED');
  await page.evaluate(()=>{window.inputTest.emit=true;window.inputTest.deny=false;});
  await page.waitForFunction(()=>document.getElementById('liveInputStatus').textContent==='LIVE');
  await page.locator('.live-input-log summary').click();
  const download=page.waitForEvent('download');await page.locator('#liveInputsExport').click();
  assert.equal((await download).suggestedFilename(),'dronelab-live-inputs.csv');
  await page.evaluate(()=>window.ZebjusDevicesWorkspace.open('overview'));
  await page.waitForTimeout(250);const reads=await page.evaluate(()=>window.inputTest.reads);
  await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.inputTest.reads),reads,'hidden monitor must stop fast snapshot reads');
  await page.evaluate(()=>window.ZebjusKits.disconnect());await connect(page,'sta');await openInputs(page);
  await page.waitForFunction(()=>document.getElementById('liveInputStatus').textContent==='LIVE');
  assert.equal(await page.locator('#liveInputTransport').textContent(),'STA');
  assert.equal(await page.locator('#pythonTarget option[value="android-relay"]').count(),1);
  await page.evaluate(()=>window.ZebjusKits.disconnect());await page.waitForFunction(()=>document.getElementById('liveInputStatus').textContent==='OFFLINE');
  assert.deepEqual(await page.evaluate(()=>window.inputTest.writes),[],'receiver must never write controls');
  results.push({name,passed:true,bounds});await context.close();
 }
 // A controlled cross-origin iframe verifies embedded layout and module loading.
 // Mock fetch is deliberate: this cannot validate a real Wix/WordPress LAN grant.
 const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});await seed(context);
 await context.route('http://127.0.0.1:8766/input-embed-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}iframe{width:100%;height:95vh;border:0}</style><iframe src="http://127.0.0.1:8765/index.html" allow="serial; camera; fullscreen" sandbox="allow-scripts allow-same-origin allow-downloads"></iframe>'}));
 const page=await context.newPage();page.on('pageerror',e=>errors.push('embedded: '+e.message));
 await page.goto('http://127.0.0.1:8766/input-embed-test');
 await page.waitForFunction(()=>document.querySelector('iframe')!==null);
 const frame=await page.locator('iframe').elementHandle().then(e=>e.contentFrame());
 try{await openInputs(frame)}catch(e){
  console.error('Embedded load state',await frame.evaluate(()=>({url:location.href,boot:document.getElementById('assetStatus')?.textContent,workspace:document.getElementById('devicesWorkspace')?.dataset.ready})));
  await page.screenshot({path:'test-output/live-inputs-embedded-failure.png',fullPage:true});throw e;
 }
 await connect(frame,'ap');await frame.waitForFunction(()=>document.getElementById('liveInputStatus').textContent==='LIVE');
 assert.equal(await frame.locator('#fwEmbeddedAccessNotice').count(),0);
 await page.screenshot({path:'test-output/live-inputs-embedded.png',fullPage:true});
 results.push({name:'cross-origin embedded AP monitor',passed:true,hardwarePermissionsTested:false});await context.close();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,results},null,2));
}finally{
 writeFileSync('test-output/live-inputs-results.json',JSON.stringify({results,errors},null,2));await browser.close();
}
