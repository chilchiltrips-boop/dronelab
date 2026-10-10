import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1440,height:920},serviceWorkers:'block'});
await configureContext(context);
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const text=async id=>page.locator('#'+id).textContent();
const until=(code,timeout=10000)=>page.waitForFunction(code,null,{timeout});
try{
 await page.goto('http://127.0.0.1:8765/tripod.html?standalone=1');
 await until(()=>document.querySelector('#tpSceneStatus')?.textContent!=='Preparing 3D…');
 const docText=await page.locator('body').textContent();
 if(/CONNECT USB SERIAL|STA MODE|AP MODE/.test(docText))throw Error('Hardware controls must not exist in Tripod page');
 if(await page.locator('.tp-orientation-hint,.tp-nose').count())throw Error('Remove floating direction text from scene');
 if((await page.locator('#tpCameraView option').count())<7)throw Error('Seven camera views including Follow Drone expected');
 await page.locator('#tpCameraView').selectOption('front');
 if(await page.locator('#tpCameraView').inputValue()!=='front')throw Error('Front view selection failed');
 await page.locator('#tpCameraView').selectOption('isometric');
 await page.locator('#tpRun').click();
 if(!(await page.locator('#tpStop').isEnabled()))throw Error('Virtual motor Run failed');
 await until(()=>/AUDIO ACTIVE|AUDIO UNAVAILABLE/.test(document.querySelector('#tpAudioStatus')?.textContent||''),7000);
 if(!(await text('tpAudioStatus')).includes('AUDIO ACTIVE'))throw Error('WebAudio gesture unlock failed');
 if((await text('tpSceneStatus')).startsWith('3D ACTIVE')){
   await until(()=>/ASSEMBLY LAB F450|MODEL FALLBACK/.test(document.querySelector('#tpSceneStatus')?.textContent||''),15000);
   if(!(await text('tpSceneStatus')).includes('ASSEMBLY LAB F450'))throw Error('Exact Assembly Lab F450 assets failed to load');
 }
 await page.locator('body').click({position:{x:30,y:170}});
 for(let i=0;i<3;i++)await page.keyboard.press('w');
 await until(()=>document.querySelector('#tpThrottleInput')?.textContent.includes('1075'));
 await page.locator('#tpMode').selectOption('acro');
 if(!(await text('tpReadoutMode')).includes('ACRO'))throw Error('ACRO mode not selected');
 // Reverse yaw at user input only; both keyboard and joystick must agree.
 await page.locator('body').click({position:{x:30,y:170}}); // blur the flight-mode select
 await page.keyboard.down('d');
 await until(()=>document.querySelector('#tpLeftReadout')?.textContent.includes('YAW -1.00'));
 await page.keyboard.up('d');
 await until(()=>document.querySelector('#tpLeftReadout')?.textContent.includes('YAW 0.00'));
 await page.keyboard.down('a');
 await until(()=>document.querySelector('#tpLeftReadout')?.textContent.includes('YAW 1.00'));
 await page.keyboard.up('a');
 await until(()=>document.querySelector('#tpLeftReadout')?.textContent.includes('YAW 0.00'));
 await page.locator('#tpLeftPad').scrollIntoViewIfNeeded();
 const yawPad=await page.locator('#tpLeftPad').boundingBox();
 await page.mouse.move(yawPad.x+yawPad.width*.5,yawPad.y+yawPad.height*.50);
 await page.mouse.down();await page.mouse.move(yawPad.x+yawPad.width*.82,yawPad.y+yawPad.height*.50);
 await until(()=>parseFloat(document.querySelector('#tpLeftReadout')?.textContent.slice(4))<-.5);
 await page.mouse.up();
 await until(()=>document.querySelector('#tpLeftReadout')?.textContent.includes('YAW 0.00'));
 const bounds=await page.locator('#tpRightPad').boundingBox();
 await page.mouse.move(bounds.x+bounds.width*.82,bounds.y+bounds.height*.5);
 await page.mouse.down();await page.waitForTimeout(150);await page.mouse.up();
 await until(()=>document.querySelector('#tpRightReadout')?.textContent.includes('R 0.00'));
 if(await page.locator('#tpPidMatrix .tp-pid-bank').count()!==5)throw Error('Expected exactly five PID banks');
 if(!(await page.locator('#tpAnglePidSection').isHidden()))throw Error('ACRO must hide Roll/Pitch outer PIDs');
 if(await page.locator('[data-pid-bank="angleYaw"]').count())throw Error('No Yaw angle PID is allowed');
 await page.locator('[data-pid-bank="rateYaw"] [data-gain="p"]').fill('3.75');
 await page.locator('[data-pid-bank="rateYaw"] button').click();
 if(!(await text('tpStatus')).includes('rateYaw'))throw Error('ANGLE Yaw rate PID did not apply');
 await page.locator('#tpPidAxis').selectOption('roll');await page.locator('#tpPidLoop').selectOption('rate');
 const throttleBefore=await text('tpThrottleReadout');
 await page.locator('#tpPidP').fill('1.25');await page.locator('#tpApplyPid').click();
 if(!(await text('tpStatus')).includes('PID APPLIED LIVE'))throw Error('Live Apply failed');
 if(await text('tpThrottleReadout')!==throttleBefore)throw Error('Live Apply reset virtual throttle');
 if(!(await page.locator('#tpStop').isEnabled()))throw Error('Live Apply disarmed motors');
 await page.locator('body').click({position:{x:30,y:170}});
 for(let i=0;i<10;i++)await page.keyboard.press('w');
 await until(()=>Number(document.querySelector('#tpThrottleReadout').textContent.split(' ')[0])>=1300);
 await page.locator('#tpTestResponse').click();
 await until(()=>document.querySelector('#tpStatus')?.textContent.includes('PID TEST'));
 await page.waitForTimeout(700);
 if(Number.parseFloat(await text('tpPeakRate'))<.01)throw Error('PID pulse failed to move physical model');
 await page.locator('#tpPreset').selectOption('highP');
 await until(()=>document.querySelector('#tpStatus')?.textContent.includes('PRESET APPLIED LIVE'));
 await page.locator('#tpTestResponse').click();
 await until(()=>document.querySelector('#tpStatus')?.textContent.includes('PID TEST'));
 await page.locator('#tpAbGain').selectOption('p');
 await page.locator('#tpAbLow').fill('.3');await page.locator('#tpAbHigh').fill('2.8');
 await page.locator('#tpCompare').click();
 await until(()=>document.querySelector('#tpCompareResult')?.textContent.includes('Peak rate'),15000);
 await page.locator('#tpChartAxis').selectOption('pidTerms');
 await page.locator('#tpPauseGraph').click();
 if(await text('tpPauseGraph')!=='Resume Graph')throw Error('Pause graph failed');
 await page.locator('#tpPauseGraph').click();
 await page.locator('#tpResetIntegrators').click();
 if(!(await text('tpStatus')).includes('INTEGRATORS RESET'))throw Error('PID reset failed');
 await page.locator('#tpCameraView').selectOption('follow');
 await page.locator('#tpSoundPreset').selectOption('quiet');
 await page.locator('#tpSound').click();
 if(await page.locator('#tpSound').getAttribute('aria-pressed')!=='false')throw Error('Mute failed');
 await page.locator('#tpSound').click();
 if(await page.locator('#tpSound').getAttribute('aria-pressed')!=='true')throw Error('Unmute failed');
 await page.locator('#tpMode').selectOption('acro');
 if(!(await page.locator('#tpAnglePidSection').isHidden()))throw Error('ACRO must hide outer Angle PID');
 await page.locator('[data-pid-bank="ratePitch"] [data-gain="p"]').fill('1.3');
 await page.locator('[data-pid-bank="ratePitch"] button').click();
 await page.locator('#tpMode').selectOption('angle');
 if(await page.locator('#tpAnglePidSection').isHidden())throw Error('ANGLE outer PID missing');
 if(Number(await page.locator('[data-pid-bank="ratePitch"] [data-gain="p"]').inputValue())!==1.3)throw Error('Rate PID must be shared across modes');
 await page.locator('#tpPidLoop').selectOption('angle');await page.locator('#tpCalibrate').click();
 await page.locator('#tpWind').fill('20');await page.locator('#tpWind').dispatchEvent('input');
 if(await text('tpWindOut')!=='20%')throw Error('Environment slider failed');
 await page.locator('#tpStop').click();
 if(!(await page.locator('#tpRun').isEnabled()))throw Error('Stop failed');
 if((await text('tpRoll'))!=='0.0°'||(await text('tpPitch'))!=='0.0°'||(await text('tpYaw'))!=='0.0°'||(await text('tpVerticalZ'))!=='0.00 cm')throw Error('STOP did not home roll/pitch/yaw/height');
 const motors=await page.locator('.tp-motor strong').allTextContents();
 if(motors.some(t=>t!=='0%'))throw Error('Motors did not stop');
 await page.screenshot({path:'test-output/flight-training-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'test-output/flight-training-mobile.png',fullPage:true});
 const layout=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
 if(layout.width>layout.viewport+2)throw Error('Mobile horizontal overflow '+JSON.stringify(layout));

 // Layout geometry contract across 7 wide, tablet and phone sizes.
 for(const [width,height] of [[1920,1080],[1440,900],[1100,800],[900,750],[768,850],[390,844],[320,740]]){
  await page.setViewportSize({width,height});
  const m=await page.evaluate(()=>{
   const r=s=>{const x=document.querySelector(s)?.getBoundingClientRect();return x&&{left:x.left,right:x.right,top:x.top,bottom:x.bottom,width:x.width,height:x.height}};
   return {scroll:document.documentElement.scrollWidth,view:r('.tp-view-panel'),sticks:r('.tp-sticks'),vertical:r('.tp-vertical'),pid:r('.tp-pid-panel'),telemetry:r('.tp-telemetry'),env:r('.tp-env-panel'),ab:r('.tp-ab-compare'),rate:r('#tpRatePidSection'),angle:r('#tpAnglePidSection'),left:r('#tpLeftPad'),right:r('#tpRightPad')}
  });
  if(m.scroll>width+2)throw Error('Responsive PID page overflow '+JSON.stringify({width,m}));
  const {view,sticks,vertical,pid,telemetry,env,ab,rate,angle,left,right}=m;
  if([view,sticks,vertical,pid,telemetry,env,ab,rate,angle,left,right].some(x=>!x||x.width<50))throw Error('PID section clipped or missing '+JSON.stringify({width,m}));
  if(width>1050){
   if(Math.abs(view.top-sticks.top)>8||pid.top<view.bottom-8||pid.top<vertical.bottom-8||
     pid.left>view.left+5||pid.right<sticks.right-5||telemetry.top<pid.bottom-8||
     Math.abs(telemetry.top-env.top)>8||ab.top<env.bottom-8||ab.left<telemetry.right-8)
    throw Error('Desktop PID workbench misplaced '+JSON.stringify({width,m}));
  }else{
   if(sticks.top<view.bottom-8||vertical.top<sticks.bottom-8||pid.top<vertical.bottom-8||
     telemetry.top<pid.bottom-8||env.top<telemetry.bottom-8||ab.top<env.bottom-8)
    throw Error('Mobile sections overlap '+JSON.stringify({width,m}));
  }
  if(angle.width<width*.20||rate.width<width*.20)throw Error('PID editor compressed '+JSON.stringify({width,m}));
  if([1920,900,390].includes(width))await page.screenshot({path:`test-output/pid-full-width-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.locator('[data-pid-bank="rateRoll"] [data-gain="p"]').fill('1.15');
 await page.locator('[data-pid-bank="rateRoll"] button').click();
 if(!(await text('tpStatus')).includes('PID APPLIED LIVE'))throw Error('Reflow broke PID Apply');
 await page.locator('#tpAbGain').selectOption('i');
 if(await page.locator('#tpAbGain').inputValue()!=='i')throw Error('Reflow broke A/B');
 if(errors.length)throw Error('Page errors: '+errors.join(' | '));
 console.log('PASS V1.5.2 Tripod: Assembly GLBs, ACRO/ANGLE, live Apply, A/B, PID pulse, camera follow, audio, mobile and safe Stop');
}catch(e){console.error(e.stack||e);await page.screenshot({path:'test-output/flight-training-error.png',fullPage:true}).catch(()=>{});process.exitCode=1}
finally{await browser.close()}
