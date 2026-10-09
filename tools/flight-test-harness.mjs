import {chromium} from 'playwright';import {browserOptions,configureContext} from './browser-harness.mjs';
export const base='http://127.0.0.1:8765/';
export const wait=(p,fn,timeout=18000)=>p.waitForFunction(fn,null,{timeout});
export async function pairBench(){
 const browser=await chromium.launch(browserOptions),ctx=await browser.newContext({viewport:{width:1440,height:900},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});await configureContext(ctx);
 await ctx.addInitScript(()=>{
  let api;Object.defineProperty(window,'ZebjusP2P',{configurable:true,get:()=>api,set(value){api=value;const original=value.session;value.session=(...args)=>window.__testPeer=original(...args)}});
 });
 const web=await ctx.newPage(),phone=await ctx.newPage(),errors=[];for(const page of [web,phone])page.on('pageerror',e=>errors.push(e.message));
 await Promise.all([web.goto(base+'tripod.html'),phone.goto(base+'companion.html')]);
 await web.locator('#topPairMobileBtn').click();await phone.locator('#flightSettings').click();
 return {browser,ctx,web,phone,errors};
}
export async function exchange(web,phone,{camera=false}={}){
 await web.locator(camera?'#pairCameraMode':'#pairCodeMode').click();await web.locator('#pairCreateBtn').click();
 await wait(web,()=>document.getElementById('pairOfferText').value.startsWith('zj1:'));
 const offer=await web.locator('#pairOfferText').inputValue();
 await phone.locator('#offerInput').fill(offer);await phone.locator('#useOfferBtn').click();
 await wait(phone,()=>document.getElementById('answerText').value.startsWith('zj1:'));const answer=await phone.locator('#answerText').inputValue();
 await web.locator('#pairStep1NextBtn').click();await web.locator('.qr-advanced').evaluate(e=>e.open=true);
 await web.locator('#pairAnswerText').fill(answer);await web.locator('#pairUseAnswerBtn').click();
 await wait(web,()=>!document.getElementById('pairConfirmBtn').disabled);await web.locator('#pairConfirmBtn').click();
 await wait(phone,()=>!document.getElementById('requestControlBtn').disabled);
}
export async function grant(web,phone){
 await phone.locator('#requestControlBtn').click();await web.locator('#topGrantMobileSwitch').evaluate(e=>e.closest('label').click());
 await wait(phone,()=>!document.getElementById('flightArm').disabled);
}
export async function safeShot(page,path){const masks=page.locator('#pairOfferCanvas,#pairCode,#pairVerifyPin,#pairOfferText,#pairAnswerText,#pairPhoneCode,#answerCanvas,#appPairCode,#answerText,#offerInput,#phoneShortCode,#mobileLog,#pairActivityLog,#pairDeviceList');await page.screenshot({path,fullPage:true,mask:[masks]})}
