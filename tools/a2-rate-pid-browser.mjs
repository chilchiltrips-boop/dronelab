import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import {PID_BANKS,PID_PROFILES} from '../js/pid-profiles.js';

const browser=await chromium.launch(browserOptions);
const context=await browser.newContext({viewport:{width:1366,height:768},serviceWorkers:'block'});
await configureContext(context);
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://127.0.0.1:8765/index.html#pid',{waitUntil:'domcontentloaded'});
 const frame=page.frameLocator('#pidFrame');
 const gain=(bank,term='p')=>frame.locator(`[data-pid-bank="${bank}"] [data-gain="${term}"]`);
 const read=frame.locator('#tpPidReadFC'),save=frame.locator('#tpPidSaveFC'),apply=frame.locator('#tpApplyPid');
 const restore=frame.locator('#tpPidDefaults'),status=frame.locator('#tpPidKitStatus');
 await gain('rateRoll').waitFor();
 assert.equal(await frame.locator('#tpPidAxis,#tpPidLoop,#tpPreset,.tp-ab-compare').count(),0);
 assert.equal(await save.isVisible(),false);
 await gain('rateRoll').fill('1.55');
 await apply.click();
 await status.filter({hasText:'Applied to Simulator'}).waitFor();
 await page.evaluate(({banks,profiles})=>{
  const api=window.ZebjusKits,kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',board:'ZFC-A2',kitName:'A2 fixture',
   bootId:'a'.repeat(32),transport:'sta',version:'1.7.16',controlAuthorized:true,connectionGeneration:1,motorsArmed:false,motorsDisabled:true};
  const board={kitId:kit.kitId,bootId:kit.bootId,version:3,supported:true,wizardVersion:1,pageSaveVersion:1,
   configRevision:1,configValid:true,configVerified:true,escCalibrationSaved:false,layout:'A2_QUAD_X',layoutPins:['D0','D1','D2','D3'],
   rotations:['CW','CCW','CW','CCW'],observedMinimumUs:[0,0,0,0],mode:'DISABLED',reason:'USER_STOP',
   motorsDisabled:true,pulseUs:[0,0,0,0],accelModel:'0:0:0:0:0:1000:1000:1000:0:0:0'};
  const initial={profile:profiles[0].id,...profiles[0].gains,rateRoll:{p:1.8,i:18,d:.035},angleRoll:{p:3.25,i:0,d:0}};
  const state=window.pidFixture={kit,board,calls:[],cfg:{kitId:kit.kitId,bootId:kit.bootId,supported:true,version:1,schemaVersion:2,
   persisted:true,revision:1,saved:initial,active:initial,preview:false,activeGeneration:1,savedRequestId:'old'}};
  api.getState=()=>({...kit});
  api.pidExchange=async(binding,action,args,guard)=>{
   guard?.();
   const cfg=state.cfg;
   if(binding.kitId!==kit.kitId)throw Error('Wrong binding');
   if(action!=='GET'){
    if(args.expectedRevision!==cfg.revision||args.expectedGeneration!==cfg.activeGeneration)throw Error('Conflict');
    const profile=profiles.find(item=>item.id===args.profile);
    if(profile?.layout!==board.layout)throw Error('PROFILE_WIRING_MISMATCH');
    const values=action==='RESET'?profile.gains:Object.fromEntries(banks.map((bank,i)=>{
     const [p,iTerm,d]=args.gains.split('|').slice(i*3,i*3+3).map(x=>Number(x)/1000);
     return [bank,{p,i:iTerm,d}];
    }));
    const active={profile:profile.id,...values};
    state.calls.push(action);
    Object.assign(cfg,{active,preview:action==='APPLY',requestId:args.requestId,activeRequestId:args.requestId,activeGeneration:cfg.activeGeneration+1});
    if(action!=='APPLY')Object.assign(cfg,{saved:active,savedRequestId:args.requestId,revision:cfg.revision+1});
   }
   return structuredClone({...cfg,wiredLayout:board.layout});
  };
  api.requestBound=async(_,route,method,args,guard)=>{
   guard?.();
   if(route!=='/api/motor')throw Error('Unexpected request');
   if(args.action==='WIZARD_SAVE_PAGE'){
    if(!args.c.endsWith(':WIRING'))throw Error('Wrong wizard save scope');
    board.layout=args.a.startsWith('P:')?'A2_QUAD_PLUS':'A2_QUAD_X';board.configRevision++;
   }else if(!['WIZARD_STATUS','STATUS'].includes(args.action))throw Error('Unexpected motor command');
   return structuredClone(board);
  };
  window.dispatchEvent(new Event('dronelab:kit-link'));
 },{banks:PID_BANKS,profiles:PID_PROFILES});
 await status.filter({hasText:'revision 1'}).waitFor();
 await frame.locator('#tpPidTarget').filter({hasText:'A2 fixture · ZFC-A2-012345ABCDEF · STA'}).waitFor();
 assert.equal(await gain('rateRoll').inputValue(),'1.8');
 assert.equal(await gain('angleRoll').inputValue(),'3.25');
 assert.equal(await read.isVisible(),true);
 assert.equal(await page.evaluate(()=>pidFixture.calls.length),0);
 await gain('rateRoll').fill('1.725');await gain('anglePitch').fill('3.55');
 await apply.click();
 await status.filter({hasText:'Live bench tuning applied'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>[pidFixture.cfg.active.anglePitch.p,pidFixture.cfg.saved.anglePitch.p,pidFixture.cfg.revision]),[3.55,3,1]);
 await save.click();
 await status.filter({hasText:'Saved to FC and verified'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>[pidFixture.cfg.saved.rateRoll.p,pidFixture.cfg.saved.anglePitch.p,pidFixture.cfg.revision]),[1.725,3.55,2]);
 await restore.click();
 await status.filter({hasText:'Defaults saved to FC and verified'}).waitFor();
 assert.equal(await gain('anglePitch').inputValue(),'3');

 await page.evaluate(()=>{location.hash='setup';});
 const wizard=page.locator('#a2SetupRoot');
 await wizard.locator('[data-panel="0"]').waitFor();
 await wizard.locator('[data-action="detect"]').click();
 await wizard.locator('[data-step="1"]').click();
 const profile=wizard.locator('#a2PidProfile'),load=wizard.locator('[data-action="load-pid-profile"]');
 assert.deepEqual(await profile.locator('option').allTextContents(),PID_PROFILES.map(item=>item.label));
 await load.click();
 await wizard.locator('.a2-pid-status').filter({hasText:'revision 4'}).waitFor();
 await profile.selectOption('aerof450-quad-plus');
 assert.equal(await wizard.locator('#a2Layout').inputValue(),'A2_QUAD_PLUS');
 assert.equal(await load.isDisabled(),true);
 await wizard.locator('[data-action="save-page"]').click();
 await wizard.locator('[data-save-page="1"]').filter({hasText:'Saved on board'}).waitFor();
 await load.click();
 await wizard.locator('.a2-pid-status').filter({hasText:'revision 5'}).waitFor();
 assert.equal(await page.evaluate(()=>pidFixture.cfg.active.profile),'aerof450-quad-plus');
 await page.evaluate(()=>{location.hash='pid';});
 await status.filter({hasText:'Aerof450 · Quad +'}).filter({hasText:'revision 5'}).waitFor();
 assert.equal(await gain('rateRoll').inputValue(),'1.4');

 await page.evaluate(()=>{pidFixture.kit.connected=false;window.dispatchEvent(new Event('dronelab:kit-link'));});
 await frame.locator('#tpPidTarget').filter({hasText:'SIMULATOR'}).waitFor();
 assert.equal(await gain('rateRoll').inputValue(),'1.55');
 await page.evaluate(()=>{Object.assign(pidFixture.kit,{connected:true,board:'ZFC-A1',kitId:'ZFC-A1-012345ABCDEF'});window.dispatchEvent(new Event('dronelab:kit-link'));});
 await status.filter({hasText:'FC PID unavailable on this Kit'}).waitFor();
 assert.equal(await gain('rateRoll').isEditable(),true);
 assert.equal(await save.isVisible(),false);
 await page.setViewportSize({width:320,height:740});
 assert.equal(await frame.locator('#tpPidKitActions').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 assert.deepEqual(errors,[]);
 console.log('PASS Aerof450 Wizard profiles, FC/Simulator PID switching, volatile Apply, dual-loop Save and Restore, verified cross-page sync');
}finally{await browser.close();}
