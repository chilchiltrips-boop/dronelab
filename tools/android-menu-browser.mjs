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
  await page.waitForFunction(()=>document.getElementById('mobileConnection').open&&document.getElementById('kitLink').value==='sta');
  assert.equal(await toggle.getAttribute('aria-checked'),'true');
  assert.match(await page.locator('#kitNetStatus').textContent(),/STA selected/);
  await page.locator('#kitLink').selectOption('ap');
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  // Check every expanded section, including hidden-by-default Wi-Fi and OTA.
  await page.locator('.settings-accordion').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
  const layout=await page.evaluate(()=>{
   const dialog=document.getElementById('mobileConnection'),main=dialog.querySelector('main'),box=main.getBoundingClientRect();
   const clipped=[...main.querySelectorAll('button,input:not([type=hidden]),select,textarea,summary')].filter(e=>e.getClientRects().length).filter(e=>{
    const r=e.getBoundingClientRect();return r.left<box.left-1||r.right>box.right+1||r.width<1;
   }).map(e=>e.id||e.tagName);
   return {scroll:dialog.scrollWidth,width:dialog.clientWidth,columns:getComputedStyle(main).gridTemplateColumns,clipped};
  });
  assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));
  assert.deepEqual(layout.clipped,[],JSON.stringify(layout));
  await page.screenshot({path:`test-output/android-menu-${width}x${height}.png`});
  await page.locator('#flightBack').click();
  const header=await page.locator('.flight-topbar').evaluate(e=>({height:e.getBoundingClientRect().height,children:[...e.children].filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return{id:n.id,left:r.left,right:r.right,bottom:r.bottom,top:r.top,height:r.height}})}));
  for(const child of header.children)assert.ok(child.left>=0&&child.right<=width+1,JSON.stringify(header));
  if(width>height)assert.ok(header.height<=56,JSON.stringify(header));
  for(const id of ['flightStop','flightNetworkSwitch'])assert.ok(header.children.find(e=>e.id===id).height>=44);
  assert.deepEqual(externalScripts,[],'PeerJS must load locally with external scripts unavailable');
  assert.deepEqual(errors,[]);
  results.push({width,height,layout,header});await context.close();
 }
 writeFileSync('test-output/android-menu-results.json',JSON.stringify(results,null,2));
 console.log('PASS local PeerJS, synchronized AP/STA header, five menu/header viewports');
}finally{await browser.close()}
