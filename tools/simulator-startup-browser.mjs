// Browser startup failure/recovery, using a deliberately blocked iframe load.
// This verifies virtual controls only, never physical hardware acceptance.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('test-output/startup',{recursive:true});
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
await configureContext(context);
let held;
const match='**/tripod.html?embedded=1';
await context.route(match,route=>{held=route});
const page=await context.newPage();
try{
 await page.goto('http://127.0.0.1:8765/index.html#pid',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.ZebjusPairingBridge&&window.ZebjusTraining);
 await page.waitForFunction(()=>document.querySelector('.pid-load-status')?.textContent.includes('could not start'),null,{timeout:22000});
 assert.equal(await page.evaluate(()=>window.ZebjusTraining.isReady()),false);
 assert.equal((await page.evaluate(()=>window.ZebjusTraining.apply({}).accepted)),false);
 assert.ok(await page.locator('.pid-load-status button').isVisible());
 assert.ok((await page.locator('.pid-load-status button').boundingBox()).height>=44);
 await page.screenshot({path:'test-output/startup/timed-out.png'});
 await context.unroute(match);await held.abort();held=null;
 await page.locator('.pid-load-status button').click();
 await page.waitForFunction(()=>window.ZebjusTraining.isReady(),null,{timeout:30000});
 assert.equal(await page.locator('.pid-load-status').isHidden(),true);
 assert.equal(await page.locator('#pidFrame').evaluate(el=>el.inert),false);
 const sim=page.frameLocator('#pidFrame');
 await sim.locator('#tpRun').click();
 await page.waitForFunction(()=>window.ZebjusTraining.snapshot()?.armed===true);
 await sim.locator('#tpStop').click();
 await page.waitForFunction(()=>window.ZebjusTraining.snapshot()?.armed===false);
 await page.screenshot({path:'test-output/startup/recovered.png'});
 writeFileSync('test-output/startup/evidence.json',JSON.stringify({deadlineMs:15000,
  timeoutErrorVisible:true,explicitRetryRecovered:true,runStop:true,physicalHardware:'NOT TESTED'},null,2));
 console.log('PASS simulator startup: bounded timeout, visible reason, explicit Retry and functional Run/Stop');
}catch(error){await page.screenshot({path:'test-output/startup/error.png'}).catch(()=>{});throw error}
finally{if(held)await held.abort().catch(()=>{});await browser.close()}
