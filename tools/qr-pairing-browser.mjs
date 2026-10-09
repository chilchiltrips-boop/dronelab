import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream']});
const ctx=await browser.newContext({viewport:{width:1480,height:900}}),web=await ctx.newPage(),phone=await ctx.newPage();
const fails=[],logs=[];
for(const p of [web,phone]){
 p.on('pageerror',e=>fails.push(e.message));
 p.on('console',m=>{if(m.type()==='error')logs.push(m.text())});
}
const url='http://127.0.0.1:8765/';
async function qrDecoded(page,canvasId,expected){
 const actual=await page.locator('#'+canvasId).evaluate(el=>{
  const c=el.getContext('2d',{willReadFrequently:true}),d=c.getImageData(0,0,el.width,el.height);
  return jsQR(d.data,el.width,el.height,{inversionAttempts:'attemptBoth'})?.data||null
 });
 if(actual!==expected)throw Error(canvasId+' QR encode/decode mismatch; decoded size '+actual?.length+', expected '+expected.length);
}
const log=message=>console.log('CHECK:',message);
try{
 await Promise.all([web.goto(url,{waitUntil:'domcontentloaded'}),phone.goto(url+'companion.html',{waitUntil:'domcontentloaded'})]);
 await web.locator('[data-tab="settings"]').click();
 await web.locator('#webappVersion').waitFor();
 if(!((await web.locator('#webappVersion').textContent())||'').includes('1.1.0'))throw Error('Web version missing');
 const phoneButtons=await phone.locator('#mobileLedOn').isDisabled();if(!phoneButtons)throw Error('Unpaired LED button must be disabled');
 await web.locator('#pairCreateBtn').click();
 await web.waitForFunction(()=>document.getElementById('pairOfferText')?.value.startsWith('zj1:'),null,{timeout:25000});
 const offer=await web.locator('#pairOfferText').inputValue();
 await qrDecoded(web,'pairOfferCanvas',offer);
 log('Web offer QR generated, encoded and decoded offline');
 await phone.locator('#offerInput').fill(offer);
 await phone.locator('#useOfferBtn').click();
 await phone.locator('#createAnswerBtn').waitFor({state:'visible'});
 if(await phone.locator('#createAnswerBtn').isDisabled())throw Error('Phone did not accept Web pairing offer');
 const firstCode=await web.locator('#pairCode').textContent(),secondCode=await phone.locator('#appPairCode').textContent();
 if(firstCode!==secondCode||!/^\d{6}$/.test(firstCode))throw Error('Pairing PIN mismatch');
 await phone.locator('#createAnswerBtn').click();
 await phone.waitForFunction(()=>document.getElementById('answerText')?.value.startsWith('zj1:'),null,{timeout:25000});
 const answer=await phone.locator('#answerText').inputValue();
 await qrDecoded(phone,'answerCanvas',answer);
 log('Android companion answer QR generated and decoded; matching PIN '+firstCode);
 await web.locator('#pairAnswerText').fill(answer);
 await web.locator('#pairUseAnswerBtn').click();
 await web.locator('#pairConfirmBtn').waitFor({state:'visible'});
 await web.waitForFunction(()=>document.getElementById('pairConfirmBtn')&&!document.getElementById('pairConfirmBtn').disabled,null,{timeout:30000});
 await web.locator('#pairConfirmBtn').click();
 await phone.waitForFunction(()=>document.getElementById('requestControlBtn')&&!document.getElementById('requestControlBtn').disabled,null,{timeout:12000});
 log('WebRTC peer connected and human confirmation approved');
 await phone.locator('#requestControlBtn').click();
 await web.locator('#pairGrantControlBtn').waitFor({state:'visible'});
 await web.waitForFunction(()=>!document.getElementById('pairGrantControlBtn').disabled,null,{timeout:10000});
 await web.locator('#pairGrantControlBtn').click();
 await phone.waitForFunction(()=>!document.getElementById('mobileLedOn').disabled,null,{timeout:10000});
 log('Single-controller lock granted explicitly to Android');
 await phone.locator('#mobileLedOn').click();
 await web.waitForFunction(()=>document.getElementById('ledState').textContent==='LED ON',null,{timeout:10000});
 await phone.waitForFunction(()=>document.getElementById('mobileLedState').textContent==='LED ON'&&document.getElementById('commandStatus').textContent.includes('confirmed'),null,{timeout:10000});
 if(await web.locator('#webLedOn').isEnabled())throw Error('Web LED button must be locked while Android owns control');
 await phone.locator('#mobileLedOff').click();
 await phone.waitForFunction(()=>document.getElementById('mobileLedState').textContent==='LED OFF'&&document.getElementById('commandStatus').textContent.includes('confirmed'),null,{timeout:10000});
 log('LED ON and OFF commands acknowledged and synchronized');
 await web.locator('[data-tab="led"]').click();
 await web.screenshot({path:'test-output/qr-led-desktop.png',fullPage:true});
 await phone.screenshot({path:'test-output/qr-companion-phone.png',fullPage:true});
 await web.reload({waitUntil:'domcontentloaded'});
 await web.waitForFunction(()=>document.getElementById('mobileHeaderStatus')?.textContent.includes('Disconnected'),null,{timeout:10000});
 await phone.waitForFunction(()=>document.getElementById('mobileLedOn')?.disabled===true,null,{timeout:15000});
 const lastCode=await web.locator('#pairCode').textContent();
 if(lastCode!=='------')throw Error('Refreshing the Web App must destroy session QR and code');
 log('Web App refresh invalidates pairing; Android LED buttons disabled');
 if(fails.length)throw Error('Uncaught JavaScript errors: '+fails.join(' | '));
 console.log('PASS no-cloud WebRTC QR test: offer and answer QR, correct PIN, pairing approval, exclusive lock, authoritative LED ACKs, refresh disconnect');
}catch(e){
 console.error('FAIL QR P2P:',e.stack||e);console.error('BROWSER ERRORS:',fails.slice(-10));console.error('CONSOLE ERRORS:',logs.slice(-10));
 await web.screenshot({path:'test-output/qr-error-web.png',fullPage:true}).catch(()=>{});
 await phone.screenshot({path:'test-output/qr-error-phone.png',fullPage:true}).catch(()=>{});
 process.exitCode=1;
}finally{await browser.close()}
