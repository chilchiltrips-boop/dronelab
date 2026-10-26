// Real browser geometry/scroll regression, with simulated read-only Kit telemetry.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';

mkdirSync('test-output/live-inputs',{recursive:true});
const browser=await chromium.launch(browserOptions),evidence=[];
const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block',reducedMotion:'reduce'});
await configureContext(context);
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));
try{
 await page.goto('http://127.0.0.1:8765/index.html#firmware');
 await page.waitForFunction(()=>window.ZebjusKits&&window.ZebjusDevicesWorkspace);
 await page.evaluate(()=>{
  const f=window.__monitorLayout={seq:0,source:'NONE',legacy:true,requests:[]};
  const kitId='ZFC-A2-41FEFF63B0E4';
  const mode={supported:true,stabilizationSupported:false,saved:'angle',active:'angle',pending:null};
  window.ZebjusKits.getState=()=>({kitId,kitName:'zebjus_drone_1',connected:true,transport:'sta',board:'ZFC-A2',
   version:f.legacy?'1.5.9':'1.5.10',heartbeatAt:Date.now(),flightMode:'angle',
   ...(f.legacy?{}:{flightModeState:mode}),motorsDisabled:true,motorsArmed:false,ledOn:true});
  window.ZebjusKits.getMonitorPaths=()=>[{kitId,transport:'sta',verified:true,available:true,fresh:true,permitted:true,lastPacketAt:Date.now()}];
  window.ZebjusKits.request=async(route,method='GET')=>{
   f.requests.push({route,method});
   if(route!=='/api/rc/snapshot'||method!=='GET')throw Error('Layout test attempted a hardware mutation');
   return {kitId,seq:++f.seq,source:f.source,transport:'STA',ownerId:'layout-owner',active:f.source!=='NONE',
    inputValid:true,failsafe:false,ageMs:f.source==='NONE'?5000:0,
    throttle:1000,roll:1500,pitch:1650,yaw:1400,ch5:1700,ch6:1200,
    ...(f.source==='PPM'?{channels:[1500,1650,1000,1400,1700,1200,1800,1300]}:{}),
    inputArmed:false,flightMode:'angle',...(f.legacy?{}:{flightModeState:mode}),
    motorsDisabled:true,motorsArmed:false,ledOn:true,accepted:f.seq,rejected:0};
  };
  window.ZebjusDevicesWorkspace.open('inputs');
 });
 await page.waitForFunction(()=>document.getElementById('liKitIdentity').textContent==='ZFC-A2-41FEFF63B0E4');
 await page.waitForFunction(()=>document.getElementById('liModeStatus').textContent.includes('UNSUPPORTED'));
 for(const source of ['NONE','PPM']){
  await page.evaluate(source=>{window.__monitorLayout.source=source;window.__monitorLayout.legacy=source==='NONE'},source);
  if(source==='PPM')await page.waitForFunction(()=>document.getElementById('liCh8').textContent.includes('1300'));
  for(const [width,height] of [[2048,1082],[1920,900],[1366,768],[1024,768],[768,900],[390,844],[320,740]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>{window.scrollTo(0,0);document.getElementById('dw-body-inputs').scrollTop=0});
   await page.waitForFunction(()=>{
    const shell=document.getElementById('devicesWorkspace'),body=document.getElementById('dw-body-inputs');
    // Wait for the resize observer to finish fitting the workspace, rather
    // than accepting the previous viewport's height within a 40px tolerance.
    return innerWidth<=780||(Math.abs(shell.getBoundingClientRect().bottom-innerHeight)<40&&body.getBoundingClientRect().bottom<=innerHeight+1);
   });
   const metrics=await page.evaluate(()=>{
    const card=document.getElementById('fwLiveInputs'),body=document.getElementById('dw-body-inputs');
    const bounds=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,width:r.width}};
    return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,card:bounds(card),
     cardScrollHeight:card.scrollHeight,cardClientHeight:card.clientHeight,body:bounds(body),
     badge:bounds(document.getElementById('liLiveState')),
     bodyScrollHeight:body.scrollHeight,bodyClientHeight:body.clientHeight,
     controls:bounds(card.querySelector('.li-controls')),identity:bounds(card.querySelector('.li-identity')),
     beforeSticks:card.querySelector('.li-middle').getBoundingClientRect().top-card.getBoundingClientRect().top,
     ppmRows:new Set([...card.querySelectorAll('.li-ppm-channel')].map(el=>Math.round(el.getBoundingClientRect().top))).size,
     selects:[...card.querySelectorAll('select')].map(el=>bounds(el)),
     visibleHeadings:[...document.querySelectorAll('#dw-panel-inputs h2')].filter(el=>el.getBoundingClientRect().height>0).length};
   });
   const detail=JSON.stringify({source,width,height,metrics});
   assert.ok(metrics.documentWidth<=width+1,'Horizontal overflow: '+detail);
   assert.ok(metrics.cardScrollHeight<=metrics.cardClientHeight+1,'Card clipped its own content: '+detail);
   assert.equal(metrics.visibleHeadings,1,'Duplicate Live Inputs heading');
   assert.ok(metrics.badge.left>=metrics.card.left&&metrics.badge.right<=metrics.card.right,'Connection badge clipped: '+detail);
   for(const select of metrics.selects){
    assert.ok(select.height>=44&&select.left>=0&&select.right<=width+1,'Select target clipped/small: '+detail);
   }
   if(width>=1366){
    assert.ok(metrics.beforeSticks<225,'Monitor controls consume too much height: '+detail);
    assert.equal(metrics.ppmRows,1,'Desktop PPM channels must occupy one row');
    assert.ok(metrics.identity.height<55,'Identity must be a compact single strip: '+detail);
   }
   if(width>780){
    assert.ok(metrics.body.bottom<=height+1,'Workspace extends beyond viewport: '+detail);
    if(metrics.bodyScrollHeight>metrics.bodyClientHeight+1){
     await page.locator('.li-middle').hover();await page.mouse.wheel(0,1500);
     await page.waitForFunction(()=>document.getElementById('dw-body-inputs').scrollTop>0);
    }
    await page.locator('#dw-body-inputs').evaluate(el=>el.scrollTop=el.scrollHeight);
   }else await page.locator('#liHelp').scrollIntoViewIfNeeded();
   const footer=await page.locator('#liHelp').evaluate(el=>{
    const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+Math.min(r.width/2,40),r.top+Math.min(r.height/2,5));
    return {top:r.top,bottom:r.bottom,visible:hit===el||el.contains(hit)};
   });
   assert.ok(footer.top>=0&&footer.bottom<=height+1&&footer.visible,'Monitor footer unreachable: '+JSON.stringify({source,width,footer}));
   if(source==='PPM')assert.equal((await page.locator('#liMotors').textContent()).trim(),'DISABLED');
   evidence.push({source,width,height,metrics,footer});
   await page.evaluate(()=>{window.scrollTo(0,0);document.getElementById('dw-body-inputs').scrollTop=0});
   if(source==='NONE'||[1366,390,320].includes(width))await page.screenshot({path:`test-output/live-inputs/${source.toLowerCase()}-${width}.png`,fullPage:true});
   console.log('PASS Live Inputs compact/scroll',source,width,height);
  }
 }
 // Force overflow on a short laptop display and verify actual mouse-wheel scrolling.
 await page.setViewportSize({width:1366,height:540});
 await page.locator('#dw-body-inputs').evaluate(el=>el.scrollTop=0);
 await page.locator('.li-header').hover();await page.mouse.wheel(0,1500);
 await page.waitForFunction(()=>document.getElementById('dw-body-inputs').scrollTop>0);
 await page.locator('#dw-body-inputs').evaluate(el=>el.scrollTop=el.scrollHeight);
 assert.ok(await page.locator('#liMotors').isVisible());
 assert.ok((await page.evaluate(()=>window.__monitorLayout.requests)).every(r=>r.method==='GET'&&r.route==='/api/rc/snapshot'));
 assert.deepEqual(errors,[]);
 console.log('PASS short-laptop wheel scrolling and read-only monitoring');
}catch(error){await page.screenshot({path:'test-output/live-inputs/error.png',fullPage:true}).catch(()=>{});throw error}
finally{
 writeFileSync('test-output/live-inputs/geometry.json',JSON.stringify({evidence,errors,physicalHardware:'NOT TESTED'},null,2));
 await browser.close();
}
