// Actual WebApp handlers and layout with an explicit signed-session device
// boundary double. Radio/USB/physical handset acceptance is not claimed.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const output='test-output/wifi-workspace';mkdirSync(output,{recursive:true});
const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
await configureContext(context);const page=await context.newPage(),errors=[],layouts=[];
page.on('pageerror',e=>{if(!/^Canceled/.test(e.message))errors.push(e.message)});
try{
 await page.addInitScript(()=>{const native=fetch;window.fetch=(u,o)=>/^http:\/\/(?:192\.168\.|zebjus|127\.0\.0\.1:8766)/.test(String(u))?Promise.resolve(new Response('',{status:404})):native(u,o)});
 await page.goto('http://127.0.0.1:8765/index.html#firmware');
 await page.waitForFunction(()=>window.ZebjusWifiWorkspace&&window.ZebjusKits&&window.ZebjusDevicesWorkspace);
 assert.equal(await page.locator('#wifiHotspotSettings').evaluate(e=>e.open),false);
 assert.equal(await page.locator('#dw-body-wifi').evaluate(e=>e.firstElementChild.id),'kitNetworkSettings');
 assert.equal(await page.locator('#dw-body-security #kitAdmin').count(),1);
 assert.equal(await page.locator('#dw-body-diagnostics #wifiLegacyNetwork').count(),1);
 await page.evaluate(async()=>{
  const id='ZFC-A2-012345ABCDEF',native=fetch;
  const f=window.__wifiFixture={id,mode:'sta',authorized:true,ppm:false,requests:[],saved:['Classroom','Workshop','<img src=x>']};
  const rc=()=>({kitId:f.id,source:f.ppm?'PPM':'NONE',claimed:f.ppm,active:f.ppm,inputValid:f.ppm,inputArmed:false,throttle:1000,roll:1500,pitch:1500,yaw:1500,seq:f.ppm?1:0});
  const status=()=>({kitId:f.id,kitCode:'123456',kitName:'A2 network classroom',board:'ZFC-A2',version:'1.5.11',bootId:'wifi-boot',requestTransport:'STA',mode:f.mode,
   setupAuthorized:f.authorized,controlAuthorized:f.authorized,otaAuthorized:f.authorized,staConnected:true,apActive:false,ip:'192.168.1.20',ssid:'Classroom',exclusiveWifi:true,radioHandover:{version:1,lastStaInput:'ANDROID_WEBRTC'},rc:rc(),motorsDisabled:true,motorsArmed:false});
  window.fetch=(u,o)=>String(u)==='http://192.168.1.20/api/identify'?Promise.resolve(new Response(JSON.stringify({kitId:id,kitCode:'123456',board:'ZFC-A2',simpleConnection:true,adminSessions:true}))):native(u,o);
  const request=async(route,method='GET',args={})=>{
   f.requests.push({route,method,args:{...args}});
   if(route==='/api/status')return status();
   if(route==='/api/rc/snapshot')return rc();
   if(route==='/api/telemetry')return {kitId:id,board:'A2',gyroReady:true,sampleValid:true,sampleAgeMs:0,address:104,roll:0,pitch:0,yaw:0,millis:1,scanner:[],scannerRunning:false,scanSequence:1};
   if(route==='/api/wifi/saved'){
    const result={kitId:id,networks:f.saved.map((ssid,i)=>({ssid,preferred:i===0})),preferred:f.saved[0]};
    if(f.delaySaved)return new Promise(resolve=>{f.releaseSaved=()=>resolve(result)});
    return result;
   }
   if(route==='/api/wifi/scan')return {kitId:id,state:'ready',networks:[{ssid:'Workshop',rssi:-42}]};
   if(route==='/api/wifi/test')throw Error('router_test_rejected');
   if(route==='/api/wifi/mode')throw Error('mode_write_rejected');
   if(route==='/api/wifi/use')throw Error('profile_switch_rejected');
   if(route==='/api/wifi/forget'){f.saved=f.saved.filter(ssid=>ssid!==args.ssid);return {kitId:id,forgotten:true}}
   throw Error('Unexpected fixture route '+route);
  };
  window.ZebjusKitAuth.http=x=>x;window.ZebjusKitAuth.open=async()=>({expiresAt:Date.now()+600000,request});
  window.ZebjusKitPairingStore={fromSession:()=> 'a1'.repeat(16),restore:async()=> 'a1'.repeat(16),saveSession(){},remember:async()=>{}};
  for(const [name,value] of Object.entries({kitTransport:'sta',kitCodeInput:'123456',kitIpInput:'192.168.1.20'}))document.getElementById(name).value=value;
  await window.ZebjusKits.connect(id);window.ZebjusDevicesWorkspace.open('wifi');
 });
 await page.waitForFunction(()=>document.getElementById('wifiActualMode').textContent==='STA');
 await page.locator('#kitSavedRefresh').click();await page.waitForFunction(()=>document.querySelectorAll('.wifi-saved-choice').length===3);
 assert.equal(await page.locator('#wifiSavedList img').count(),0,'SSID must remain text');
 await page.locator('.wifi-saved-choice').filter({hasText:'Workshop'}).click();
 const writes=()=>page.evaluate(()=>window.__wifiFixture.requests.filter(r=>r.method==='POST'));
 assert.equal((await writes()).length,0,'Selecting a profile is not a network command');
 await page.locator('#kitSavedUse').click();await page.waitForFunction(()=>document.getElementById('kitWifiStatus').textContent.includes('profile_switch_rejected'));
 assert.equal((await writes()).at(-1).args.ssid,'Workshop');
 await page.locator('#kitWifiScan').click();await page.waitForFunction(()=>document.getElementById('kitWifiNetworks').options.length===2);
 await page.locator('#kitWifiNetworks').selectOption('Workshop');
 assert.equal(await page.locator('#kitRouterSsid').inputValue(),'Workshop');
 assert.equal(await page.locator('#wifiManualField').isVisible(),false);
 await page.locator('#wifiManualSsid').check();await page.locator('#kitRouterSsid').fill('Manual Router');
 await page.locator('#kitRouterPass').fill('FixtureRouter#123');await page.locator('#wifiShowRouterPassword').click();
 assert.equal(await page.locator('#kitRouterPass').getAttribute('type'),'text');
 await page.locator('#kitWifiSave').click();await page.waitForFunction(()=>document.getElementById('kitWifiStatus').textContent.includes('router_test_rejected'));
 assert.equal((await writes()).at(-1).args.ssid,'Manual Router');assert.equal(await page.locator('#kitRouterPass').inputValue(),'');
 await page.locator('[data-wifi-mode="ap"]').click();
 assert.equal(await page.locator('#wifiActualMode').textContent(),'STA','Selection must not fake active radio mode');
 const before=(await writes()).length;await page.locator('#kitModeApply').click();
 await page.waitForFunction(()=>document.getElementById('kitWifiStatus').textContent.includes('mode_write_rejected'));
 assert.equal((await writes()).length,before+1);assert.equal((await writes()).at(-1).args.mode,'ap');
 assert.equal(await page.locator('#wifiActualMode').textContent(),'STA');
 await page.locator('[data-wifi-mode="sta"]').click();
 assert.equal(await page.locator('#kitModeApply').isDisabled(),true);
 await page.evaluate(async()=>{window.__wifiFixture.mode='auto';await window.ZebjusKits.read()});
 assert.equal(await page.locator('#kitWifiMode').inputValue(),'auto');assert.equal(await page.locator('#wifiActualMode').textContent(),'STA');
 assert.equal(await page.locator('#kitModeApply').textContent(),'Automatic selected');
 await page.evaluate(async()=>{window.__wifiFixture.mode='sta';await window.ZebjusKits.read()});
 for(const width of [1366,1024,768,390,320]){
  await page.setViewportSize({width,height:width<781?844:768});await page.evaluate(()=>{scrollTo(0,0);document.getElementById('dw-body-wifi').scrollTop=0});
  const m=await page.evaluate(()=>{
   const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right}};
   return {width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,title:r('wifiModeTitle'),save:r('kitWifiSave'),panel:r('dw-body-wifi'),hotspotOpen:document.getElementById('wifiHotspotSettings').open,
    font:parseFloat(getComputedStyle(document.getElementById('kitWifiSave')).fontSize),touch:document.getElementById('kitWifiScan').getBoundingClientRect().height};
  });
  assert.ok(m.overflow<=1,JSON.stringify(m));assert.equal(m.hotspotOpen,false);assert.ok(m.font>=13);
  if(width===1366)assert.ok(m.save.bottom<=m.panel.bottom,'Daily actions must fit a laptop first view: '+JSON.stringify(m));
  if(width<=768)assert.ok(m.touch>=44,'Touch target too small');
  layouts.push(m);await page.screenshot({path:output+'/connected-'+width+'.png',fullPage:true});
 }
 await page.evaluate(async()=>{window.__wifiFixture.ppm=true;await window.ZebjusKits.read()});
 assert.equal(await page.locator('#kitModeApply').isDisabled(),true);assert.equal(await page.locator('#kitWifiSave').isDisabled(),true);
 assert.match(await page.locator('#wifiModeHint').textContent(),/RC input is active/);
 await page.evaluate(async()=>{window.__wifiFixture.ppm=false;window.__wifiFixture.authorized=false;await window.ZebjusKits.read()});
 assert.equal(await page.locator('#kitWifiSave').isDisabled(),true);assert.equal(await page.locator('#kitRouterPass').isDisabled(),true);
 assert.match(await page.locator('#wifiPermissionHint').textContent(),/Read-only/);
 const count=(await writes()).length;
 await page.evaluate(async()=>{window.__wifiFixture.id='ZFC-A1-ABCDEF012345';try{await window.ZebjusKits.read()}catch{}});
 await page.waitForFunction(()=>!window.ZebjusKits.getState().linkVerified,null,{timeout:15000});
 assert.equal((await page.evaluate(()=>window.ZebjusKits.getState())).connected,false);assert.equal((await writes()).length,count);
 assert.equal(await page.locator('#kitRouterPass').inputValue(),'');
 assert.equal(await page.locator('.wifi-saved-choice').count(),0,'Previous Kit profiles must be cleared');
 assert.equal((await page.evaluate(()=>window.__wifiFixture.requests)).some(r=>r.route.startsWith('/api/rc/')&&r.method==='POST'),false);
 await page.evaluate(async()=>{
  const f=window.__wifiFixture;f.id='ZFC-A2-012345ABCDEF';f.authorized=true;
  document.getElementById('kitTransport').value='sta';document.getElementById('kitIpInput').value='192.168.1.20';
  await window.ZebjusKits.connect(f.id);f.delaySaved=true;
 });
 await page.locator('#kitSavedRefresh').click();await page.waitForFunction(()=>typeof window.__wifiFixture.releaseSaved==='function');
 // USB mode handover uses the original serial handler and changes the active
 // badge only after its ACK and fresh network report.
 await page.evaluate(async()=>{
  const id='ZFC-A1-ABCDEF012345',f=window.__wifiUsb={mode:'ap',writes:[]};
  const emit=line=>dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line,transport:'usb'}}));
  const handover=()=>({kitId:id,mode:f.mode,radioHandover:{version:1,profileSaved:true,revision:1,state:'PREPARED',mode:f.mode,targetInput:f.mode==='ap'?'ANDROID_AP':'ANDROID_WEBRTC',lastStaInput:'ANDROID_WEBRTC'},rcAccess:{version:1,pathVersion:1,controlPath:f.mode==='ap'?'ANDROID_AP':'ANDROID_WEBRTC',selection:'ANDROID',paused:true,handoverPaused:true,stationary:true,maintenance:{active:false,owned:false,leaseRemainingMs:0}}});
  f.report=()=>{emit('ZJNET,HANDOVER,'+JSON.stringify(handover()));emit('ZJNET,MODE,'+f.mode);emit('ZJNET,AP,'+(f.mode==='ap'?'ON,Kit-A1':'OFF'));emit(f.mode==='sta'?'ZJNET,STA,CONNECTED,192.168.1.21,Classroom':'ZJNET,STA,OFFLINE')};
  window.DroneLabSerial={isOpen:()=>true,isFlashing:()=>false,generation:()=>88,writeLine:async line=>{
   line=String(line).trim();
   if(line==='ZJKIT,GET'){emit('ZJKIT,ID,'+id);emit('ZJKIT,CODE,123456');emit('ZJKIT,NAME,A1 USB network')}
   else if(line==='ZJINFO,GET')emit('ZJINFO,FW,ZFC-A1,1.5.11');
   else if(line==='ZJNET,PAIR')emit('ZJNET,PAIR,'+id+','+'b2'.repeat(16));
   else if(line==='ZJNET,GET'){f.report();dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{transport:'sta',line:'ZJNET,STA,CONNECTED,10.1.2.3,Wrong Kit Network'}}))}
   else if(line.startsWith('ZJNET,MODE,')){f.writes.push(line);f.mode=line.split(',')[2];emit('ZJNET,HANDOVER,'+JSON.stringify(handover()));emit('ZJNET,ACK,MODE,'+f.mode)}
  }};
  document.getElementById('kitTransport').value='usb';await window.ZebjusKits.connect();
 });
 await page.waitForFunction(()=>document.getElementById('wifiActualMode').textContent==='AP');
 await page.evaluate(()=>window.__wifiFixture.releaseSaved());
 await page.waitForFunction(()=>/Selected [Kk]it changed/.test(document.getElementById('kitWifiStatus').textContent));
 assert.equal(await page.locator('.wifi-saved-choice').count(),0,'Late A2 profile response must not populate the newly verified A1');
 assert.equal(await page.locator('[data-wifi-mode="ap"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#fwWifiName').textContent(),'Router not connected','New USB Kit must not inherit the previous STA SSID');
 await page.locator('[data-wifi-mode="sta"]').click();
 assert.equal(await page.evaluate(()=>window.__wifiUsb.writes.length),0);assert.equal(await page.locator('#wifiActualMode').textContent(),'AP');
 await page.locator('#kitModeApply').click();await page.waitForFunction(()=>document.getElementById('wifiActualMode').textContent==='STA');
 assert.deepEqual(await page.evaluate(()=>window.__wifiUsb.writes),['ZJNET,MODE,sta,ANDROID_WEBRTC']);
 assert.equal(await page.locator('#wifiBrowserLink').textContent(),'USB');
 await page.goto('http://127.0.0.1:8765/lab.html#firmware');await page.waitForFunction(()=>window.ZebjusWifiWorkspace);
 await page.evaluate(()=>window.ZebjusDevicesWorkspace.open('wifi'));
 assert.equal(await page.locator('#dw-body-wifi').evaluate(e=>e.firstElementChild.id),'kitNetworkSettings');
 assert.deepEqual(errors,[]);writeFileSync(output+'/evidence.json',JSON.stringify({layouts,errors,physicalHardware:'NOT TESTED',originalHandlers:true,observerAndPpmGuarded:true,failedWritesVisible:true},null,2));
 console.log('PASS Wi-Fi workspace: priority, profiles, manual/scan, explicit mode, error visibility, observer/PPM/identity guards and five viewports');
}catch(error){await page.screenshot({path:output+'/error.png',fullPage:true}).catch(()=>{});console.error(error.stack||error);process.exitCode=1}
finally{await browser.close()}
