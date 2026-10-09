// Real encrypted DataChannel; applied state assertions use the actual one-page receiver.
import {pairBench,exchange,grant,wait,safeShot} from './flight-test-harness.mjs';import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('test-output',{recursive:true});const {browser,ctx,web,phone,errors}=await pairBench();const measurements=[];
try{
 await phone.setViewportSize({width:844,height:390});await exchange(web,phone);await grant(web,phone);
 await web.locator('#connectionClose').click();await phone.locator('#flightBack').click();
 if(await web.locator('iframe').count())throw Error('Flight Training must not contain an iframe');
 if(!await web.locator('#tpRun').isDisabled()||!await web.locator('#tpMode').isDisabled())throw Error('Local controls can fight mobile ownership');
 await phone.locator('#flightArm').click();await wait(web,()=>window.ZebjusTraining.snapshot().armed);
 const left=await phone.locator('#flightLeftZone').boundingBox(),right=await phone.locator('#flightRightZone').boundingBox();
 const touch=await ctx.newCDPSession(phone),l={id:1,x:left.x+left.width*.45,y:left.y+left.height*.67},r={id:2,x:right.x+right.width*.53,y:right.y+right.height*.65};
 const event=(type,touchPoints)=>touch.send('Input.dispatchTouchEvent',{type,touchPoints});
 await event('touchStart',[l]);await event('touchMove',[{...l,y:l.y-65}]);await phone.waitForTimeout(760);await event('touchEnd',[]);
 await wait(phone,()=>parseInt(document.getElementById('flightThrottle').textContent)>=1200);await phone.waitForTimeout(140);
 const held=await phone.locator('#flightThrottle').textContent();if(await web.locator('#tpThrottleReadout').textContent()!==held)throw Error('Authoritative throttle mirror differs');
 await phone.waitForTimeout(200);if(await phone.locator('#flightThrottle').textContent()!==held)throw Error('Throttle did not hold on release');
 await event('touchStart',[l]);await event('touchStart',[l,r]);
 await event('touchMove',[{...l,x:l.x+28},{...r,x:r.x+25,y:r.y-20}]);
 await wait(phone,()=>parseInt(document.getElementById('flightYaw').textContent)<-5&&parseInt(document.getElementById('flightRoll').textContent)>5);
 const mirror=await web.evaluate(()=>({a:window.ZebjusTraining.snapshot(),left:document.getElementById('tpLeftKnob').style.left,right:document.getElementById('tpRightKnob').style.left}));
 if(mirror.a.axes.yaw>=0||mirror.a.axes.roll<=0||mirror.a.sticks.left.x<=0||mirror.a.sticks.right.x<=0)throw Error('Applied dual-stick mirror missing');
 const before=await web.locator('#tpThrottleReadout').textContent();await web.locator('body').click({position:{x:20,y:180}});await web.keyboard.press('w');
 if(await web.locator('#tpThrottleReadout').textContent()!==before)throw Error('Web keys fought Android');
 await safeShot(web,'test-output/web-mobile-mirror.png');await safeShot(phone,'test-output/android-connected.png');measurements.push({heldThrottle:held,appliedAxes:mirror.a.axes,knobs:{left:mirror.left,right:mirror.right}});
 await event('touchEnd',[l]);await wait(web,()=>window.ZebjusTraining.snapshot().axes.yaw===0&&window.ZebjusTraining.snapshot().axes.roll>0);
 await event('touchEnd',[]);await wait(web,()=>Object.values(window.ZebjusTraining.snapshot().axes).every(v=>v===0));
 // Exact commanded 1300 travels through the real transmitter/peer/receiver/ACK chain.
 await phone.evaluate(()=>{const p=window.__testPeer;window.__realSend=p.sendSimulatorControl;p.sendSimulatorControl=(m,c)=>window.__realSend({...m,throttle:m.armed?1300:m.throttle},c)});
 await wait(web,()=>document.getElementById('tpThrottleReadout').textContent==='1300 µs');await wait(phone,()=>document.getElementById('flightThrottle').textContent==='1300 µs');
 measurements.push({exact1300:true,receiver:await web.evaluate(()=>window.ZebjusTraining.snapshot().throttle)});
 await phone.evaluate(()=>window.__testPeer.sendSimulatorControl=window.__realSend);
 // Local tuning remains available during mobile ownership.
 await web.locator('#tpPidP').fill('1.1');await web.locator('#tpApplyPid').click();await wait(web,()=>document.getElementById('tpStatus').textContent.includes('PID APPLIED LIVE'));
 await phone.locator('#flightMode').selectOption('acro');await wait(web,()=>window.ZebjusTraining.snapshot().mode==='acro');
 // Malformed and replayed packets cannot mutate the plant.
 const prior=await web.evaluate(()=>window.ZebjusTraining.snapshot().seq);
 await phone.evaluate(()=>{const p=window.__testPeer;p.channel.send(JSON.stringify({v:1,type:'SIM_CONTROL',seq:1,sessionId:p.status().sessionId,mode:'acro',armed:true,throttle:1900,axes:{roll:1,pitch:0,yaw:0}}));p.channel.send('null');p.channel.send(JSON.stringify({v:1,type:'SIM_CONTROL',seq:999,sessionId:'wrong-session',mode:'acro',armed:true,throttle:1900,axes:{roll:1,pitch:0,yaw:0}}))});
 await web.waitForTimeout(100);if(await web.evaluate(()=>window.ZebjusTraining.snapshot().throttle)===1900)throw Error('Replay/wrong session changed state');
 // STOP while captured fingers are down, on either side.
 await event('touchStart',[l]);await event('touchMove',[{...l,x:l.x+30,y:l.y-20}]);await phone.locator('#flightStop').click();
 await wait(web,()=>!window.ZebjusTraining.snapshot().armed&&window.ZebjusTraining.snapshot().motors.rpm.every(v=>v===0));await event('touchCancel',[]);
 await wait(phone,()=>document.getElementById('flightThrottle').textContent==='1000 µs');
 await phone.locator('#flightArm').click();await wait(web,()=>window.ZebjusTraining.snapshot().armed);await web.locator('#tpStop').click();
 await wait(phone,()=>document.getElementById('flightArm').getAttribute('aria-pressed')==='false');await wait(web,()=>!window.ZebjusTraining.snapshot().armed);
 // A paused sender leaves motors off within the receiver's 450ms watchdog.
 await wait(phone,()=>!document.getElementById('flightArm').disabled);await phone.locator('#flightArm').click();await wait(web,()=>window.ZebjusTraining.snapshot().armed);
 await phone.evaluate(()=>{window.__originalSend=window.__testPeer.sendSimulatorControl;window.__testPeer.sendSimulatorControl=()=>true});
 await wait(web,()=>!window.ZebjusTraining.snapshot().armed,2500);await phone.evaluate(()=>window.__testPeer.sendSimulatorControl=window.__originalSend);await phone.waitForTimeout(200);
 if(await web.evaluate(()=>window.ZebjusTraining.snapshot().armed))throw Error('Watchdog auto re-armed');
 await safeShot(phone,'test-output/android-stop.png');
 await phone.evaluate(()=>window.zebjusNetworkChanged());await wait(web,()=>document.getElementById('mobileHeaderStatus').textContent.includes('Disconnected'));
 if(!await web.locator('#tpRun').isEnabled())throw Error('Web control did not return after disconnect');
 if(errors.length)throw Error('JavaScript errors: '+errors.join(' | '));
 writeFileSync('test-output/webrtc-applied-evidence.json',JSON.stringify({transport:'Real Chromium DTLS/SCTP WebRTC DataChannel',measurements,replayAfter:prior,errors},null,2));
 console.log('PASS real WebRTC: one plant, applied mirror, throttle hold, multitouch, exclusive ownership, live PID, mode, replay rejection, dual STOP, 450ms watchdog, network reset');
}catch(e){console.error(e.stack||e);console.error(errors);await safeShot(web,'test-output/flight-error-web.png').catch(()=>{});await safeShot(phone,'test-output/flight-error-phone.png').catch(()=>{});process.exitCode=1}finally{await browser.close()}
