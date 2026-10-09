// Browser-only end-to-end Tripod page test: real controller/DOM and WebGL if available.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1450,height:920},serviceWorkers:'block'});await configureContext(context);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8765/tripod.html');
 await page.locator('#tpSceneStatus').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#tpSceneStatus')?.textContent!=='Preparing 3D…');
 const text=await page.locator('body').textContent();
 if(/PAIR MOBILE|CONNECT USB SERIAL|STA MODE|AP MODE/.test(text))throw Error('Hardware/network controls leaked into Tripod page');
 const nav=await page.locator('a[href="./index.html#python"]').count();
 if(nav!==1)throw Error('Missing navigation back to Python Lab');
 if(!(await page.locator('#tpRun').isEnabled()))throw Error('Run not enabled at safe throttle');
 await page.locator('#tpRun').click();
 if(!(await page.locator('#tpStop').isEnabled()))throw Error('Virtual motor run failed');
 await page.locator('body').click({position:{x:30,y:160}});
 await page.keyboard.press('w');await page.keyboard.press('w');await page.keyboard.press('w');
 if(!(await page.locator('#tpThrottleInput').textContent()).includes('1075'))throw Error('Throttle W key does not hold value');
 await page.locator('#tpMode').selectOption('acro');
 if(!((await page.locator('#tpReadoutMode').textContent())||'').includes('ACRO'))throw Error('ACRO mode not selected');
 const right=await page.locator('#tpRightPad').boundingBox();
 await page.mouse.move(right.x+right.width*.82,right.y+right.height*.5);
 await page.mouse.down();await page.waitForTimeout(300);await page.mouse.up();
 await page.waitForTimeout(150);
 if(!((await page.locator('#tpRightReadout').textContent())||'').includes('R 0.00'))throw Error('Right stick failed to recenter');
 await page.locator('#tpPidAxis').selectOption('roll');await page.locator('#tpPidLoop').selectOption('rate');
 await page.locator('#tpPidP').fill('1.25');await page.locator('#tpApplyPid').click();
 if(!((await page.locator('#tpStatus').textContent())||'').includes('PID APPLIED'))throw Error('PID update failed');
 await page.locator('#tpMode').selectOption('angle');
 await page.locator('#tpPidLoop').selectOption('angle');await page.locator('#tpCalibrate').click();
 await page.locator('#tpWind').fill('20');await page.locator('#tpWind').dispatchEvent('input');
 if((await page.locator('#tpWindOut').textContent())!=='20%')throw Error('Environment slider output not synchronized');
 await page.locator('#tpStop').click();if(!(await page.locator('#tpRun').isEnabled()))throw Error('Stop did not disarm');
 const motors=await page.locator('.tp-motor strong').allTextContents();if(motors.some(t=>t!=='0%'))throw Error('Motor output remains after Stop');
 await page.screenshot({path:'test-output/tripod-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-output/tripod-mobile.png',fullPage:true});
 const metrics=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,heading:document.querySelector('h1')?.textContent}));
 if(metrics.width>metrics.viewport+2)throw Error('Tripod layout has horizontal overflow: '+JSON.stringify(metrics));
 if(errors.length)throw Error('Uncaught page errors: '+errors.join(' | '));
 console.log('PASS Tripod page: real page, local controls, mode change, keyboard throttle, joysticks, virtual PID, motor Stop, desktop/mobile, no hardware controls');
}catch(e){console.error(e.stack||e);await page.screenshot({path:'test-output/tripod-error.png',fullPage:true}).catch(()=>{});process.exitCode=1}
finally{await browser.close()}
