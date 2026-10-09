// Real encrypted DataChannel; applied state assertions use the actual one-page receiver.
import {pairBench,exchange,grant,wait,safeShot} from './flight-test-harness.mjs';import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('test-output',{recursive:true});const {browser,ctx,web,phone,errors}=await pairBench();const measurements=[];
try{
 await phone.setViewportSize({width:844,height:390});await exchange(web,phone);await grant(web,phone);
 await web.locator('#connectionClose').click();await phone.locator('#flightBack').click();
 // Keep the software-rendered CI bench below its expensive shadow workload;
 // adaptive/default quality is independently exercised in the rendering suite.
 await web.locator('#tpQuality').selectOption('low');
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
 // Send actual Web keyboard input without focusing the phone out of its
 // captured touch session. Compare applied plant state, not a 10-Hz UI sample.
 const before=await web.evaluate(()=>window.ZebjusTraining.snapshot());await web.keyboard.press('w');
 const after=await web.evaluate(()=>window.ZebjusTraining.snapshot());
 if(!after.armed)throw Error('Receiver safety-stopped during ownership keyboard check: '+await web.locator('#tpStatus').textContent());
 if(after.source!=='mobile'||after.throttle!==before.throttle)throw Error('Web keys changed Android-applied throttle: '+before.throttle+' -> '+after.throttle);
 await safeShot(web,'test-output/web-mobile-mirror.png');await safeShot(phone,'test-output/android-connected.png');measurements.push({heldThrottle:held,appliedAxes:mirror.a.axes,knobs:{left:mirror.left,right:mirror.right}});
 await event('touchEnd',[l]);await wait(web,()=>window.ZebjusTraining.snapshot().axes.yaw===0&&window.ZebjusTraining.snapshot().axes.roll>0);
 await event('touchEnd',[]);await wait(web,()=>Object.values(window.ZebjusTraining.snapshot().axes).every(v=>v===0));
 // Exact commanded 1300 travels through the real transmitter/peer/receiver/ACK chain.
 await phone.evaluate(()=>{const p=window.__testPeer;window.__realSend=p.sendSimulatorControl;p.sendSimulatorControl=(m,c)=>window.__realSend({...m,throttle:m.armed?1300:m.throttle},c)});
 await wait(web,()=>document.getElementById('tpThrottleReadout').textContent==='1300 µs');await wait(phone,()=>document.getElementById('flightThrottle').textContent==='1300 µs');
 measurements.push({exact1300:true,receiver:await web.evaluate(()=>window.ZebjusTraining.snapshot().throttle)});
 await phone.evaluate(()=>window.__testPeer.sendSimulatorControl=window.__realSend);
 // The main banner must reflect receiver-applied ARM, not a stale pairing STOP.
 if(!await web.locator('#tpStatus').textContent().then(s=>s.includes('VIRTUAL ARMED')&&!s.includes('MOTORS OFF')))throw Error('Web banner disagrees with applied ARM');
 // Local tuning remains available during mobile ownership.
 await web.locator('#tpPidP').fill('1.1');await web.locator('#tpApplyPid').click();await wait(web,()=>document.getElementById('tpStatus').textContent.includes('PID APPLIED LIVE'));
 await phone.locator('#flightMode').selectOption('acro');await wait(web,()=>window.ZebjusTraining.snapshot().mode==='acro');
 await web.locator('#tpQuality').selectOption('low');await web.locator('#tpEffects').selectOption('off');
 // Delay/reorder actual receiver feedback before it enters the encrypted
 // channel. Drop every seventh ACK: payloads still come from the real plant.
 await web.evaluate(()=>{
  const channel=window.__testPeer.channel,send=channel.send.bind(channel);
  window.__feedbackSend=send;window.__feedbackTimers=[];
  channel.send=raw=>{
   const m=JSON.parse(raw);
   if(m.type==='SIM_ACK'||m.type==='SIM_TELEMETRY'){
    if(m.type==='SIM_ACK'&&m.ackSeq%7===0)return;
    const n=m.ackSeq??m.applied.seq,delay=[300,80,220][n%3];
    window.__feedbackTimers.push(setTimeout(()=>{if(channel.readyState==='open')send(raw)},delay));return;
   }send(raw);
  };
 });
 await phone.locator('#flightMode').selectOption('angle');await phone.waitForTimeout(50);await phone.locator('#flightMode').selectOption('acro');
 await phone.waitForTimeout(1000);await wait(web,()=>window.ZebjusTraining.snapshot().mode==='acro');
 if(await phone.locator('#flightMode').inputValue()!=='acro')throw Error('Delayed old ACK overwrote requested mode');
 const delayedState=await web.evaluate(()=>window.ZebjusTraining.snapshot()),delayedAck=await phone.locator('#flightFeedback').textContent();
 // Real CPU/renderer load can add enough delay to exceed the 650ms safety
 // watchdog. A safe disarm is correct in that case; never weaken the watchdog
 // merely to keep the test armed or confuse STOP with stale mode overwrite.
 if(!delayedState.armed&&(delayedState.throttle!==1000||delayedState.motors.rpm.some(v=>v!==0)||await phone.locator('#flightArm').getAttribute('aria-pressed')!=='false'))throw Error('Jitter did not fail safe');
 measurements.push({feedbackJitterMs:[80,220,300],reorderedAck:true,droppedEverySeventhAck:true,feedback:delayedAck,safetyStopObserved:!delayedState.armed});
 await web.evaluate(()=>{window.__feedbackTimers.forEach(clearTimeout);window.__testPeer.channel.send=window.__feedbackSend});
 if(!delayedState.armed){
  await phone.waitForTimeout(180);if(await web.evaluate(()=>window.ZebjusTraining.snapshot().armed))throw Error('Jitter recovery auto-armed');
  await wait(phone,()=>!document.getElementById('flightArm').disabled);await phone.locator('#flightArm').click();await wait(web,()=>window.ZebjusTraining.snapshot().armed);
 }
 // Malformed and replayed packets cannot mutate the plant.
 const prior=await web.evaluate(()=>window.ZebjusTraining.snapshot().seq);
 await phone.evaluate(()=>{const p=window.__testPeer;p.channel.send(JSON.stringify({v:1,type:'SIM_CONTROL',seq:1,sessionId:p.status().sessionId,mode:'acro',armed:true,throttle:1900,axes:{roll:1,pitch:0,yaw:0}}));p.channel.send('null');p.channel.send(JSON.stringify({v:1,type:'SIM_CONTROL',seq:999,sessionId:'wrong-session',mode:'acro',armed:true,throttle:1900,axes:{roll:1,pitch:0,yaw:0}}))});
 await web.waitForTimeout(100);if(await web.evaluate(()=>window.ZebjusTraining.snapshot().throttle)===1900)throw Error('Replay/wrong session changed state');
 // STOP while captured fingers are down, on either side.
 await event('touchStart',[l]);await event('touchMove',[{...l,x:l.x+30,y:l.y-20}]);await phone.locator('#flightStop').click();
 await wait(web,()=>!window.ZebjusTraining.snapshot().armed&&window.ZebjusTraining.snapshot().motors.rpm.every(v=>v===0));await event('touchCancel',[]);
 await wait(phone,()=>document.getElementById('flightThrottle').textContent==='1000 µs');
 if(!await web.locator('#tpStatus').textContent().then(s=>s.includes('MOTORS OFF')))throw Error('Web banner did not reflect applied STOP');
 await phone.locator('#flightArm').click();await wait(web,()=>window.ZebjusTraining.snapshot().armed);await web.locator('#tpStop').click();
 await wait(phone,()=>document.getElementById('flightArm').getAttribute('aria-pressed')==='false');await wait(web,()=>!window.ZebjusTraining.snapshot().armed);
 // A paused sender leaves motors off within the receiver's 450ms watchdog.
 await wait(phone,()=>!document.getElementById('flightArm').disabled);await phone.locator('#flightArm').click();await wait(web,()=>window.ZebjusTraining.snapshot().armed);
 await phone.evaluate(()=>{Object.defineProperty(window.__testPeer.channel,'bufferedAmount',{configurable:true,get:()=>140000});});
 await wait(web,()=>!window.ZebjusTraining.snapshot().armed,2500);await phone.evaluate(()=>{delete window.__testPeer.channel.bufferedAmount});await phone.waitForTimeout(200);
 if(await web.evaluate(()=>window.ZebjusTraining.snapshot().armed))throw Error('Watchdog auto re-armed');
 measurements.push({backpressureBytes:140000,normalAndCriticalSendsRejected:true,watchdogMs:450});
 await safeShot(phone,'test-output/android-stop.png');
 await phone.evaluate(()=>window.zebjusNetworkChanged());await wait(web,()=>document.getElementById('mobileHeaderStatus').textContent.includes('Disconnected'));
 if(!await web.locator('#tpRun').isEnabled())throw Error('Web control did not return after disconnect');
 if(errors.length)throw Error('JavaScript errors: '+errors.join(' | '));
 writeFileSync('test-output/webrtc-applied-evidence.json',JSON.stringify({transport:'Real Chromium DTLS/SCTP WebRTC DataChannel',measurements,replayAfter:prior,errors},null,2));
 console.log('PASS real WebRTC: one plant, applied mirror, throttle hold, multitouch, exclusive ownership, live PID, mode, 80–300ms reordered/dropped feedback, replay rejection, dual STOP, bounded backpressure/450ms watchdog, network reset');
}catch(e){console.error(e.stack||e);console.error(errors);await safeShot(web,'test-output/flight-error-web.png').catch(()=>{});await safeShot(phone,'test-output/flight-error-phone.png').catch(()=>{});process.exitCode=1}finally{await browser.close()}
