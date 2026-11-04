// Simulated firmware transport. Physical tones, PWM and NVS need A2 bench verification.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

const browser=await chromium.launch(browserOptions);
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const safetyPrompts=[];
 page.on('dialog',dialog=>{safetyPrompts.push(dialog.message());void dialog.accept();});
 await configureContext(page.context());
 await page.goto('http://127.0.0.1:8765/#setup');
 const wizard=page.locator('#a2SetupRoot');
 await wizard.locator('[data-step="0"]').waitFor();
 assert.deepEqual(await wizard.locator('[data-step]').evaluateAll(buttons=>buttons.map(b=>b.getAttribute('aria-label'))),
  ['Board','Wiring','Inputs','IMU Calibration','Output Signal','ESC Calibration','Output Calibration','Report']);
 const installFixture=({savedBoard={},boot='testboot'}={})=>{
  const kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',kitName:'A2 fixture',transport:'sta',bootId:boot,connectionGeneration:1,board:'A2',version:'1.7.10'};
  const identityModel='0:0:0:0:0:1000:1000:1000:0:0:0';
  const f=window.__wizard={kit,calls:[],writes:0,run:0,imuSequence:3,candidates:{},
   board:{wizardVersion:1,pageSaveVersion:1,accelManualVersion:1,version:3,kitId:kit.kitId,configRevision:0,supported:true,configValid:true,configVerified:true,layout:'A2_QUAD_X',layoutPins:['D0','D1','D2','D3'],rotations:['CW','CCW','CW','CCW'],observedMinimumUs:[0,0,0,0],escCalibrationSaved:false,escCalibrationPending:false,escConfirmationStaged:false,accelModel:identityModel,timedBenchSupported:true,sliderDurationMaxMs:30000,remainingMs:0,selectedInput:'PPM',inputSource:'PPM',inputValid:true,inputAgeMs:0,channels:[1500,1500,1000,1500],outputSignal:{profile:'PWM_50HZ_1000_2000',hz:50,minUs:1000,maxUs:2000,timer:3,resolutionBits:14},
    imu:{state:'READY',imuValid:true,accelG:[0.120,-0.010,1.080],accelRawG:[0.120,-0.010,1.080],raw:[0,0,0],bias:[0,0,0],corrected:[0,0,0],samples:2000,sampleSequence:50},
    ...savedBoard,bootId:boot,mode:'DISABLED',reason:'USER_STOP',pulseUs:[0,0,0,0],capture:{sequence:3,state:'IDLE',ready:false}}
  };
  const stop=(reason='USER_STOP')=>Object.assign(f.board,{mode:'DISABLED',reason,pulseUs:[0,0,0,0]});
  const setWiring=encoded=>{
   const [frame,pins,rotations]=encoded.split(':');
   Object.assign(f.board,{layout:frame==='P'?'A2_QUAD_PLUS':'A2_QUAD_X',layoutPins:[...pins].map(n=>'D'+n),rotations:[...rotations].map(n=>n==='0'?'CW':'CCW')});
  };
  window.ZebjusKits={...window.ZebjusKits,getState:()=>({...kit}),requestBound:async(_,route,method,a,guard)=>{
   guard?.();if(route!=='/api/motor')throw Error('Unexpected fixture request');
   f.calls.push({...a});const b=f.board;let extra={};
   if(a.action==='WIZARD_STATUS'&&f.failStatus)throw Error('Simulated unavailable readback');
   switch(a.action){
    case 'WIZARD_IMU':{
     const sequence=++f.imuSequence;extra={imuRequestSequence:sequence};
     setTimeout(()=>{b.capture={sequence,state:'CAPTURED',ready:true,samples:128,model:'0:1:0:0:0:1000:1000:1000:42:0:0'};},450);break;
    }
    case 'WIZARD_BEGIN':
     f.run++;f.mapping=a.c;Object.assign(b,{mode:'READY',reason:'NONE'});extra={session:'fixture-token'};break;
    case 'CAL_HIGH':
     Object.assign(b,{mode:'CAL_HIGH',pulseUs:[2000,2000,2000,2000],remainingMs:15000,escCalibrationSaved:false,escCalibrationPending:false,escConfirmationStaged:false});break;
    case 'CAL_LOW':{
     Object.assign(b,{mode:'CAL_LOW',pulseUs:[1000,1000,1000,1000],remainingMs:3000});
     const run=f.run;setTimeout(()=>{if(f.run===run){stop('CAL_FINISHED');b.escCalibrationPending=true;}},1000);break;
    }
    case 'WIZARD_ESC_CONFIRM':
     if(!b.escCalibrationPending)throw Error('ESC incomplete');b.escConfirmationStaged=true;break;
    case 'CAL_SLIDER':
     Object.assign(b,{mode:'SLIDER_TEST',sliderMask:Number(a.a),remainingMs:30000,pulseUs:[0,1,2,3].map(i=>Number(a.a)&(1<<i)?1000:0)});break;
    case 'SLIDE':
     if(Number(a.b)>1500)throw Error('Calibration cap');
     if(f.holdPulse&&a.b===f.holdPulse){await new Promise(resolve=>{f.release=resolve;});guard?.();}
     if(b.mode==='SLIDER_TEST')b.pulseUs=[0,1,2,3].map(i=>b.sliderMask&(1<<i)?Number(a.b):0);break;
    case 'STOP':
     if(b.mode==='SLIDER_TEST'&&a.session){
      extra={stoppedSlider:true,stoppedMask:b.sliderMask,stoppedPulseUs:b.pulseUs.find(Boolean)};
      if(a.a==='CAPTURE_OUTPUT')for(let i=0;i<4;i++)if(b.sliderMask&(1<<i))f.candidates[i]=b.pulseUs[i];
     }
     f.run++;if(!b.escConfirmationStaged)b.escCalibrationPending=false;stop();break;
    case 'WIZARD_SAVE_PAGE':{
     const scope=a.c.split(':')[1];
     if(b.mode!=='DISABLED'||Number(a.b)!==b.configRevision||!a.c.startsWith(kit.bootId+':'))throw Error('Save interlock');
     if(f.failSave){f.failSave=false;throw Error('Simulated NVS failure');}
     if(scope==='WIRING'){
      setWiring(a.a);b.observedMinimumUs=[0,0,0,0];b.escCalibrationSaved=false;
     }else if(scope==='ACCEL'){
      if(!b.capture.ready||a.a!=='CAPTURED:'+b.capture.model)throw Error('Capture mismatch');
      b.accelModel=b.capture.model;b.capture.ready=false;
     }else if(scope==='ACCEL_MANUAL'){
      const m=/^MANUAL:(-?\d+):(-?\d+):(-?\d+)$/.exec(a.a);
      if(!m||m.slice(1).some(v=>Math.abs(Number(v))>250))throw Error('Manual offset invalid');
      const parts=m.slice(1).map(Number);
      b.accelModel=b.accelModel.split(':M:')[0]+(parts.some(Boolean)?':M:'+parts.join(':'):'');
     }else if(scope==='ESC'){
      if(!b.escConfirmationStaged)throw Error('ESC incomplete');
      b.escCalibrationSaved=true;b.escCalibrationPending=b.escConfirmationStaged=false;
     }else if(scope==='ALL'||/^M[1-4]$/.test(scope)){
      const selected=scope==='ALL'?[0,1,2,3]:[Number(scope.slice(1))-1],pulse=Number(a.a);
      if(!b.escCalibrationSaved||pulse<1000||pulse>1500||selected.some(i=>f.candidates[i]!==pulse&&b.observedMinimumUs[i]!==pulse))throw Error('Confirmed pulse required');
      b.observedMinimumUs=[...b.observedMinimumUs];for(const i of selected)b.observedMinimumUs[i]=pulse;
     }else if(scope.startsWith('RESET_')){
      if(a.a!=='CONFIRM_RESET')throw Error('Confirm reset');
      if(scope==='RESET_ACCEL'||scope==='RESET_ALL')b.accelModel=identityModel;
      if(scope==='RESET_ESC'||scope==='RESET_ALL')b.escCalibrationSaved=false;
      if(scope==='RESET_OUTPUT'||scope==='RESET_ALL')b.observedMinimumUs=[0,0,0,0];
      if(scope==='RESET_ALL')setWiring('X:0123:0101');
     }else throw Error('Unsupported scope');
     b.configRevision++;f.writes++;
     if(f.dropSaveAck){f.dropSaveAck=false;throw Error('Simulated lost Save acknowledgement');}
     break;
    }
    case 'WIZARD_SAVE':throw Error('The Wizard must save one page at a time');
   }
   return {...b,...extra,motorsDisabled:b.mode==='DISABLED'};
  }};
 };
 await page.evaluate(installFixture);
 const button=action=>wizard.locator(`[data-action="${action}"]`);
 const step=index=>wizard.locator(`[data-step="${index}"]`);
 const nav=value=>wizard.locator(`[data-nav="${value}"]`);
 const savedBadge=index=>wizard.locator(`[data-save-page="${index}"]`);
 const check=async(...ids)=>{for(const id of ids)await wizard.locator('#'+id).check();};
 const expectText=async(selector,value)=>page.waitForFunction(({selector,value})=>document.querySelector(selector)?.textContent.includes(value),{selector,value});
 const expectSaved=async(index,value=true)=>page.waitForFunction(({index,value})=>document.querySelector(`[data-save-page="${index}"]`)?.dataset.saved===String(value),{index,value});
 const fixture=fn=>page.evaluate(fn);
 await button('detect').click();await expectText('.a2-identity','page saves');
 await step(1).click();
 await wizard.locator('#a2Layout').selectOption('A2_QUAD_PLUS');
 await wizard.locator('[data-pin="0"]').selectOption('D2');
 assert.equal(await nav(1).isDisabled(),true);
 await wizard.locator('[data-pin="2"]').selectOption('D0');
 assert.equal(await wizard.locator('.a2-checks').count(),0,'global output checkbox bar is removed');
 for(const id of ['a2Props','a2Pins','a2Profile'])assert.equal(await wizard.locator('#'+id).count(),0);
 await fixture(()=>{__wizard.failSave=true;});await button('save-page').click();
 await expectText('.a2-message','Simulated NVS failure');await expectSaved(1,false);
 assert.equal(await fixture(()=>__wizard.board.layout),'A2_QUAD_X');
 await button('save-page').click();await expectSaved(1);
 assert.match(await savedBadge(1).textContent(),/✓ Saved on board/);
 assert.equal(await fixture(()=>__wizard.writes),1);
 await nav(1).click();assert.equal(await button('save-page').isVisible(),false);
 await nav(1).click();await expectText('.a2-gyro-status','2000 / 2000');
 assert.equal(await button('save-page').isDisabled(),true,'runtime gyro bias is not persisted as accelerometer calibration');
 await check('a2Still');await button('imu-level').click();
 await expectText('.a2-capture-status','Unsaved accelerometer settings');await expectSaved(3,false);
 await nav(1).click();assert.equal(await wizard.locator('[data-panel="4"]').isVisible(),true);
 await fixture(()=>{if(__wizard.board.accelModel!=='0:1:0:0:0:1000:1000:1000:42:0:0')throw Error('IMU page not saved');});
 assert.equal(await fixture(()=>__wizard.writes),2);
 await step(3).click();
 await page.waitForFunction(()=>document.querySelector('[data-imu-orient-status]')?.textContent.includes('FRESH'));
 assert.equal(await wizard.locator('[data-gyro-corrected="0"]').textContent(),'0.000');
 assert.equal(await wizard.locator('[data-accel-raw="0"]').textContent(),'0.120');
 assert.equal(await wizard.locator('[data-imu-cube]').count(),1,'three-dimensional IMU view exists');
 assert.equal(await wizard.locator('[data-imu-trace="0"]').count(),1,'X corrected accelerometer trace exists');
 await wizard.locator('#a2ManualX').fill('0.030');
 await wizard.locator('#a2ManualY').fill('-0.010');
 await wizard.locator('#a2ManualZ').fill('0.080');
 await expectText('[data-accel-corrected="0"]','0.090');
 await expectText('[data-accel-corrected="1"]','0.000');
 await expectText('[data-accel-corrected="2"]','1.000');
 await expectSaved(3,false);
 await wizard.locator('#a2ManualX').fill('0.251');
 assert.equal(await button('save-page').isDisabled(),true,'invalid manual offset must block saves');
 await wizard.locator('#a2ManualX').fill('0.030');
 await button('save-page').click();await expectSaved(3);
 assert.equal(await fixture(()=>__wizard.board.accelModel),'0:1:0:0:0:1000:1000:1000:42:0:0:M:30:-10:80');
 assert.equal(await fixture(()=>__wizard.writes),3);
 await step(4).click();
 await nav(1).click();assert.equal(await button('high').isDisabled(),true,'ESC calibration still requires procedure-specific safety checks');
 await check('a2EscProps','a2PowerOff','a2ReadProcedure');
 await button('high').click();await expectText('.a2-phase','HIGH · 2000 µs');
 assert.match(await fixture(()=>__wizard.mapping),/P:2103:0101/);
 await button('low').click();await expectText('.a2-phase','PWM off. Confirm');
 assert.equal(await button('save-page').isDisabled(),true);
 await check('a2Tones','a2EscDisconnected');await button('confirm-cal').click();
 await expectText('.a2-calibration-summary','Save this page');await expectSaved(5,false);
 await fixture(()=>{__wizard.dropSaveAck=true;__wizard.failStatus=true;});
 await button('save-page').click();await expectText('.a2-message','Simulated lost Save acknowledgement');
 await expectSaved(5,false);
 assert.equal(await fixture(()=>__wizard.board.escCalibrationSaved),true,'the board committed despite the lost response');
 await fixture(()=>{__wizard.failStatus=false;document.querySelector('[data-action="save-page"]').click();});await expectSaved(5);
 assert.equal(await fixture(()=>__wizard.writes),4,'retry reads the board before another write');
 await nav(1).click();await expectText('.a2-cal-target','Motor 1 of 4');
 assert.equal(await nav(1).isDisabled(),true);
 const pulse=wizard.locator('#a2CalPulse');
 assert.equal(await pulse.getAttribute('max'),'1500');assert.equal(await pulse.isDisabled(),true);
 const capture=async value=>{
  await button('cal-slider').click();await expectText('.a2-cal-output','ACK 1000');
  await pulse.fill(value);await expectText('.a2-cal-output','ACK '+value);
  await button('cal-slider').click();await expectText('.a2-cal-output','Pending save');
 };
 await capture('1087');await expectSaved(6,false);
 assert.match(safetyPrompts.join('|'),/Remove all propellers, verify motor\/ESC wiring and power/,'motor activation must require explicit confirmation');
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[0,0,0,0]);
 await fixture(()=>{__wizard.failSave=true;});await button('save-page').click();
 await expectText('.a2-message','Simulated NVS failure');await expectSaved(6,false);
 await button('save-page').click();await expectSaved(6);
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[1087,0,0,0]);
 await nav(1).click();await expectText('.a2-cal-target','Motor 2 of 4');
 await nav(-1).click();await expectSaved(6);assert.equal(await pulse.inputValue(),'1087');
 await button('cal-slider').click();await expectText('.a2-cal-output','ACK 1000');
 await button('resume-cal').click();await expectText('.a2-cal-output','ACK 1087');
 await fixture(()=>{__wizard.holdPulse='1125';});await pulse.fill('1125');await page.waitForFunction(()=>!!__wizard.release);
 await button('cal-slider').click();await expectText('.a2-cal-output','Repeat the attempt');await fixture(()=>__wizard.release());
 assert.equal(await pulse.inputValue(),'1087');assert.equal(await fixture(()=>__wizard.board.mode),'DISABLED');
 for(const [motor,value] of [[2,'1090'],[3,'1105'],[4,'1110']]){
  await nav(1).click();await expectText('.a2-cal-target',`Motor ${motor} of 4`);await capture(value);
 }
 await nav(1).click();assert.equal(await wizard.locator('[data-panel="7"] h3').textContent(),'Setup report');
 assert.equal(await button('save-page').isVisible(),false);assert.equal(await nav(1).isVisible(),false);
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[1087,1090,1105,1110]);
 assert.doesNotMatch(await wizard.locator('.a2-report').textContent(),/Pending|Motor test/i);
 await nav(-1).click();await expectText('.a2-cal-target','Motor 4 of 4');await expectSaved(6);
 assert.equal(await pulse.inputValue(),'1110');
 await wizard.locator('#a2CalAll').check();assert.equal(await pulse.inputValue(),'1000');
 await capture('1150');
 const previous=await fixture(()=>[...__wizard.board.observedMinimumUs]);
 await fixture(()=>{__wizard.failSave=true;});await button('save-page').click();
 await expectText('.a2-message','Simulated NVS failure');assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),previous);await expectSaved(6,false);
 await fixture(()=>{__wizard.dropSaveAck=true;});await nav(1).click();
 assert.equal(await wizard.locator('[data-panel="7"]').isVisible(),true);
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[1150,1150,1150,1150]);
 const persisted=await fixture(()=>({...__wizard.board}));
 await page.reload();await wizard.locator('[data-step="0"]').waitFor();await page.evaluate(installFixture,{savedBoard:persisted,boot:'nextboot'});
 await button('detect').click();
 for(const index of [1,3,5,6]){await step(index).click();await expectSaved(index);}
 assert.equal(await pulse.inputValue(),'1150');assert.equal(await fixture(()=>__wizard.calls.filter(c=>c.action==='WIZARD_BEGIN').length),0,'reload never restarts output');
 await wizard.locator('#a2CalAll').check();await expectSaved(6);
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>{
  const nav=document.querySelector('.a2-steps'),current=nav.querySelector('[aria-current="step"]');
  const viewport=nav.getBoundingClientRect(),button=current.getBoundingClientRect();return button.left>=viewport.left-1&&button.right<=viewport.right+1;
 });
 assert.equal(await button('save-page').isVisible(),true);assert.equal(await button('stop').isVisible(),true);
 mkdirSync('test-output',{recursive:true});await page.screenshot({path:'test-output/a2-page-save-mobile.png',fullPage:true});
 await step(7).click();await wizard.locator('[data-panel="7"] summary').click();
 await button('reset-selected').click();await expectText('.a2-report-state','Reset saved on board');
 assert.match(await fixture(()=>__wizard.board.accelModel),/^0:0:/);
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[1150,1150,1150,1150]);assert.equal(await fixture(()=>__wizard.board.escCalibrationSaved),true);
 await step(6).click();assert.equal(await wizard.locator('.a2-checks').count(),0);await step(7).click();
 await button('reset-all').click();await expectText('.a2-report-state','Reset saved on board');
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[0,0,0,0]);assert.equal(await fixture(()=>__wizard.board.escCalibrationSaved),false);
 assert.equal(await wizard.locator('.a2-checks').count(),0,'reset does not restore the removed checklist');
 assert.deepEqual(await fixture(()=>__wizard.calls.filter(c=>c.action==='WIZARD_SAVE')),[]);
 assert.deepEqual(errors,[]);
 console.log('PASS simulated A2 per-page Save · no global output tick bar, motor-start confirmation, ESC safety, persistence, reset and mobile layout');
}finally{await browser.close();}
