// Focused responsive, access and simulator-only regression for the compact PID toolbar.
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {browserOptions,configureContext} from './browser-harness.mjs';

mkdirSync('test-output',{recursive:true});
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
await configureContext(context);
const page=await context.newPage(),errors=[],hardwareWrites=[],measurements=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));
page.on('request',request=>{if(!['GET','HEAD'].includes(request.method()))hardwareWrites.push({method:request.method(),url:request.url()})});
const check=(condition,message)=>{if(!condition)throw Error(message)};
const visible=selector=>page.locator(selector).isVisible();
try{
 await page.goto('http://127.0.0.1:8765/tripod.html?standalone=1');
 await page.waitForFunction(()=>window.ZebjusTraining&&document.querySelector('#tpSourceState')?.textContent.includes('READY'));
 check(await page.locator('.tp-compact-heading .badge').count()===1,'SIM ONLY must be the only heading badge');
 check((await page.locator('.tp-compact-heading h1').textContent()).includes('PID Tuning'),'Title missing');
 check(!(await page.locator('body').textContent()).includes('FLIGHT CONTROL • INTERACTIVE TRAINING'),'Old eyebrow remains');
 check(await page.locator('#tpInputValues').evaluate(e=>!!e.closest('.tp-sticks .panel-title')),'TRPY not in joystick header');
 check(/T \d+ • R \d+ • P \d+ • Y \d+ µs/.test(await page.locator('#tpInputValues').textContent()),'Raw TRPY values or units missing');
 for(const [width,height] of [[1920,1080],[1440,900],[1366,900],[1024,800],[768,900],[390,844],[320,740]]){
  await page.setViewportSize({width,height});
  const data=await page.evaluate(()=>{
   const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}};
   return {scrollWidth:document.documentElement.scrollWidth,strip:rect('.tp-cockpit-row'),main:rect('.tp-main-grid'),heading:rect('.tp-compact-heading'),toolbar:rect('.tp-compact-controls'),help:rect('.tp-help-menu>summary'),
    targets:['#tpInputSource','#tpMode','#tpRun','#tpStop','#tpTestResponse','.tp-tools-menu>summary','.tp-sound-menu>summary','.tp-help-menu>summary'].map(rect)};
  });
  check(data.scrollWidth<=width+2,'Horizontal overflow at '+width+': '+JSON.stringify(data));
  if(width>=1366){
    check(Math.abs(data.heading.top-data.toolbar.top)<4&&Math.abs(data.heading.top-data.help.top)<4,'Desktop heading, controls and Help must share one horizontal row at '+width+': '+JSON.stringify(data));
    check(data.strip.height<=80,'Single-row desktop cockpit too tall at '+width+': '+JSON.stringify(data));
   }
   if(width>=1024)check(data.strip.height<=130,'Desktop cockpit exceeds 130px at '+width+': '+JSON.stringify(data));
   check(data.main.top-data.strip.bottom<=20,'Unexpected gap below controls at '+width+': '+JSON.stringify(data));
  for(const r of data.targets)check(r.width>=44&&r.height>=44&&r.left>=-1&&r.right<=width+1,'Touch target clipped/small at '+width+': '+JSON.stringify(r));
  measurements.push({width,topHeight:Math.round(data.strip.height),gapToScene:Math.round(data.main.top-data.strip.bottom),oneRow:Math.abs(data.heading.top-data.toolbar.top)<4,overflow:data.scrollWidth-width,minTouchHeight:Math.min(...data.targets.map(t=>t.height))});
  if(width===1366)await page.screenshot({path:'test-output/pid-single-row-desktop-1366.png',fullPage:true});
  if(width===390)await page.screenshot({path:'test-output/pid-single-row-mobile-390.png',fullPage:true});
  if(width===320)await page.screenshot({path:'test-output/pid-single-row-mobile-320.png',fullPage:true});
 }
 await page.setViewportSize({width:1366,height:900});
 await page.locator('.tp-help-menu>summary').focus();
 await page.keyboard.press('Enter');
 check(await visible('.tp-help-panel'),'Help should open by keyboard');
 check((await page.locator('.tp-help-panel').textContent()).includes('250 Hz'),'Physics detail missing from Help');
 await page.keyboard.press('Escape');
 check(!(await visible('.tp-help-panel')),'Escape did not close Help');
 check(await page.locator('.tp-help-menu>summary').evaluate(e=>document.activeElement===e),'Help focus lost on Escape');
 await page.locator('#tpInputSource').selectOption('android');
 await page.waitForFunction(()=>document.querySelector('#tpSourceState').textContent.includes('Android AP'));
 check((await page.locator('#tpSourceState').textContent()).includes('STALE'),'Disconnected Android input should show STALE');
 await page.locator('#tpInputSource').selectOption('web');
 await page.waitForFunction(()=>document.querySelector('#tpSourceState').textContent.includes('WebApp'));
 await page.locator('#tpMode').selectOption('acro');
 await page.locator('#tpRun').click();
 await page.waitForFunction(()=>window.ZebjusTraining.snapshot().armed);
 check(!(await page.locator('#tpInputSource').isEnabled()),'Source choice must lock during Run');
 check((await page.locator('#tpSourceState').textContent()).includes('RUNNING'),'Running source state missing');
 await page.locator('#tpTestResponse').click();
 await page.waitForFunction(()=>document.querySelector('#tpStatus').textContent.includes('PID TEST'));
 await page.locator('.tp-tools-menu>summary').click();
 await page.locator('#tpCalibrate').click();
 check((await page.locator('#tpStatus').textContent()).includes('LEVEL TRIM SAVED'),'Calibration handler missing');
 await page.locator('#tpTilt').click();
 check((await page.locator('#tpTilt').getAttribute('aria-pressed'))==='true','Tilt toggle not enabled');
 check((await page.locator('#tpTilt').textContent())==='Tilt: On','Tilt short label not retained');
 await page.locator('#tpReset').click();
 check(await page.locator('#tpRun').isEnabled(),'Reset failed to stop virtual simulator');
 check(!(await page.evaluate(()=>window.ZebjusTraining.snapshot().armed)),'Reset did not disarm virtual motors');
 await page.locator('.tp-sound-menu>summary').click();
 await page.locator('#tpSoundPreset').selectOption('detailed');
 await page.locator('#tpVolume').fill('40');await page.locator('#tpVolume').dispatchEvent('input');
 check((await page.locator('#tpVolumeOut').textContent())==='40%','Volume percentage not synchronized');
 await page.locator('#tpSound').click();
 check((await page.locator('#tpSound').textContent())==='Sound Off','Mute text did not update');
 check((await page.locator('.tp-sound-menu>summary').getAttribute('aria-label')).includes('off'),'Speaker accessibility label not updated');
 await page.locator('#tpSound').click();
 check((await page.locator('#tpSound').textContent())==='Sound On','Unmute text did not update');
 await page.locator('.tp-sound-menu>summary').click();
 await page.locator('#tpRun').click();
 await page.waitForFunction(()=>window.ZebjusTraining.snapshot().armed);
 await page.locator('#tpStop').click();
 check(await page.locator('#tpRun').isEnabled(),'Stop failed to resume Run availability');
 check(await page.evaluate(()=>window.ZebjusTraining.hardwareInput()===null),'Simulator hardwareInput must remain null');
 check(hardwareWrites.length===0,'Simulator triggered network writes: '+JSON.stringify(hardwareWrites));
 check(errors.length===0,'Browser errors: '+errors.join(' | '));
 writeFileSync('test-output/pid-compact-evidence.json',JSON.stringify({measurements,hardwareWrites,errors,environment:'Playwright Chromium; not physical drone or phone hardware'},null,2));
 console.log('PASS compact PID toolbar: '+JSON.stringify(measurements)+'; menus, source, run/stop/reset, audio and no hardware writes');
}catch(e){
 console.error(e.stack||e);
 await page.screenshot({path:'test-output/pid-compact-error.png',fullPage:true}).catch(()=>{});
 process.exitCode=1;
}finally{await browser.close()}
