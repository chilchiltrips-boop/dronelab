// Real touchscreen AP client with a native-boundary double that never returns ACKs.
// Production encrypted UDP, scheduling and feedback faults are checked by udp-stream.test.mjs.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';

const browser=await chromium.launch(browserOptions);
try{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,reducedMotion:'reduce',serviceWorkers:'block'});
 await configureContext(context);
 await context.addInitScript(()=>{
  const kitId='ZFC-A2-012345ABCDEF';let api,active=false,streamId='',sent=0;
  window.__apFrames=[];window.__apStops=0;
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
    request:async(route)=>{
     if(route==='/api/status')return {kitId,kitCode:'123456',board:'ZFC-A2',mode:'ap',requestTransport:'AP',
      apActive:true,apSsid:'zebjus_drone_1',inputArmSupported:true,controlAuthorized:true};
     if(route==='/api/rc/claim'){active=true;return {kitId,session:'a'.repeat(32),udpProtocol:'ZJUDP1',udpPort:4210,udpFeedbackVersion:2};}
     if(route==='/api/rc/release'){active=false;return {released:true};}
     throw Error('Unexpected AP management request '+route);
    }});
  }});
 });
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/companion.html');
 await page.waitForFunction(()=>window.ZebjusNetwork?.isConnected()&&!document.getElementById('flightArm').disabled);
 await page.locator('#flightArm').tap();
 await page.waitForFunction(()=>window.ZebjusNetwork.inputArmed()&&document.getElementById('flightArm').textContent==='DISARM');
 assert.equal(await page.evaluate(()=>window.__apTransport),'AP');
 assert.equal(await page.evaluate(()=>window.ZebjusNetwork.feedback().inputArmed),false);
 await page.waitForFunction(()=>document.getElementById('flightFeedback').textContent.includes('KIT UNCONFIRMED'));
 const left=await page.locator('#flightLeftZone').boundingBox(),right=await page.locator('#flightRightZone').boundingBox();
 const cdp=await context.newCDPSession(page);
 const l={id:1,x:left.x+left.width*.5,y:left.y+left.height*.65},r={id:2,x:right.x+right.width*.5,y:right.y+right.height*.65};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[l,r]});
 const movedL={...l,x:l.x+25,y:l.y-30},movedR={...r,x:r.x+30,y:r.y-25};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[movedL,movedR]});
 await page.waitForFunction(()=>window.__apFrames.some(f=>f.inputArmed&&f.channels[0]>1050&&
  f.channels[1]!==1500&&f.channels[2]!==1500&&f.channels[3]!==1500));
 await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+13000;});
 await page.waitForFunction(()=>window.__apFrames.length>30);
 assert.equal(await page.evaluate(()=>window.ZebjusNetwork.hasControl()&&window.ZebjusNetwork.isConnected()),true);
 assert.equal(await page.evaluate(()=>window.ZebjusNetwork.feedback().seq),0);
 assert.equal(await page.evaluate(()=>window.ZebjusNetwork.feedback().at),0);
 const stop=await page.locator('#flightStop').boundingBox();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[movedL,movedR,
  {id:3,x:stop.x+stop.width/2,y:stop.y+stop.height/2}]});
 await page.waitForFunction(()=>!window.ZebjusNetwork.inputArmed()&&!window.ZebjusNetwork.hasControl());
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 assert.ok(await page.evaluate(()=>window.__apStops>0));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS AP ACK-free cockpit: immediate ARM, truthful unconfirmed feedback, four channels, >12s status age, third-finger STOP');
}finally{await browser.close();}
