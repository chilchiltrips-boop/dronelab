import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('test-output/v2',{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
try{
 for(const width of [320,360,390,768,1024,1366,1920]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await configureContext(context);
  const page=await context.newPage();await page.goto('http://127.0.0.1:8765/#settings');
  await page.waitForFunction(()=>window.ZebjusKits);
  const metrics=await page.evaluate(()=>{
   const header=document.querySelector('.topbar'),nav=header.querySelector('.tabs');
   const boxes=[...nav.children].map(e=>e.getBoundingClientRect());
   return {height:header.getBoundingClientRect().height,width:innerWidth,scroll:document.documentElement.scrollWidth,navOverflow:nav.scrollWidth>nav.clientWidth+1,overlap:boxes.some((b,i)=>i&&b.left<boxes[i-1].right-1)};
  });results.push(metrics);
  await page.screenshot({path:`test-output/v2/header-${width}.png`});
  assert.ok(metrics.height<=82,JSON.stringify(metrics));assert.ok(metrics.scroll<=width,JSON.stringify(metrics));assert.equal(metrics.navOverflow,false,JSON.stringify(metrics));assert.equal(metrics.overlap,false);
  await page.locator('.v2-connection-details>summary').click();
  const pop=await page.locator('.v2-connection-popover').boundingBox();assert.ok(pop.x>=0&&pop.x+pop.width<=width+1);
  await page.locator('#kitTopNetworkSwitch').click();assert.equal(await page.locator('#kitTopNetworkSwitch').getAttribute('aria-checked'),'true');
  assert.equal(await page.locator('#kitTopControl').isDisabled(),true);
  assert.equal(await page.locator('#fwNetworkFlashBtn').isDisabled(),true,'Offline transport selection cannot enable OTA');
  await context.close();console.log('PASS V2 header',width,metrics.height);
 }
}finally{writeFileSync('test-output/v2/layout.json',JSON.stringify(results,null,2));await browser.close()}
