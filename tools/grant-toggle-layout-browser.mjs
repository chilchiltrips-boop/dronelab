import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {browserOptions,configureContext} from './browser-harness.mjs';

mkdirSync('test-output',{recursive:true});
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1294,height:801},serviceWorkers:'block',reducedMotion:'reduce'});
await configureContext(context);
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const rect=obj=>({x:obj.x,y:obj.y,right:obj.right,bottom:obj.bottom,width:obj.width,height:obj.height});
const collides=(a,b)=>a.right>b.x+.25&&b.right>a.x+.25&&a.bottom>b.y+.25&&b.bottom>a.y+.25;
let checks=0;
try{
 await page.goto('http://127.0.0.1:8765/index.html#assembly',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#topGrantMobileSwitch');
 for(const width of [320,360,390,480,670,768,1024,1100,1294,1440,1920]){
  await page.setViewportSize({width,height:850});
  // Test disabled, enabled and checked states; no live connection/armed flight is affected.
  for(const state of ['disabled','enabled','checked']){
   await page.locator('#topGrantMobileSwitch').evaluate((el,state)=>{el.disabled=state==='disabled';el.checked=state==='checked'},state);
   const layout=await page.locator('.top-grant-control').evaluate(label=>{
    const text=label.querySelector('.grant-control-text'),track=label.querySelector('.qr-switch-track');
    const get=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    const range=document.createRange();range.selectNodeContents(text);
    return {label:get(label),text:get(text),track:get(track),
     glyphs:[...range.getClientRects()].map(r=>({x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height})),
     css:{labelDisplay:getComputedStyle(label).display,gap:getComputedStyle(label).columnGap},
     textScroll:text.scrollWidth,textClient:text.clientWidth,
     htmlScroll:document.documentElement.scrollWidth};
   });
   const fail=message=>{throw Error(width+'px '+state+': '+message+' '+JSON.stringify(layout))};
   if(layout.css.labelDisplay!=='inline-grid'&&layout.css.labelDisplay!=='grid')fail('switch must use a two-column grid');
   if(layout.track.width<39.8||layout.track.width>40.2)fail('switch track not reserved 40px');
   if(layout.track.x-layout.text.right<8)fail('text column adjacent/overlapping switch');
   if(layout.text.scrollWidth>layout.text.clientWidth+1)fail('label text overflow');
   if(!layout.glyphs.length)fail('no visible label text');
   for(const glyph of layout.glyphs){
    if(collides(glyph,layout.track))fail('glyph overlaps switch track');
    if(glyph.x<layout.text.x-1||glyph.right>layout.text.right+1)fail('glyph clipped horizontally');
   }
   const r=layout.label;
   if(r.x<-.5||r.right>width+.5)fail('control overflows viewport');
   checks++;
  }
  if([320,390,768,1294].includes(width))await page.screenshot({path:'test-output/grant-mobile-'+width+'.png'});
 }
 await page.setViewportSize({width:1294,height:801});
 for(const tab of ['pid','settings','python','assembly']){
  await page.locator('[data-tab="'+tab+'"]').click();
  const t=await page.locator('.top-grant-control .grant-control-text').textContent();
  if(t.trim()!=='Grant Mobile Control')throw Error('Grant switch disappeared on '+tab);
  const r=await page.locator('.top-grant-control').boundingBox();
  if(!r||r.width<170)throw Error('Header control collapsed on '+tab);
 }
 if(errors.length)throw Error('Browser errors: '+errors.join(' | '));
 console.log('PASS Grant Mobile Control switch: '+checks+' widths/states geometric non-overlap checks + persistent top header across 4 pages');
}catch(e){console.error(e.stack||e);await page.screenshot({path:'test-output/grant-mobile-error.png'}).catch(()=>{});process.exitCode=1}
finally{await browser.close()}
