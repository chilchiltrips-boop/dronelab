// Actual renderer/audio state, bounded effects, teardown and forced WebGL fallback.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('test-output',{recursive:true});
const browser=await chromium.launch(browserOptions),context=await browser.newContext({viewport:{width:1440,height:920},serviceWorkers:'block'});
await configureContext(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const wait=fn=>page.waitForFunction(fn),diagnostics=()=>page.evaluate(()=>window.ZebjusTraining.diagnostics());
try{
 await page.goto('http://127.0.0.1:8765/tripod.html?standalone=1');
 await page.waitForFunction(()=>document.getElementById('tpSceneStatus').textContent.includes('ASSEMBLY LAB F450'),null,{timeout:30000});
 const quiet=await diagnostics();if(quiet.audio.profile!=='quiet'||quiet.audio.volume!==.25||quiet.audio.voices!==0)throw Error('Quiet default / gesture-only audio failed');
 await page.locator('#tpRun').click();await page.locator('body').click({position:{x:20,y:180}});for(let n=0;n<24;n++)await page.keyboard.press('w');
 await wait(()=>window.ZebjusTraining.snapshot().vertical.z>.015);
 const active=await diagnostics();
 if(active.physics.motorRPM.some(v=>v<2000)||active.audio.voices!==4||!active.audio.running||active.scene.wash.some(v=>v<=0))throw Error('Actual motor effects/audio missing');
 if(Math.abs(active.scene.pivotY-(3.48+active.physics.vertical.z*7))>.04)throw Error('Mast does not follow measured constrained travel');
 await page.screenshot({path:'test-output/flight-thrust-active.png',fullPage:true});
 await page.locator('#tpEffects').selectOption('off');await wait(()=>window.ZebjusTraining.diagnostics().scene.wash.every(v=>v===0));
 await page.locator('#tpEffects').selectOption('soft');await wait(()=>window.ZebjusTraining.diagnostics().scene.wash.every(v=>v>0));
 await page.locator('#tpQuality').selectOption('low');await wait(()=>window.ZebjusTraining.diagnostics().scene.quality==='low');
 const low=await diagnostics();
 const performanceTrace=await page.evaluate(async()=>{
  const times=[];let last=performance.now();for(let n=0;n<120;n++)await new Promise(resolve=>requestAnimationFrame(now=>{times.push(now-last);last=now;resolve()}));
  times.sort((a,b)=>a-b);return {sampleCount:times.length,p50FrameMs:times[60],p95FrameMs:times[114],longestFrameMs:times.at(-1),heapBytes:performance.memory?.usedJSHeapSize??null};
 });
 await page.locator('#topPairMobileBtn').click();await page.locator('#connectionStop').click();await page.locator('#connectionClose').click();
 await wait(()=>!window.ZebjusTraining.snapshot().armed&&window.ZebjusTraining.diagnostics().audio.voices===0&&window.ZebjusTraining.diagnostics().scene.wash.every(v=>v===0));
 await page.waitForTimeout(220);const stopped=await diagnostics();
 await page.locator('#tpVolume').fill('30');await page.locator('#tpVolume').dispatchEvent('input');await page.locator('#tpSound').click();
 await page.reload();await wait(()=>window.ZebjusTraining);const persisted=await diagnostics();
 if(persisted.audio.enabled||persisted.audio.volume!==.3||persisted.audio.voices!==0)throw Error('Mute/volume persistence failed');
 await page.waitForFunction(()=>document.getElementById('tpSceneStatus').textContent.includes('ASSEMBLY LAB F450'),null,{timeout:30000});
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await page.waitForTimeout(200);const disposed=await diagnostics();
 if(disposed.audio.voices!==0||disposed.physics.running||await page.locator('#tpStage canvas:not(#tpFallback)').count())throw Error('Page teardown left resources/motors active');
 const fallback=await context.newPage();fallback.on('pageerror',e=>errors.push(e.message));
 await fallback.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/i.test(type)?null:get.call(this,type,...args)}});
 await fallback.goto('http://127.0.0.1:8765/tripod.html?standalone=1');await fallback.waitForFunction(()=>document.getElementById('tpSceneStatus').textContent==='2D FALLBACK');
 await fallback.locator('#tpRun').click();await fallback.locator('body').click({position:{x:20,y:180}});await fallback.keyboard.press('w');
 await fallback.waitForFunction(()=>window.ZebjusTraining.snapshot().armed&&window.ZebjusTraining.snapshot().throttle===1025);
 await fallback.locator('#tpStop').click();await fallback.waitForFunction(()=>!window.ZebjusTraining.snapshot().armed);
 await fallback.screenshot({path:'test-output/flight-2d-fallback.png',fullPage:true});
 if(errors.length)throw Error(errors.join(' | '));
 writeFileSync('test-output/render-audio-evidence.json',JSON.stringify({environment:'Headless Chromium, software GPU; not phone or acoustic measurements',quiet,active,low,performanceTrace,stopped,persisted,disposed,forcedFallback:true,errors},null,2));
 console.log('PASS measured thrust/mast, individual effects, low quality, quiet audio/STOP/persistence/disposal and actual forced WebGL 2D fallback');
}catch(e){console.error(e.stack||e);await page.screenshot({path:'test-output/flight-quality-error.png',fullPage:true}).catch(()=>{});process.exitCode=1}finally{await browser.close()}
