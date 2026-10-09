/* V1.3 Smart Two-Way QR e2e.
   Both QR images are decoded from their own pixels by jsQR; the laptop webcam
   callback is simulated because CI does not own a physical camera. WebRTC peers
   and ACK messages are real Chromium PeerConnections.
*/
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
mkdirSync('test-output',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream']});
const ctx=await browser.newContext({viewport:{width:1450,height:900}}),web=await ctx.newPage(),phone=await ctx.newPage();
const errors=[];
for(const page of [web,phone])page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:8765/';
async function assertQr(page,id,expected){
 const decoded=await page.locator('#'+id).evaluate(canvas=>{
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),pix=ctx.getImageData(0,0,canvas.width,canvas.height);
  return jsQR(pix.data,canvas.width,canvas.height,{inversionAttempts:'attemptBoth'})?.data||null;
 });
 if(decoded!==expected)throw Error(id+' is not readable as the expected QR');
}
async function onePair(){
 await web.locator('#pairCreateBtn').click();
 await web.waitForFunction(()=>document.getElementById('pairOfferText').value.startsWith('zj1:'),null,{timeout:22000});
 const offer=await web.locator('#pairOfferText').inputValue();
 await assertQr(web,'pairOfferCanvas',offer);
 await web.waitForFunction(()=>!!window.__qrScanOptions,null,{timeout:5000});
 await phone.locator('#offerInput').fill(offer);
 await phone.locator('#useOfferBtn').click();
 await phone.waitForFunction(()=>document.getElementById('answerText').value.startsWith('zj1:'),null,{timeout:22000});
 const answer=await phone.locator('#answerText').inputValue();
 await assertQr(phone,'answerCanvas',answer);
 const pinWeb=await web.locator('#pairCode').textContent(),pinMobile=await phone.locator('#appPairCode').textContent();
 if(pinWeb!==pinMobile||!/^\d{6}$/.test(pinWeb))throw Error('Pairing PIN mismatch');
 // Simulate the laptop camera scanning the actual phone QR we just pixel-decoded.
 await web.evaluate(answer=>window.__qrScanOptions.onData(answer),answer);
 await web.waitForFunction(()=>!document.getElementById('pairConfirmBtn').disabled,null,{timeout:17000});
 await web.locator('#pairConfirmBtn').click();
 await phone.waitForFunction(()=>!document.getElementById('requestControlBtn').disabled,null,{timeout:17000});
 return pinWeb;
}
async function grantAndToggle(){
 await phone.locator('#requestControlBtn').click();
 await web.locator('.qr-header-switch').click();
 await phone.waitForFunction(()=>!document.getElementById('mobileLedOn').disabled,null,{timeout:14000});
 if(await web.locator('#webLedOn').isEnabled())throw Error('Web LED must lock while phone owns control');
 await phone.locator('#mobileLedOn').click();
 await web.waitForFunction(()=>document.getElementById('ledState').textContent==='LED ON',null,{timeout:12000});
 await phone.waitForFunction(()=>document.getElementById('mobileLedState').textContent==='LED ON',null,{timeout:12000});
 await phone.locator('#mobileLedOff').click();
 await phone.waitForFunction(()=>document.getElementById('mobileLedState').textContent==='LED OFF',null,{timeout:12000});
 await web.locator('.qr-header-switch').click();
 await phone.waitForFunction(()=>document.getElementById('mobileLedOn').disabled,null,{timeout:12000});
}
try{
 await Promise.all([web.goto(base+'#settings',{waitUntil:'domcontentloaded'}),phone.goto(base+'companion.html',{waitUntil:'domcontentloaded'})]);
 await web.locator('[data-tab="settings"]').click();
 if(!((await web.locator('#webappVersion').textContent())||'').includes('1.3.0'))throw Error('Web version not updated to 1.3');
 if(!(await web.locator('#mobileHeaderStatus').getAttribute('class')).includes('disconnected'))throw Error('Disconnected status not red');
 if(!(await phone.locator('#mobileLedOn').isDisabled()))throw Error('Unpaired phone can control LED');
 // CI camera surrogate: check that pairing triggers scanning without another click.
 await web.evaluate(()=>{const old=window.ZebjusQR.scan;window.__oldQrScan=old;window.ZebjusQR.scan=async opts=>{window.__qrScanOptions=opts;return ()=>{};}});
 const pin=await onePair();
 console.log('PASS QR offer + Android auto reply QR generated and pixel decoded; Web webcam auto callback; PIN '+pin);
 if(!(await web.locator('#topGrantMobileSwitch').isEnabled()))throw Error('Header grant toggle not enabled after pairing');
 await grantAndToggle();
 console.log('PASS mobile grant toggle, LED ON / OFF state ACK, exclusive controller lock');
 await phone.evaluate(()=>window.zebjusNetworkChanged());
 await phone.waitForFunction(()=>document.getElementById('mobileLedOn').disabled&&document.getElementById('appPairCode').textContent==='------',null,{timeout:12000});
 await web.waitForFunction(()=>document.getElementById('mobileHeaderStatus').textContent.includes('Disconnected'),null,{timeout:12000});
 console.log('PASS network-change reset revokes stale control and old QR session');
 await onePair(); // Full fresh QR exchange; no local bridge or cloud.
 await phone.locator('#requestControlBtn').click();
 await web.locator('.qr-header-switch').click();
 await phone.waitForFunction(()=>!document.getElementById('mobileLedOn').disabled,null,{timeout:12000});
 await phone.locator('#mobileLedOn').click();
 await phone.waitForFunction(()=>document.getElementById('mobileLedState').textContent==='LED ON',null,{timeout:12000});
 console.log('PASS fresh QR re-pair after Wi-Fi change restores LED control');
 await web.screenshot({path:'test-output/smart-qr-web-settings.png',fullPage:true});
 await phone.screenshot({path:'test-output/smart-qr-android-response.png',fullPage:true});
 await web.reload({waitUntil:'domcontentloaded'});
 await web.waitForFunction(()=>document.getElementById('mobileHeaderStatus').textContent.includes('Disconnected'),null,{timeout:10000});
 await phone.waitForFunction(()=>document.getElementById('mobileLedOn').disabled,null,{timeout:15000});
 if((await web.locator('#pairCode').textContent())!=='------')throw Error('Refresh did not discard PIN');
 if(errors.length)throw Error('JS errors: '+errors.join(' | '));
 console.log('SUCCESS Smart Two-Way QR 1.3.0: two camera-decodable QR payloads, WebRTC, control lock, ACK, fresh Wi-Fi re-pair, refresh invalidation');
}catch(err){
 console.error('SMART TWO-WAY QR TEST FAILED:',err.stack||err);
 console.error('WEB:',await web.locator('#pairAnswerState').textContent().catch(()=>''),'PHONE:',await phone.locator('#answerState').textContent().catch(()=>''));
 console.error('PHONE LOG:',(await phone.locator('#mobileLog').textContent().catch(()=>''))?.slice(-1200));
 console.error('JS ERRORS:',errors);
 await web.screenshot({path:'test-output/smart-qr-failed-web.png',fullPage:true}).catch(()=>{});
 await phone.screenshot({path:'test-output/smart-qr-failed-android.png',fullPage:true}).catch(()=>{});
 process.exitCode=1;
}finally{await browser.close()}
