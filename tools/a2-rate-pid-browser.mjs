import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';

const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
await configureContext(context);
const page=await context.newPage();
try{
 await page.goto('http://127.0.0.1:8765/index.html#pid',{waitUntil:'domcontentloaded'});
 const frame=page.frameLocator('#pidFrame'),roll=frame.locator('[data-pid-bank="rateRoll"] [data-gain="p"]');
 const save=frame.locator('#tpPidSaveFC'),reload=frame.locator('#tpPidReloadFC'),status=frame.locator('#tpPidKitStatus');
 await roll.waitFor();
 assert.equal(await save.isEnabled(),false);
 await roll.fill('1.55');
 await page.evaluate(()=>{
  const api=window.ZebjusKits;
  const kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',board:'ZFC-A2',kitName:'A2 fixture',
   bootId:'a'.repeat(32),transport:'sta',controlAuthorized:true,connectionGeneration:1,motorsArmed:false,motorsDisabled:true};
  let cfg={kitId:kit.kitId,bootId:kit.bootId,supported:true,version:1,schemaVersion:1,persisted:true,revision:1,
   rateRoll:{p:1.8,i:18,d:.035},ratePitch:{p:1.4,i:18,d:.035},rateYaw:{p:3,i:20,d:0}};
  const state=api.getState;
  api.getState=()=>({...state(),...kit});
  window.pidWrites=0;
  api.pidExchange=async(binding,action,args)=>{
   if(binding.kitId!==kit.kitId)throw Error('Wrong binding');
   if(action==='SET'){
    if(args.expectedRevision!==cfg.revision)throw Error('Conflict');
    window.pidWrites++;
    const [p,i,d]=args.gains.split('|').map(x=>Number(x)/1000);
    cfg={...cfg,rateRoll:{p,i,d},revision:cfg.revision+1,requestId:args.requestId,savedRequestId:args.requestId};
   }
   return cfg;
  };
  window.dispatchEvent(new Event('dronelab:kit-link'));
 });
 await status.filter({hasText:'revision 1'}).waitFor();
 assert.equal(await roll.inputValue(),'1.55','connection preserves the simulator draft');
 assert.equal(await page.evaluate(()=>window.pidWrites),0);
 await reload.click();
 assert.equal(await roll.inputValue(),'1.8');
 await roll.fill('1.725');
 await save.click();
 await status.filter({hasText:'SAVED TO A2 FC'}).waitFor();
 assert.equal(await page.evaluate(()=>window.pidWrites),1);
 assert.equal(await roll.inputValue(),'1.725');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await frame.locator('#tpPidKitActions').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 console.log('PASS existing PID editor: offline draft, authorized A2 read/save/readback, responsive inline status');
}finally{await browser.close();}
