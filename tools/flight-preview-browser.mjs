import {chromium} from 'playwright';import {browserOptions,configureContext} from './browser-harness.mjs';import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('test-output',{recursive:true});const b=await chromium.launch(browserOptions),records=[];
try{
 for(const [width,height] of [[488,227],[595,227],[640,360],[800,450],[844,390],[1080,480]]){
  const c=await b.newContext({viewport:{width,height},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion:'reduce'});await configureContext(c);const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:8765/companion.html');await p.waitForFunction(()=>window.ZebjusFlightApp&&!document.getElementById('flightCockpit').hidden);
  const l=await p.locator('#flightLeftZone').boundingBox(),r=await p.locator('#flightRightZone').boundingBox();const session=await c.newCDPSession(p);
  const left={id:1,x:l.x+l.width*.48,y:l.y+l.height*.67},right={id:2,x:r.x+r.width*.52,y:r.y+r.height*.66};
  const event=(type,touchPoints)=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
  await event('touchStart',[left]);await p.waitForFunction(()=>document.getElementById('flightLeftRing').classList.contains('dragging'));
  const anchor=await p.locator('#flightLeftRing').evaluate(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top),zero:document.getElementById('flightYaw').textContent}));
  if(Math.abs(anchor.x-(left.x-l.x))>1||Math.abs(anchor.y-(left.y-l.y))>1||anchor.zero!=='0%')throw Error('Incorrect first-touch anchor '+JSON.stringify(anchor));
  await event('touchStart',[left,right]);await p.waitForFunction(()=>document.getElementById('flightRightRing').classList.contains('dragging'));
  const lm={...left,x:left.x+45,y:left.y-25},rm={...right,x:right.x+35,y:right.y-30};await event('touchMove',[lm,rm]);
  await p.waitForFunction(()=>parseInt(document.getElementById('flightRoll').textContent)>10&&parseInt(document.getElementById('flightYaw').textContent)<-10);
  if(await p.locator('#flightThrottle').textContent()!=='1000 µs'||await p.locator('#flightSent').textContent()!=='#0')throw Error('Preview transmitted or integrated flight throttle');
  await p.screenshot({path:`test-output/android-preview-${width}x${height}.png`});
  await event('touchEnd',[lm]);await p.waitForFunction(()=>document.getElementById('flightYaw').textContent==='0%'&&parseInt(document.getElementById('flightRoll').textContent)>10);
  await event('touchStart',[rm,left]);await event('touchMove',[rm,lm]);
  const stopBox=await p.locator('#flightStop').boundingBox(),stop={id:4,x:stopBox.x+stopBox.width/2,y:stopBox.y+stopBox.height/2};
  await event('touchStart',[rm,lm,stop]);await p.waitForFunction(()=>document.getElementById('flightRoll').textContent==='0%'&&document.getElementById('flightYaw').textContent==='0%');
  await event('touchEnd',[stop]);
  await event('touchCancel',[]);await p.waitForFunction(()=>document.getElementById('flightRoll').textContent==='0%');
  // A second same-zone touch must not move the first anchor or steal its ID.
  await event('touchStart',[left]);await event('touchStart',[left,{id:3,x:left.x+20,y:left.y+20}]);
  if(await p.locator('#flightLeftRing').evaluate(e=>parseFloat(e.style.left))!==anchor.x)throw Error('Second pointer stole anchor');
  await event('touchCancel',[]);
  await p.locator('#flightSettings').click();if(!await p.locator('#mobileConnection').evaluate(d=>d.open))throw Error('Gear did not open sheet');
  await p.locator('#flightPreset').selectOption('Slow');await p.locator('#flightBack').click();await p.reload();await p.waitForFunction(()=>window.ZebjusFlightApp);
  if(await p.locator('#flightPreset').inputValue()!=='Slow')throw Error('Preset did not persist');
  const layout=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,stop:(()=>{const r=document.getElementById('flightStop').getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,height:r.height}})()}));
  if(layout.scroll>layout.width+1||layout.stop.right>width||layout.stop.height<44||layout.stop.y<0)throw Error('STOP clipped '+JSON.stringify(layout));
  if(errors.length)throw Error(errors.join(' | '));records.push({width,height,anchor,layout,errors});await c.close();
 }
 writeFileSync('test-output/preview-layout.json',JSON.stringify(records,null,2));console.log('PASS Chromium touchscreen preview: 6 landscape sizes including native density, independent touches, capture/CANCEL, zero anchor, real third-finger STOP, reachability, presets, no flight commands');
}finally{await b.close()}
