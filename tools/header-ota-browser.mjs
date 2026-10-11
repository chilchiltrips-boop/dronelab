import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {browserOptions,configureContext} from './browser-harness.mjs';

mkdirSync('test-output',{recursive:true});
const browser=await chromium.launch(browserOptions);
try{
 for(const [width,height] of [[1837,801],[1366,768],[844,390]]){
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'});
  await configureContext(ctx);
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8765/index.html#settings',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.ZebjusKits?.getState&&document.querySelector('.topbar-main'));
  const metric=await page.evaluate(()=>{
   const head=document.querySelector('.topbar').getBoundingClientRect();
   const main=document.querySelector('.topbar-main'),row=main.getBoundingClientRect();
   const elements=[...main.children].filter(x=>getComputedStyle(x).display!=='none');
   return{height:head.height,mainHeight:row.height,wrap:getComputedStyle(main).flexWrap,positions:elements.map(e=>({top:Math.round(e.getBoundingClientRect().top),left:Math.round(e.getBoundingClientRect().left)})),documentWidth:document.documentElement.scrollWidth};
  });
  assert.ok(metric.height<=84,'Header height grew: '+JSON.stringify(metric));
  assert.equal(metric.wrap,'nowrap','Top actions wrapped onto multiple rows');
  assert.ok(Math.max(...metric.positions.map(x=>x.top))-Math.min(...metric.positions.map(x=>x.top))<=10,
    'Header items not aligned on same row: '+JSON.stringify(metric));
  assert.ok(metric.documentWidth<=width,'Document overflows viewport instead of scrolling internally');
  assert.equal(await page.locator('#kitTopControl').isDisabled(),true);
  assert.equal(await page.locator('#fwNetworkFlashBtn').isDisabled(),true);
  await page.screenshot({path:'test-output/aerion-header-'+width+'x'+height+'.png'});
  const before=await page.locator('#kitTopNetworkSwitch').getAttribute('aria-checked');
  await page.locator('#kitTopNetworkSwitch').click();
  const after=await page.locator('#kitTopNetworkSwitch').getAttribute('aria-checked');
  assert.notEqual(before,after,'STA/AP header switch did not change target');
  const label=await page.locator('#kitTopWifiConnect').innerText();
  assert.match(label,/Connect (AP|STA)/);
  await ctx.close();
  if(errors.length)throw Error('Browser console exception: '+errors.join('; '));
  console.log('PASS AERION header '+width+'x'+height+' single-row and offline-safe mode/flash controls');
 }
}finally{await browser.close()}
