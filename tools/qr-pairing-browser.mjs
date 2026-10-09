/* V1.2.0 Cloud-free One-Scan WebRTC integration test using local Python signaling bridge.
   Browser Android surrogate uses same companion.js and QR payload; native HTTP callback is
   separately validated by Android APK build and source/tests. */
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
mkdirSync('test-output',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream']});
const ctx=await browser.newContext({viewport:{width:1450,height:920}}),web=await ctx.newPage(),android=await ctx.newPage();
const failures=[];
for(const p of [web,android])p.on('pageerror',e=>failures.push(e.message));
const base='http://127.0.0.1:8765/';
async function connect(){
 await web.locator('#pairCreateBtn').click();
 await web.waitForFunction(()=>document.getElementById('pairOfferText')?.value.startsWith('zj1:'),null,{timeout:20000});
 const offer=await web.locator('#pairOfferText').inputValue();
 const qr=await web.locator('#pairOfferCanvas').evaluate(c=>{
  const ctx=c.getContext('2d',{willReadFrequently:true}),pixels=ctx.getImageData(0,0,c.width,c.height);
  return jsQR(pixels.data,c.width,c.height,{inversionAttempts:'attemptBoth'})?.data;
 });
 if(qr!==offer)throw Error('Offer QR was not camera-decodable');
 await android.locator('#offerInput').fill(offer);
 await android.locator('#useOfferBtn').click(); // Simulates the result of the SINGLE Android QR scan.
 await android.waitForFunction(()=>document.getElementById('answerState').textContent.includes('Answer delivered'),null,{timeout:30000});
 await web.waitForFunction(()=>!document.getElementById('pairConfirmBtn').disabled,null,{timeout:30000});
 const webPin=await web.locator('#pairCode').textContent(),phonePin=await android.locator('#appPairCode').textContent();
 if(webPin!==phonePin||!(/^[0-9]{6}$/.test(webPin)))throw Error('QR pairing PIN mismatch');
 await web.locator('#pairConfirmBtn').click();
 await android.waitForFunction(()=>!document.getElementById('requestControlBtn').disabled,null,{timeout:15000});
 return webPin;
}
try{
 await Promise.all([web.goto(base+'#settings',{waitUntil:'domcontentloaded'}),android.goto(base+'companion.html',{waitUntil:'domcontentloaded'})]);
 await web.locator('[data-tab="settings"]').click();
 if(!((await web.locator('#webappVersion').textContent())||'').includes('1.2.0'))throw Error('Missing V1.2 version');
 if(!((await web.locator('#mobileHeaderStatus').getAttribute('class'))||'').includes('disconnected'))throw Error('Disconnected must be red');
 if(!(await android.locator('#mobileLedOn').isDisabled()))throw Error('Unpaired Android LED must be disabled');
 const pin=await connect();
 console.log('PASS single Android QR, automatic authenticated LAN answer, WebRTC, human confirmation PIN '+pin);
 if(!(await web.locator('#topGrantMobileSwitch').isEnabled()))throw Error('Header Grant Mobile Control toggle not enabled');
 await android.locator('#requestControlBtn').click();
 await web.locator('.qr-header-switch').click();
 await android.waitForFunction(()=>!document.getElementById('mobileLedOn').disabled,null,{timeout:12000});
 if(await web.locator('#webLedOn').isEnabled())throw Error('Web LED must be locked when Android controls it');
 await android.locator('#mobileLedOn').click();
 await web.waitForFunction(()=>document.getElementById('ledState').textContent==='LED ON',null,{timeout:10000});
 await android.waitForFunction(()=>document.getElementById('mobileLedState').textContent==='LED ON',null,{timeout:10000});
 await android.locator('#mobileLedOff').click();
 await android.waitForFunction(()=>document.getElementById('mobileLedState').textContent==='LED OFF',null,{timeout:10000});
 await web.locator('.qr-header-switch').click();
 await android.waitForFunction(()=>document.getElementById('mobileLedOn').disabled,null,{timeout:10000});
 console.log('PASS top control toggle ON/OFF and ACK-synchronized LED state');
 await web.locator('.qr-header-switch').click();
 await android.waitForFunction(()=>!document.getElementById('mobileLedOn').disabled,null,{timeout:10000});
 await android.evaluate(()=>window.zebjusNetworkChanged());
 await android.waitForFunction(()=>document.getElementById('mobileLedOn').disabled&&document.getElementById('appPairCode').textContent==='------',null,{timeout:10000});
 await web.waitForFunction(()=>document.getElementById('mobileHeaderStatus').textContent.includes('Disconnected'),null,{timeout:12000});
 console.log('PASS Wi-Fi change revokes stale pairing, session and controller lock');
 await web.locator('#pairCreateBtn').click();
 await web.waitForFunction(()=>document.getElementById('pairOfferText').value.startsWith('zj1:'),null,{timeout:20000});
 const fresh=await web.locator('#pairOfferText').inputValue();
 await android.locator('#offerInput').fill(fresh);
 await android.locator('#useOfferBtn').click();
 await android.waitForFunction(()=>document.getElementById('answerState').textContent.includes('Answer delivered'),null,{timeout:30000});
 await web.waitForFunction(()=>!document.getElementById('pairConfirmBtn').disabled,null,{timeout:30000});
 await web.locator('#pairConfirmBtn').click();
 await android.waitForFunction(()=>!document.getElementById('requestControlBtn').disabled,null,{timeout:15000});
 await android.locator('#requestControlBtn').click();
 await web.locator('.qr-header-switch').click();
 await android.waitForFunction(()=>!document.getElementById('mobileLedOn').disabled,null,{timeout:10000});
 await android.locator('#mobileLedOn').click();
 await android.waitForFunction(()=>document.getElementById('mobileLedState').textContent==='LED ON',null,{timeout:10000});
 console.log('PASS QR re-pairing after Wi-Fi change restores LED control');
 await web.screenshot({path:'test-output/one-scan-web-settings.png',fullPage:true});
 await android.screenshot({path:'test-output/one-scan-android-companion.png',fullPage:true});
 await web.reload({waitUntil:'domcontentloaded'});
 await web.waitForFunction(()=>document.getElementById('mobileHeaderStatus').textContent.includes('Disconnected'),null,{timeout:8000});
 await android.waitForFunction(()=>document.getElementById('mobileLedOn').disabled,null,{timeout:12000});
 if((await web.locator('#pairCode').textContent())!=='------')throw Error('Refresh preserved old pairing code');
 if(failures.length)throw Error('Uncaught JS: '+failures.join(' | '));
 console.log('SUCCESS V1.2: one QR scan, no cloud, automatic answer, exclusive grant toggle, LED ACKs, Wi-Fi re-pair, page-refresh invalidation');
}catch(e){
 console.error('ONE-SCAN E2E FAILED:',e.stack||e);
 console.error('WEB STATUS:',await web.locator('#pairAnswerState').textContent().catch(()=>''),'ANDROID STATUS:',await android.locator('#answerState').textContent().catch(()=>''));
 console.error('LOG:',(await android.locator('#mobileLog').textContent().catch(()=>''))?.slice(-900));
 console.error('JS ERRORS:',failures);
 await web.screenshot({path:'test-output/one-scan-failed-web.png',fullPage:true}).catch(()=>{});
 await android.screenshot({path:'test-output/one-scan-failed-android.png',fullPage:true}).catch(()=>{});
 process.exitCode=1;
}finally{await browser.close()}
