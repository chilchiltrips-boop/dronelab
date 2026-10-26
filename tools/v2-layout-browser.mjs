// Shared Aerion WebApp shell: two 32px horizontal rows and real File actions.
// The same authenticated controls stay mounted across all five pages.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('test-output/v2',{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
try{
 for(const width of [320,360,390,736,768,850,1024,1280,1294,1366,1920]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await configureContext(context);
  const page=await context.newPage();await page.goto('http://127.0.0.1:8765/#settings');
  await page.waitForFunction(()=>window.ZebjusKits&&window.ZebjusControlUI?.snapshot());
  const metrics=await page.evaluate(()=>{
   const bounds=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
   const header=document.querySelector('.topbar'),nav=document.querySelector('.topbar-primary>.tabs');
   const controls=[...header.querySelectorAll('button,summary,select,label,strong')].filter(e=>!e.closest('.control-path-popover,.v2-connection-popover,.topbar-status')&&e.getBoundingClientRect().height>0);
   return {header:bounds(header),nav:bounds(nav),width:innerWidth,scroll:document.documentElement.scrollWidth,
    controls:controls.map(e=>({id:e.id||e.getAttribute('aria-label')||e.textContent,rect:bounds(e)})),
    workspace:bounds(document.querySelector('#app>main')),secondRow:bounds(document.querySelector('.topbar-main')),
    pairing:bounds(document.getElementById('topPairMobileBtn')),mirror:bounds(document.querySelector('.top-grant-control')),
    sidebar:!!document.querySelector('.app-navigation'),
    hiddenWorkspaceTools:!!document.querySelector('details.v2-workspace-tools'),
    inputVisible:document.querySelector('#headerControlPath').getBoundingClientRect().height>0,
    navButtons:[...nav.querySelectorAll('.tab')].map(bounds)};
  });results.push(metrics);
  assert.ok(metrics.scroll<=width,JSON.stringify(metrics));
  assert.equal(metrics.hiddenWorkspaceTools,false);
  assert.ok(metrics.inputVisible,'Input selection must be directly visible');
  assert.equal(metrics.navButtons.length,5);
  for(const {id,rect} of metrics.controls){
   assert.ok(rect.left>=-1&&rect.right<=width+1&&rect.top>=metrics.header.top-1&&rect.bottom<=metrics.header.bottom+1,JSON.stringify({width,id,rect,header:metrics.header}));
  }
  for(let i=0;i<metrics.controls.length;i++)for(let j=0;j<i;j++){
   const a=metrics.controls[i],b=metrics.controls[j];
   const overlap=Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left)>1&&Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top)>1;
   assert.ok(!overlap,JSON.stringify({width,overlap:[a,b]}));
  }
  assert.equal(metrics.sidebar,false,'No navigation rail');
  if(width>=736){
   assert.equal(metrics.header.height,64,JSON.stringify(metrics));
   assert.equal(metrics.header.left,0);
   assert.ok(metrics.workspace.top>=64&&metrics.workspace.top<=65,'Workspace begins immediately after two header rows');
   for(const control of [metrics.pairing,metrics.mirror])assert.ok(control.top>=metrics.secondRow.top&&control.bottom<=metrics.secondRow.bottom,'Mobile controls must remain in row two');
   for(let i=1;i<metrics.navButtons.length;i++)assert.ok(metrics.navButtons[i].left>=metrics.navButtons[i-1].right-1,'Horizontal navigation overlaps');
  }
  const headerState=await page.evaluate(()=>{
   const name=document.getElementById('kitGlobalName'),badge=document.getElementById('kitGlobalState');
   return {nameVisible:name.getBoundingClientRect().width>0,badgeVisible:badge.getBoundingClientRect().width>0,
    color:getComputedStyle(badge).color,position:getComputedStyle(document.querySelector('#app .topbar')).position};
  });
  assert.ok(headerState.nameVisible&&headerState.badgeVisible,JSON.stringify({width,headerState}));
  assert.equal(headerState.position,'relative');assert.equal(headerState.color,'rgb(255, 255, 255)');
  await page.locator('.v2-connection-details>summary').click();
  const pop=await page.locator('.v2-connection-popover').boundingBox();assert.ok(pop.x>=0&&pop.x+pop.width<=width+1,JSON.stringify({width,pop}));
  await page.locator('.v2-connection-popover [data-header-close]').click();
  await page.locator('.control-path-info>summary').click();
  const inputPop=await page.locator('.control-path-popover').boundingBox();assert.ok(inputPop.x>=0&&inputPop.x+inputPop.width<=width+1,JSON.stringify({width,inputPop}));
  await page.locator('.control-path-popover [data-header-close]').click();
  await page.locator('#kitTopNetworkSwitch').click();assert.equal(await page.locator('#kitTopNetworkSwitch').getAttribute('aria-checked'),'true');
  assert.equal(await page.locator('#kitTopControl').count(),0);
  assert.equal(await page.locator('#kitRcAccess').textContent(),'RC OFFLINE');
  assert.equal(await page.locator('#fwNetworkFlashBtn').isDisabled(),true,'Offline transport selection cannot enable OTA');
  if(width===1366){
   assert.equal(await page.locator('[data-brand-name]').textContent(),'ZEBJUS Aerion');
   assert.equal(await page.locator('#webappVersion').textContent(),'v1.9');
   const menu=page.locator('#workspaceFileMenu'),summary=menu.locator('summary');
   await summary.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'saveBtn');
   await page.keyboard.press('Escape');assert.equal(await menu.evaluate(e=>e.open),false);
   await summary.click();
   const popup=await page.locator('.workspace-file-actions').boundingBox();assert.ok(popup.x>=0&&popup.x+popup.width<=width);
   assert.equal((await page.locator('.topbar').boundingBox()).height,64,'File menu overlays without growing header');
   assert.deepEqual(await menu.locator('button').evaluateAll(es=>es.map(e=>e.id)),['saveBtn','undoBtn','redoBtn','resetBtn']);
   const items=await menu.locator('button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
   for(let i=1;i<items.length;i++)assert.ok(items[i].top>=items[i-1].bottom,'File actions must stack vertically');
   await page.locator('#saveBtn').click();assert.equal(await menu.evaluate(e=>e.open),false);
   assert.match(await page.locator('#saveState').textContent(),/Saved/);
   await page.locator('[data-tab="assembly"]').click();await page.locator('#freeModeBtn').click();
   await summary.click();await page.locator('#undoBtn').click();assert.match(await page.locator('#guidedModeBtn').getAttribute('class'),/active/);
   await summary.click();await page.locator('#redoBtn').click();assert.match(await page.locator('#freeModeBtn').getAttribute('class'),/active/);
   const stable=await page.evaluate(()=>{
    const x=()=>[document.getElementById('headerControlPath').getBoundingClientRect().left,document.querySelector('#workspaceFileMenu>summary').getBoundingClientRect().left];
    const before=x(),mobile=document.getElementById('mobileHeaderStatus'),active=document.querySelector('[data-control-active]');
    const original=[mobile.textContent,active.textContent];
    mobile.textContent='Mobile: Awaiting approval';active.textContent='Android WebRTC';
    const after=x();[mobile.textContent,active.textContent]=original;
    return {before,after};
   });
   assert.deepEqual(stable.before,stable.after,'Status changes must not shift input or workspace actions');
   // Keep DOM nodes and handlers while changing pages; status text may grow
   // without moving the sidebar, toolbar, input or save controls.
   await page.evaluate(()=>{window.__shellNodes=[document.querySelector('.topbar'),document.getElementById('topGrantMobileSwitch'),document.getElementById('headerControlPath')]});
   for(const tab of ['assembly','wiring','python','pid','firmware']){
    await page.locator('[data-tab="'+tab+'"]').click();
    assert.ok(await page.evaluate(()=>window.__shellNodes.every(e=>e.isConnected)&&window.__shellNodes[0]===document.querySelector('.topbar')));
    assert.equal((await page.locator('.topbar').boundingBox()).height,64);
   }
   await page.locator('[data-tab="pid"]').click();
   await page.screenshot({path:'test-output/v2/desktop-pid-1366.png'});
  }
  await page.screenshot({path:`test-output/v2/header-${width}.png`});
  await context.close();console.log('PASS desktop shell/fallback',width,metrics.header.height);
 }
}finally{writeFileSync('test-output/v2/layout.json',JSON.stringify(results,null,2));await browser.close()}
