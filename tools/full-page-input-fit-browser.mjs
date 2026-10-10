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
 for(const inp of result.inputs)if(!inp.fit)hardFailures.push(result.tag+' '+result.width+'px: placeholder #'+inp.id+' "'+inp.placeholder+'" requires '+inp.textPixels+'px, available '+inp.availablePixels+'px');
 for(const b of result.buttons)if(b.ratio>1.06)hardFailures.push(result.tag+' '+result.width+'px: control #'+b.id+' clipped ('+b.text+', ratio='+b.ratio+')');
}
try{
 await page.goto(base+'index.html#settings',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>document.querySelector('#app')?.dataset.ready==='true',null,{timeout:40000});
 await page.evaluate(()=>{const d=document.getElementById('pairStep2');if(d)d.open=true});
 for(const width of widths){
  await page.setViewportSize({width,height:840});
  for(const tab of ['settings','assembly','wiring','python','pid','firmware']){
   await page.locator('[data-tab="'+tab+'"]').click();
   await page.waitForTimeout(70);
   const r=await inspect('main:'+tab,width);record(r);
   if(tab==='settings'){
    if(!r.inputs.find(x=>x.id==='pairPhoneCode'))hardFailures.push('Main Settings '+width+'px Step 2 code input hidden');
    if(width===390||width===1294)await page.screenshot({path:'test-output/form-fit/settings-'+width+'.png',fullPage:true});
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
