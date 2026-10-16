// Browser layout and local PeerJS coverage. Native MotionEvents and radio access
// are separate gates; this native facade never performs a Kit HTTP request.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
mkdirSync('test-output',{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
try{
 for(const [width,height] of [[360,800],[488,227],[640,360],[844,390],[1080,480]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true,reducedMotion:'reduce',serviceWorkers:'block'});
  await configureContext(context);
  await context.addInitScript(()=>{window.ZebjusNative={requestSecure(){throw Error('Unexpected native network request during transport selection')}}});
  const page=await context.newPage(),errors=[],externalScripts=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.resourceType()==='script'&&!r.url().startsWith('http://127.0.0.1:8765/'))externalScripts.push(r.url())});
  await page.goto('http://127.0.0.1:8765/companion.html');
  await page.waitForFunction(()=>window.ZebjusFlightApp&&typeof window.Peer==='function');
  const toggle=page.locator('#flightNetworkSwitch');
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await toggle.click();
  await page.waitForFunction(()=>document.getElementById('mobileConnection').open);
  assert.equal(await toggle.getAttribute('aria-checked'),'false','Unverified kit must not switch AP/STA');
  assert.equal(await page.locator('[data-mobile-tab="wifi"]').getAttribute('aria-selected'),'true');
  assert.match(await page.locator('#kitNetStatus').textContent(),/Connect and verify the Kit/);
  assert.equal(await page.locator('#downloadStableApk').count(),0,'No App Update button in controller');
  assert.equal(await page.locator('#androidInstalledVersion').count(),0,'No duplicate app update card');
  assert.equal(await page.locator('#appBuildVersion').count(),1,'Installed APK version remains in More');
  assert.equal(await page.locator('#mobileSettingsStop').isVisible(),false,'No duplicate menu STOP');
  assert.equal(await page.locator('#flightBack').isVisible(),true,'Back arrow remains accessible');
  const bounds=await page.evaluate(()=>{
   const d=document.getElementById('mobileConnection').getBoundingClientRect();
   const n=document.querySelector('.mobile-adaptive-nav').getBoundingClientRect();
   const m=document.querySelector('.mobile-adaptive-main').getBoundingClientRect();
   return {d:{top:d.top,bottom:d.bottom},n:{top:n.top,bottom:n.bottom,right:n.right},m:{top:m.top,bottom:m.bottom,left:m.left}};
  });
  assert.ok(bounds.m.left>=bounds.n.right-1,JSON.stringify(bounds));
  assert.ok(Math.abs(bounds.m.top-bounds.n.top)<=2&&Math.abs(bounds.m.bottom-bounds.n.bottom)<=2,'Right panel and left sidebar must have equal full height: '+JSON.stringify(bounds));
  const categories=['pair','kit','wifi','control','more'],verified=[];
  for(const category of categories){
   await page.locator('[data-mobile-tab="'+category+'"]').click();
   await page.waitForFunction(name=>window.ZebjusMobileMenu.active()===name,category);
   const panel=page.locator('[data-mobile-panel="'+category+'"]');
   assert.equal(await panel.isVisible(),true,category+' content not reachable');
   assert.equal(await page.locator('.mobile-adaptive-panel:visible').count(),1,'Exactly one active category');
   await panel.locator('details.settings-accordion').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
   const layout=await page.evaluate(()=>{
    const dialog=document.getElementById('mobileConnection'),main=dialog.querySelector('main'),box=main.getBoundingClientRect(),nav=dialog.querySelector('.mobile-adaptive-nav');
    const clipped=[...main.querySelectorAll('button,input:not([type=hidden]),select,textarea,summary')].filter(e=>e.getClientRects().length).filter(e=>{
     const r=e.getBoundingClientRect();return r.left<box.left-1||r.right>box.right+1||r.width<1;
    }).map(e=>e.id||e.tagName);
    return {scroll:main.scrollWidth,width:main.clientWidth,navScroll:nav.scrollWidth,navWidth:nav.clientWidth,dialogScroll:dialog.scrollWidth,dialogWidth:dialog.clientWidth,clipped};
   });
   assert.ok(layout.scroll<=layout.width+1,category+': '+JSON.stringify(layout));
   assert.ok(layout.dialogScroll<=layout.dialogWidth+1,category+': '+JSON.stringify(layout));
   assert.deepEqual(layout.clipped,[],category+': '+JSON.stringify(layout));
   await page.screenshot({path:`test-output/android-menu-${width}x${height}-${category}.png`});
   verified.push({category,layout});
  }
  assert.equal(await page.locator('#scanOfferBtn').count(),1);
  assert.equal(await page.locator('#kitOtaAdminKey').count(),1);
  assert.equal(await page.locator('#kitRememberDiagnostic').count(),1);
  assert.equal(await page.locator('#kitAllowWeb').count(),1);
  await page.locator('[data-mobile-tab="kit"]').click();
  await page.locator('#kitLink').selectOption('ap');
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await page.locator('#flightBack').tap();
  await page.waitForFunction(()=>!document.getElementById('mobileConnection').open);
  await toggle.tap();
  await page.waitForFunction(()=>document.getElementById('mobileConnection').open);
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await page.locator('#flightBack').tap();
  await page.waitForFunction(()=>!document.getElementById('mobileConnection').open);
  const header=await page.locator('.flight-topbar').evaluate(e=>({height:e.getBoundingClientRect().height,children:[...e.children].filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return{id:n.id,left:r.left,right:r.right,bottom:r.bottom,top:r.top,height:r.height}})}));
  for(const child of header.children)assert.ok(child.left>=0&&child.right<=width+1,JSON.stringify(header));
  if(width>height)assert.ok(header.height<=56,JSON.stringify(header));
  for(const id of ['flightStop','flightNetworkSwitch'])assert.ok(header.children.find(e=>e.id===id).height>=44);
  assert.deepEqual(externalScripts,[],'PeerJS must load locally with external scripts unavailable');
  assert.deepEqual(errors,[]);
  results.push({width,height,categories:verified,header});await context.close();
 }
 writeFileSync('test-output/android-menu-results.json',JSON.stringify(results,null,2));
 console.log('PASS local PeerJS, synchronized AP/STA header, five menu/header viewports');
}finally{await browser.close()}
