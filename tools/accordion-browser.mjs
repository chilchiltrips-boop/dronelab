/* Chromium regression: real native <details> state and visibility after
 * the unified Devices workspace moves existing controls into tab panels.
 * No physical USB/device and no real cloud credentials are needed.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {browserOptions,configureContext} from './browser-harness.mjs';

mkdirSync('test-output/accordion',{recursive:true});
const browser=await chromium.launch(browserOptions);
try{
 for(const [width,cloudOnline] of [[1366,false],[390,true]]){
  const ctx=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block',reducedMotion:'reduce'});
  await configureContext(ctx);
  if(cloudOnline){
   // A configured remote admin server may be online while no staff user is
   // logged in. That must NOT hide the independent physical USB controls.
   await ctx.route('**/api/admin/session',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({available:true,user:null})
   }));
  }
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto('http://127.0.0.1:8765/index.html#firmware',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#app')?.dataset.ready==='true'&&
    document.querySelector('#devicesWorkspace')?.dataset.ready==='true',null,{timeout:30000});
   await page.locator('[data-tab="firmware"]').click();
   assert.equal(await page.locator('#dw-panel-overview').isVisible(),true);
   // Kit Connection: the relocated legacy Advanced is one disclosure only.
   await page.locator('[data-dw-view="connection"]').click();
   const outer=page.locator('#dwLegacyConnection');
   assert.equal(await outer.count(),1);
   assert.equal(await outer.evaluate(e=>e.open),false);
   assert.equal(await page.locator('#kitNewSetup').isVisible(),false,'recovery must stay folded initially');
   await outer.locator(':scope > summary').click();
   await page.waitForFunction(()=>document.querySelector('#kitAdvancedHardware')?.open);
   assert.equal(await outer.evaluate(e=>e.open),true);
   assert.equal(await page.locator('#kitNewSetup').isVisible(),true,'one click exposes setup recovery');
   // The same native toggle event must work for keyboard-assisted opening.
   await outer.locator(':scope > summary').focus();
   await page.keyboard.press('Enter');assert.equal(await outer.evaluate(e=>e.open),false);
   await page.keyboard.press('Enter');
   await page.waitForFunction(()=>document.querySelector('#kitAdvancedHardware')?.open);
   assert.equal(await page.locator('#kitNewSetup').isVisible(),true,'keyboard opens recovery in one action');
   // First visit to Security opens existing USB maintenance accordion.
   await page.locator('[data-dw-view="security"]').click();
   assert.equal(await page.locator('#dw-panel-security').isVisible(),true);
   assert.equal(await page.locator('#cloudAdminCenter').isVisible(),true,'cloud sign-in must render');
   await page.waitForFunction(()=>!/Checking central admin server/.test(document.querySelector('#cloudAdminStatus')?.textContent||''),null,{timeout:9000});
   await page.locator('[data-open-admin]').click();
   assert.equal(await page.locator('#dw-panel-security').isVisible(),true);
   assert.equal(await page.locator('#smartAdvanced').evaluate(e=>e.open),true);
   assert.equal(await page.locator('#kitAdminSecret').isVisible(),true,'USB passphrase input must be visible');
   assert.equal(await page.locator('#kitAdminResetAp').isVisible(),true,'AP reset action must render');
   // Cloud session resolution must not hide the independent physical USB tools.
   assert.equal(await page.locator('#kitAdmin').isVisible(),true,'cloud session must not hide physical USB accordion');
   assert.equal(await page.locator('#kitAdminSecret').isVisible(),true);
   // A teacher can intentionally collapse maintenance; switching tabs must
   // NOT force it open again (save manual accordion state).
   await page.locator('#smartAdvanced > summary').click();
   assert.equal(await page.locator('#smartAdvanced').evaluate(e=>e.open),false);
   assert.equal(await page.locator('#kitAdminSecret').isVisible(),false);
   await page.locator('[data-dw-view="overview"]').click();
   await page.locator('[data-dw-view="security"]').click();
   assert.equal(await page.locator('#smartAdvanced').evaluate(e=>e.open),false,'manual close must persist');
   await page.locator('#smartAdvanced > summary').click();
   assert.equal(await page.locator('#kitAdminSecret').isVisible(),true);
   await page.screenshot({path:`test-output/accordion/security-${width}.png`,fullPage:true});
   if(errors.length)throw Error('Browser script error: '+errors.join(' | '));
   console.log('PASS accordion init / first-open / legacy Advanced / USB visibility / cloud isolation / manual persistence',width,cloudOnline?'online':'unconfigured');
  }catch(e){
   await page.screenshot({path:`test-output/accordion/error-${width}.png`,fullPage:true}).catch(()=>{});
   throw e;
  }finally{await ctx.close()}
 }
}finally{await browser.close()}
