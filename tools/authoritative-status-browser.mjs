// UI integration with explicitly simulated verified Kit data. This is not hardware acceptance.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('test-output',{recursive:true});
const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
await configureContext(context);
const page=await context.newPage(),errors=[],evidence=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));
const check=(ok,text)=>{if(!ok)throw Error(text)};
try{
 await page.goto('http://127.0.0.1:8765/index.html#pid');
 await page.waitForFunction(()=>window.ZebjusTraining?.isReady?.()&&window.ZebjusKits&&window.ZebjusDevicesWorkspace,null,{timeout:30000});
 await page.evaluate(()=>{
  const kitId='ZFC-A2-012345ABCDEF';
  const mode={supported:true,stabilizationSupported:false,saved:'angle',active:'angle',pending:null};
  const kit={kitId,kitName:'Verified fixture',connected:true,transport:'ap',version:'1.5.10',board:'ZFC-A2',bootId:'boot-test',
   flightMode:'angle',flightModeState:mode,ledOn:true,motorsArmed:false,motorsDisabled:true,usbAvailable:true,working:false};
  const f=window.__statusFixture={kit,seq:0,t:1000,r:1500,armed:false,requests:[]};
  const rc=()=>({kitId,seq:++f.seq,source:'ANDROID',transport:'AP',active:true,inputValid:true,failsafe:false,ageMs:0,
   throttle:f.t,roll:f.r,pitch:1500,yaw:1500,ch5:1725,ch6:1280,inputArmed:f.armed,
   flightMode:kit.flightMode,flightModeState:{...mode},motorsDisabled:true,motorsArmed:false});
  window.ZebjusKits.getState=()=>({...kit,heartbeatAt:Date.now()});
  window.ZebjusKits.getMonitorPaths=()=>kit.connected?[{kitId,transport:kit.transport,verified:true,available:true,fresh:true,permitted:true,lastPacketAt:Date.now()}]:[];
  window.ZebjusKits.request=async(route,method='GET')=>{f.requests.push({route,method});if(route!=='/api/rc/snapshot'||method!=='GET')throw Error('Unexpected hardware operation');return rc()};
  setInterval(()=>{if(kit.connected&&kit.transport==='usb')window.dispatchEvent(new CustomEvent('dronelab:serial-line',{
   detail:{transport:'usb',line:'ZJSTATE,1,'+JSON.stringify({kitId,flightModeState:{...mode},ledOn:true,ledEffect:1,rc:rc()})}}))},80);
 });
 const sim=page.frameLocator('#pidFrame');
 await page.waitForFunction(()=>window.ZebjusTraining.snapshot().activeSource==='android');
 for(const transport of ['ap','sta','android-relay']){
  await page.evaluate(t=>{window.__statusFixture.kit.transport=t;window.ZebjusDevicesWorkspace.open('inputs')},transport);
  await page.locator('#liMonitorSelect').selectOption(transport);
  await page.waitForFunction(()=>document.getElementById('liConnectionState').textContent==='CONNECTED'&&document.getElementById('liAux5').textContent==='1725 µs');
  check((await page.locator('#liAux5').textContent())==='1725 µs','Auxiliary channel missing on '+transport);
  check((await page.locator('#liInputArm').textContent())==='DISARMED','Disarmed input not shown');
  check((await page.locator('#liMotors').textContent())==='DISABLED','Motor state incorrect');
  check(await page.locator('#liModeSelect').isDisabled()=== (transport==='android-relay'),'Relay mode control must remain read-only');
  evidence.push({transport,aux:true,inputDisarmed:true,motorsDisabled:true});
 }
 await page.evaluate(()=>{window.__statusFixture.kit.transport='usb'});
 await page.locator('#liMonitorSelect').selectOption('usb');
 await page.waitForFunction(()=>document.getElementById('liAux6').textContent==='1280 µs');
 for(const colorScheme of ['light','dark']){
  await page.emulateMedia({colorScheme});
  for(const width of [1366,1024,768,390,320]){
   await page.setViewportSize({width,height:900});
   const colors=await page.locator('#liMonitorSelect').evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor,
    optionFg:getComputedStyle(el.options[0]).color,optionBg:getComputedStyle(el.options[0]).backgroundColor,
    height:el.getBoundingClientRect().height,right:el.getBoundingClientRect().right}));
   check(colors.fg!==colors.bg&&colors.optionFg!==colors.optionBg,'Unreadable native select colors');
   check(colors.height>=44&&colors.right<=width+2,'Monitor touch target clipped at '+width);
   evidence.push({colorScheme,width,colors});
  }
 }
 await page.setViewportSize({width:1366,height:900});
 await page.locator('[data-tab="pid"]').first().click();
 await sim.locator('#tpInputSource').selectOption('usb');
 await page.waitForFunction(()=>window.ZebjusTraining.snapshot().activeSource==='usb'&&window.ZebjusTraining.snapshot().input.fresh);
 check(await sim.locator('#tpMode').isDisabled(),'Connected Kit must own simulator mode');
 await sim.locator('#tpRun').click();
 await page.waitForFunction(()=>window.ZebjusTraining.snapshot().armed);
 await page.evaluate(()=>{const f=window.__statusFixture;f.kit.flightMode='acro';Object.assign(f.kit.flightModeState,{saved:'acro',active:'acro',pending:null})});
 await page.waitForFunction(()=>document.getElementById('pidFrame').contentDocument.getElementById('tpKitMode').textContent.includes('SYNC PENDING'));
 check((await sim.locator('#tpMode').inputValue())==='angle','Running virtual mode changed silently');
 await sim.locator('#tpStop').click();
 await page.waitForFunction(()=>document.getElementById('pidFrame').contentDocument.getElementById('tpMode').value==='acro');
 await sim.locator('#tpRun').click();
 await page.evaluate(()=>window.__statusFixture.kit.connected=false);
 await page.waitForFunction(()=>!window.ZebjusTraining.snapshot().armed,null,{timeout:5000});
 await page.evaluate(()=>window.__statusFixture.kit.connected=true);
 check(!(await page.evaluate(()=>window.ZebjusTraining.snapshot().armed)),'Telemetry restarted virtual motors');
 check((await page.evaluate(()=>window.__statusFixture.requests)).every(r=>r.method==='GET'),'Simulator wrote to hardware');
 check(errors.length===0,'Browser errors: '+errors.join(' | '));
 await page.screenshot({path:'test-output/authoritative-status-usb.png',fullPage:true});
 writeFileSync('test-output/authoritative-status-evidence.json',JSON.stringify({evidence,errors,physicalHardware:'NOT TESTED'},null,2));
 console.log('PASS authoritative status: AP/STA/relay/USB, auxiliaries, disarmed monitoring, USB simulator, pending mode, contrast and five viewports');
}catch(error){await page.screenshot({path:'test-output/authoritative-status-error.png',fullPage:true}).catch(()=>{});throw error}
finally{await browser.close()}
