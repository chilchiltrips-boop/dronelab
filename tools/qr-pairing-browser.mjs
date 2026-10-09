/* QR pixels decoded by jsQR; camera callbacks are a surrogate, encrypted peers
 * and applied control ACKs are real Chromium. Public code service is tested separately. */
import {pairBench,grant,wait,safeShot} from './flight-test-harness.mjs';import {mkdirSync} from 'node:fs';
mkdirSync('test-output',{recursive:true});const {browser,web,phone,errors}=await pairBench();
async function assertQr(p,id,value){const decoded=await p.locator('#'+id).evaluate(c=>{const x=c.getContext('2d',{willReadFrequently:true}),data=x.getImageData(0,0,c.width,c.height);return jsQR(data.data,c.width,c.height,{inversionAttempts:'attemptBoth'})?.data});if(decoded!==value)throw Error('QR pixel roundtrip failed '+id)}
async function finishPair(){await wait(web,()=>!document.getElementById('pairConfirmBtn').disabled);if(!await web.locator('#pairConfirmPanel').evaluate(e=>e.classList.contains('ready')))throw Error('Confirmation readiness missing');await web.locator('#pairConfirmBtn').click();await wait(phone,()=>!document.getElementById('requestControlBtn').disabled)}
async function onePair(){
 await web.evaluate(()=>window.__qrScanOptions=null);await web.locator('#pairCreateBtn').click();await wait(web,()=>document.getElementById('pairOfferText').value.startsWith('zj1:'));
 const offer=await web.locator('#pairOfferText').inputValue();await assertQr(web,'pairOfferCanvas',offer);
 if(await web.evaluate(()=>!!window.__qrScanOptions))throw Error('Camera opened during Step 1');
 await phone.locator('#offerInput').fill(offer);await phone.locator('#useOfferBtn').click();await wait(phone,()=>document.getElementById('answerText').value.startsWith('zj1:'));
 const answer=await phone.locator('#answerText').inputValue();await assertQr(phone,'answerCanvas',answer);
 if(await web.locator('#pairCode').textContent()!==await phone.locator('#appPairCode').textContent())throw Error('Safety PIN differs');
 await web.locator('#pairStep1NextBtn').click();await web.locator('#pairScanAnswerBtn').click();await wait(web,()=>!!window.__qrScanOptions,5000);
 await web.evaluate(value=>window.__qrScanOptions.onData(value),answer);await finishPair();
}
async function exerciseControl(){
 await grant(web,phone);await phone.locator('#flightBack').click();await phone.locator('#flightArm').click();await wait(web,()=>window.ZebjusTraining.snapshot().armed);
 await phone.locator('#flightStop').click();await wait(web,()=>!window.ZebjusTraining.snapshot().armed&&window.ZebjusTraining.snapshot().motors.rpm.every(x=>x===0));
 await phone.locator('#flightSettings').click();await web.locator('#topGrantMobileSwitch').evaluate(e=>e.closest('label').click());await wait(phone,()=>document.getElementById('flightArm').disabled);
}
try{
 if(!await web.locator('#pairCameraSection').isHidden()||await web.locator('#pairCodeMode').getAttribute('aria-pressed')!=='true')throw Error('Code default lost');
 if(!await phone.locator('#flightArm').isDisabled())throw Error('Unpaired ARM enabled');
 const ui=await web.locator('body').textContent();if(/LED ON|LED OFF|ANDROID FLIGHT/.test(ui)||await web.locator('iframe').count())throw Error('Legacy control feature remains');
 await web.evaluate(()=>window.ZebjusQR.scan=async opts=>{window.__qrScanOptions=opts;return ()=>{}});
 await web.locator('#pairCameraMode').click();await onePair();await exerciseControl();
 await phone.evaluate(()=>window.zebjusNetworkChanged());await wait(web,()=>document.getElementById('mobileHeaderStatus').textContent.includes('Disconnected'));
 await wait(phone,()=>document.getElementById('appPairCode').textContent==='------');await onePair();await exerciseControl();
 // Preserve the six-digit UI path. Only public signaling lookup is substituted.
 await web.locator('#pairDisconnectBtn').click();await phone.locator('#resetPairBtn').click();await web.locator('#pairCodeMode').click();
 await web.locator('#pairCreateBtn').click();await wait(web,()=>document.getElementById('pairOfferText').value.startsWith('zj1:'));
 const offer=await web.locator('#pairOfferText').inputValue();await phone.locator('#offerInput').fill(offer);await phone.locator('#useOfferBtn').click();await wait(phone,()=>document.getElementById('answerText').value.startsWith('zj1:'));
 const answer=await phone.locator('#answerText').inputValue();await web.exposeFunction('__testCodeReply',()=>answer);await web.evaluate(()=>window.ZebjusCodePair.resolveAnswer=async ({code})=>{if(code!=='654321')throw Error('Wrong test code');return window.__testCodeReply()});
 await web.locator('#pairStep1NextBtn').click();await web.locator('#pairPhoneCode').fill('654321');await web.locator('#pairConnectCodeBtn').click();await finishPair();await exerciseControl();
 await safeShot(web,'test-output/connection-confirmed.png');await safeShot(phone,'test-output/android-connection-sheet.png');
 await web.reload();await wait(phone,()=>document.getElementById('flightArm').disabled);await wait(web,()=>document.getElementById('mobileHeaderStatus').textContent.includes('Disconnected'));
 if(await web.locator('#pairCode').textContent()!=='------')throw Error('Refresh retained pairing');if(errors.length)throw Error(errors.join(' | '));
 console.log('PASS real encrypted QR pairing/ACK/STOP: camera pixels, code UI, PIN approval, exclusive owner, Wi-Fi reset/fresh QR, refresh invalidation; no legacy LED');
}catch(e){console.error(e.stack||e);console.error(errors);await safeShot(web,'test-output/qr-error-web.png').catch(()=>{});await safeShot(phone,'test-output/qr-error-phone.png').catch(()=>{});process.exitCode=1}finally{await browser.close()}
