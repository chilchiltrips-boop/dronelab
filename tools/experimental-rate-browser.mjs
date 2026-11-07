// Uses the exact compiled candidate. No motor or flash operation is invoked.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';

assert.ok(process.env.A2_RATE_ARTIFACT_DIR,'Provide the verified candidate directory');
const dir=resolve(process.env.A2_RATE_ARTIFACT_DIR),catalog=JSON.parse(readFileSync(resolve(dir,'catalog.json')));
const release=catalog.boards[0].latest;
const browser=await chromium.launch(browserOptions);
try{
 const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
 await configureContext(context);
 await context.route('**/experimental-rate-catalog.json',route=>route.fulfill({json:catalog}));
 const page=await context.newPage(),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()!=='GET'&&/\/api\/(motor|flight|firmware)/.test(r.url()))writes.push(r.url());});
 const field=id=>page.locator('#'+id),shows=(id,text)=>field(id).filter({hasText:text}).waitFor({state:'visible'});
 await page.goto('http://127.0.0.1:8765/index.html#firmware',{waitUntil:'domcontentloaded'});
 await page.locator('[data-dw-view="firmware"]').click();
 await field('fwBoardProfile').selectOption('ZFC-A2');
 await shows('fwSourceBadge','BENCH LOADED');
 await field('fwFileInput').setInputFiles(resolve(dir,release.app.file));
 await shows('fwSourceBadge','EXPERIMENTAL RATE LOADED');
 await shows('fwBuildId',release.app.buildId);
 await shows('fwSourceMessage','Physical tests NOT_RUN');
 await shows('fwPackageState','VERIFIED IMPORT');
 await page.evaluate(()=>{
  window.ZebjusKits.getState=()=>({connected:true,transport:'sta',board:'ZFC-A2',kitId:'ZFC-A2-012345ABCDEF',
   kitName:'Rate fixture',otaAuthorized:true,motorsArmed:false,motorsDisabled:true});
  window.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:true}}));
 });
 await shows('fwNetworkFlashHelp','APP OTA ready');
 await shows('fwBuildId',release.app.buildId);
 assert.equal(await field('fwNetworkFlashBtn').isDisabled(),false);
 await field('fwAutoLoadBtn').click();
 await shows('fwSourceBadge','BENCH LOADED');
 assert.notEqual(await field('fwBuildId').textContent(),release.app.buildId);
 const corrupt=Buffer.from(readFileSync(resolve(dir,release.app.file)));corrupt[corrupt.length-1]^=1;
 await field('fwFileInput').setInputFiles({name:release.app.file,mimeType:'application/octet-stream',buffer:corrupt});
 await shows('fwSourceMessage','does not match a verified FlightCore package');
 await field('fwFileInput').setInputFiles(resolve(dir,release.factory.file));
 await shows('fwBuildId',release.factory.buildId);
 await shows('fwSourceBadge','EXPERIMENTAL RATE LOADED');
 assert.equal(await field('fwNetworkFlashBtn').isDisabled(),true,'Factory cannot use network OTA');
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log('PASS real experimental APP/FACTORY explicit import, exact hashes, reconnect retention, ordinary Auto Load and no physical commands');
}finally{await browser.close();}
