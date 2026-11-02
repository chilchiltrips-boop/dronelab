// Rendered wizard integration against an explicitly simulated firmware transport.
import {chromium} from 'playwright';
import {browserOptions} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch(browserOptions);
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/#setup');
 await page.locator('#tab-setup.active').waitFor();
 await page.locator('[data-action=detect]').click();
 await page.waitForFunction(()=>document.querySelector('.a2-message').textContent.includes('verified A2'));
 await page.evaluate(()=>{
  const kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',kitName:'Browser test fixture',transport:'sta',bootId:'testboot',connectionGeneration:1,board:'ZFC-A2',version:'1.7.4',controlAuthorized:true};
  const f=window.__motorFixture={run:0,kit,state:{version:3,timedBenchSupported:true,kitId:kit.kitId,bootId:kit.bootId,supported:true,mode:'DISABLED',reason:'USER_STOP',layout:'A2_QUAD_X',layoutPins:['D0','D1','D2','D3'],rotations:['CW','CCW','CW','CCW'],observedMinimumUs:[0,0,0,0],maxTestPulseUs:2000,sliderDurationMaxMs:30000,profile:'PWM_50HZ_1000_2000',selectedInput:'PPM',inputSource:'PPM',inputValid:true,inputAgeMs:0,channels:[1500,1500,1000,1500,1000,1500,1500,1500],throttle:1000,inputArmed:false,pulseUs:[0,0,0,0],remainingMs:0},calls:[]};
  window.__motorCalls=[];
  const finishAfter=(ms,reason)=>{const run=++f.run;setTimeout(()=>{if(f.run===run)f.state={...f.state,mode:'DISABLED',reason,pulseUs:[0,0,0,0]};},ms);};
  window.ZebjusKits={...window.ZebjusKits,getState:()=>({...kit}),requestBound:async(_,route,method,a,guard)=>{
   guard?.();
   if(route!=='/api/motor')throw Error('Unexpected fixture request');window.__motorCalls.push(a.action);f.calls.push({...a});
   if(a.action==='STATUS'){
    if(f.failNextStatus){f.failNextStatus=false;f.statusErrorSeen=true;throw Error('Simulated status read timeout');}
    if(f.holdStatus)await new Promise(resolve=>{f.releaseStatus=resolve;});
    if(f.statusDelay)await new Promise(resolve=>setTimeout(resolve,f.statusDelay));
   }
   if(a.action==='STOP'&&f.holdStop){f.stopPending=true;await new Promise(resolve=>f.releaseStop=resolve);f.stopPending=false;}
   if(a.action==='STOP'&&f.rejectStop){f.rejectStop=false;throw Error('Simulated STOP failure');}
   let state=f.state;
   if(a.action==='BEGIN'){++f.run;state={...state,session:'fixture',mode:'READY',pulseUs:[1000,1000,1000,1000]};}
   if(a.action==='STOP'){++f.run;state={...state,mode:'DISABLED',reason:'USER_STOP',pulseUs:[0,0,0,0]};}
   if(a.action==='LAYOUT')state={...state,layout:a.a,layoutPins:a.b==='-'?state.layoutPins:[...a.b].map(p=>'D'+p),rotations:a.c==='-'?state.rotations:[...a.c].map(p=>p==='0'?'CW':'CCW')};
   if(a.action==='MINIMUM'){state.observedMinimumUs=[...state.observedMinimumUs];state.observedMinimumUs[Number(a.a)-1]=Number(a.b);}
   if(a.action==='SLIDER')state={...state,mode:'SLIDER_TEST',sliderMask:Number(a.a),remainingMs:Number(a.c),pulseUs:[1000,1000,1000,1000]};
   if(a.action==='SLIDE')state={...state,pulseUs:[0,1,2,3].map(i=>(state.sliderMask&(1<<i))?Number(a.b):1000)};
   if(a.action==='SLIDE'&&f.loseControl){f.loseControl=false;state={...state,mode:'DISABLED',reason:'CONTROL_LOST',pulseUs:[0,0,0,0]};}
   if(a.action==='SINGLE'||a.action==='ALL'){state={...state,mode:a.action==='ALL'?'ALL_TEST':'SINGLE_TEST',remainingMs:Number(a.c),pulseUs:[1000,1000,1000,1000]};if(a.action==='ALL')state.pulseUs.fill(Number(a.b));else state.pulseUs[Number(a.a)-1]=Number(a.b);finishAfter(Number(a.c),'TEST_FINISHED');}
   if(a.action==='CAL_HIGH')state={...state,mode:'CAL_HIGH',pulseUs:[2000,2000,2000,2000],remainingMs:15000};
   if(a.action==='CAL_LOW'){state={...state,mode:'CAL_LOW',pulseUs:[1000,1000,1000,1000],remainingMs:3000};finishAfter(3000,'CAL_FINISHED');}
   f.state=state;return {...state};
  }};
 });
 const confirm=page.getByRole('button',{name:'Confirm / Continue',exact:true});
 await page.locator('[data-action=detect]').click();
 await page.waitForFunction(()=>document.querySelector('.a2-identity').textContent.includes('Supported · configurable'));
 assert.match(await page.locator('.a2-visual-title').textContent(),/flight controller/);
 mkdirSync('test-output',{recursive:true});await page.screenshot({path:'test-output/a2-board.png',fullPage:true});
 await page.locator('[data-step="1"]').click();
 await page.waitForFunction(()=>document.querySelector('.a2-visual-title').textContent.includes('Quad X'));
 await page.evaluate(()=>window.__airframeNode=document.querySelector('[data-frame-diagram]'));
 await page.screenshot({path:'test-output/a2-quad-x-preview.png',fullPage:true});
 await page.locator('#a2Layout').selectOption('A2_QUAD_PLUS');
 await page.waitForFunction(()=>{const node=document.querySelector('[data-motor="1"]'),m=new DOMMatrixReadOnly(getComputedStyle(node).transform);return Math.abs(m.m41-260)<.5&&Math.abs(m.m42-108)<.5;});
 assert.equal(await page.evaluate(()=>window.__airframeNode===document.querySelector('[data-frame-diagram]')),true,'frame selection morphs the existing diagram');
 assert.equal(await page.locator('.configuration-preview .a2-rotation-guide').count(),4);
 assert.equal(await page.locator('.configuration-preview .spinning').count(),0,'configuration arrows must not claim physical motor output');
 await page.screenshot({path:'test-output/a2-quad-plus-preview.png',fullPage:true});
 await page.locator('#a2Layout').selectOption('A2_QUAD_X');
 await page.waitForFunction(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-motor="1"]')).transform);return Math.abs(m.m41-142)<.5&&Math.abs(m.m42-132)<.5;});

 for(const id of ['a2Props','a2Pins','a2Profile'])await page.locator('#'+id).check();
 await page.locator('#a2Layout').selectOption('A2_QUAD_PLUS');
 await page.locator('[data-pin="0"]').selectOption('D2');
 assert.equal(await page.locator('[data-action=layout]').isDisabled(),true,'duplicate output pins must be rejected');
 await page.locator('[data-pin="2"]').selectOption('D0');
 await page.locator('[data-action=layout]').click();
 await page.waitForFunction(()=>window.__motorFixture.state.layout==='A2_QUAD_PLUS'&&!window.ZebjusMotorSetup.active);
 assert.deepEqual(await page.evaluate(()=>window.__motorFixture.state.layoutPins),['D2','D1','D0','D3']);
 assert.equal(await page.evaluate(()=>window.__motorFixture.calls.find(c=>c.action==='BEGIN').c),'PWM_50HZ_1000_2000_TIMED');
 await page.waitForFunction(()=>!document.querySelector('[data-action=layout]').disabled);
 await page.waitForFunction(()=>{const m=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-motor="1"]')).transform);return Math.abs(m.m41-260)<.5&&Math.abs(m.m42-108)<.5;});
 await page.screenshot({path:'test-output/a2-wiring.png',fullPage:true});
 await page.locator('[data-step="4"]').click();assert.equal(await page.locator('.a2-visual [data-motor="2"]').getAttribute('role'),'button','direct Wiring to Motor Test navigation enables diagram selection');
 await page.locator('[data-step="1"]').click();assert.equal(await page.locator('.a2-visual [data-motor="2"]').getAttribute('role'),null,'configuration preview is not a motor test control');
 await page.locator('[data-step="2"]').click();
 await page.evaluate(()=>{window.__motorFixture.state.channels[0]=1750;window.__motorFixture.state.channels[2]=1475;});
 await page.waitForFunction(()=>document.querySelector('[data-channel="2"] output').textContent==='1475 µs');
 await page.waitForFunction(()=>{
  const knobs=document.querySelectorAll('.a2-visual .a2-stick-knob');
  return knobs.length===2&&Number(knobs[0].getAttribute('cy'))===149.5&&Number(knobs[1].getAttribute('cx'))===315;
 });
 await page.screenshot({path:'test-output/a2-inputs.png',fullPage:true});
 await page.evaluate(()=>window.__motorFixture.state.inputValid=false);
 await page.waitForFunction(()=>document.querySelector('[data-channel="2"] output').textContent==='—');
 await page.evaluate(()=>{window.__motorFixture.state.inputValid=true;window.__motorFixture.state.inputAgeMs=250;});
 await page.waitForFunction(()=>document.querySelector('.a2-input').textContent.includes('LAST SAMPLE')&&document.querySelector('[data-channel="2"] output').textContent==='1475 µs');
 assert.equal(await page.locator('[data-channel="2"]').getAttribute('data-fresh'),'false','a delayed last sample must never be labelled LIVE');
 await page.evaluate(()=>window.__motorFixture.state.inputAgeMs=0);
 await page.evaluate(()=>{const s=window.__motorFixture.state;s.inputValid=false;s.inputSource='NONE';s.ppm={present:true,ageMs:0,captureHz:50,captureBackend:'RMT_RX',captureReady:true,channels:[1500,1500,1800,1500,2000,1500,1500,1500]};});
 await page.waitForFunction(()=>document.querySelector('[data-channel="2"] output').textContent==='1800 µs'&&document.querySelector('.a2-input').textContent.includes('receiver monitor'));
 assert.match(await page.locator('.a2-input-health').textContent(),/RMT_RX · 50 Hz/);
 await page.evaluate(()=>{window.__inputMarker=document.querySelector('[data-input-throttle]');window.__motorFixture.statusDelay=220;});
 await page.waitForFunction(()=>window.ZebjusMotorSetup.state.roundTripMs>=200&&document.querySelector('.a2-input').textContent.includes('MONITORING'));
 await page.waitForTimeout(450);
 assert.equal(await page.locator('[data-channel="2"]').getAttribute('data-fresh'),'true','read-only observation must not flicker at the 150 ms control cutoff');
 assert.equal(await page.evaluate(()=>window.__inputMarker===document.querySelector('[data-input-throttle]')),true,'input SVG nodes must survive status and animation ticks');
 await page.evaluate(()=>{window.__motorFixture.failNextStatus=true;window.__motorFixture.holdStatus=true;});
 await page.waitForFunction(()=>window.__motorFixture.statusErrorSeen);
 await page.waitForTimeout(350);
 assert.equal(await page.locator('[data-channel="2"] output').textContent(),'1800 µs','one failed refresh must not erase a valid display observation');
 assert.match(await page.locator('.a2-input-health').textContent(),/Status refresh delayed/);
 await page.waitForFunction(()=>document.querySelector('[data-channel="2"] output').textContent==='—',null,{timeout:6000});
 assert.match(await page.locator('.a2-input-health').textContent(),/UNVERIFIED/,'expired observation is not evidence of physical receiver loss');
 await page.evaluate(()=>{const f=window.__motorFixture;f.holdStatus=false;f.statusDelay=0;f.releaseStatus?.();});
 await page.waitForFunction(()=>document.querySelector('[data-channel="2"] output').textContent==='1800 µs');
 assert.equal(await page.evaluate(()=>window.__inputMarker===document.querySelector('[data-input-throttle]')),true);
 assert.match(await page.locator('.a2-message').textContent(),/Status refresh recovered/);
 await page.screenshot({path:'test-output/a2-input-monitor-recovery.png',fullPage:true});
 await page.evaluate(()=>{const s=window.__motorFixture.state;s.ppm.present=false;s.ppm.channels=null;});
 await page.waitForFunction(()=>document.querySelector('[data-channel="2"] output').textContent==='—');
 await page.evaluate(()=>{const s=window.__motorFixture.state;delete s.ppm;s.inputValid=true;s.inputSource='PPM';s.channels[2]=1000;});
 await page.locator('[data-step="4"]').click();
 const begins=await page.evaluate(()=>window.__motorCalls.filter(c=>c==='BEGIN').length);
 const chosen=()=>page.locator('#a2MotorSelection').getAttribute('data-selection');
 assert.equal(await page.locator('select#a2Motor').count(),0,'motor selection uses Next, without a native dropdown rebuilt during polling');
 await page.locator('.a2-visual [data-motor="2"]').click();
 assert.equal(await chosen(),'2');
 await page.locator('#a2AllMotors').check();await page.waitForFunction(()=>document.querySelector('#a2MotorSelection').dataset.selection==='all');
 assert.equal(await page.locator('.a2-visual .is-selected').count(),4);
 await page.locator('#a2AllMotors').uncheck();await page.waitForFunction(()=>document.querySelector('#a2MotorSelection').dataset.selection==='2');
 assert.equal(await page.evaluate(()=>window.__motorCalls.filter(c=>c==='BEGIN').length),begins,'selecting outputs must never start them');
 await page.locator('.a2-visual [data-motor="1"]').click();
 await page.locator('[data-action=next-motor]').click();
 await page.waitForFunction(()=>document.querySelector('.a2-message').textContent.includes('record a starting pulse'));
 assert.equal(await chosen(),'1','Save & next cannot invent an unobserved minimum');
 // Save an observed minimum for each motor and advance one by one.
 for(let motor=1;motor<=4;motor++){
  await page.locator('[data-action=slider]').click();await confirm.click();
  await page.waitForFunction(n=>window.__motorFixture.state.mode==='SLIDER_TEST'&&window.__motorFixture.state.sliderMask===(1<<(n-1)),motor);
  await page.locator('#a2Pulse').fill(String(1100+motor*10));
  await page.waitForFunction(n=>window.__motorFixture.state.pulseUs[n-1]===1100+n*10,motor);
  await page.locator('#a2Spinning').check();
  const starts=await page.evaluate(()=>window.__motorCalls.filter(c=>c==='SLIDER').length);
  await page.locator('[data-action=next-motor]').click();
  await page.waitForFunction(n=>!window.ZebjusMotorSetup.busy&&document.querySelector('#a2MotorSelection').dataset.selection===String(n%4+1),motor);
  assert.equal(await page.evaluate(n=>window.__motorFixture.state.observedMinimumUs[n-1],motor),1100+motor*10,'Save & next persists the observed pulse');
  assert.equal(await page.evaluate(()=>window.__motorCalls.filter(c=>c==='SLIDER').length),starts,'Save & next must not start the next motor');
 }
 await page.locator('[data-action=slider]').click();await confirm.click();
 await page.waitForFunction(()=>window.__motorFixture.state.mode==='SLIDER_TEST');
 assert.match(await page.locator('[data-action=slider]').textContent(),/Stop motor test/);
 assert.equal(await page.locator('#a2AllMotors').isEnabled(),true,'All motors can be selected during a wizard test by stopping it first');
 const started=await page.evaluate(()=>window.__motorCalls.filter(c=>c==='BEGIN').length);
 await page.evaluate(()=>window.__motorFixture.holdStop=true);
 await page.locator('[data-action=next-motor]').click();
 await page.waitForFunction(()=>window.__motorFixture.stopPending);
 assert.equal(await chosen(),'1','selection waits for a STOP acknowledgement');
 assert.equal(await page.locator('[data-action=next-motor]').isDisabled(),true);
 assert.equal(await page.locator('#a2AllMotors').isDisabled(),true);
 await page.evaluate(()=>{window.__motorFixture.holdStop=false;window.__motorFixture.releaseStop();});
 await page.waitForFunction(()=>!window.ZebjusMotorSetup.busy&&document.querySelector('#a2MotorSelection').dataset.selection==='2');
 assert.equal(await page.evaluate(()=>window.__motorCalls.filter(c=>c==='BEGIN').length),started,'Next motor stops without automatically starting another output');
 assert.equal(await page.locator('#a2Pulse').inputValue(),'1000');
 await page.locator('[data-action=slider]').click();await confirm.click();
 await page.waitForFunction(()=>window.__motorFixture.state.sliderMask===2&&window.__motorFixture.state.mode==='SLIDER_TEST');
 await page.locator('[data-action=slider]').click();await page.waitForFunction(()=>!window.ZebjusMotorSetup.busy);
 assert.equal(await page.locator('#a2Pulse').inputValue(),'1000');
 assert.equal(await page.locator('.a2-visual .spinning').count(),0,'the same primary button stops output');
 // Switching to all outputs stops a running individual test; it requires Start again.
 await page.locator('[data-action=slider]').click();await confirm.click();
 await page.waitForFunction(()=>window.__motorFixture.state.mode==='SLIDER_TEST');
 const beforeAll=await page.evaluate(()=>window.__motorCalls.filter(c=>c==='BEGIN').length);
 await page.locator('#a2AllMotors').check();
 await page.waitForFunction(()=>!window.ZebjusMotorSetup.busy&&document.querySelector('#a2MotorSelection').dataset.selection==='all');
 assert.equal(await page.evaluate(()=>window.__motorFixture.state.mode),'DISABLED');
 assert.equal(await page.evaluate(()=>window.__motorCalls.filter(c=>c==='BEGIN').length),beforeAll);
 await page.locator('#a2AllMotors').uncheck();await page.waitForFunction(()=>document.querySelector('#a2MotorSelection').dataset.selection==='2');
 // A failed STOP must keep the original selected motor and not start a new mask.
 await page.locator('[data-action=slider]').click();await confirm.click();
 await page.waitForFunction(()=>window.__motorFixture.state.mode==='SLIDER_TEST');
 await page.locator('#a2Pulse').fill('1150');
 await page.waitForFunction(()=>window.__motorFixture.state.pulseUs[1]===1150);
 await page.locator('#a2Spinning').check();await page.locator('[data-action=observe-min]').click();
 await page.evaluate(()=>window.__motorFixture.rejectStop=true);
 await page.locator('#a2AllMotors').click();
 await page.waitForFunction(()=>document.querySelector('.a2-message').textContent.includes('Simulated STOP failure'));
 assert.equal(await chosen(),'2');assert.equal(await page.locator('#a2AllMotors').isChecked(),false);
 await page.locator('[data-action=next-motor]').click();
 await page.waitForFunction(()=>!window.ZebjusMotorSetup.busy&&document.querySelector('#a2MotorSelection').dataset.selection==='3');
 assert.equal(await page.evaluate(()=>window.__motorFixture.state.observedMinimumUs[1]),1150,'Save & next retries STOP before saving after a failed stop');
 await page.locator('.a2-visual [data-motor="1"]').click();
 await page.waitForFunction(()=>document.querySelector('#a2MotorSelection').dataset.selection==='1');
 const confirmedBegins=await page.evaluate(()=>window.__motorCalls.filter(c=>c==='BEGIN').length);

 await page.locator('[data-action=slider]').click();await page.getByRole('button',{name:'Cancel / STOP',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('dialog.motor-confirm'));
 assert.equal(await page.evaluate(()=>window.__motorCalls.filter(c=>c==='BEGIN').length),confirmedBegins,'cancelled confirmation must not start output');
 await page.locator('[data-action=slider]').click();await confirm.click();
 await page.waitForFunction(()=>window.__motorFixture.state.mode==='SLIDER_TEST');
 await page.locator('#a2Pulse').fill('1137');
 await page.waitForFunction(()=>window.__motorFixture.state.pulseUs[0]===1137);
 assert.equal(await page.locator('.a2-visual [data-motor="1"] .spinning').count(),1);
 await page.locator('#a2Spinning').check();await page.locator('[data-action=observe-min]').click();
 await page.locator('[data-action=save-min]').click();
 await page.waitForFunction(()=>window.__motorFixture.state.observedMinimumUs[0]===1137&&!window.ZebjusMotorSetup.active);
 await page.locator('#a2AllMotors').check();await page.locator('[data-action=slider]').click();await confirm.click();
 await page.waitForFunction(()=>window.__motorFixture.state.mode==='SLIDER_TEST');await page.locator('#a2Pulse').fill('2000');
 await page.waitForFunction(()=>window.__motorFixture.state.pulseUs.every(p=>p===2000));
 assert.equal(await page.locator('.a2-visual .spinning').count(),4);
 await page.screenshot({path:'test-output/a2-motor-test.png',fullPage:true});
 await page.locator('[data-action=stop]').click();await page.waitForFunction(()=>!window.ZebjusMotorSetup.active);
 const slides=await page.evaluate(()=>window.__motorCalls.filter(c=>c==='SLIDE').length);await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>window.__motorCalls.filter(c=>c==='SLIDE').length),slides,'STOP must cancel the slider command pump');
 await page.evaluate(()=>window.__motorFixture.loseControl=true);
 await page.locator('[data-action=slider]').click();await confirm.click();
 await page.waitForFunction(()=>document.querySelector('.a2-test-state').textContent.includes('750 ms')&&!window.ZebjusMotorSetup.active);
 assert.ok(!(await page.locator('.a2-message').textContent()).includes('Live test started'),'a terminal first SLIDE ACK must not report start success');
 await page.locator('.a2-secondary-test summary').click();
 await page.locator('#a2Pulse').fill('1100');await page.locator('[data-action=single]').click();await confirm.click();
 await page.waitForFunction(()=>window.__motorCalls.includes('ALL'));
 await page.waitForFunction(()=>!window.ZebjusMotorSetup.active);
 await page.locator('[data-step="3"]').click();await page.locator('#a2PowerOff').check();
 await page.locator('[data-action=high]').click();await page.waitForFunction(()=>document.querySelector('.a2-phase').textContent.includes('HIGH active'));
 assert.equal(await page.locator('#a2PowerOff').isChecked(),false,'each calibration must require a fresh battery-disconnected confirmation');
 await page.screenshot({path:'test-output/a2-calibration.png',fullPage:true});
 await page.locator('[data-action=low]').click();await page.waitForFunction(()=>document.querySelector('.a2-phase').textContent.includes('CAL_FINISHED'));
 await page.locator('#a2Tones').check();await page.locator('[data-action=confirm-cal]').click();
 await page.locator('[data-step="5"]').click();assert.match(await page.locator('.a2-report').textContent(),/1137 µs/);
 await page.screenshot({path:'test-output/a2-report.png',fullPage:true});
 // Review every page at desktop, small laptop and mobile widths.
 for(const [width,height] of [[1366,900],[1024,768],[390,844],[320,844]]){
  await page.setViewportSize({width,height});
  for(let step=0;step<6;step++){
   await page.locator('[data-step="'+step+'"]').click();
   const box=await page.evaluate(()=>{
    const root=document.querySelector('#a2SetupRoot'),tab=document.querySelector('#tab-setup'),main=document.querySelector('.a2-content').getBoundingClientRect(),visual=document.querySelector('.a2-visual').getBoundingClientRect(),row=document.querySelector('.a2-columns').getBoundingClientRect();
    const stop=document.querySelector('[data-action=stop]').getBoundingClientRect(),title=document.querySelector('.a2-title').getBoundingClientRect();
    return {fits:root.scrollWidth<=tab.clientWidth,height:row.height,bottomGap:Math.abs(main.bottom-visual.bottom),stopInHeader:stop.top>=title.top&&stop.bottom<=title.bottom};
   });
   assert.equal(box.fits,true,'wizard step '+step+' fits '+width+'px');
   assert.equal(box.stopInHeader,true,'STOP must not float over form controls on step '+step+' at '+width+'px');
   if(width>=1024){
    assert.ok(box.bottomGap<2,'task and visual cards share a bottom edge on step '+step);
    assert.ok(box.height<=(width===1366?540:620),'primary task must stay compact on step '+step+' at '+width+'px: '+box.height);
   }
   await page.screenshot({path:'test-output/a2-compact-step-'+step+'-'+width+'.png',fullPage:true});
  }
 }
 // Execute the actual Python Worker, RPC bridge and main-thread confirmations.
 await page.setViewportSize({width:1366,height:900});
 await page.evaluate(()=>{
  window.ZebjusKits.getMonitorPaths=()=>[{kitId:window.ZebjusKits.getState().kitId,transport:'sta',verified:true,available:true,fresh:true,permitted:true}];
  window.DroneLabNetwork.read=async()=>window.ZebjusKits.getState();
  window.DroneLabNetwork.stream=()=>{};
 });
 await page.locator('[data-tab="python"]').click();
 await page.waitForFunction(()=>window.monaco?.editor?.getModels().some(m=>m.uri.toString().includes('main.py'))&&document.getElementById('pythonTarget').value==='sta',null,{timeout:45000});
 const edit=code=>page.evaluate(code=>window.monaco.editor.getModels().find(m=>m.uri.toString().includes('main.py')).setValue(code),code);
 await edit('from zebjus_simple import Drone\nasync with await Drone().motor_setup() as setup:\n    await setup.set_layout()\n    result = await setup.test_motor(2, 1100, 800)\n    print("PYTHON_MOTOR", result["reason"])\n');
 await page.locator('#runPythonBtn').click();
 await confirm.waitFor({timeout:90000});await confirm.click();
 await page.waitForFunction(()=>document.querySelector('dialog.motor-confirm p')?.textContent.startsWith('Run motor 2'));
 await confirm.click();
 await page.waitForFunction(()=>document.getElementById('pyLastRun').textContent==='COMPLETE',null,{timeout:30000});
 assert.match(await page.locator('#pythonTerminal').textContent(),/PYTHON_MOTOR TEST_FINISHED/);
 assert.equal(await page.evaluate(()=>window.ZebjusMotorSetup.active),false);
 await edit('import asyncio\nfrom zebjus_simple import Drone\nasync with await Drone().motor_setup() as setup:\n    print("PYTHON_SESSION_READY")\n    await asyncio.sleep(30)\n');
 await page.locator('#runPythonBtn').click();await confirm.waitFor({timeout:90000});await confirm.click();
 await page.waitForFunction(()=>document.getElementById('pythonTerminal').textContent.includes('PYTHON_SESSION_READY'));
 await page.locator('#stopPythonBtn').click();
 await page.waitForFunction(()=>!window.ZebjusMotorSetup.active&&window.__motorCalls.at(-1)==='STOP');
 assert.deepEqual(errors,[]);console.log('PASS A2 six-step visuals, X/+ wiring read-back, live/aged/lost channels, confirmation cancellation, terminal SLIDE acknowledgment, Save-before-next for all four motors and all-output transitions, compact six-page layout, individual/all 1000–2000 slider, observed minimum persistence, calibration, mobile fit and real Python motor RPC/STOP');
}finally{await browser.close();}
