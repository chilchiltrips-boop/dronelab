// Shared Aerion WebApp shell: a 56px control row and a 48px centered navigation row and real File actions.
// The same authenticated controls stay mounted across all six pages.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const expectedVersion='v'+JSON.parse(readFileSync(new URL('../app-version.json',import.meta.url),'utf8')).version;
mkdirSync('test-output/v2',{recursive:true});
const browser=await chromium.launch(browserOptions),results=[];
try{
 for(const width of [320,360,390,736,768,1024,1199,1200,1279,1280,1294,1359,1360,1366,1600,1920]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});await configureContext(context);
  const page=await context.newPage();await page.goto('http://127.0.0.1:8765/#settings');
  await page.waitForFunction(()=>window.ZebjusKits&&window.ZebjusControlUI?.snapshot());
  const metrics=await page.evaluate(()=>{
   const bounds=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
   const header=document.querySelector('.topbar'),nav=document.querySelector('.topbar-main>.tabs');
   const controls=[...header.querySelectorAll('button,summary,select,label,strong,a')].filter(e=>!e.closest('.control-path-popover,.v2-connection-popover,.topbar-status')&&e.getBoundingClientRect().height>0);
   return {header:bounds(header),nav:bounds(nav),width:innerWidth,scroll:document.documentElement.scrollWidth,
    controls:controls.map(e=>({id:e.id||e.getAttribute('aria-label')||e.textContent,rect:bounds(e),primary:!!e.closest('.topbar-primary')})),
    workspace:bounds(document.querySelector('#app>main')),firstRow:bounds(document.querySelector('.topbar-primary')),secondRow:bounds(document.querySelector('.topbar-main')),
    brand:bounds(document.querySelector('.brand')),kitName:bounds(document.getElementById('kitGlobalName')),kitBadge:bounds(document.getElementById('kitGlobalState')),
    topOrder:[document.querySelector('.brand'),document.getElementById('kitTopStatus'),document.getElementById('headerInputSlot'),document.querySelector('.v2-workspace-tools'),document.querySelector('.header-health'),document.querySelector('#workspaceFileMenu')].map(bounds),
    navFont:parseFloat(getComputedStyle(nav.querySelector('.tab')).fontSize),
    pairing:bounds(document.getElementById('topPairMobileBtn')),mirror:bounds(document.querySelector('.top-grant-control')),
    sidebar:!!document.querySelector('.app-navigation'),
    hiddenWorkspaceTools:!!document.querySelector('details.v2-workspace-tools'),
    inputVisible:document.querySelector('#headerControlPath').getBoundingClientRect().height>0,
    navButtons:[...nav.querySelectorAll('.tab,.nav-shop')].map(bounds),
    navigationOnly:document.querySelector('.topbar-main').children.length===1,
    shop:{count:header.querySelectorAll('[data-shop]').length,text:nav.querySelector('.nav-shop')?.textContent,href:nav.querySelector('.nav-shop')?.getAttribute('href'),target:nav.querySelector('.nav-shop')?.target},
    rowScroll:document.querySelector('.topbar-primary').scrollWidth,rowOverflow:getComputedStyle(document.querySelector('.topbar-primary')).overflowX};
  });results.push(metrics);
  assert.ok(metrics.scroll<=width,JSON.stringify(metrics));
  assert.equal(metrics.hiddenWorkspaceTools,false);
  assert.ok(metrics.inputVisible,'Input selection must be directly visible');
  assert.equal(metrics.navButtons.length,7);
  assert.deepEqual(await page.locator('.topbar-main .tab').evaluateAll(es=>es.map(e=>e.dataset.tab)),['assembly','wiring','python','setup','pid','firmware']);
  assert.equal(metrics.navigationOnly,true,'Only navigation belongs in the lower row');
  assert.deepEqual(metrics.shop,{count:1,text:'Shop',href:'https://www.zebjus.in/category/all-products',target:'_blank'});
  for(const {id,rect,primary} of metrics.controls){
   const inViewport=rect.left>=-1&&rect.right<=width+1;
   assert.ok((inViewport||(primary&&width>=736&&width<1280))&&rect.top>=metrics.header.top-1&&rect.bottom<=metrics.header.bottom+1,JSON.stringify({width,id,rect,header:metrics.header}));
  }
  for(let i=0;i<metrics.controls.length;i++)for(let j=0;j<i;j++){
   const a=metrics.controls[i],b=metrics.controls[j];
   const overlap=Math.min(a.rect.right,b.rect.right)-Math.max(a.rect.left,b.rect.left)>1&&Math.min(a.rect.bottom,b.rect.bottom)-Math.max(a.rect.top,b.rect.top)>1;
   assert.ok(!overlap,JSON.stringify({width,overlap:[a,b]}));
  }
  assert.equal(metrics.sidebar,false,'No navigation rail');
  if(width>=736){
   assert.equal(metrics.header.height,104,JSON.stringify(metrics));
   assert.equal(metrics.header.left,0);
   assert.ok(metrics.workspace.top>=104&&metrics.workspace.top<=105,'Workspace begins immediately after two header rows');
   for(const control of metrics.topOrder)assert.ok(control.top>=metrics.firstRow.top+8&&control.bottom<=metrics.firstRow.bottom-8,'Every top-row group has vertical breathing room');
   for(let i=1;i<metrics.topOrder.length;i++)assert.ok(metrics.topOrder[i].left>=metrics.topOrder[i-1].right-1&&(i>=4||metrics.topOrder[i].left-metrics.topOrder[i-1].right<=12),'Controls flow from the brand in consistent groups');
   assert.ok(Math.abs((metrics.kitName.top+metrics.kitName.bottom)/2-(metrics.kitBadge.top+metrics.kitBadge.bottom)/2)<=1,'Kit name and status share one line');
   assert.ok(metrics.nav.top>=metrics.secondRow.top&&metrics.nav.bottom<=metrics.secondRow.bottom,'Page names belong in row two');
   const inset=width>=1360?24:20;
   assert.equal(metrics.brand.left,inset,'Left edge has a deliberate inset');
   assert.ok(Math.abs((metrics.nav.left+metrics.nav.right)/2-width/2)<=1,'Navigation stays centered on the viewport');
   if(width>=1280){assert.ok(Math.max(...metrics.topOrder.map(r=>r.right))<=width-inset,'Right edge has the same minimum inset');assert.equal(metrics.rowScroll,width,'Desktop controls need no scrolling')}
   for(const r of metrics.navButtons)assert.ok(r.top>=metrics.secondRow.top+6&&r.bottom<=metrics.secondRow.bottom-6,'Navigation has vertical space');
   assert.ok(metrics.navFont>=14,'Page names remain larger than toolbar text');
   for(let i=1;i<metrics.navButtons.length;i++)assert.ok(metrics.navButtons[i].left>=metrics.navButtons[i-1].right-1,'Horizontal navigation overlaps');
  }
  if(width>=736&&width<1280){
   assert.equal(metrics.rowOverflow,'auto','Compact desktop allows scrolling when its controls need more room');
   for(const selector of ['#kitTopRefresh','#kitTopNetworkSwitch','.v2-connection-details>summary','#headerControlPath','[data-control-apply]','.control-path-info>summary','.top-grant-control','#topPairMobileBtn','#workspaceFileMenu>summary']){
    const control=page.locator(selector).first();await control.scrollIntoViewIfNeeded();
    const r=await control.boundingBox();assert.ok(r.x>=-1&&r.x+r.width<=width+1,`Reachable control at ${width}: ${selector}`);
   }
   await page.locator('#workspaceFileMenu>summary').press('ArrowDown');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'saveBtn');
   const popup=await page.locator('.workspace-file-actions').boundingBox();
   assert.ok(popup.x>=0&&popup.x+popup.width<=width,'Scrolled File popup escapes the row clipping');
   await page.keyboard.press('Escape');
   await page.locator('.topbar-primary').evaluate(e=>e.scrollLeft=0);
  }
  const headerState=await page.evaluate(()=>{
   const name=document.getElementById('kitGlobalName'),badge=document.getElementById('kitGlobalState');
   const previous=badge.textContent;badge.textContent='KIT CONNECTED';const connectedFits=badge.scrollWidth<=badge.clientWidth+1;badge.textContent=previous;
   return {nameVisible:name.getBoundingClientRect().width>0,nameFits:name.scrollWidth<=name.clientWidth+1,connectedFits,badgeVisible:badge.getBoundingClientRect().width>0,
    color:getComputedStyle(badge).color,position:getComputedStyle(document.querySelector('#app .topbar')).position};
  });
  assert.ok(headerState.nameVisible&&headerState.badgeVisible,JSON.stringify({width,headerState}));
  assert.ok(headerState.nameFits&&headerState.connectedFits,'Normal Kit labels must fit without clipping '+JSON.stringify({width,headerState}));
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
   await page.waitForFunction(version=>document.getElementById('webappVersion').textContent===version,expectedVersion);
   const menu=page.locator('#workspaceFileMenu'),summary=menu.locator('summary');
   await page.evaluate(()=>{window.__fileEscapeBubbled=0;window.addEventListener('keydown',e=>{if(e.key==='Escape')window.__fileEscapeBubbled++})});
   await summary.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.id),'saveBtn');
   await page.keyboard.press('Escape');assert.equal(await menu.evaluate(e=>e.open),false);
   assert.equal(await page.evaluate(()=>window.__fileEscapeBubbled),0,'File Escape must not trigger underlying project shortcuts');
   await summary.click();
   const popup=await page.locator('.workspace-file-actions').boundingBox();assert.ok(popup.x>=0&&popup.x+popup.width<=width);
   assert.equal((await page.locator('.topbar').boundingBox()).height,104,'File menu overlays without growing header');
   assert.deepEqual(await menu.locator('button').evaluateAll(es=>es.map(e=>e.id)),['saveBtn','undoBtn','redoBtn','resetBtn']);
   const items=await menu.locator('button').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
   for(let i=1;i<items.length;i++)assert.ok(items[i].top>=items[i-1].bottom,'File actions must stack vertically');
   await page.locator('#saveBtn').click();assert.equal(await menu.evaluate(e=>e.open),false);
   assert.match(await page.locator('#saveState').textContent(),/Saved/);
   await page.locator('[data-tab="assembly"]').click();await page.locator('#freeModeBtn').click();
   await summary.click();await page.locator('#undoBtn').click();assert.match(await page.locator('#guidedModeBtn').getAttribute('class'),/active/);
   await summary.click();await page.locator('#redoBtn').click();assert.match(await page.locator('#freeModeBtn').getAttribute('class'),/active/);
   const firstTab=page.locator('[data-tab=assembly]');
   await page.locator('#workspaceFileMenu>summary').focus();await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.tab),'assembly');assert.equal(await firstTab.evaluate(e=>getComputedStyle(e).outlineStyle),'solid','Keyboard focus is visible');
   await firstTab.click();assert.equal(await firstTab.getAttribute('aria-selected'),'true');
   const selectedColor=await firstTab.evaluate(e=>getComputedStyle(e).backgroundImage);
   await page.locator('[data-tab=wiring]').click();assert.equal(await firstTab.getAttribute('aria-selected'),'false');
   await page.mouse.move(0,200);await page.waitForTimeout(180);
   assert.notEqual(await firstTab.evaluate(e=>getComputedStyle(e).backgroundImage),selectedColor,'Selected page has a distinct persistent fill');
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
   // without moving the toolbar, input or save controls.
   await page.evaluate(()=>{window.__shellNodes=[document.querySelector('.topbar'),document.getElementById('topGrantMobileSwitch'),document.getElementById('headerControlPath')]});
   for(const tab of ['assembly','wiring','python','pid','firmware']){
    await page.locator('[data-tab="'+tab+'"]').click();
    assert.ok(await page.evaluate(()=>window.__shellNodes.every(e=>e.isConnected)&&window.__shellNodes[0]===document.querySelector('.topbar')));
    assert.equal((await page.locator('.topbar').boundingBox()).height,104);
   }
   await page.locator('[data-tab="pid"]').click();
   await page.screenshot({path:'test-output/v2/desktop-pid-1366.png'});
  }
  await page.screenshot({path:`test-output/v2/header-${width}.png`});
  await context.close();console.log('PASS desktop shell/fallback',width,metrics.header.height);
 }
}finally{writeFileSync('test-output/v2/layout.json',JSON.stringify(results,null,2));await browser.close()}
