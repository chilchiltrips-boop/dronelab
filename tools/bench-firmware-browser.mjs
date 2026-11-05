import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';

const version=JSON.parse(readFileSync('FlightCore_Firmware/bench-release-policy.json')).benchArtifact.version;
const folder=`FlightCore_Firmware/bench/${version}`;
const catalog=JSON.parse(readFileSync(`${folder}/catalog.json`));
const published=JSON.parse(readFileSync('firmware-catalog.json'));
const release=catalog.boards.find(board=>board.id==='ZFC-A2').latest;
const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
await configureContext(context);
const page=await context.newPage(),errors=[],writes=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(request.method()!=='GET'&&request.url().includes('/api/firmware'))writes.push(request.url());});
const field=id=>page.locator('#'+id);
const showing=async (id,label)=>field(id).filter({hasText:label}).waitFor({state:'visible'});
try{
 await page.goto('http://127.0.0.1:8765/index.html#firmware',{waitUntil:'domcontentloaded'});
 await page.locator('[data-dw-view="firmware"]').click();
 // Default to A1 published package until an A2 board is selected.
 await showing('fwFileVersion',published.version);
 await field('fwBoardProfile').selectOption('ZFC-A2');
 await showing('fwFileVersion',version);
 await showing('fwBuildId',release.app.buildId);
 await showing('fwSourceMessage','Flight outputs locked');
 await field('fwLoadPublishedBtn').click();
 await showing('fwFileVersion',published.version);
 await showing('fwSourceBadge','LOADED');
 await field('fwAutoLoadBtn').click();
 await showing('fwBuildId',release.app.buildId);
 await showing('fwFileVersion',version);
 await field('fwLoadBenchBtn').click();
 await showing('fwBuildId',release.app.buildId);
 await showing('fwSourceBadge','BENCH LOADED');
 await showing('fwSourceMessage','Flight outputs locked');
 assert.equal(await field('fwEraseUsb').isDisabled(),true);
 assert.equal(await field('fwUsbFlashBtn').isDisabled(),true);

 await page.evaluate(()=>{
  const api=window.ZebjusKits;
  window.restoreBenchKit=api.getState;
  api.getState=()=>({connected:true,transport:'sta',board:'ZFC-A2',kitId:'ZFC-A2-012345ABCDEF',
   kitName:'Bench fixture',version:'1.7.15',otaAuthorized:true,motorsArmed:false,motorsDisabled:true});
  window.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:true}}));
 });
 await showing('fwNetworkFlashHelp','APP OTA ready');
 await showing('fwBuildId',release.app.buildId);
 await field('fwImageType').selectOption('factory');
 await showing('fwBuildId',release.factory.buildId);
 assert.equal(await field('fwNetworkFlashBtn').isDisabled(),true);
 await field('fwImageType').selectOption('app');
 await showing('fwBuildId',release.app.buildId);
 await field('fwAutoLoadBtn').click();
 await showing('fwFileVersion',version);
 await showing('fwBuildId',release.app.buildId);
 // Explicit stable rollback must survive a connected-kit discovery event.
 await field('fwLoadPublishedBtn').click();
 await showing('fwFileVersion',published.version);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:true}})));
 await showing('fwFileVersion',published.version);
 await page.evaluate(()=>{window.ZebjusKits.getState=window.restoreBenchKit;});
 // Re-select the offline A2 board: without a connected Kit, Auto detection
 // intentionally falls back to the published A1 default rather than guessing.
 await field('fwBoardProfile').selectOption('ZFC-A2');
 await showing('fwFileVersion',version);
 await field('fwAutoLoadBtn').click();
 await showing('fwFileVersion',version);
 await field('fwFileInput').setInputFiles(`${folder}/${release.app.file}`);
 await showing('fwPackageState','VERIFIED IMPORT');
 await showing('fwBuildId',release.app.buildId);

 const corrupt=Buffer.from(readFileSync(`${folder}/${release.app.file}`));
 corrupt[corrupt.length-1]^=1;
 await page.route(new RegExp(`/bench/[^/]+/${release.app.file}\\?`),route=>route.fulfill({body:corrupt}));
 await field('fwForgetBtn').click();
 await showing('fwFileVersion','--');
 await field('fwLoadBenchBtn').click();
 await showing('fwPackageState','LOAD FAILED');
 await showing('fwSourceMessage','checksum mismatch');
 assert.equal(await field('fwFileVersion').textContent(),'--');
 assert.equal(await field('fwNetworkFlashBtn').isDisabled(),true);
 assert.deepEqual(writes,[]);
 assert.deepEqual(errors,[]);
 console.log(`PASS A2 defaults to verified ${version} bench, A1 published fallback, explicit ${published.version} rollback, APP/FACTORY, import, OTA readiness and corrupted image rejection`);
}finally{await browser.close();}
