// Real Chromium touch events against the bundled cockpit and native-bridge
// boundary double. Radio/physical board validation remains a hardware check.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch(browserOptions);
try{
 const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,reducedMotion:'reduce',serviceWorkers:'block'});
 await configureContext(context);
 await context.addInitScript(()=>{
  const kitId='ZFC-A2-012345ABCDEF';let api,seq=0,active=false;
  window.__kitFrames=[];
  window.ZebjusNative={
   requestWifiPermission:id=>queueMicrotask(()=>window.zebjusNativeWifiPermissionResult({id,granted:true})),
   pinSelectedNetwork:id=>queueMicrotask(()=>window.zebjusNativePinResult({id,ok:true})),clearSelectedNetwork(){},
   requestSecure(id){queueMicrotask(()=>window.zebjusNativeResult({id,ok:true,status:200,text:JSON.stringify({kitId,authVersion:2,simpleConnection:true})}))}
  };
  Object.defineProperty(window,'ZebjusKitAuth',{get:()=>api,set(value){
   api=value;api.local=async()=>({local:true,expiresAt:Date.now()+1800000,request:async(route,method,args={})=>{
    if(route==='/api/status')return {kitId,kitCode:'123456',board:'ZFC-A2',mode:'ap',requestTransport:'AP',apActive:true,apSsid:'zebjus_drone_1',inputArmSupported:true,controlAuthorized:true};
    if(route==='/api/rc/claim'){active=true;return {kitId,session:'touch-session-'+(++seq)}}
    if(route==='/api/rc/release'){active=false;return {released:true}}
    if(route==='/api/rc/preview'){if(!active)throw Error('not owned');window.__kitFrames.push({...args});return {kitId,received:true,seq:args.seq,inputArmed:args.inputArmed==='true'}}
    throw Error('Unexpected route '+route);
   }});
  }});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/companion.html');
 await page.waitForFunction(()=>window.ZebjusNetwork?.isConnected()&&!document.getElementById('flightArm').disabled);
 assert.equal(await page.locator('#kitRcPreview').count(),0,'No extra input enable toggle');
 await page.locator('#flightArm').tap();
 await page.waitForFunction(()=>window.ZebjusNetwork.inputArmed()&&document.getElementById('flightArm').textContent==='DISARM');
 const left=await page.locator('#flightLeftZone').boundingBox(),right=await page.locator('#flightRightZone').boundingBox();
 const cdp=await context.newCDPSession(page);
 const l={id:1,x:left.x+left.width*.5,y:left.y+left.height*.65},r={id:2,x:right.x+right.width*.5,y:right.y+right.height*.65};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[l,r]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...l,x:l.x+25,y:l.y-30},{...r,x:r.x+30,y:r.y-25}]});
 await page.waitForFunction(()=>window.__kitFrames.some(f=>f.throttle>1050&&f.roll!==1500&&f.pitch!==1500&&f.yaw!==1500&&f.inputArmed==='true'));
 const stop=await page.locator('#flightStop').boundingBox();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[l,r,{id:3,x:stop.x+stop.width/2,y:stop.y+stop.height/2}]});
 await page.waitForFunction(()=>!window.ZebjusNetwork.inputArmed()&&!window.ZebjusNetwork.hasControl());
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await page.locator('#flightArm').tap();await page.waitForFunction(()=>window.ZebjusNetwork.inputArmed());
 await page.locator('#flightArm').tap();await page.waitForFunction(()=>!window.ZebjusNetwork.inputArmed());
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS direct AP cockpit: no extra enable toggle, ARM ACK, two real joystick touches, all four channels, third-finger STOP, DISARM');
}finally{await browser.close()}
