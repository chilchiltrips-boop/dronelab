// Actual WebApp rendering and diagnostic-lease handlers; Kit replies are a
// device double. No radio, physical USB or handset acceptance is claimed.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const before=process.env.DRONELAB_AUDIT_BEFORE==='1',output='test-output/ui-stability-'+(before?'before':'after');
mkdirSync(output,{recursive:true});
let browser;const results=[];
try{
 for(const [width,height] of before?[[1366,768]]:[[1920,1080],[1366,768],[1024,768],[768,900],[390,844],[360,800]]){
  browser=await chromium.launch(browserOptions);
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});await configureContext(context);
  await context.tracing.start({screenshots:true,snapshots:true});
  await context.addInitScript(()=>{
   const original=window.fetch;
   window.fetch=(url,options)=>/^http:\/\/(?:192\.168\.|zebjus|127\.0\.0\.1:8766)/.test(String(url))?
    Promise.resolve(new Response('',{status:404})):original(url,options);
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{if(!/^Canceled/.test(e.message))errors.push(e.message)});
  try{
   await page.goto('http://127.0.0.1:8765/index.html#python');
   await page.waitForFunction(()=>window.ZebjusKits&&window.ZebjusDevicesWorkspace&&window.DroneLabSerial);
   await page.evaluate(async()=>{
    const kitId='ZFC-A2-012345ABCDEF',realFetch=window.fetch;let owned=false,seq=0;
    const status=()=>({kitId,kitCode:'123456',kitName:'Browser fixture',board:'ZFC-A2',version:'1.5.10',bootId:'fixture-boot',
     requestTransport:'AP',mode:'ap',setupAuthorized:true,controlAuthorized:true,apActive:true,apSsid:'Browser-fixture-123456',motorsDisabled:true,motorsArmed:false,
     flightModeState:{supported:true,stabilizationSupported:false,saved:'angle',active:'angle',pending:null},flightMode:'angle',
     rc:{claimed:owned,active:owned,source:owned?'WEB':'NONE',ownerId:owned?'fixture-owner':'',inputArmed:false,seq:++seq,throttle:1000,roll:1500,pitch:1500,yaw:1500}});
    window.fetch=(url,options)=>String(url)==='http://192.168.4.1/api/identify'?Promise.resolve(new Response(JSON.stringify({kitId,kitCode:'123456',name:'Browser fixture',board:'ZFC-A2',simpleConnection:true}))):realFetch(url,options);
    window.ZebjusKitAuth.http=x=>x;
    window.ZebjusKitAuth.openLocal=async()=>({expiresAt:Date.now()+600000,request:async route=>{
     if(route==='/api/status')return status();
     if(route==='/api/telemetry')return {kitId,board:'A2',gyroReady:true,address:104,roll:0,pitch:0,yaw:0,millis:123,scannerRunning:false,scanner:[],scanSequence:1};
     if(route==='/api/rc/snapshot')return {kitId,...status().rc,inputValid:owned,failsafe:!owned,ageMs:0,motorsDisabled:true};
     if(route==='/api/rc/claim'){owned=true;return {kitId,session:'fixture-control',ownerId:'fixture-owner'}}
     if(route==='/api/rc/preview')return {kitId,received:true};
     if(route==='/api/rc/release'||route==='/api/rc/stop'){owned=false;return {released:true}}
     throw Error('Unexpected fixture route '+route);
    }});
    for(const [id,value] of Object.entries({kitTransport:'ap',kitCodeInput:'123456',kitIpInput:'192.168.4.1'}))document.getElementById(id).value=value;
    await window.ZebjusKits.connect(kitId);
   });
   for(const tab of ['python','firmware','pid']){
    await page.locator('[data-tab="'+tab+'"]').first().click();
    if(tab==='firmware')await page.evaluate(()=>window.ZebjusDevicesWorkspace.open('overview'));
    if(tab==='pid'){
     await page.waitForFunction(()=>window.ZebjusTraining?.isReady?.(),null,{timeout:45000});
     const simulator=page.frameLocator('#pidFrame');
     await simulator.locator('#tpInputSource').selectOption('web');await simulator.locator('#tpRun').click();
     await page.evaluate(()=>{
      const receiver=document.getElementById('pidFrame').contentWindow;
      for(let n=0;n<20;n++)receiver.dispatchEvent(new KeyboardEvent('keydown',{key:'w'}));
     });
     await page.waitForFunction(()=>window.ZebjusTraining.snapshot().armed&&window.ZebjusTraining.snapshot().throttle===1500);
    }
    await page.waitForTimeout(500);
    await page.evaluate(()=>{
     const panel=document.querySelector('.tab-panel.active'),iframe=document.getElementById('pidFrame');
     const audit=window.__renderAudit={tab:panel?.id,hash:location.hash,scroll:scrollY,panel,iframe,
      editor:document.getElementById('pythonMonaco'),canvas:iframe?.contentDocument?.querySelector('#tpStage canvas'),
      shifts:0,frames:0,flashes:0,tabChanges:0,childWrites:0};
     audit.observer=new MutationObserver(records=>{audit.childWrites+=records.filter(r=>r.type==='childList').length;});
     audit.observer.observe(document.getElementById('app'),{subtree:true,childList:true});
     audit.shiftObserver=new PerformanceObserver(list=>{for(const e of list.getEntries())audit.shifts+=e.value});
     audit.shiftObserver.observe({type:'layout-shift',buffered:false});
     audit.active=true;
     const sample=()=>{
      if(!audit.active)return;
      audit.frames++;
      if(document.querySelector('.tab-panel.active')?.id!==audit.tab)audit.tabChanges++;
      const style=getComputedStyle(panel),root=getComputedStyle(document.getElementById('app'));
      if(style.display==='none'||Number(style.opacity)<.9||root.display==='none'||Number(root.opacity)<.9)audit.flashes++;
      requestAnimationFrame(sample);
     };requestAnimationFrame(sample);
    });
    await page.screenshot({path:`${output}/${width}-${tab}-before.png`});
    for(let i=0;i<3;i++){
     await page.locator('#kitTopControl').click();await page.waitForFunction(()=>window.ZebjusKits.getState().owner);
     await page.locator('#kitTopControl').click();await page.waitForFunction(()=>!window.ZebjusKits.getState().owner);
    }
    const audit=await page.evaluate(()=>{
     const a=window.__renderAudit;a.active=false;a.observer.disconnect();a.shiftObserver.disconnect();
     return {tab:a.tab,activeTab:document.querySelector('.tab-panel.active')?.id,hashUnchanged:location.hash===a.hash,
      scrollDelta:Math.abs(scrollY-a.scroll),editorMounted:document.getElementById('pythonMonaco')===a.editor,
      iframeMounted:document.getElementById('pidFrame')===a.iframe,
      canvasMounted:!a.canvas||document.getElementById('pidFrame')?.contentDocument?.querySelector('#tpStage canvas')===a.canvas,
      shifts:a.shifts,frames:a.frames,flashes:a.flashes,tabChanges:a.tabChanges,childWrites:a.childWrites,
      simulator:window.ZebjusTraining?.snapshot?.()?{running:window.ZebjusTraining.snapshot().armed,throttle:window.ZebjusTraining.snapshot().throttle}:null};
    });
    results.push({width,height,tab,...audit});console.log('UI RENDER AUDIT '+JSON.stringify(results.at(-1)));
    await page.screenshot({path:`${output}/${width}-${tab}-after.png`});
    if(!before){
     assert.equal(audit.activeTab,audit.tab,'Take Control navigated away from the user workspace');
     assert.equal(audit.hashUnchanged,true);assert.equal(audit.tabChanges,0);assert.equal(audit.flashes,0);
     assert.ok(audit.scrollDelta<=2,'Control toggling moved the page scroll');
     assert.ok(audit.shifts<=.02,'Unexpected layout shift exceeded CLS 0.02 per six toggles');
     assert.ok(audit.editorMounted&&audit.iframeMounted&&audit.canvasMounted,'Editor/simulator remounted');
     if(tab==='pid'){
      assert.ok(audit.simulator.running&&audit.simulator.throttle===1500,'Take Control interrupted the running virtual simulator');
      await page.locator('[data-tab="firmware"]').first().click();
      await page.waitForFunction(()=>!window.ZebjusTraining.snapshot().armed);
      assert.match(await page.evaluate(()=>window.ZebjusTraining.snapshot().lastStopReason),/hidden|focus/i,'Hiding the simulator must still stop it');
     }
    }
   }
   if(!before)assert.deepEqual(errors,[]);
  }finally{
   await context.tracing.stop({path:`${output}/${width}-trace.zip`});await context.close();await browser.close();
  }
 }
}finally{writeFileSync(output+'/results.json',JSON.stringify({results,physicalHardware:'NOT TESTED'},null,2));await browser?.close()}
