import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {browserOptions,configureContext} from './browser-harness.mjs';
mkdirSync('test-output',{recursive:true});
// Model a physical laptop and phone as independent browser processes. Sharing
// one Chromium process can background the mock phone when laptop tabs change,
// triggering its *correct* visibility failsafe and a false WebRTC regression.
const browser=await chromium.launch(browserOptions),phoneBrowser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1440,height:900},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
await configureContext(context);
await context.addInitScript(()=>{
 let api;
 Object.defineProperty(window,'ZebjusP2P',{configurable:true,get:()=>api,set(v){api=v;const original=v.session;v.session=(...args)=>window.__testPeer=original(...args)}});
});
// Separate browser contexts model a physical phone and desktop. Switching
// desktop tabs must not background the phone (which correctly releases
// its own control lease when its own activity is backgrounded).
const phoneContext=await phoneBrowser.newContext({viewport:{width:390,height:844},hasTouch:true,
 serviceWorkers:'block',reducedMotion:'reduce'});
await configureContext(phoneContext);
const page=await context.newPage(),phone=await phoneContext.newPage(),errors=[];
for(const p of [page,phone])p.on('pageerror',e=>errors.push(e.message));
const until=(p,fn,timeout=19000)=>p.waitForFunction(fn,null,{timeout});
try{
 await Promise.all([page.goto('http://127.0.0.1:8765/index.html#firmware',{waitUntil:'domcontentloaded'}),
                    phone.goto('http://127.0.0.1:8765/companion.html',{waitUntil:'domcontentloaded'})]);
 // The simulator is initialized when Mobile Controller is opened, not on every
 // Hardware Center view; navigate there before waiting for its iframe.
 await page.locator('[data-dw-view="mobile"]').click();
 await until(page,()=>document.querySelector('#pidFrame')?.contentWindow?.ZebjusTraining&&window.__testPeer,30000);
 const legacy=await context.newPage();
 await legacy.goto('http://127.0.0.1:8765/tripod.html');
 await until(legacy,()=>location.hash==='#pid'&&location.pathname.endsWith('index.html'));
 await legacy.close();
 await page.locator('.topbar').evaluate(el=>{window.__testHeader=el});
 await page.locator('[data-dw-view="mobile"]').click();
 if(!(await page.locator('#dw-panel-mobile').isVisible()))throw Error('Mobile Controller must be a real Devices panel');
 if(!(await page.locator('#connectionFlow').isVisible()))throw Error('Inline QR/code form missing from Settings');
 if(await page.locator('#connectionDialog').evaluate(el=>el.tagName)!=='SECTION')throw Error('Connection settings must not be a blocking dialog');
 if(!(await page.locator('#topGrantMobileSwitch').isDisabled()))throw Error('Grant cannot be available before pairing');
 await page.locator('[data-tab="pid"]').click();
 await until(page,()=>document.querySelector('#tab-pid')?.classList.contains('active'));
 const link=page.locator('[data-tab="pid"]');
 if((await link.textContent()).trim().toUpperCase()!=='PID TUNING')throw Error('Old flight training name still present');
 const computed=await link.evaluate(el=>getComputedStyle(el).textDecorationLine);
 if(computed.includes('underline'))throw Error('PID nav underlined');
 const iframe=page.frameLocator('#pidFrame');
 await until(page,()=>document.querySelector('#pidFrame')?.contentWindow?.document?.getElementById('tpRun'));
 if(!(await iframe.locator('#tpRun').isVisible()))throw Error('PID Tuning cockpit not visible');
 if(await iframe.locator('.tp-header').isVisible())throw Error('Duplicate topbar inside embedded simulator');
 await page.locator('[data-tab="firmware"]').click();await page.locator('[data-dw-view="mobile"]').click();
 await until(page,()=>document.querySelector('#tab-firmware')?.classList.contains('active')&&!document.querySelector('#dw-panel-mobile')?.hidden);
 if(!await page.locator('.topbar').evaluate(el=>el===window.__testHeader))throw Error('Header was replaced across tabs');
 await page.locator('#pairCreateBtn').click();
 await until(page,()=>document.getElementById('pairOfferText')?.value.startsWith('zj1:'),23000);
 await phone.locator('#flightSettings').click();
 const offer=await page.locator('#pairOfferText').inputValue();
 await phone.locator('#offerInput').fill(offer);await phone.locator('#useOfferBtn').click();
 await until(phone,()=>document.getElementById('answerText')?.value.startsWith('zj1:'),22000);
 const answer=await phone.locator('#answerText').inputValue();
 await page.locator('#pairStep1NextBtn').click();
 await page.locator('.qr-advanced').evaluate(e=>e.open=true);
 await page.locator('#pairAnswerText').fill(answer);
 await page.locator('#pairUseAnswerBtn').click();
 await until(page,()=>!document.getElementById('pairConfirmBtn').disabled,23000);
 await page.locator('#pairConfirmBtn').click();
 await until(phone,()=>window.ZebjusFlightApp&&document.getElementById('controlState').textContent.includes('INPUT MIRROR'));
 await until(page,()=>window.ZebjusSimulatorInputs?.snapshot().fresh);
 await phone.locator('#flightBack').click();
 const before=await page.evaluate(()=>window.ZebjusDeviceRelay.status());
 if(!before.connected||before.remoteMirrorVersion!==1)throw Error('Read-only input mirror not paired');
 await page.locator('[data-tab="pid"]').click();
 await iframe.locator('#tpQuality').selectOption('low');
 await iframe.locator('#tpRun').click();
 await until(page,()=>document.querySelector('#pidFrame').contentWindow.ZebjusTraining.snapshot().armed);
 await page.locator('[data-tab="firmware"]').click();await page.locator('[data-dw-view="mobile"]').click();
 await until(page,()=>!document.querySelector('#pidFrame').contentWindow.ZebjusTraining.snapshot().armed);
 const after=await page.evaluate(()=>window.ZebjusDeviceRelay.status());
 if(!after.connected||after.sessionId!==before.sessionId)throw Error('Navigation discarded input mirror pairing');
 await page.locator('[data-tab="pid"]').click();
 await iframe.locator('#tpRun').click();await until(page,()=>document.querySelector('#pidFrame').contentWindow.ZebjusTraining.snapshot().armed);
 await iframe.locator('#tpStop').click();
 await page.locator('[data-tab="firmware"]').click();await page.locator('[data-dw-view="mobile"]').click();
 const final=await page.evaluate(()=>window.ZebjusDeviceRelay.status());
 if(!final.connected||final.sessionId!==before.sessionId)throw Error('Local Stop disconnected WebRTC');
 await page.screenshot({path:'test-output/pid-shell-settings-desktop.png',fullPage:true});
 await page.locator('[data-tab="pid"]').click();
 await page.screenshot({path:'test-output/pid-shell-simulator-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'test-output/pid-shell-mobile-shell.png',fullPage:true});
 if(errors.length)throw Error('Uncaught JavaScript errors: '+errors.join(' | '));
 console.log('PASS unified PID shell: one header, no underline, embedded simulator, inline QR/code, top Grant switch, WebRTC session survives PID/Devices Mobile, read-only input and Web Run/Stop');
}catch(e){console.error(e.stack||e);console.error('Browser errors',errors);
 await page.screenshot({path:'test-output/pid-shell-error-web.png',fullPage:true}).catch(()=>{});
 await phone.screenshot({path:'test-output/pid-shell-error-phone.png',fullPage:true}).catch(()=>{});
 process.exitCode=1;
}finally{await Promise.allSettled([browser.close(),phoneBrowser.close()])}
