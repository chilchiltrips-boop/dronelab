// Browser simulation only: no physical Kit commands, flashing or radio access.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {browserOptions,configureContext} from './browser-harness.mjs';

const browser=await chromium.launch(browserOptions);
try{
 const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'});
 await configureContext(context);
 const page=await context.newPage(),errors=[],native=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>{native.push(dialog.message());void dialog.dismiss();});
 await page.goto('http://127.0.0.1:8765/#setup');
 await page.waitForFunction(()=>window.AerionDialogs?.mode==='inline');
 await page.evaluate(()=>{
  window.__inlineKit={kitId:'A2-fixture',bootId:'first-boot',connected:true,transport:'sta',connectionGeneration:1};
  window.ZebjusKits={getState:()=>({...__inlineKit}),getUsbMonitorState:()=>{throw Error('USB not connected');}};
  const host=document.createElement('div');host.id='inlineTestHost';document.querySelector('#tab-setup').append(host);
 });
 const panel=page.locator('.aerion-inline-action[data-kind]'),accept=panel.locator('[data-inline-accept]'),cancel=panel.locator('[data-inline-cancel]');
 const request=async(kind='confirm',extra={})=>{
  await page.evaluate(({kind,extra})=>{
   window.__inlineResult='PENDING';window.__inlineAllowed=true;window.__inlineAbort=new AbortController();
   const options={host:document.getElementById('inlineTestHost'),guard:()=>__inlineAllowed,signal:__inlineAbort.signal,...extra};
   const promise=kind==='prompt'?AerionDialogs.prompt('Enter the setup value','',options):AerionDialogs.confirm('Confirm the setup action',options);
   promise.then(result=>{window.__inlineResult=result;});
  },{kind,extra});
  await panel.waitFor();
  assert.equal(await panel.evaluate(node=>getComputedStyle(node).position),'static','confirmation stays in the page flow');
  assert.equal(await page.locator('dialog').count(),0,'no HTML modal is created');
 };
 const result=async expected=>{
  await page.waitForFunction(value=>window.__inlineResult===value,expected);
  assert.equal(await panel.count(),0);
 };
 await request();await cancel.click();await result(false);
 await request();await accept.click();await result(true);
 await request();await page.keyboard.press('Escape');await result(false);
 await request();await page.evaluate(()=>__inlineAbort.abort());await result(false);
 await request();await page.evaluate(()=>{__inlineKit.connectionGeneration++;document.querySelector('[data-inline-accept]').click();});await result(false);
 await request();await page.evaluate(()=>{__inlineKit.bootId='new-boot';document.querySelector('[data-inline-accept]').click();});await result(false);
 await request();await page.evaluate(()=>{__inlineAllowed=false;document.querySelector('[data-inline-accept]').click();});await result(false);
 await request();await page.evaluate(()=>document.querySelector('#tab-setup').classList.remove('active'));await result(false);
 await page.evaluate(()=>document.querySelector('#tab-setup').classList.add('active'));
 await request('prompt',{kitBound:false,type:'password',required:true,minLength:6,maxLength:12});
 assert.equal(await panel.locator('input').getAttribute('type'),'password');
 await accept.click();assert.match(await panel.locator('[role=status]').textContent(),/Enter a value|at least/);
 assert.equal(await page.evaluate(()=>__inlineResult),'PENDING','invalid input cannot confirm');
 await panel.locator('input').fill('abcdef');await accept.click();await result('abcdef');
 await request('prompt',{kitBound:false});await cancel.click();await result(null);
 // A hardware STOP aborts a pending Python/motor confirmation before any action.
 await page.evaluate(async()=>{
  const motor=await import('./js/motor-setup.js');window.__cancelMotorInline=motor.cancelMotorConfirmations;
  window.__inlineResult='PENDING';void motor.confirmMotor('Simulated motor action').then(()=>{__inlineResult=true;},()=>{__inlineResult=false;});
 });
 await panel.waitFor();await page.evaluate(()=>__cancelMotorInline());await result(false);
 assert.deepEqual(native,[]);assert.deepEqual(errors,[]);

 // File and example prompts use the same controls. Cancelling an example must
 // preserve both the edited file and its hardware target.
 await page.goto('http://127.0.0.1:8765/#python');
 await page.locator('#pythonMonaco .monaco-editor').waitFor({timeout:45000});
 await page.evaluate(()=>{
  const model=monaco.editor.getModels().find(model=>model.uri.toString().includes('main.py'));
  model.setValue('print("keep this edited file")\n');window.__inlineOriginal=model.getValue();
  window.__inlineTarget=document.getElementById('pythonTarget').value;
 });
 await page.locator('#pythonQuickHardware').selectOption('basic');
 await panel.waitFor();await cancel.click();
 assert.equal(await page.evaluate(()=>monaco.editor.getModels().find(model=>model.uri.toString().includes('main.py')).getValue()),await page.evaluate(()=>__inlineOriginal));
 assert.equal(await page.locator('#pythonTarget').inputValue(),await page.evaluate(()=>__inlineTarget));
 const fileCount=await page.locator('#pythonFileList option').count();
 const openNewFile=async()=>{
  await page.locator('.py-ide-menu:has(#pythonNewFileBtn) > summary').click();
  await page.locator('#pythonNewFileBtn').click();await panel.waitFor();
 };
 await openNewFile();await cancel.click();
 assert.equal(await page.locator('#pythonFileList option').count(),fileCount,'Cancel creates no file');
 await openNewFile();await panel.locator('input').fill('inline_test.py');await accept.click();
 await page.waitForFunction(()=>document.getElementById('pythonActiveFileLabel').textContent==='inline_test.py');
 assert.equal(await page.locator('#pythonFileList option').count(),fileCount+1);
 await page.locator('#pythonQuickHardware').selectOption('basic');await panel.waitFor();
 // An editor change while confirmation is open invalidates the pending replace.
 await page.evaluate(()=>{
  monaco.editor.getModels().find(model=>model.uri.toString().includes('inline_test.py')).setValue('print("newer edit survives")\n');
  document.querySelector('[data-inline-accept]').click();
 });
 await panel.waitFor({state:'detached'});
 assert.match(await page.evaluate(()=>monaco.editor.getModels().find(model=>model.uri.toString().includes('inline_test.py')).getValue()),/newer edit survives/);
 await page.locator('#pythonQuickHardware').selectOption('basic');await panel.waitFor();
 mkdirSync('test-output',{recursive:true});
 const desktopFormBounds=await panel.boundingBox();assert.ok(desktopFormBounds.x>=0&&desktopFormBounds.x+desktopFormBounds.width<=1367,'desktop confirmation fits without horizontal overflow');
 await page.screenshot({path:'test-output/inline-python-confirmation-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'test-output/inline-python-confirmation-mobile.png',fullPage:true});
 const formBounds=await panel.boundingBox();assert.ok(formBounds.x>=0&&formBounds.x+formBounds.width<=391,'inline form fits a narrow screen');
 await cancel.click();
 assert.deepEqual(native,[]);

 // Actual mobile connection UI is a page. Back restores the controller and STOP
 // stays reachable without a modal, overlay, or a backdrop.
 await page.setViewportSize({width:390,height:844});
 await page.goto('http://127.0.0.1:8765/companion.html');
 await page.waitForFunction(()=>window.ZebjusFlightApp);
 await page.locator('#flightSettings').click();
 const connection=page.locator('#mobileConnection');
 assert.equal(await connection.evaluate(node=>node.tagName),'SECTION');
 assert.equal(await connection.evaluate(node=>getComputedStyle(node).position),'static');
 assert.equal(await page.locator('#flightCockpit').isVisible(),false);
 assert.equal(await page.locator('#flightBack').isVisible(),true);
 assert.equal(await page.locator('#flightStop').isVisible(),true,'original STOP remains on the full-page settings view');
 assert.equal(await page.locator('#flightStop').count(),1,'STOP is moved, not duplicated');
 const transportParts=await page.locator('#flightNetworkSwitch').evaluate(node=>{
  const [ap,track,sta]=[...node.children].map(child=>child.getBoundingClientRect());
  return {apRight:ap.right,trackLeft:track.left,trackRight:track.right,staLeft:sta.left,trackWidth:track.width};
 });
 assert.ok(transportParts.apRight<=transportParts.trackLeft&&transportParts.trackRight<=transportParts.staLeft&&transportParts.trackWidth>=24,'moved AP/STA labels and toggle must not overlap');
 const bounds=await connection.boundingBox();assert.ok(bounds.x>=0&&bounds.width<=390&&bounds.height>=843);
 mkdirSync('test-output',{recursive:true});
 await page.screenshot({path:'test-output/inline-mobile-connection.png',fullPage:true});
 await page.locator('#flightBack').click();
 assert.equal(await connection.isVisible(),false);
 assert.equal(await page.locator('#flightCockpit').isVisible(),true,'Back restores the controller');
 await page.locator('#flightSettings').click();await page.keyboard.press('Escape');
 assert.equal(await connection.isVisible(),false,'Escape restores the controller too');
 assert.equal(await page.locator('#flightCockpit').isVisible(),true);
 assert.deepEqual(native,[]);assert.deepEqual(errors,[]);
 // Standalone pairing stays in the simulator page. Hiding/revealing the live
 // canvas at Close must not stall input delivery or recreate its scene.
 await page.setViewportSize({width:1366,height:900});
 await page.goto('http://127.0.0.1:8765/tripod.html?standalone=1');
 await page.waitForFunction(()=>window.ZebjusTraining?.isReady?.());
 await page.evaluate(()=>{window.__inlineCanvas=document.querySelector('#tpStage canvas');});
 await page.locator('#topPairMobileBtn').click();
 assert.equal(await page.locator('#connectionDialog').evaluate(node=>getComputedStyle(node).position),'static');
 assert.equal(await page.locator('.tp-shell').isVisible(),true);
 assert.equal(await page.locator('#connectionStop').isVisible(),true);
 await page.locator('#connectionClose').click();
 assert.equal(await page.locator('#connectionDialog').isVisible(),false);
 assert.equal(await page.evaluate(()=>document.querySelector('#tpStage canvas')===__inlineCanvas),true,'closing pairing retains the canvas');
 await page.locator('#topPairMobileBtn').click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('#connectionDialog').isVisible(),false);
 assert.deepEqual(native,[]);assert.deepEqual(errors,[]);
 console.log('PASS simulated inline confirm/prompt validation, cancel/STOP/context revocation, mobile connection page and Back/Escape restoration; no native dialogs');
}finally{await browser.close();}
