/* Full-page responsive form/label fit audit. Checks rendered Chromium geometry and
 * computed placeholder typography, not merely CSS declarations.
 * No camera, USB, APK, WebRTC grant or physical flight control is invoked. */
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {browserOptions,configureContext} from './browser-harness.mjs';
mkdirSync('test-output/form-fit',{recursive:true});
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1294,height:801},serviceWorkers:'block',reducedMotion:'reduce'});
await configureContext(context);
const page=await context.newPage();
const base='http://127.0.0.1:8765/';
const widths=[360,390,768,1024,1294,1600];
const reports=[],hardFailures=[],pageErrors=[];
page.on('pageerror',e=>pageErrors.push(e.message));
function inspect(tag,width){
 return page.evaluate(({tag,width})=>{
  const visible=e=>{
   if(!e||!e.isConnected)return false;
   const box=e.getBoundingClientRect(),st=getComputedStyle(e);
   return box.width>25&&box.height>8&&st.display!=='none'&&st.visibility!=='hidden'&&st.opacity!=='0'&&
    !e.closest('[hidden],.tab-panel:not(.active),details:not([open]) > :not(summary)');
  };
  const rect=e=>{const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),right:Math.round(b.right)}};
  const inputs=[];
  for(const e of document.querySelectorAll('input[placeholder],textarea[placeholder]')){
   if(!visible(e)||e.tagName==='TEXTAREA')continue;
   const cs=getComputedStyle(e),ps=getComputedStyle(e,'::placeholder'),c=document.createElement('canvas').getContext('2d');
   c.font=[ps.fontStyle||'normal',ps.fontWeight||'400',ps.fontSize||cs.fontSize,ps.fontFamily||cs.fontFamily].join(' ');
   const letter=parseFloat(ps.letterSpacing==='normal'?'0':ps.letterSpacing)||0;
   const placeholder=e.getAttribute('placeholder')||'',available=e.clientWidth-parseFloat(cs.paddingLeft||0)-parseFloat(cs.paddingRight||0);
   const estimated=c.measureText(placeholder).width+Math.max(0,placeholder.length-1)*letter;
   const fit=estimated<=available+3;
   inputs.push({id:e.id,placeholder,fit,textPixels:Math.round(estimated),availablePixels:Math.round(available),fontSize:ps.fontSize,letterSpacing:ps.letterSpacing,rect:rect(e)});
  }
  const buttons=[];
  for(const el of document.querySelectorAll('button,select,summary')){
   if(!visible(el))continue;
   const st=getComputedStyle(el),ratio=el.clientWidth?el.scrollWidth/el.clientWidth:1;
   const over=(el.scrollWidth>el.clientWidth+3)&&['hidden','clip'].includes(st.overflowX);
   if(over)buttons.push({id:el.id||'',text:(el.textContent||'').trim().slice(0,90),ratio:Math.round(ratio*100)/100,rect:rect(el)});
  }
  const wanted=['#pairStep2Title','#pairCodeSection','#pairPhoneCode','#pairConnectCodeBtn'];
  const widgets=Object.fromEntries(wanted.map(id=>[id,document.querySelector(id)?rect(document.querySelector(id)):null]));
  return {tag,width,documentWidth:document.documentElement.scrollWidth,inputs,buttons,widgets};
 },{tag,width});
}
function record(result){
 reports.push(result);
 if(result.documentWidth>result.width+1)
  hardFailures.push(result.tag+' '+result.width+'px: horizontal document overflow '+result.documentWidth+'px');
 for(const inp of result.inputs)if(!inp.fit)hardFailures.push(result.tag+' '+result.width+'px: placeholder #'+inp.id+' "'+inp.placeholder+'" requires '+inp.textPixels+'px, available '+inp.availablePixels+'px');
 for(const b of result.buttons)if(b.ratio>1.06)hardFailures.push(result.tag+' '+result.width+'px: control #'+b.id+' clipped ('+b.text+', ratio='+b.ratio+')');
}
try{
 await page.goto(base+'index.html#firmware',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>document.querySelector('#app')?.dataset.ready==='true',null,{timeout:40000});
 await page.evaluate(()=>{const d=document.getElementById('pairStep2');if(d)d.open=true});
 // Actual independent wheel-scroll behavior, not just CSS string assertions.
 await page.setViewportSize({width:1480,height:640});
 await page.locator('[data-tab="firmware"]').click();
 await page.locator('[data-dw-view="wifi"]').click();
 await page.waitForTimeout(220);
 const before=await page.evaluate(()=>{
  const nav=document.querySelector('.dw-nav-list');
  const aside=document.querySelector('.dw-sidebar');
  const content=document.querySelector('#dw-body-wifi');
  const shell=document.querySelector('#devicesWorkspace');
  return {bodyY:scrollY,asideY:aside.getBoundingClientRect().top,navY:nav.scrollTop,
    contentY:content.scrollTop,contentHasOverflow:content.scrollHeight>content.clientHeight+20,
    shellBottom:shell.getBoundingClientRect().bottom,
    rightOverflow:getComputedStyle(content).overflowY};
 });
 if(!before.contentHasOverflow||before.rightOverflow!=='auto')
  hardFailures.push('Desktop hardware Wi-Fi pane must overflow and use independent scrolling');
 await page.locator('#dw-body-wifi').hover();
 await page.mouse.wheel(0,410);
 await page.waitForTimeout(250);
 const after=await page.evaluate(()=>({
  bodyY:scrollY,asideY:document.querySelector('.dw-sidebar').getBoundingClientRect().top,
  navY:document.querySelector('.dw-nav-list').scrollTop,
  contentY:document.querySelector('#dw-body-wifi').scrollTop
 }));
 if(after.contentY<=before.contentY+10||Math.abs(after.bodyY-before.bodyY)>2||
    Math.abs(after.asideY-before.asideY)>2||after.navY!==before.navY)
  hardFailures.push('Desktop mousewheel should scroll only the right hardware settings pane');
 await page.screenshot({path:'test-output/form-fit/hardware-scroll-desktop.png'});
 // Overview must allow a long status/details card to scroll under an always
 // visible, physically identical Take Control button (no duplicate handler).
 await page.setViewportSize({width:1480,height:590});
 await page.locator('[data-dw-view="overview"]').click();
 await page.waitForTimeout(240);
 const ovBefore=await page.evaluate(()=>{
  const content=document.querySelector('#dw-body-overview');
  const ctl=document.querySelector('#fwKitTakeControl');
  const bar=document.querySelector('#dw-panel-overview>.dw-overview-actions');
  const card=document.querySelector('#dw-body-overview>.fw-kit-detail-card');
  const rect=ctl.getBoundingClientRect();
  return {bodyY:scrollY,contentY:content.scrollTop,hasOverflow:content.scrollHeight>content.clientHeight+20,
   controlVisible:rect.top>=0&&rect.bottom<=innerHeight,
   controlBarParent:ctl.closest('.dw-overview-actions')===bar,
   buttonCount:document.querySelectorAll('#fwKitTakeControl').length,
   cardNatural:card.scrollHeight<=card.getBoundingClientRect().height+2,
   barY:bar.getBoundingClientRect().top};
 });
 if(!ovBefore.hasOverflow||!ovBefore.controlVisible||!ovBefore.controlBarParent||ovBefore.buttonCount!==1||!ovBefore.cardNatural)
  hardFailures.push('Overview Take Control needs one visible button and an independently scrollable, unclipped details card');
 await page.locator('#dw-body-overview').hover();
 await page.mouse.wheel(0,440);
 await page.waitForTimeout(200);
 const ovAfter=await page.evaluate(()=>{
  const content=document.querySelector('#dw-body-overview');
  const bar=document.querySelector('#dw-panel-overview>.dw-overview-actions');
  return {bodyY:scrollY,contentY:content.scrollTop,barY:bar.getBoundingClientRect().top,
   hitTest:document.elementFromPoint(...(()=>{
    const r=document.querySelector('#fwKitTakeControl').getBoundingClientRect();
    return [r.left+r.width/2,r.top+r.height/2]
   })())?.closest('#fwKitTakeControl')!==null};
 });
 if(ovAfter.contentY<=ovBefore.contentY+15||Math.abs(ovAfter.bodyY-ovBefore.bodyY)>2||
    Math.abs(ovAfter.barY-ovBefore.barY)>2||!ovAfter.hitTest)
  hardFailures.push('Overview wheel must scroll details without moving/click-blocking Take Control');
 await page.screenshot({path:'test-output/form-fit/hardware-overview-controls-desktop.png'});
 // The three onboarding cards must stay full height above the real Connect
 // controls; scrolling must reveal the form rather than clip the first card.
 await page.setViewportSize({width:1480,height:640});
 await page.locator('[data-dw-view="connection"]').click();
 await page.waitForTimeout(180);
 const connBefore=await page.evaluate(()=>{
  const root=document.querySelector('#dw-body-connection'),card=root.querySelector('.fw-connect-card');
  const steps=[...root.querySelectorAll('.fw-simple-steps>div')],rc=card.getBoundingClientRect();
  const connect=card.querySelector('#fwKitConnectSelected').getBoundingClientRect();
  return {scroll:root.scrollTop,hasOverflow:root.scrollHeight>root.clientHeight+15,
   naturalCard:card.scrollHeight<=rc.height+5,
   stepsFit:steps.length===3&&steps.every(n=>{const span=n.querySelector('span').getBoundingClientRect(),r=n.getBoundingClientRect();return span.bottom<=r.bottom+2&&r.bottom<=rc.bottom}),
   formAfterSteps:connect.top>steps[2].getBoundingClientRect().bottom};
 });
 if(!connBefore.hasOverflow||!connBefore.naturalCard||!connBefore.stepsFit||!connBefore.formAfterSteps)
  hardFailures.push('Kit Connection 1/2/3 content or Connect form clipped inside its panel');
 await page.locator('#dw-body-connection').hover();
 await page.mouse.wheel(0,430);
 await page.waitForTimeout(150);
 if(await page.evaluate(()=>document.querySelector('#dw-body-connection').scrollTop)<=connBefore.scroll+10)
  hardFailures.push('Kit Connection right-side scrolling did not reveal the form');
 // Firmware source/monitor cards must not shrink when placed in the same
 // independently scrolling workspace.
 await page.locator('[data-dw-view="firmware"]').click();
 const firmwareFit=await page.evaluate(()=>{
  const root=document.querySelector('#dw-body-firmware'),cards=[...root.querySelectorAll('.firmware-grid>.form-card')];
  return {hasOverflow:root.scrollHeight>root.clientHeight+15,
   cardsFit:cards.length>=3&&cards.every(n=>n.scrollHeight<=n.getBoundingClientRect().height+5)};
 });
 if(!firmwareFit.hasOverflow||!firmwareFit.cardsFit)
  hardFailures.push('Firmware Flash contains truncated Step 1/2/3 cards');
 // Wide desktops should show the USB Serial controls on one line, with
 // Open Serial Port and Clear Output next to one another at every width.
 await page.setViewportSize({width:1680,height:840});
 await page.locator('[data-dw-view="diagnostics"]').click();
 await page.waitForTimeout(160);
 const serialWide=await page.evaluate(()=>{
  const toolbar=document.querySelector('#dw-body-diagnostics .fw-serial-toolbar');
  const head=toolbar.querySelector('.fw-serial-head');
  const items=[head,toolbar.querySelector('.fw-serial-tabs'),...toolbar.querySelectorAll('.fw-serial-baud'),
   toolbar.querySelector('#fwSerialReconnectBtn'),toolbar.querySelector('#fwSerialResetBtn'),
   toolbar.querySelector('.dw-serial-access')].filter(Boolean);
  const ys=items.map(n=>Math.round(n.getBoundingClientRect().top));
  const ports=[document.getElementById('fwSerialMonitorBtn'),document.getElementById('fwSerialClearBtn')];
  const first=ports[0].getBoundingClientRect(),second=ports[1].getBoundingClientRect();
  return {oneRow:ys.every(y=>Math.abs(y-ys[0])<=9),grouped:ports.every(n=>n.closest('.dw-serial-access')),
   portInline:Math.abs(first.top-second.top)<=2};
 });
 if(!serialWide.oneRow||!serialWide.grouped||!serialWide.portInline)
  hardFailures.push('Desktop USB Serial tools should fit in one row with Open/Clear grouped');
 await page.setViewportSize({width:390,height:760});
 await page.waitForTimeout(160);
 const serialMobile=await page.evaluate(()=>{
  const group=document.querySelector('.dw-serial-access'),buttons=[...group.querySelectorAll('button')];
  const rects=buttons.map(b=>b.getBoundingClientRect());
  return {sameRow:Math.abs(rects[0].top-rects[1].top)<3,
   inside:rects.every(r=>r.left>=-1&&r.right<=innerWidth+1)};
 });
 if(!serialMobile.sameRow||!serialMobile.inside)
  hardFailures.push('Mobile Open Serial Port and Clear Output should remain side-by-side without clipping');
 // A short desktop screen must scroll the middle menu while header/status stay frozen.
 await page.setViewportSize({width:1480,height:410});
 await page.waitForTimeout(230);
 const navSize=await page.evaluate(()=>{
  const el=document.querySelector('.dw-nav-list');
  return {height:el.clientHeight,scrollHeight:el.scrollHeight,overflow:getComputedStyle(el).overflowY};
 });
 if(navSize.overflow!=='auto'||navSize.scrollHeight<=navSize.height+10)
  hardFailures.push('Short desktop hardware sidebar navigation should overflow independently');
 const prior=await page.evaluate(()=>({
  bodyY:scrollY,contentY:document.querySelector('#dw-body-wifi').scrollTop,
  navY:document.querySelector('.dw-nav-list').scrollTop
 }));
 await page.locator('.dw-nav-list').hover();
 await page.mouse.wheel(0,220);
 await page.waitForTimeout(200);
 const menuAfter=await page.evaluate(()=>({
  bodyY:scrollY,contentY:document.querySelector('#dw-body-wifi').scrollTop,
  navY:document.querySelector('.dw-nav-list').scrollTop
 }));
 if(menuAfter.navY<=prior.navY+10||Math.abs(menuAfter.bodyY-prior.bodyY)>2||
    Math.abs(menuAfter.contentY-prior.contentY)>2)
  hardFailures.push('Short desktop mousewheel should scroll only the left hardware menu');
 // Mobile should return to one natural scrolling document and sticky horizontal menu.
 await page.setViewportSize({width:390,height:760});
 await page.waitForTimeout(250);
 const mobile=await page.evaluate(()=>{
  const el=document.querySelector('.dw-sidebar'),nav=document.querySelector('.dw-nav-list');
  const shell=document.getElementById('devicesWorkspace');
  const content=document.getElementById('dw-body-wifi');
  return {sidebarPos:getComputedStyle(el).position,navOverflow:getComputedStyle(nav).overflowX,
    shellHeight:getComputedStyle(shell).height,contentOverflow:getComputedStyle(content).overflowY};
 });
 if(mobile.sidebarPos!=='sticky'||mobile.navOverflow!=='auto'||mobile.contentOverflow!=='visible')
  hardFailures.push('Mobile needs sticky horizontal navigation and natural document scrolling');
 await page.screenshot({path:'test-output/form-fit/hardware-scroll-mobile.png'});
 for(const width of widths){
  await page.setViewportSize({width,height:840});
  for(const tab of ['firmware','assembly','wiring','python','pid']){
   await page.locator('[data-tab="'+tab+'"]').click();
   await page.waitForTimeout(70);
   const r=await inspect('main:'+tab,width);record(r);
   if(tab==='firmware'){
    // Audit the new icon sidebar's active mobile pairing view and the other
    // hardware sections, without opening any physical flash operation.
    await page.locator('[data-dw-view="mobile"]').click();
    await page.evaluate(()=>{document.getElementById('pairStep2').open=true});
    const mobile=await inspect('devices:mobile',width);record(mobile);
    if(!mobile.inputs.find(x=>x.id==='pairPhoneCode'))hardFailures.push('Devices Mobile Controller '+width+'px Step 2 code input hidden');
    if(width===390||width===1294)await page.screenshot({path:'test-output/form-fit/devices-mobile-'+width+'.png',fullPage:true});
    for(const section of ['overview','connection','wifi','firmware','diagnostics','security']){
     await page.locator('[data-dw-view="'+section+'"]').click();
     record(await inspect('devices:'+section,width));
    }
   }
  }
 }
 for(const pathname of ['tripod.html?standalone=1','companion.html','lab.html']){
  await page.goto(base+pathname,{waitUntil:'domcontentloaded',timeout:35000});
  if(pathname.startsWith('tripod')){
   await page.evaluate(()=>{document.querySelector('#connectionDialog')?.removeAttribute('hidden');const s=document.querySelector('#pairStep2');if(s)s.open=true;});
  }
  for(const width of [390,768,1294]){
   await page.setViewportSize({width,height:840});
   const r=await inspect(pathname,width);record(r);
   if(width===390)await page.screenshot({path:'test-output/form-fit/'+pathname.split('.')[0]+'-'+width+'.png',fullPage:true});
  }
 }
 const problems=reports.flatMap(r=>r.inputs.filter(i=>!i.fit).map(i=>({page:r.tag,width:r.width,id:i.id,placeholder:i.placeholder,required:i.textPixels,available:i.availablePixels})));
 writeFileSync('test-output/form-fit/audit.json',JSON.stringify({viewports:widths,screenCount:reports.length,problems,failures:hardFailures,all:reports},null,2));
 console.log('AUDIT '+reports.length+' rendered page/viewport checks; '+reports.reduce((n,r)=>n+r.inputs.length,0)+' placeholder measurements; '+hardFailures.length+' clipping problems');
 for(const failure of hardFailures)console.error('FORM FIT ISSUE: '+failure);
 if(pageErrors.length)console.log('Nonfatal page JS diagnostics: '+pageErrors.slice(0,6).join(' | '));
 if(hardFailures.length)process.exitCode=1;
}catch(e){console.error('Responsive audit failed:',e.stack||e);process.exitCode=1}
finally{await browser.close()}
