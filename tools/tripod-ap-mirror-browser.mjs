// End-to-end test: authenticated Kit read-only Android RC -> existing Live Inputs monitor
// -> same-origin parent store -> embedded PID simulator. Never writes to a Kit.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('test-output',{recursive:true});
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
await configureContext(context);
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));
const check=(ok,message)=>{if(!ok)throw Error(message)};
try{
 await page.goto('http://127.0.0.1:8765/index.html#pid');
 await page.waitForFunction(()=>window.ZebjusKits&&window.ZebjusKitData&&window.ZebjusTraining?.isReady?.(),null,{timeout:30000});
 await page.evaluate(()=>{
  const kit={connected:true,transport:'ap',kitId:'TEST-VERIFIED-A2',kitName:'Test verified AP',bootId:'boot-1',
    working:false,otaInProgress:false,apActive:true,motorsArmed:false};
  window.__pidTest={kit,channels:{throttle:1000,roll:1500,pitch:1500,yaw:1500},seq:0,requests:[]};
  window.ZebjusKits.getState=()=>({...kit});
  window.ZebjusKits.getMonitorPaths=()=>kit.connected?[{kitId:kit.kitId,transport:'ap',
    verified:true,available:true,fresh:true}]:[];
  window.ZebjusKits.request=async(path,method='GET')=>{
   window.__pidTest.requests.push({path,method});
   if(path!=='/api/rc/snapshot'||method!=='GET')throw Error('Unexpected hardware request '+method+' '+path);
   if(!kit.connected)throw Error('Kit link lost');
   const s=window.__pidTest;return {kitId:kit.kitId,source:'ANDROID',transport:'ap',
    seq:++s.seq,active:true,inputValid:true,failsafe:false,inputArmed:true,ageMs:15,
    ...s.channels,__observedAt:Date.now()};
  };
 });
 await page.waitForFunction(()=>window.ZebjusSimulatorInputs?.snapshot().kit?.fresh===true,null,{timeout:15000});
 const iframe=page.frameLocator('#pidFrame');
 await page.waitForFunction(()=>window.ZebjusTraining.snapshot()?.activeSource==='android');
 check((await iframe.locator('#tpSourceState').textContent()).includes('Android AP'),'AP source label missing');
 check((await iframe.locator('#tpInputStatus').textContent()).includes('VERIFIED KIT RC'),'Source should say Kit RC not WebRTC');
 check(!(await page.evaluate(()=>window.ZebjusSimulatorInputs.snapshot().peer.approved)),'Kit path must not claim WebRTC pairing');
 check((await iframe.locator('#tpCameraView').inputValue())==='back','Initial view should face opposite direction');
 await iframe.locator('#tpRun').click();
 try{await page.waitForFunction(()=>window.ZebjusTraining.snapshot()?.armed===true,null,{timeout:7000})}
 catch(error){
  const debug=await page.evaluate(()=>({
   topTab:document.querySelector('#tab-pid')?.className,
   status:document.querySelector('#pidFrame')?.contentWindow?.document?.getElementById('tpStatus')?.textContent,
   sourceState:document.querySelector('#pidFrame')?.contentWindow?.document?.getElementById('tpSourceState')?.textContent,
   inputStatus:document.querySelector('#pidFrame')?.contentWindow?.document?.getElementById('tpInputStatus')?.textContent,
   simulator:window.ZebjusTraining?.snapshot(),kitMirror:window.ZebjusSimulatorInputs?.snapshot().kit,
   kitRequests:window.__pidTest?.requests?.slice(-8)
  }));
  throw Error('AP Run did not stay active: '+JSON.stringify(debug)+' • '+error.message);
 }
 check(await iframe.locator('#tpInputSource').isDisabled(),'Source must lock during Run');
 await page.evaluate(()=>Object.assign(window.__pidTest.channels,{throttle:1350,roll:1800,pitch:1250,yaw:1700}));
 await page.waitForFunction(()=>{
   const s=window.ZebjusTraining.snapshot();return s?.armed&&s.throttle===1350&&s.axes.roll>.5&&s.axes.pitch<-.4&&s.axes.yaw>.3;
 },null,{timeout:12000});
 const active=await page.evaluate(()=>window.ZebjusTraining.snapshot());
 check(active.motors.rpm.some(n=>n>0),'Mirrored AP joystick should drive virtual motor response');
 await page.screenshot({path:'test-output/pid-ap-mirror-running.png',fullPage:true});
 await iframe.locator('#tpStop').click();
 await page.waitForFunction(()=>window.ZebjusTraining.snapshot()?.armed===false);
 await page.waitForTimeout(450);
 check(!(await page.evaluate(()=>window.ZebjusTraining.snapshot().armed)),'Incoming data must not auto-run after Stop');
 await page.evaluate(()=>Object.assign(window.__pidTest.channels,{throttle:1000,roll:1500,pitch:1500,yaw:1500}));
 await iframe.locator('#tpRun').click();
 await page.waitForFunction(()=>window.ZebjusTraining.snapshot()?.armed===true);
 await page.evaluate(()=>{window.__pidTest.kit.connected=false});
 await page.waitForFunction(()=>window.ZebjusTraining.snapshot()?.armed===false,null,{timeout:8000});
 const evidence=await page.evaluate(()=>({
  requests:window.__pidTest.requests,sim:window.ZebjusTraining.snapshot(),
  hardwareInput:window.ZebjusTraining.hardwareInput()
 }));
 check(evidence.hardwareInput===null,'PID simulator must have no hardware output interface');
 check(evidence.requests.length>2&&evidence.requests.every(r=>r.path==='/api/rc/snapshot'&&r.method==='GET'),
  'Only authenticated diagnostic GET is allowed: '+JSON.stringify(evidence.requests));
 check(!errors.length,'Browser errors: '+errors.join(' | '));
 writeFileSync('test-output/pid-ap-mirror-evidence.json',JSON.stringify({
  requests:evidence.requests.length,lastVirtualStatus:evidence.sim.reason,
  hardwareWrites:0,errors,environment:'Mocked verified Kit read-only RC, Chromium; physical AP validation still required'},null,2));
 console.log('PASS verified AP Android RC -> live monitor -> embedded PID: source, Run, TRPY, Stop, input-loss safe stop, no hardware writes');
}catch(e){
 console.error(e.stack||e);
 await page.screenshot({path:'test-output/pid-ap-mirror-error.png',fullPage:true}).catch(()=>{});
 process.exitCode=1;
}finally{await browser.close()}
