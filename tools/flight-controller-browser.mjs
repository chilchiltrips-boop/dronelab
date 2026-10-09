import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import {mkdirSync} from 'node:fs';
mkdirSync('test-output',{recursive:true});
const browser=await chromium.launch(browserOptions);
const ctx=await browser.newContext({viewport:{width:1250,height:810},serviceWorkers:'block'});
await configureContext(ctx);
const web=await ctx.newPage(),phone=await ctx.newPage(),errors=[];
for(const page of [web,phone])page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:8765/';
const wait=(p,fn,timeout=18000)=>p.waitForFunction(fn,null,{timeout});
try{
 await Promise.all([
  web.goto(base+'#settings',{waitUntil:'domcontentloaded'}),
  phone.goto(base+'companion.html?cockpit=1',{waitUntil:'domcontentloaded'})
 ]);
 await web.locator('[data-tab="settings"]').click();
 await wait(phone,()=>window.ZebjusFlightApp&&document.documentElement.classList.contains('cockpit-active'));
 if(!(await phone.locator('#flightCockpit').isVisible()))throw Error('Android cockpit not shown');
 if(!(await phone.locator('#flightArm').isDisabled()))throw Error('Unpaired flight ARM active');
 if(await phone.locator('#flightPreset option').count()!==3)throw Error('Expected exactly three joystick response presets');
 await phone.screenshot({path:'test-output/android-flight-landscape.png'});
 await phone.evaluate(()=>window.ZebjusFlightApp.show(false));
 // Real existing QR offer/answer exchange, actual in-browser encrypted WebRTC channel.
 await web.locator('#pairCreateBtn').click();
 await wait(web,()=>document.getElementById('pairOfferText').value.startsWith('zj1:'));
 const offer=await web.locator('#pairOfferText').inputValue();
 await phone.locator('#offerInput').fill(offer);await phone.locator('#useOfferBtn').click();
 await wait(phone,()=>document.getElementById('answerText').value.startsWith('zj1:'));
 const answer=await phone.locator('#answerText').inputValue();
 await web.locator('#pairStep1NextBtn').click();
 await web.locator('#pairAnswerText').fill(answer);
 await web.locator('#pairUseAnswerBtn').click();
 await wait(web,()=>!document.getElementById('pairConfirmBtn').disabled);
 await web.locator('#pairConfirmBtn').click();
 await wait(phone,()=>!document.getElementById('requestControlBtn').disabled);
 await phone.locator('#requestControlBtn').click();
 await web.locator('#topGrantMobileSwitch').evaluate(input=>{
  // User-level switch click — emulate ordinary browser click on its label.
  input.closest('label').click();
 });
 await wait(phone,()=>document.getElementById('flightOwner').textContent==='CONTROL GRANTED');
 await web.locator('.tab[data-tab="simcontrol"]').click();
 await wait(web,()=>document.getElementById('simReceiverState').textContent.includes('READY'),22000);
 await phone.evaluate(()=>window.ZebjusFlightApp.show(true));
 await wait(phone,()=>!document.getElementById('flightArm').disabled);
 // Three response presets persist and remain bound to one controller.
 await phone.locator('#flightSettings').click();
 await phone.locator('#flightPreset').selectOption('Fast');
 await phone.locator('#flightOptions').evaluate(el=>{if(el.hidden)throw Error('Settings panel unexpectedly closed')});
 await phone.locator('#flightSettings').click();
 await phone.locator('#flightArm').click();
 await wait(phone,()=>document.getElementById('flightFeedback').textContent.includes('ACK'),15000);
 const sim=web.frameLocator('#simRemoteFrame');
 await wait(web,()=>document.getElementById('simControlInfo').textContent.includes('Mobile control'));
 // Hold left stick upward long enough to increase throttle at full rate, then release.
 const left=await phone.locator('#flightLeftZone').boundingBox();
 const cx=left.x+left.width*.5,cy=left.y+left.height*.68;
 await phone.mouse.move(cx,cy);await phone.mouse.down();
 await phone.waitForTimeout(60);
 const initial=await phone.locator('#flightYaw').textContent();
 if(initial!=='0%')throw Error('First touch jumped yaw: '+initial);
 await phone.mouse.move(cx,cy-72,{steps:5});await phone.waitForTimeout(850);await phone.mouse.up();
 await wait(phone,()=>parseInt(document.getElementById('flightThrottle').textContent,10)>1090);
 const throttle=await phone.locator('#flightThrottle').textContent();
 await phone.waitForTimeout(150);
 if(await phone.locator('#flightThrottle').textContent()!==throttle)throw Error('Throttle changed after touch release');
 await wait(web,()=>document.getElementById('simControlInfo').textContent.includes('µs'));
 await wait(phone,()=>document.getElementById('flightYaw').textContent==='0%');
 // Right stick first touch/return-to-center and safe STOP.
 const right=await phone.locator('#flightRightZone').boundingBox();
 await phone.mouse.move(right.x+right.width*.5,right.y+right.height*.68);await phone.mouse.down();
 await phone.mouse.move(right.x+right.width*.7,right.y+right.height*.46,{steps:4});
 await wait(phone,()=>parseInt(document.getElementById('flightRoll').textContent,10)>10);
 await phone.mouse.up();
 await wait(phone,()=>document.getElementById('flightRoll').textContent==='0%');
 await phone.locator('#flightStop').click();
 await wait(phone,()=>document.getElementById('flightThrottle').textContent==='1000 µs');
 await wait(web,()=>document.getElementById('simControlInfo').textContent.includes('DISARMED'),15000);
 await wait(web,()=>document.getElementById('simRemoteFrame')?.contentDocument?.getElementById('tpThrottleReadout')?.textContent==='1000 µs',12000);
 if(errors.length)throw Error('Uncaught page errors: '+errors.join(' | '));
 console.log('PASS encrypted WebRTC QR paired Android cockpit -> receiver-owned Tripod, ARM, 25Hz ACK, throttle hold, dual sticks, STOP');
}catch(e){console.error('ANDROID FLIGHT WEBRTC FAILURE:',e.stack||e);console.error('BROWSER ERRORS:',errors);
 await web.screenshot({path:'test-output/android-flight-error-web.png',fullPage:true}).catch(()=>{});
 await phone.screenshot({path:'test-output/android-flight-error-phone.png',fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{await browser.close()}
