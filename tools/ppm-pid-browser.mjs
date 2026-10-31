// Production Live Inputs -> shared store -> embedded PID, with explicitly
// simulated verified Kit replies. This is browser integration, not a radio test.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('test-output',{recursive:true});
// Keep the real input watchdog and physics, while isolating transport/state
// assertions from slow CI software WebGL. Graphics suites cover the 3D renderer.
const browser=await chromium.launch({...browserOptions,args:[...browserOptions.args,'--disable-webgl']}),evidence=[];
const check=(ok,message)=>{if(!ok)throw Error(message)};
try{
 for(const [board,transport] of [['A2','sta'],['A1','sta'],['A2','ap'],['A2','usb']]){
  const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
  await configureContext(context);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.stack||e.message));
  try{
   await page.goto('http://127.0.0.1:8765/index.html#pid');
   await page.waitForFunction(()=>window.ZebjusTraining?.isReady?.()&&window.ZebjusKits&&window.ZebjusKitData,null,{timeout:30000});
   await page.evaluate(({board,transport})=>{
    const kitId='ZFC-'+board+'-012345ABCDEF';
    const mode={supported:true,stabilizationSupported:false,saved:'angle',active:'angle',pending:null};
    const kit={kitId,kitName:'PPM fixture '+board,board:'ZFC-'+board,version:'1.5.10',bootId:'boot-1',connected:true,
     transport,physicalLink:transport,flightMode:'angle',flightModeState:mode,owner:false,
     motorsDisabled:true,motorsArmed:false,working:false,usbAvailable:transport==='usb'};
    const f=window.__ppmFixture={kit,seq:0,present:true,delay:false,requests:[],
     values:{throttle:1000,roll:1650,pitch:1400,yaw:1550}};
    const rc=()=>({kitId,seq:++f.seq,accepted:f.seq,source:f.present?'PPM':'NONE',transport:'PPM',ownerId:'PPM',
     active:f.present,inputValid:f.present,failsafe:!f.present,ageMs:0,inputArmed:false,
     motorsDisabled:true,motorsArmed:false,ch5:1000,ch6:1500,...f.values,
     channels:f.present?[f.values.roll,f.values.pitch,f.values.throttle,f.values.yaw,1000,1500,1500,1500]:null});
    window.ZebjusKits.getState=()=>({...kit,heartbeatAt:Date.now()});
    window.ZebjusKits.getMonitorPaths=()=>kit.connected?[{kitId,transport,verified:true,available:true,fresh:true,permitted:true,lastPacketAt:Date.now()}]:[];
    window.ZebjusKits.request=async(path,method='GET')=>{
     f.requests.push({path,method});
     if(path!=='/api/rc/snapshot'||method!=='GET')throw Error('Unexpected Kit write or route '+method+' '+path);
     if(f.delay)throw Error('Simulated temporary telemetry delay');
     return rc();
    };
    if(transport==='usb')setInterval(()=>{
     if(kit.connected&&!f.delay)window.dispatchEvent(new CustomEvent('dronelab:serial-line',{
      detail:{transport:'usb',line:'ZJSTATE,1,'+JSON.stringify({kitId,flightModeState:mode,ledOn:false,rc:rc()})}}));
    },80);
   },{board,transport});
   const sim=page.frameLocator('#pidFrame');
   await sim.locator('#tpFallback').waitFor({state:'visible'});
   await page.waitForFunction(()=>window.ZebjusTraining.snapshot().activeSource==='ppm'&&window.ZebjusTraining.snapshot().input?.fresh);
   // The receiver snapshot updates before the iframe's scheduled UI render.
   // Require the displayed transport too, without racing that animation frame.
   await sim.locator('#tpSourceState').filter({hasText:'PPM '+transport.toUpperCase()}).waitFor({state:'visible',timeout:5000});
   check(await page.evaluate(()=>window.ZebjusKits.getState().owner===false),'No WebApp hardware ownership is required');
   await sim.locator('#tpInputSource').selectOption('ppm');
   await page.waitForFunction(()=>window.ZebjusTraining.snapshot().previewAxes.roll===.3);
   check(!(await page.evaluate(()=>window.ZebjusTraining.snapshot().armed)),'PPM arrival must only preview');
   // High throttle is rejected by the actual Run button; low throttle starts.
   await page.evaluate(()=>window.__ppmFixture.values.throttle=1400);
   await page.waitForFunction(()=>window.ZebjusTraining.snapshot().input?.channels.throttle===1400);
   await sim.locator('#tpRun').click();
   check(!(await page.evaluate(()=>window.ZebjusTraining.snapshot().armed)),'High throttle must reject Run');
   check((await sim.locator('#tpStatus').textContent()).includes('LOWER THROTTLE'),'Run rejection must explain why');
   await page.evaluate(()=>window.__ppmFixture.values.throttle=1000);
   await page.waitForFunction(()=>window.ZebjusTraining.snapshot().input?.channels.throttle===1000);
   await sim.locator('#tpRun').click();
   await page.waitForFunction(()=>window.ZebjusTraining.snapshot().armed);
   await page.evaluate(()=>Object.assign(window.__ppmFixture.values,{throttle:1700,roll:1800,pitch:1250,yaw:1700}));
   await page.waitForFunction(()=>{
    const s=window.ZebjusTraining.snapshot();return s.armed&&s.throttle===1700&&s.axes.roll===.6&&s.axes.pitch===-.5&&s.axes.yaw===.4&&s.motors.rpm.some(n=>n>0);
   });
   // Mode and live PID edits remain virtual while physical PPM owns the Kit.
   await sim.locator('#tpMode').selectOption('acro');
   await sim.getByRole('spinbutton',{name:'RATE Roll P',exact:true}).fill('1.15');
   await sim.getByRole('button',{name:'Apply RATE Roll PID',exact:true}).click();
   await page.waitForFunction(()=>{
    const c=window.ZebjusTraining.diagnostics().physics.controllers.rateRoll;
    return Math.abs(c.error)>.01&&Math.abs(c.p-1.15*c.error)<.0001;
   });
   check(await page.evaluate(()=>window.ZebjusTraining.snapshot().armed&&window.ZebjusTraining.snapshot().throttle===1700),'PID edit must preserve virtual Run and throttle');
   await page.screenshot({path:'test-output/ppm-pid-'+board+'-'+transport+'.png',fullPage:true});
   await sim.locator('#tpStop').click();
   await page.waitForFunction(()=>!window.ZebjusTraining.snapshot().armed);
   await page.waitForTimeout(250);
   check(!(await page.evaluate(()=>window.ZebjusTraining.snapshot().armed)),'Fresh PPM cannot undo explicit Stop');
   await page.evaluate(()=>window.__ppmFixture.values.throttle=1000);
   await page.waitForFunction(()=>window.ZebjusTraining.snapshot().input?.channels.throttle===1000);
   await sim.locator('#tpRun').click();
   await page.waitForFunction(()=>window.ZebjusTraining.snapshot().armed);
   await page.evaluate(()=>window.__ppmFixture.present=false);
   await page.waitForFunction(()=>!window.ZebjusTraining.snapshot().armed);
   check(await page.evaluate(()=>window.ZebjusTraining.snapshot().throttle===1000),'Receiver loss must neutralize the virtual plant');
   await page.evaluate(()=>window.__ppmFixture.present=true);
   await page.waitForFunction(()=>window.ZebjusTraining.snapshot().input?.fresh);
   check(!(await page.evaluate(()=>window.ZebjusTraining.snapshot().armed)),'Reacquisition needs explicit Run');
   await sim.locator('#tpRun').click();
   await page.waitForFunction(()=>window.ZebjusTraining.snapshot().armed);
   await page.evaluate(()=>window.__ppmFixture.delay=true);
   await page.waitForFunction(()=>!window.ZebjusTraining.snapshot().armed,null,{timeout:6000});
   check(await page.evaluate(()=>window.ZebjusTraining.snapshot().throttle===1000),'Polling loss cannot hold PPM throttle indefinitely');
   const result=await page.evaluate(()=>({requests:window.__ppmFixture.requests,hardwareInput:window.ZebjusTraining.hardwareInput(),reason:window.ZebjusTraining.snapshot().lastStopReason}));
   check(result.hardwareInput===null,'Simulator cannot expose a hardware output interface');
   check(result.requests.every(r=>r.path==='/api/rc/snapshot'&&r.method==='GET'),'PPM simulator must issue only read-only snapshots');
   check(errors.length===0,'Browser errors: '+errors.join(' | '));
   evidence.push({board,transport,requests:result.requests.length,hardwareWrites:0,lastStop:result.reason,errors});
   console.log('PASS '+board+' PPM '+transport+': Auto/explicit source, low-throttle Run, TRPY, live PID, Stop, receiver/poll loss and no Kit writes');
  }catch(error){await page.screenshot({path:'test-output/ppm-pid-'+board+'-'+transport+'-error.png',fullPage:true}).catch(()=>{});throw error}
  finally{await context.close()}
 }
 writeFileSync('test-output/ppm-pid-evidence.json',JSON.stringify({environment:'Chromium, simulated verified Kit replies; physical receiver validation still required',cases:evidence},null,2));
}catch(error){console.error(error.stack||error);process.exitCode=1}
finally{await browser.close()}
