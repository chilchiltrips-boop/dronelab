// Production selectors, page adapters, polling failure handling and cockpit
// touch locks against explicit firmware/phone doubles. No hardware acceptance.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('test-output/control-path',{recursive:true});
const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
await configureContext(context);const page=await context.newPage(),errors=[];
page.on('pageerror',e=>{if(!/^Canceled/.test(e.message))errors.push(e.message)});
try{
 await page.addInitScript(()=>{
  const fetchOriginal=window.fetch;
  window.fetch=(url,options)=>/^http:\/\/(?:192\.168\.|zebjus|127\.0\.0\.1:8766)/.test(String(url))?Promise.resolve(new Response('',{status:404})):fetchOriginal(url,options);
  const get=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/.test(kind)?null:get.call(this,kind,...args)};
 });
 await page.goto('http://127.0.0.1:8765/index.html#firmware');
 await page.waitForFunction(()=>window.ZebjusKits&&window.ZebjusControlUI);
 await page.evaluate(async()=>{
  const f=window.__controlFixture={id:'ZFC-A2-012345ABCDEF',mode:'sta',path:'PPM',source:'PPM',selection:'PPM',seq:0,failStatus:0,actions:[],snapshotIdle:false};
  const access=()=>({version:1,pathVersion:1,controlPath:f.path,selection:f.selection,paused:false,stationary:true,maintenance:{active:false,owned:false,leaseRemainingMs:0}});
  const rc=()=>({kitId:f.id,ownerId:f.source==='WEB'?'browser-owner':f.source,source:f.source,transport:f.source==='PPM'?'PPM':f.mode.toUpperCase(),claimed:f.source!=='NONE',active:f.source!=='NONE',inputValid:f.source!=='NONE',failsafe:f.source==='NONE',inputArmed:false,seq:f.source==='NONE'?0:++f.seq,ageMs:0,accepted:f.seq,rejected:0,throttle:1000,roll:1500,pitch:1500,yaw:1500,ch5:1000,ch6:1500,motorsDisabled:true,motorsArmed:false});
  const status=()=>({kitId:f.id,kitCode:'123456',kitName:'Control path test A2',board:'ZFC-A2',version:'1.5.12',bootId:'control-boot',requestTransport:f.mode.toUpperCase(),mode:f.mode,controlAuthorized:true,setupAuthorized:true,otaAuthorized:false,motorsDisabled:true,motorsArmed:false,staConnected:f.mode==='sta',apActive:f.mode==='ap',ip:f.mode==='sta'?'192.168.1.20':'',ssid:'Classroom',ppm:{present:true},rcAccess:access(),rc:rc()});
  const fetchOriginal=window.fetch;
  window.fetch=(url,options)=>/\/api\/identify$/.test(String(url))?Promise.resolve(new Response(JSON.stringify({kitId:f.id,kitCode:'123456',board:'ZFC-A2',simpleConnection:true,adminSessions:true}))):fetchOriginal(url,options);
  const request=async(route,method='GET',args={})=>{
   if(route==='/api/status'){if(f.failStatus){--f.failStatus;throw Error('Injected status timeout')}return status()}
   if(route==='/api/rc/snapshot')return f.snapshotIdle?{...rc(),source:'NONE',claimed:false,active:false,inputValid:false,seq:0,accepted:0}:rc();
   if(route==='/api/telemetry')return {kitId:f.id,board:'A2',address:104,gyroReady:true,sampleValid:true,sampleAgeMs:0,roll:0,pitch:0,yaw:0,millis:100,rcAlive:true};
   if(route==='/api/wifi/saved')return {kitId:f.id,networks:[]};
   if(route==='/api/rc/access'){
    f.actions.push(args);f.path=args.controlPath;f.selection=args.source;f.source=args.source==='PPM'?'PPM':'NONE';
    return {kitId:f.id,rcAccess:access(),rc:rc()};
   }
   if(route==='/api/rc/claim'){f.source='WEB';return {kitId:f.id,session:'control-web-session',ownerId:'browser-owner'}}
   if(route==='/api/rc/preview')return {kitId:f.id,received:true,seq:args.seq,inputArmed:false};
   if(route==='/api/rc/release'){f.source='NONE';return {kitId:f.id,released:true}}
   throw Error('Unexpected fixture route '+route);
  };
  window.ZebjusKitAuth.http=x=>x;window.ZebjusKitAuth.open=window.ZebjusKitAuth.openLocal=async()=>({expiresAt:Date.now()+600000,request});
  window.ZebjusKitPairingStore={fromSession:()=> 'a1'.repeat(16),restore:async()=> 'a1'.repeat(16),saveSession(){},remember:async()=>{}};
  window.ZebjusDeviceRelay.status=()=>({connected:true,paired:true,approved:true,sessionId:'fixture-approved-peer'});
  for(const [id,value] of Object.entries({kitTransport:'sta',kitCodeInput:'123456',kitIpInput:'192.168.1.20'}))document.getElementById(id).value=value;
  await window.ZebjusKits.connect(f.id);window.ZebjusDevicesWorkspace.open('overview');window.ZebjusControlUI.refresh();
 });
 await page.waitForFunction(()=>window.ZebjusControlUI.snapshot()?.active==='PPM');
 const availability=()=>page.evaluate(()=>window.ZebjusControlUI.refresh().paths.filter(p=>p.selectable).map(p=>p.id));
 assert.deepEqual(await availability(),['ANDROID_WEBRTC','PPM','WEB_STA']);
 assert.equal(await page.locator('[data-control-selector] select option').count(),5);
 // A delayed management status must not discard identity or create a false RC loss.
 await page.evaluate(async()=>{window.__controlFixture.failStatus=1;await window.ZebjusKits.refreshConnection().catch(()=>{});window.ZebjusControlUI.refresh()});
 assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().connected),true);
 assert.equal(await page.locator('#kitGlobalState').textContent(),'RESPONSE DELAYED');
 assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().rc.source),'PPM');
 await page.evaluate(()=>window.ZebjusKits.read());
 for(const view of ['overview','connection','wifi','inputs','diagnostics','security','mobile','firmware']){
  await page.evaluate(view=>{window.ZebjusDevicesWorkspace.open(view);window.ZebjusControlUI.refresh()},view);
  assert.match(await page.locator('#dw-panel-'+view+' [data-control-summary]').textContent(),/PPM RX\/TX/);
  assert.equal(await page.locator('#dw-panel-'+view+' [data-control-summary]').isVisible(),true,'Shared summary must be visible in '+view);
 }
 await page.evaluate(()=>{window.__controlFixture.snapshotIdle=true;window.__controlFixture.source='NONE';window.ZebjusDevicesWorkspace.open('inputs')});
 await page.waitForFunction(()=>document.getElementById('liLiveState').textContent==='IDLE');
 await page.waitForTimeout(1100);
 assert.equal(await page.locator('#liLiveState').textContent(),'IDLE');
 assert.equal(await page.locator('#liConnectionState').textContent(),'CONNECTED');
 await page.evaluate(async()=>{window.__controlFixture.snapshotIdle=false;window.__controlFixture.source='PPM';await window.ZebjusKits.read();document.getElementById('kitHardwareTarget').checked=true;await window.ZebjusControlUI.selectPath('WEB_STA')});
 assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().owner),true);
 assert.equal(await page.evaluate(()=>window.ZebjusControlUI.snapshot().selected),'WEB_STA');
 await page.evaluate(async()=>{window.__controlFixture.failStatus=1;await window.ZebjusKits.refreshConnection().catch(()=>{})});
 assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().owner),true,'One management delay must not remove fresh browser RC ownership');
 await page.evaluate(async()=>{await window.ZebjusKits.read();await window.ZebjusKits.releaseRc();await window.ZebjusControlUI.selectPath('ANDROID_WEBRTC')});
 assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().owner),false,'WebRTC must not claim Kit RC');
 assert.equal(await page.evaluate(()=>window.ZebjusControlUI.snapshot().target),'Simulator');
 await page.evaluate(()=>window.ZebjusControlUI.selectPath('PPM'));
 assert.equal(await page.evaluate(()=>window.ZebjusKits.getState().rcAccess.controlPath),'PPM');
 await page.evaluate(async()=>{const f=window.__controlFixture;f.mode='ap';await window.ZebjusKits.read();window.ZebjusControlUI.refresh()});
 assert.deepEqual(await availability(),['ANDROID_AP','PPM']);
 for(const width of [1366,768,390,320]){
  await page.setViewportSize({width,height:900});await page.evaluate(()=>{window.ZebjusDevicesWorkspace.open('overview');scrollTo(0,0)});
  await page.locator('[data-control-selector]').evaluate(e=>{e.open=true});
  await page.waitForTimeout(150);
  const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,popover:document.querySelector('.control-path-popover').getBoundingClientRect().toJSON()}));
  assert.ok(size.scroll<=width+2,JSON.stringify(size));assert.ok(size.popover.x>=-1&&size.popover.right<=width+1,JSON.stringify(size));
  await page.screenshot({path:'test-output/control-path/web-'+width+'.png',fullPage:false});
 }
 // The real cockpit touch handlers respect the same confirmed PPM lock.
 const phone=await context.newPage();await phone.setViewportSize({width:800,height:450});
 await phone.goto('http://127.0.0.1:8765/companion.html');await phone.waitForFunction(()=>window.ZebjusFlightApp&&window.ZebjusControlUI);
 await phone.evaluate(()=>{
  document.getElementById('flightSplash').hidden=true;
  const state={connected:true,kitId:'ZFC-A2-012345ABCDEF',transport:'ap',physicalLink:'ap',apActive:true,controlAuthorized:true,rcAt:Date.now(),heartbeatAt:Date.now(),rcAccess:{version:1,pathVersion:1,controlPath:'PPM',selection:'PPM',paused:false,stationary:true,maintenance:{active:false,owned:false,leaseRemainingMs:0}},rc:{source:'PPM',active:true,claimed:true,inputValid:true,ageMs:0,throttle:1000,inputArmed:false},ppm:{present:true}};
  window.ZebjusNetwork.getState=()=>state;window.ZebjusControlUI.refresh();window.dispatchEvent(new CustomEvent('dronelab:control-path',{detail:{path:'PPM'}}));
 });
 await phone.waitForFunction(()=>document.getElementById('flightLeftZone').getAttribute('aria-disabled')==='true');
 assert.equal(await phone.locator('#flightArm').isDisabled(),true);
 const before=await phone.locator('#flightThrottle').textContent();
 await phone.locator('#flightLeftZone').dispatchEvent('pointerdown',{pointerId:8,pointerType:'touch',button:0,clientX:80,clientY:180});
 assert.equal(await phone.locator('#flightThrottle').textContent(),before);
 const phoneLayout=await phone.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,header:document.querySelector('.flight-topbar').getBoundingClientRect().toJSON()}));
 assert.ok(phoneLayout.scroll<=phoneLayout.width+2,JSON.stringify(phoneLayout));
 assert.ok(phoneLayout.header.height<=70,'Input selection must retain a compact cockpit header');
 await phone.screenshot({path:'test-output/control-path/android-ppm.png'});
 assert.deepEqual(errors,[]);writeFileSync('test-output/control-path/result.json',JSON.stringify({passed:true,checks:['AP/STA availability','four header options','same-source summaries across eight pages','single status failure without link flicker','idle telemetry freshness','explicit source confirmation','responsive selector','Android PPM touch lock']},null,2));
 console.log('PASS unified control paths: availability, polling, page status, source confirmation and Android touch lock');
}finally{await browser.close()}
