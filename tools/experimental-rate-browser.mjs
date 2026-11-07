// Uses the published package or an exact freshly compiled candidate.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';

const pinned=JSON.parse(readFileSync('FlightCore_Firmware/experimental-rate-catalog.json'));
const pinnedDir=resolve('FlightCore_Firmware','experimental',pinned.version);
const dir=resolve(process.env.A2_RATE_ARTIFACT_DIR||pinnedDir);
const external=dir!==pinnedDir,catalog=JSON.parse(readFileSync(resolve(dir,'catalog.json')));
const release=catalog.boards[0].latest;
const kinds=['app','factory'];
const imageBytes=Object.fromEntries(kinds.map(kind=>[kind,readFileSync(resolve(dir,release[kind].file))]));
const corrupt=Buffer.from(imageBytes.app);corrupt[corrupt.length-1]^=1;
const browser=await chromium.launch(browserOptions);
try{
 const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
 await configureContext(context);
 if(external)await context.route('**/experimental-rate-catalog.json',route=>route.fulfill({json:catalog}));
 const downloads={app:0,factory:0};
 let corruptDownload=false;
 for(const kind of kinds){
  const path=`/FlightCore_Firmware/experimental/${release.version}/${release[kind].file}`;
  await context.route(url=>url.pathname===path,route=>{
   downloads[kind]++;
   if(kind==='app'&&corruptDownload)return route.fulfill({body:corrupt,contentType:'application/octet-stream'});
   if(external)return route.fulfill({body:imageBytes[kind],contentType:'application/octet-stream'});
   return route.fallback();
  });
 }
 const page=await context.newPage(),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.method()!=='GET'&&/\/api\/(motor|flight|firmware)/.test(r.url()))writes.push(r.url());});
 const field=id=>page.locator('#'+id),shows=(id,text)=>field(id).filter({hasText:text}).waitFor({state:'visible'});
 async function checkLoaded(kind){
  await shows('fwSourceBadge','EXPERIMENTAL RATE LOADED');
  await shows('fwBuildId',release[kind].buildId);
  await shows('fwSourceMessage','Physical tests NOT_RUN');
  assert.equal(await field('fwImageType').inputValue(),kind);
 }
 async function checkDownload(kind){
  const ready=page.waitForEvent('download');
  await field('fwDownloadBinBtn').click();
  const file=await ready;
  assert.equal(file.suggestedFilename(),release[kind].file);
  assert.equal(createHash('sha256').update(readFileSync(await file.path())).digest('hex'),release[kind].sha256);
 }
 await page.goto('http://127.0.0.1:8765/index.html#firmware',{waitUntil:'domcontentloaded'});
 await page.locator('[data-dw-view="firmware"]').click();
 await field('fwBoardProfile').selectOption('ZFC-A2');
 await shows('fwSourceBadge','BENCH LOADED');
 assert.deepEqual(downloads,{app:0,factory:0},'ordinary Auto Load must not download Experimental');
 await field('fwLoadExperimentalBtn').click();
 await checkLoaded('app');
 await shows('fwPackageState','EXPERIMENTAL RATE');
 assert.deepEqual(downloads,{app:1,factory:0});
 await checkDownload('app');
 await page.evaluate(()=>{
  window.restoreRateKit=window.ZebjusKits.getState;
  window.ZebjusKits.getState=()=>({connected:true,transport:'sta',board:'ZFC-A2',kitId:'ZFC-A2-012345ABCDEF',
   kitName:'Rate fixture',otaAuthorized:true,motorsArmed:false,motorsDisabled:true});
  window.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:true}}));
 });
 await shows('fwNetworkFlashHelp','APP OTA ready');
 await checkLoaded('app');
 assert.equal(await field('fwNetworkFlashBtn').isDisabled(),false);
 await field('fwImageType').selectOption('factory');
 await checkLoaded('factory');
 assert.equal(await field('fwNetworkFlashBtn').isDisabled(),true,'Factory cannot use network OTA');
 assert.deepEqual(downloads,{app:1,factory:1});
 await checkDownload('factory');
 await page.evaluate(()=>{window.ZebjusKits.getState=window.restoreRateKit;});

 await field('fwAutoLoadBtn').click();
 await shows('fwSourceBadge','BENCH LOADED');
 assert.equal(await field('fwImageType').inputValue(),'factory');
 await field('fwLoadExperimentalBtn').click();
 await checkLoaded('factory');
 assert.deepEqual(downloads,{app:1,factory:1},'explicit Factory selection reuses only the matching verified cache');
 await field('fwImageType').selectOption('app');
 await checkLoaded('app');
 assert.deepEqual(downloads,{app:1,factory:1},'APP and Factory cache entries stay separate');

 await field('fwAutoLoadBtn').click();
 await shows('fwSourceBadge','BENCH LOADED');
 assert.notEqual(await field('fwBuildId').textContent(),release.app.buildId);
 await field('fwForgetBtn').click();
 await shows('fwSourceBadge','NO FILE');
 corruptDownload=true;
 await field('fwLoadExperimentalBtn').click();
 await shows('fwPackageState','LOAD FAILED');
 await shows('fwSourceMessage','checksum mismatch');
 assert.equal(await field('fwNetworkFlashBtn').isDisabled(),true);
 assert.equal(await field('fwUsbFlashBtn').isDisabled(),true);
 assert.equal(await field('fwDownloadBinBtn').isDisabled(),true);
 corruptDownload=false;

 await field('fwFileInput').setInputFiles(resolve(dir,release.app.file));
 await checkLoaded('app');
 await shows('fwPackageState','VERIFIED IMPORT');
 await field('fwFileInput').setInputFiles({name:release.app.file,mimeType:'application/octet-stream',buffer:corrupt});
 await shows('fwSourceMessage','does not match a verified FlightCore package');
 await field('fwFileInput').setInputFiles(resolve(dir,release.factory.file));
 await checkLoaded('factory');
 assert.equal(await field('fwNetworkFlashBtn').isDisabled(),true,'Factory cannot use network OTA');
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log('PASS explicit Experimental Rate download/import, exact APP/Factory hashes, cache isolation, corrupt rejection, ordinary Auto Load and no hardware writes');
}finally{await browser.close();}
