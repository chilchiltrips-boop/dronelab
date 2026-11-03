// Simulated A2 transport. PWM, tones and NVS behavior on a physical kit require bench verification.
import {chromium} from 'playwright';
import {browserOptions,configureContext} from './browser-harness.mjs';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';

const browser=await chromium.launch(browserOptions);
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',dialog=>dialog.accept());
 await configureContext(page.context());
 await page.goto('http://127.0.0.1:8765/#setup');
 const wizard=page.locator('#a2SetupRoot');
 await wizard.locator('[data-step="0"]').waitFor();
 assert.equal(await wizard.locator('[data-step]').count(),9);
 await page.evaluate(()=>{
  const kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',kitName:'A2 fixture',transport:'sta',bootId:'testboot',connectionGeneration:1,board:'A2',version:'1.7.8'};
  const identityModel='0:0:0:0:0:1000:1000:1000:0:0:0';
  const f=window.__wizard={
   kit,calls:[],writes:0,run:0,imuSequence:3,
   board:{wizardVersion:1,version:3,kitId:kit.kitId,bootId:kit.bootId,configRevision:0,supported:true,configValid:true,mode:'DISABLED',reason:'USER_STOP',layout:'A2_QUAD_X',layoutPins:['D0','D1','D2','D3'],rotations:['CW','CCW','CW','CCW'],observedMinimumUs:[0,0,0,0],escCalibrationSaved:false,escCalibrationPending:false,escConfirmationStaged:false,accelModel:identityModel,timedBenchSupported:true,sliderDurationMaxMs:30000,pulseUs:[0,0,0,0],remainingMs:0,selectedInput:'PPM',inputSource:'PPM',inputValid:true,inputAgeMs:0,channels:[1500,1500,1000,1500],outputSignal:{profile:'PWM_50HZ_1000_2000',hz:50,minUs:1000,maxUs:2000,timer:3,resolutionBits:14},
    imu:{state:'READY',imuValid:true,accelG:[0,0,1],accelRawG:[0,0,1],raw:[0,0,0],bias:[0,0,0],corrected:[0,0,0],samples:2000},
    capture:{sequence:3,state:'CAPTURED',ready:true,model:'0:1:0:0:0:1000:1000:1000:91:0:0'}}
  };
  const stop=(reason='USER_STOP')=>{Object.assign(f.board,{mode:'DISABLED',reason,pulseUs:[0,0,0,0]});};
  window.ZebjusKits={...window.ZebjusKits,getState:()=>({...kit}),requestBound:async(_,route,method,a,guard)=>{
   guard?.();
   if(route!=='/api/motor')throw Error('Unexpected fixture request');
   f.calls.push({...a});
   const b=f.board;
   let extra={};
   switch(a.action){
    case 'WIZARD_IMU':{
     const sequence=++f.imuSequence;
     extra={imuRequestSequence:sequence};
     setTimeout(()=>{b.capture={sequence,state:'CAPTURED',ready:true,samples:128,model:'0:1:0:0:0:1000:1000:1000:42:0:0'};},450);
     break;
    }
    case 'WIZARD_BEGIN':
     f.run++;f.mapping=a.c;Object.assign(b,{mode:'READY',reason:'NONE'});
     extra={session:'fixture-token'};break;
    case 'CAL_HIGH':
     Object.assign(b,{mode:'CAL_HIGH',pulseUs:[2000,2000,2000,2000],remainingMs:15000,escCalibrationSaved:false,escCalibrationPending:false,escConfirmationStaged:false});break;
    case 'CAL_LOW':{
     Object.assign(b,{mode:'CAL_LOW',pulseUs:[1000,1000,1000,1000],remainingMs:3000});
     const run=f.run;setTimeout(()=>{if(f.run===run){stop('CAL_FINISHED');b.escCalibrationPending=true;}},1000);break;
    }
    case 'WIZARD_ESC_CONFIRM':
     if(!b.escCalibrationPending)throw Error('ESC incomplete');
     b.escConfirmationStaged=true;break;
    case 'CAL_SLIDER':
    case 'SLIDER':
     f.cal=a.action==='CAL_SLIDER';
     Object.assign(b,{mode:'SLIDER_TEST',sliderMask:Number(a.a),remainingMs:30000,pulseUs:[0,1,2,3].map(i=>Number(a.a)&(1<<i)?1000:f.cal?0:1000)});break;
    case 'SLIDE':
     if(f.cal&&Number(a.b)>1500)throw Error('Calibration cap');
     if(f.holdPulse&&a.b===f.holdPulse){
      await new Promise(resolve=>{f.release=resolve;});guard?.();
     }
     if(b.mode==='SLIDER_TEST')b.pulseUs=[0,1,2,3].map(i=>b.sliderMask&(1<<i)?Number(a.b):f.cal?0:1000);
     break;
    case 'STOP':
     if(b.mode==='SLIDER_TEST'&&f.cal&&a.session)extra={stoppedSlider:true,stoppedMask:b.sliderMask,stoppedPulseUs:b.pulseUs.find(Boolean)};
     f.run++;if(!b.escConfirmationStaged)b.escCalibrationPending=false;stop();break;
    case 'WIZARD_SAVE':{
     if(b.mode!=='DISABLED'||Number(a.b)!==b.configRevision)throw Error('Save interlock');
     if(f.failSave){f.failSave=false;throw Error('Simulated NVS failure');}
     const [frame,pins,rotations,...mins]=a.a.split(':');
     const esc=a.c.split(':')[1].startsWith('1');
     const imu=a.c.split(':').slice(2).join(':');
     if(imu==='RESET')b.accelModel=identityModel;
     if(imu.startsWith('CAPTURED:'))b.accelModel=imu.slice(9);
     Object.assign(b,{layout:frame==='P'?'A2_QUAD_PLUS':'A2_QUAD_X',layoutPins:[...pins].map(n=>'D'+n),rotations:[...rotations].map(n=>n==='0'?'CW':'CCW'),observedMinimumUs:mins.map(Number),configRevision:b.configRevision+1,escCalibrationSaved:esc,escCalibrationPending:false,escConfirmationStaged:false});
     f.writes++;
     if(f.dropSaveAck){f.dropSaveAck=false;throw Error('Simulated lost Save acknowledgement');}
     break;
    }
   }
   return {...b,...extra,motorsDisabled:b.mode==='DISABLED'};
  }};
 });
 const button=action=>wizard.locator(`[data-action="${action}"]`);
 const step=index=>wizard.locator(`[data-step="${index}"]`);
 const nav=value=>wizard.locator(`[data-nav="${value}"]`);
 const check=async(...ids)=>{for(const id of ids)await wizard.locator('#'+id).check();};
 const expectText=async(selector,value)=>page.waitForFunction(({selector,value})=>document.querySelector(selector)?.textContent.includes(value),{selector,value});
 const fixture=fn=>page.evaluate(fn);
 await button('detect').click();
 await expectText('.a2-identity','Supported');
 await step(1).click();
 await wizard.locator('#a2Layout').selectOption('A2_QUAD_PLUS');
 await wizard.locator('[data-pin="0"]').selectOption('D2');
 assert.equal(await nav(1).isDisabled(),true,'duplicate pin mapping blocks Next');
 await wizard.locator('[data-pin="2"]').selectOption('D0');
 await check('a2Props','a2Pins','a2Profile');
 assert.equal(await fixture(()=>__wizard.board.layout),'A2_QUAD_X','wiring stays in the draft');
 await step(2).click();
 await expectText('[data-channel="2"] output','1000 µs');
 await step(3).click();
 await expectText('.a2-gyro-status','2000 / 2000');
 await check('a2Still');
 await button('imu-level').click();
 await expectText('.a2-capture-status','128 / 128');
 await expectText('.a2-capture-status','Draft correction pending Save');
 assert.equal(await fixture(()=>__wizard.writes),0);
 await step(4).click();
 await expectText('.a2-visual-title','timing illustration');
 await step(5).click();
 assert.equal(await button('high').isDisabled(),true);
 await check('a2EscProps','a2PowerOff','a2ReadProcedure');
 await button('high').click();
 await expectText('.a2-phase','HIGH · 2000 µs');
 assert.match(await fixture(()=>__wizard.mapping),/P:2103:0101/);
 await button('low').click();
 await expectText('.a2-phase','LOW · 1000 µs');
 await expectText('.a2-phase','PWM off. Confirm');
 assert.equal(await nav(1).isDisabled(),true);
 await check('a2Tones','a2EscDisconnected');
 await button('confirm-cal').click();
 await expectText('.a2-calibration-summary','pending final save');
 await nav(1).click();
 assert.equal(await wizard.locator('[data-panel="6"] [data-action=single]').count(),0);
 assert.equal(await wizard.locator('#a2CalAll').isChecked(),false);
 await expectText('.a2-cal-target','Motor 1 of 4');
 const pulse=wizard.locator('#a2CalPulse');
 assert.equal(await pulse.getAttribute('max'),'1500');
 assert.equal(await pulse.isDisabled(),true);
 await button('cal-slider').click();
 await expectText('.a2-cal-output','Live · ACK 1000');
 await pulse.fill('1087');
 await expectText('.a2-cal-output','ACK 1087');
 await button('cal-slider').click();
 await expectText('.a2-cal-output','Outputs off · Pending final save');
 assert.equal(await pulse.inputValue(),'1087');
 assert.equal(await fixture(()=>__wizard.writes),0);
 await nav(1).click();
 await expectText('.a2-cal-target','Motor 2 of 4');
 assert.equal(await pulse.inputValue(),'1000');
 await nav(-1).click();
 assert.equal(await pulse.inputValue(),'1087');
 assert.equal(await fixture(()=>__wizard.board.mode),'DISABLED');
 await button('cal-slider').click();
 await expectText('.a2-cal-output','ACK 1000');
 await button('resume-cal').click();
 await expectText('.a2-cal-output','ACK 1087');
 await fixture(()=>{__wizard.holdPulse='1125';});
 await pulse.fill('1125');
 await page.waitForFunction(()=>!!__wizard.release);
 await button('cal-slider').click();
 await expectText('.a2-cal-output','Repeat the attempt');
 await fixture(()=>__wizard.release());
 assert.equal(await pulse.inputValue(),'1087');
 assert.equal(await fixture(()=>__wizard.board.mode),'DISABLED');
 await wizard.locator('#a2CalAll').check();
 assert.equal(await pulse.inputValue(),'1000','mixed motor results do not resume as a group');
 await button('cal-slider').click();
 await expectText('.a2-cal-output','ACK 1000');
 await pulse.fill('1150');
 await expectText('.a2-cal-output','ACK 1150');
 await button('cal-slider').click();
 await expectText('.a2-cal-output','Pending final save');
 await nav(1).click();
 assert.equal(await button('single').isVisible(),false,'secondary tests are collapsed on Motor Test');
 await wizard.locator('[data-panel="7"] summary').click();
 assert.equal(await button('single').isVisible(),true);
 await nav(1).click();
 assert.equal(await nav(1).textContent(),'Save');
 await fixture(()=>{__wizard.failSave=true;});
 await nav(1).click();
 await expectText('.a2-report-state','Draft retained');
 assert.equal(await fixture(()=>__wizard.writes),0);
 await fixture(()=>{__wizard.dropSaveAck=true;});
 await nav(1).click();
 await expectText('.a2-report-state','Saved on board');
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[1150,1150,1150,1150]);
 assert.match(await fixture(()=>__wizard.board.accelModel),/:42:0:0$/,'the older capture response cannot replace the requested result');
 assert.equal(await fixture(()=>__wizard.writes),1,'lost ACK is resolved by readback without another write');
 await nav(-1).click();
 await nav(-1).click();
 assert.equal(await wizard.locator('#a2CalAll').isChecked(),true);
 assert.equal(await pulse.inputValue(),'1150');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await button('stop').isVisible(),true);
 const layout=await wizard.locator('.a2-columns').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
 assert.equal(layout,1);
 mkdirSync('test-output',{recursive:true});
 await page.screenshot({path:'test-output/a2-output-calibration-mobile.png',fullPage:true});
 await step(8).click();
 await wizard.locator('[data-panel="8"] summary').click();
 await button('reset-all').click();
 await expectText('.a2-report-state','Reset pending');
 assert.equal(await fixture(()=>__wizard.board.escCalibrationSaved),true);
 await nav(1).click();
 await expectText('.a2-report-state','Saved on board');
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[0,0,0,0]);
 assert.equal(await fixture(()=>__wizard.board.escCalibrationSaved),false);
 assert.match(await fixture(()=>__wizard.board.accelModel),/^0:0:/);
 assert.deepEqual(errors,[]);
 console.log('PASS simulated A2 Wizard · 9 steps, ESC phases, individual/group draft, safe resume, delayed ACK, Save readback, reset and mobile layout');
}finally{await browser.close();}
