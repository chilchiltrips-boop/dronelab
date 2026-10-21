import {chromium} from 'playwright';import {browserOptions,configureContext} from './browser-harness.mjs';
export const base='http://127.0.0.1:8765/';
export const wait=(p,fn,timeout=18000)=>p.waitForFunction(fn,null,{timeout});
export async function pairBench({nativeAp=false}={}){
 const webBrowser=await chromium.launch(browserOptions),phoneBrowser=await chromium.launch(browserOptions),ctx=await phoneBrowser.newContext({viewport:{width:1440,height:900},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});await configureContext(ctx);
 await ctx.addInitScript(()=>{
  let api;Object.defineProperty(window,'ZebjusP2P',{configurable:true,get:()=>api,set(value){api=value;const original=value.session;value.session=(...args)=>window.__testPeer=original(...args)}});
 });
 const webContext=await webBrowser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block',reducedMotion:'reduce'});await configureContext(webContext);
 await webContext.addInitScript(()=>{let api;Object.defineProperty(window,'ZebjusP2P',{configurable:true,get:()=>api,set(value){api=value;const original=value.session;value.session=(...args)=>window.__testPeer=original(...args)}})});
 if(nativeAp)await installApFixture(ctx);
 const browser={close:()=>Promise.allSettled([webBrowser.close(),phoneBrowser.close()])};
 const web=await webContext.newPage(),phone=await ctx.newPage(),errors=[];for(const page of [web,phone])page.on('pageerror',e=>errors.push(e.stack||e.message));
 await Promise.all([web.goto(base+'tripod.html?standalone=1'),phone.goto(base+'companion.html')]);
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
 await wait(phone,()=>window.__testPeer?.status().paired&&window.__testPeer.status().inputMirrorVersion===1);
}
export async function grant(web,phone){
 // Pair approval authorizes read-only input. Simulator Run belongs to WebApp.
 await wait(web,()=>window.ZebjusSimulatorInputs?.snapshot().fresh);
}
export async function safeShot(page,path){const masks=page.locator('#pairOfferCanvas,#pairCode,#pairVerifyPin,#pairOfferText,#pairAnswerText,#pairPhoneCode,#answerCanvas,#appPairCode,#answerText,#offerInput,#phoneShortCode,#mobileLog,#pairActivityLog,#pairDeviceList');await page.screenshot({path,fullPage:true,mask:[masks]})}

export async function installApFixture(context){
 await context.addInitScript(()=>{
  const kitId='ZFC-A2-012345ABCDEF';let api,active=false,streamId='',sent=0;
  window.__apFrames=[];window.__apStops=0;window.__apManagement=[];
  window.ZebjusNative={
   managementProtocol:'ZJM1',udpFeedbackVersion:2,apStreamingVersion:1,
   requestWifiPermission:id=>queueMicrotask(()=>window.zebjusNativeWifiPermissionResult({id,granted:true})),
   pinSelectedNetwork:id=>queueMicrotask(()=>window.zebjusNativePinResult({id,ok:true})),clearSelectedNetwork(){},
   requestSecure(id){queueMicrotask(()=>window.zebjusNativeResult({id,ok:true,status:200,text:JSON.stringify({kitId,authVersion:2,simpleConnection:true})}))},
   startUdp:(id,ip,device,claim,key,feedback,transport)=>{
    streamId=id;window.__apTransport=transport;
    queueMicrotask(()=>window.zebjusNativeUdpEvent({id,type:'start'}));
   },
   offerUdp:(channels,inputArmed)=>{
    if(!active)return;
    window.__apFrames.push({channels:channels.split(',').map(Number),inputArmed});
    queueMicrotask(()=>window.zebjusNativeUdpEvent({id:streamId,type:'tx',sentSeq:++sent,sent,
     ackRequired:false,requestedInputArmed:inputArmed,ackReceived:0,feedbackVersion:2}));
   },
   stopUdp:()=>{window.__apStops++;}
  };
  Object.defineProperty(window,'ZebjusKitAuth',{get:()=>api,set(value){
   api=value;api.local=async()=>({local:true,expiresAt:Date.now()+1800000,udpKey:()=>'1'.repeat(64),
    request:async(route)=>{window.__apManagement.push(route);
     if(route==='/api/status')return {kitId,kitCode:'123456',board:'ZFC-A2',mode:'ap',requestTransport:'AP',
      apActive:true,apSsid:'zebjus_drone_1',inputArmSupported:true,controlAuthorized:true};
     if(route==='/api/rc/claim'){active=true;return {kitId,session:'a'.repeat(32),udpProtocol:'ZJUDP1',udpPort:4210,udpFeedbackVersion:2};}
     if(route==='/api/rc/release'){active=false;return {released:true};}
     throw Error('Unexpected AP management request '+route);
    }});
  }});
 });
}
