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
  const kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',kitName:'Browser test fixture',transport:'sta',bootId:'testboot',connectionGeneration:1,board:'ZFC-A2',version:'1.6.0',controlAuthorized:true};
  let state={kitId:kit.kitId,bootId:kit.bootId,supported:true,mode:'DISABLED',reason:'USER_STOP',layout:'A2_QUAD_X',profile:'PWM_50HZ_1000_2000',selectedInput:'PPM',inputSource:'PPM',inputAgeMs:0,throttle:1000,inputArmed:false,pulseUs:[0,0,0,0],remainingMs:0};
  window.__motorCalls=[];
  window.ZebjusKits={...window.ZebjusKits,getState:()=>({...kit}),requestBound:async(_,route,method,a)=>{
   if(route!=='/api/motor')throw Error('Unexpected fixture request');window.__motorCalls.push(a.action);
   if(a.action==='BEGIN')state={...state,session:'fixture',mode:'READY',pulseUs:[1000,1000,1000,1000]};
   if(a.action==='STOP')state={...state,mode:'DISABLED',reason:'USER_STOP',pulseUs:[0,0,0,0]};
   if(a.action==='SINGLE'){state={...state,mode:'SINGLE_TEST',remainingMs:Number(a.c),pulseUs:[0,0,0,0]};state.pulseUs[Number(a.a)-1]=Number(a.b);setTimeout(()=>state={...state,mode:'DISABLED',reason:'TEST_FINISHED',pulseUs:[0,0,0,0]},Number(a.c));}
   if(a.action==='CAL_HIGH')state={...state,mode:'CAL_HIGH',pulseUs:[2000,2000,2000,2000],remainingMs:15000};
   if(a.action==='CAL_LOW'){state={...state,mode:'CAL_LOW',pulseUs:[1000,1000,1000,1000],remainingMs:3000};setTimeout(()=>state={...state,mode:'DISABLED',reason:'CAL_FINISHED',pulseUs:[0,0,0,0]},3000);}
   return {...state};
  }};
 });
 await page.locator('[data-action=detect]').click();
 await page.waitForFunction(()=>document.querySelector('.a2-identity').textContent.includes('Motor setup supported'));
 for(const id of ['a2Props','a2Pins','a2Profile'])await page.locator('#'+id).check();
 await page.locator('[data-step="4"]').click();
 await page.locator('[data-action=single]').click();
 await page.waitForFunction(()=>window.__motorCalls.includes('SINGLE'));
 await page.waitForFunction(()=>document.querySelector('.a2-status').textContent.includes('DISABLED')&&!window.ZebjusMotorSetup.active);
 await page.locator('[data-step="3"]').click();await page.locator('#a2PowerOff').check();
 await page.locator('[data-action=high]').click();
 await page.waitForFunction(()=>document.querySelector('.a2-phase').textContent.includes('HIGH active'));
 await page.locator('[data-action=low]').click();
 await page.waitForFunction(()=>document.querySelector('.a2-phase').textContent.includes('CAL_FINISHED'));
 await page.locator('[data-action=high]').click();
 await page.waitForFunction(()=>document.querySelector('.a2-phase').textContent.includes('HIGH active'));
 await page.locator('[data-action=stop]').click();
 await page.waitForFunction(()=>!window.ZebjusMotorSetup.active);
 mkdirSync('test-output',{recursive:true});await page.screenshot({path:'test-output/a2-setup-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-step="1"]').click();
 assert.equal(await page.evaluate(()=>document.querySelector('#a2SetupRoot').scrollWidth<=document.querySelector('#tab-setup').clientWidth),true,'wizard must fit mobile width');
 await page.screenshot({path:'test-output/a2-setup-mobile.png',fullPage:true});
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
 const confirm=page.getByRole('button',{name:'Confirm / Continue',exact:true});
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
 assert.deepEqual(errors,[]);console.log('PASS A2 wizard desktop/mobile, board detect, single motor, calibration, terminal result, Python motor RPC and Python STOP');
}finally{await browser.close();}
