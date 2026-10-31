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
  const kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',kitName:'Browser test fixture',transport:'sta',bootId:'testboot',connectionGeneration:1,board:'ZFC-A2',version:'1.7.0',controlAuthorized:true};
  const f=window.__motorFixture={run:0,kit,state:{version:2,kitId:kit.kitId,bootId:kit.bootId,supported:true,mode:'DISABLED',reason:'USER_STOP',layout:'A2_QUAD_X',layoutPins:['D0','D1','D2','D3'],rotations:['CW','CCW','CW','CCW'],observedMinimumUs:[0,0,0,0],maxTestPulseUs:2000,sliderDurationMaxMs:30000,profile:'PWM_50HZ_1000_2000',selectedInput:'PPM',inputSource:'PPM',inputValid:true,inputAgeMs:0,channels:[1500,1500,1000,1500,1000,1500,1500,1500],throttle:1000,inputArmed:false,pulseUs:[0,0,0,0],remainingMs:0},calls:[]};
  window.__motorCalls=[];
  const finishAfter=(ms,reason)=>{const run=++f.run;setTimeout(()=>{if(f.run===run)f.state={...f.state,mode:'DISABLED',reason,pulseUs:[0,0,0,0]};},ms);};
  window.ZebjusKits={...window.ZebjusKits,getState:()=>({...kit}),requestBound:async(_,route,method,a)=>{
   if(route!=='/api/motor')throw Error('Unexpected fixture request');window.__motorCalls.push(a.action);f.calls.push({...a});let state=f.state;
   if(a.action==='BEGIN'){++f.run;state={...state,session:'fixture',mode:'READY',pulseUs:[1000,1000,1000,1000]};}
   if(a.action==='STOP'){++f.run;state={...state,mode:'DISABLED',reason:'USER_STOP',pulseUs:[0,0,0,0]};}
   if(a.action==='LAYOUT')state={...state,layout:a.a,layoutPins:a.b==='-'?state.layoutPins:[...a.b].map(p=>'D'+p),rotations:a.c==='-'?state.rotations:[...a.c].map(p=>p==='0'?'CW':'CCW')};
   if(a.action==='MINIMUM'){state.observedMinimumUs=[...state.observedMinimumUs];state.observedMinimumUs[Number(a.a)-1]=Number(a.b);}
   if(a.action==='SLIDER')state={...state,mode:'SLIDER_TEST',sliderMask:Number(a.a),remainingMs:Number(a.c),pulseUs:[1000,1000,1000,1000]};
   if(a.action==='SLIDE')state={...state,pulseUs:[0,1,2,3].map(i=>(state.sliderMask&(1<<i))?Number(a.b):1000)};
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
 for(const id of ['a2Props','a2Pins','a2Profile'])await page.locator('#'+id).check();
 await page.locator('#a2Layout').selectOption('A2_QUAD_PLUS');
 await page.locator('[data-pin="0"]').selectOption('D2');
 assert.equal(await page.locator('[data-action=layout]').isDisabled(),true,'duplicate output pins must be rejected');
 await page.locator('[data-pin="2"]').selectOption('D0');
 await page.locator('[data-action=layout]').click();
 await page.waitForFunction(()=>window.__motorFixture.state.layout==='A2_QUAD_PLUS'&&!window.ZebjusMotorSetup.active);
 assert.deepEqual(await page.evaluate(()=>window.__motorFixture.state.layoutPins),['D2','D1','D0','D3']);
 await page.waitForFunction(()=>!document.querySelector('[data-action=layout]').disabled);
 await page.screenshot({path:'test-output/a2-wiring.png',fullPage:true});
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
 await page.evaluate(()=>{window.__motorFixture.state.inputValid=true;window.__motorFixture.state.channels[2]=1000;});
 await page.locator('[data-step="4"]').click();
 await page.locator('[data-action=slider]').click();await confirm.click();
 await page.waitForFunction(()=>window.__motorFixture.state.mode==='SLIDER_TEST');
 await page.locator('#a2Pulse').fill('1137');
 await page.waitForFunction(()=>window.__motorFixture.state.pulseUs[0]===1137);
 assert.equal(await page.locator('.a2-visual [data-motor="1"] .spinning').count(),1);
 await page.locator('#a2Spinning').check();await page.locator('[data-action=observe-min]').click();
 await page.locator('[data-action=save-min]').click();
 await page.waitForFunction(()=>window.__motorFixture.state.observedMinimumUs[0]===1137&&!window.ZebjusMotorSetup.active);
 await page.locator('#a2Motor').selectOption('all');await page.locator('[data-action=slider]').click();await confirm.click();
 await page.waitForFunction(()=>window.__motorFixture.state.mode==='SLIDER_TEST');await page.locator('#a2Pulse').fill('2000');
 await page.waitForFunction(()=>window.__motorFixture.state.pulseUs.every(p=>p===2000));
 assert.equal(await page.locator('.a2-visual .spinning').count(),4);
 await page.screenshot({path:'test-output/a2-motor-test.png',fullPage:true});
 await page.locator('[data-action=stop]').click();await page.waitForFunction(()=>!window.ZebjusMotorSetup.active);
 const slides=await page.evaluate(()=>window.__motorCalls.filter(c=>c==='SLIDE').length);await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>window.__motorCalls.filter(c=>c==='SLIDE').length),slides,'STOP must cancel the slider command pump');
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
 for(const width of [390,320]){
 await page.setViewportSize({width,height:844});
 for(let step=0;step<6;step++){
  await page.locator('[data-step="'+step+'"]').click();
  assert.equal(await page.evaluate(()=>document.querySelector('#a2SetupRoot').scrollWidth<=document.querySelector('#tab-setup').clientWidth),true,'wizard step '+step+' must fit mobile width');
 }
 await page.screenshot({path:'test-output/a2-setup-mobile-'+width+'.png',fullPage:true});
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
 assert.deepEqual(errors,[]);console.log('PASS A2 six-step visuals, X/+ wiring read-back, live/stale channels, individual/all 1000–2000 slider, observed minimum persistence, calibration, mobile fit and real Python motor RPC/STOP');
}finally{await browser.close();}
