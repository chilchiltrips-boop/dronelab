// Real same-origin Service Worker test: intentionally unsupported by file routes.
import {chromium} from 'playwright';
import {browserOptions} from './browser-harness.mjs';
import {mkdirSync} from 'node:fs';
if(process.env.DRONELAB_TEST_FILE_ROUTES==='1')throw Error('Offline browser verification requires a real HTTP server');
const browser=await chromium.launch(browserOptions),ctx=await browser.newContext(),page=await ctx.newPage();
const base='http://127.0.0.1:8765/';mkdirSync('test-output',{recursive:true});
try{
 await page.goto(base+'#settings');await page.waitForFunction(()=>document.getElementById('app').dataset.ready==='true');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready});
 await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,null,{timeout:120000});
 await ctx.setOffline(true);await page.goto(base+'#firmware');await page.locator('#tab-firmware.active').waitFor();
 await page.waitForFunction(()=>document.getElementById('fwFileName').textContent.includes('A1_APP.bin'),null,{timeout:30000});
 const fw=await page.evaluate(async()=>{const r=await fetch('./FlightCore_Firmware/ZEBJUS_I2C_SCANNER_A2_FACTORY.bin?v=1.0.1');return {ok:r.ok,bytes:(await r.arrayBuffer()).byteLength}});
 if(!fw.ok||fw.bytes!==4194304)throw Error('Offline firmware mismatch '+JSON.stringify(fw));
 await page.locator('[data-tab=python]').click();await page.locator('#pythonMonaco .monaco-editor').waitFor({state:'visible',timeout:30000});
 page.once('dialog',d=>d.accept());await page.locator('#pythonQuickHardware').selectOption('plot');await page.locator('#runPythonBtn').click();
 await page.waitForFunction(()=>document.getElementById('pythonInlinePlot').naturalWidth>10,null,{timeout:120000});
 await page.screenshot({path:'test-output/offline-python-plot.png',fullPage:true});
 console.log('PASS real Service Worker: fresh offline firmware catalog/4MB factory image, Monaco and first Matplotlib plot');
}finally{await browser.close()}
