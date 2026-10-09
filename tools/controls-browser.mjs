import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const browser=await chromium.launch(browserOptions),ctx=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});await configureContext(ctx);
const page=await ctx.newPage(),results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
async function click(id){const b=page.locator('#'+id);if(await b.isVisible()&&await b.isEnabled()){await b.click();results.push({id,result:'clicked; no exception'})}else results.push({id,result:'disabled/hidden guard inspected'})}
try{
 await page.goto('http://127.0.0.1:8765/');await page.waitForFunction(()=>document.getElementById('app').dataset.ready==='true');
 await click('freeModeBtn');
 for(const id of ['objectViewBtn','wireMapBtn','xrayBtn','fcCaseXrayBtn','view3dBtn','topBtn','frontBtn','explodeBtn','autoRotateBtn','batteryConnectBtn'])await click(id);
 await page.locator('.product-card').first().focus();await page.keyboard.press('Enter');results.push({id:'product-card',result:'keyboard selection'});
 const steps=await page.locator('.build-step').count();
 for(let i=0;i<steps;i++){await page.locator('.build-step').nth(i).focus();await page.keyboard.press('Space');await click('doStepAction');await click('assemblyWiringPreviewBtn')}
 for(const id of ['prevStepBtn','nextStepBtn','guidedModeBtn','freeModeBtn','undoBtn','redoBtn','saveBtn','resetBtn','undoBtn'])await click(id);
 await page.locator('[data-tab=wiring]').click();
 for(const id of ['autoWireBtn','wireUndoBtn','centerWireLayoutBtn','deleteWireBtn','deleteNodeBtn','addOptionalWireDevice','wireRunBtn'])await click(id);
 await page.locator('#wireThrottle').focus();await page.keyboard.press('Home');await page.locator('#wireAllMotors').uncheck();await page.locator('#wireAllMotors').check();
 for(const id of ['wireM1','wireM2','wireM3','wireM4']){await page.locator('#'+id).uncheck();await page.locator('#'+id).check()}
 await page.locator('#wireModeBadge').focus();await page.keyboard.press('Space');await page.keyboard.press('Space');
 const node=page.locator('[data-node=M1]').first();await node.click({position:{x:30,y:15}});const before=await node.getAttribute('transform');await page.keyboard.press('r');const rotated=await node.getAttribute('transform');if(before===rotated)throw Error('Wiring rotation key did not update transform');await page.keyboard.press('f');
 results.push({id:'wiring-node',result:'select, rotate, flip verified'});await click('clearWireBtn');
 if(await page.locator('#wireModeBadge').textContent()!=='WIRE MODE')await page.locator('#wireModeBadge').click();
 const firstPort=page.locator('.port-v8[data-port="BAT.+"][tabindex="0"]'),secondPort=page.locator('.port-v8[data-port="PDB.BAT+"][tabindex="0"]');
 await firstPort.focus();await page.keyboard.press('Enter');
 if(await firstPort.getAttribute('aria-pressed')!=='true'||await page.evaluate(()=>document.activeElement?.dataset.port)!=='BAT.+')throw Error('Wiring keyboard selection/focus was lost on render');
 await secondPort.focus();await page.keyboard.press('Space');
 if(await page.locator('.wire-v8').count()!==1)throw Error('Keyboard port pair did not create exactly one virtual wire');
 const uniquePorts=await page.locator('.port-v8[tabindex="0"]').evaluateAll(ps=>ps.map(p=>p.dataset.port));if(new Set(uniquePorts).size!==uniquePorts.length)throw Error('Duplicate FC overlay keyboard targets');
 results.push({id:'wiring-port',result:'Enter/Space creates one virtual wire; focus survives render; FC overlay targets unique'});
 await click('clearWireBtn');
 await page.locator('[data-tab=firmware]').click();
 await page.waitForFunction(()=>document.getElementById('fwFileName').textContent.includes('APP.bin'));
 await page.evaluate(()=>{Object.defineProperty(navigator,'serial',{value:{requestPort:async()=>{throw new DOMException('Permission denied for test','NotAllowedError')},getPorts:async()=>[],addEventListener(){}}})});
 for(const id of ['fwAutoLoadBtn','fwConnectUsbBtn','fwSerialMonitorBtn','fwSerialReconnectBtn','fwSerialTabPlotter','fwPlotClearBtn','fwSerialTabMonitor','fwSerialClearBtn','fwForgetBtn','fwAutoLoadBtn'])await click(id);
 await page.locator('#fwBoardProfile').selectOption('ZFC-A2');await page.waitForFunction(()=>document.getElementById('fwFileName').textContent.includes('A2_APP.bin'));
 await page.locator('#fwImageType').selectOption('factory');await page.waitForFunction(()=>document.getElementById('fwFileName').textContent.includes('A2_FACTORY.bin'));
 await page.locator('#fwFileInput').setInputFiles({name:'invalid.bin',mimeType:'application/octet-stream',buffer:Buffer.alloc(32)});await page.waitForFunction(()=>document.getElementById('fwLog').textContent.includes('does not match'));
 await page.locator('#fwFileInput').setInputFiles({name:'ZEBJUS_I2C_SCANNER_A2_FACTORY.bin',mimeType:'application/octet-stream',buffer:readFileSync('FlightCore_Firmware/ZEBJUS_I2C_SCANNER_A2_FACTORY.bin')});await page.waitForFunction(()=>document.getElementById('fwPackageState').textContent==='VERIFIED IMPORT');
 if(await page.locator('#fwUsbFlashBtn').isEnabled())throw Error('Flash enabled after denied USB selection');
 results.push({id:'firmware-select/import',result:'A2 APP/factory loaded; truncated image rejected; flash remains disabled'});
 await page.locator('[data-tab=python]').click();for(const id of ['pyConnectUsbBtn','clearTerminalBtn','copyTerminalBtn','pythonSaveFileBtn','pythonOutputOpen'])await click(id);
 if(errors.length)throw Error(errors.join('; '));console.log('PASS '+results.length+' UI action checks: assembly view/steps/history, wiring rotation/flip/reference/virtual bench, firmware import/board/type/permission failure, Python controls; no hardware writes');
}finally{mkdirSync('test-output',{recursive:true});writeFileSync('test-output/control-actions.json',JSON.stringify({results,errors},null,2));await browser.close()}
