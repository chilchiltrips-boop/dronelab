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
  ['Board','Wiring','Inputs','ACC / Gyro Calibration','Output Signal','ESC Calibration','Output Calibration','Report']);
 const installFixture=({savedBoard={},boot='testboot'}={})=>{
  const kit={connected:true,kitId:'ZFC-A2-012345ABCDEF',kitName:'A2 fixture',transport:'sta',bootId:boot,connectionGeneration:1,board:'ZFC-A2',version:'1.7.21',controlAuthorized:true,
   rcAccess:{version:1,pathVersion:1,controlPath:'PPM',selection:'PPM',paused:false},
   rc:{inputArmed:false,throttle:1000},hostname:'a2-fixture.local',
   flightModeState:{supported:true,stabilizationSupported:true,saved:'angle',active:'angle',pending:null}};
  const identityModel='0:0:0:0:0:1000:1000:1000:0:0:0';
  const f=window.__wizard={kit,calls:[],inputSaves:[],readinessReads:0,writes:0,run:0,imuSequence:3,candidates:{},
   board:{autoEsc:{version:1,state:'NONE',phase:'OFF',attemptId:'00000000',reason:'NONE',compatible:true,outputsOff:true,resultPersisted:false,sequenceReady:false,toneDetectionSupported:false,escAcceptanceVerified:false},wizardVersion:1,pageSaveVersion:1,accelManualVersion:1,calibrationSlideKeepsSession:true,version:3,kitId:kit.kitId,configRevision:0,supported:true,configValid:true,configVerified:true,layout:'A2_QUAD_X',layoutPins:['D0','D1','D2','D3'],rotations:['CW','CCW','CW','CCW'],observedMinimumUs:[0,0,0,0],escCalibrationSaved:false,escCalibrationPending:false,escConfirmationStaged:false,accelModel:identityModel,timedBenchSupported:true,sliderDurationMaxMs:30000,remainingMs:0,selectedInput:'PPM',inputSource:'PPM',inputValid:true,inputAgeMs:0,channels:[1500,1500,1000,1500],outputSignal:{profile:'PWM_50HZ_1000_2000',hz:50,minUs:1000,maxUs:2000,timer:3,resolutionBits:14},
    inputArmed:false,ppm:{pin:18,present:true,ageMs:2,seq:12,map:[2,1,4,3,5],channels:[1510,1530,1000,1350],captureHz:50},
    imu:{state:'READY',imuValid:true,accelG:[0.120,-0.010,1.080],accelRawG:[0.120,-0.010,1.080],raw:[0,0,0],bias:[0,0,0],corrected:[0,0,0],samples:2000,sampleSequence:50},
    ...savedBoard,bootId:boot,mode:'DISABLED',reason:'USER_STOP',pulseUs:[0,0,0,0],capture:{sequence:3,state:'IDLE',ready:false,mask:0}}
  };
  const stop=(reason='USER_STOP')=>Object.assign(f.board,{mode:'DISABLED',reason,pulseUs:[0,0,0,0]});
  const setWiring=encoded=>{
   const [frame,pins,rotations]=encoded.split(':');
   Object.assign(f.board,{layout:frame==='P'?'A2_QUAD_PLUS':'A2_QUAD_X',layoutPins:[...pins].map(n=>'D'+n),rotations:[...rotations].map(n=>n==='0'?'CW':'CCW')});
  };
  f.readinessResponse=()=>{
   const enabled=f.experimental===true,blocker=f.readinessBlocker||'NONE';
   return {schema:1,mode:'ACRO_READINESS',board:kit.board,kitId:kit.kitId,bootId:f.wrongBoot?'other-boot':kit.bootId,
    firmwareVersion:kit.version,flightOutputEnabled:enabled,setupComplete:true,pidSaved:true,
    flight:{version:1,enabled,authorized:false,canArm:enabled&&blocker==='NONE',state:'DISARMED',
     blockReason:enabled?blocker:'UNQUALIFIED',lastArmReason:'NONE'},
    setupRevision:f.board.configRevision,blockReason:enabled?blocker:'UNQUALIFIED',softwareBlockReason:blocker,
    ppmFresh:true,inputArmed:false,inputSource:'PPM',inputAgeMs:2,throttleUs:blocker==='THROTTLE_HIGH'?1350:1000,
    gyroFresh:true,timingHealthy:true,controlHz:249.8,outputsOffAck:true,benchActive:false,escCalibrationActive:false};
  };
  window.ZebjusKits={...window.ZebjusKits,getState:()=>({...kit}),selectControlPath:async(path,options)=>{
   f.inputSaves.push({path,options});
   if(f.rejectInputSave)throw Error('Simulated input save rejection');
   const source=path==='PPM'?'PPM':path==='WEB_STA'?'WEB':'ANDROID';
   kit.rcAccess={...kit.rcAccess,controlPath:path,selection:source};
   Object.assign(f.board,{selectedInput:path,inputSource:path==='PPM'?'PPM':'NONE',inputValid:path==='PPM'});
   return kit.rcAccess;
  },requestBound:async(_,route,method,a,guard)=>{
   guard?.();
   if(route==='/api/flight/readiness'&&method==='GET'){
    f.readinessReads++;
    const value=f.readinessResponse();
    if(f.holdReadiness)await new Promise(resolve=>{f.releaseReadiness=resolve;});
    return value;
   }
   if(route!=='/api/motor')throw Error('Unexpected fixture request');
   f.calls.push({...a});const b=f.board;let extra={};
   if(a.action==='WIZARD_STATUS'&&f.failStatus)throw Error('Simulated unavailable readback');
   switch(a.action){
    case 'WIZARD_IMU':{
     const sequence=++f.imuSequence;extra={imuRequestSequence:sequence};
     if(a.a==='GYRO'){
      Object.assign(b.imu,{state:'CALIBRATING',manualGyro:true,imuValid:false,samples:512});
      setTimeout(()=>Object.assign(b.imu,{state:'READY',manualGyro:false,imuValid:true,samples:2000,sampleSequence:b.imu.sampleSequence+1}),550);
     }else if(a.a==='CLEAR_ACCEL'){
      setTimeout(()=>{b.capture={sequence,state:'IDLE',ready:false,mask:0};},240);
     }else if(a.a==='FACE'){
      const mask=b.capture.mask,face=Number(a.b),failure=f.faceFailure;
      f.faceFailure='';
      const finish=()=>{
       const accepted=mask|(1<<face),complete=accepted===63;
       b.capture=failure?{sequence,state:failure,ready:false,mask,samples:0}:
        {sequence,state:complete?'CAPTURED':'FACE_CAPTURED',ready:complete,mask:accepted,samples:128,
         model:complete?'1:0:0:0:0:1000:1000:1000:0:0:0':undefined};
      };
      if(f.delayFace)f.finishFace=finish;
      else setTimeout(finish,380);
     }else if(a.a==='LEVEL'){
      b.capture={sequence,state:'CAPTURING',running:true,ready:false,mask:0,samples:16};
      const model=b.accelModel.split(':');
      model[1]='1';model[8]='42';
      setTimeout(()=>{b.capture={sequence,state:'CAPTURED',ready:true,mask:0,samples:128,model:model.join(':')};},550);
     }
     break;
    }
    case 'WIZARD_BEGIN':
     f.run++;f.mapping=a.c;Object.assign(b,{mode:'READY',reason:'NONE'});extra={session:'fixture-token'};
     if(f.holdBegin)await new Promise(resolve=>{f.releaseBegin=resolve;});break;
    case 'WIZARD_AUTO_ESC_PREPARE':{
     if(a.a!=='PROPS_REMOVED:WIRING_VERIFIED:POWER_CYCLE_UNDERSTOOD'||a.c!==kit.bootId||Number(a.b)!==b.configRevision)throw Error('Prepare interlock');
     if(b.escCalibrationSaved||b.observedMinimumUs.some(Boolean))b.configRevision++;
     Object.assign(b,{escCalibrationSaved:false,escConfirmationStaged:false,observedMinimumUs:[0,0,0,0]});
     b.autoEsc={version:1,state:'AWAITING_POWER_CYCLE',phase:'OFF',attemptId:'00000ABC',reason:'NONE',compatible:true,outputsOff:true,resultPersisted:false,sequenceReady:false,toneDetectionSupported:false,escAcceptanceVerified:false};
     if(f.dropPrepareAck){f.dropPrepareAck=false;throw Error('Simulated lost preparation acknowledgement');}
     break;
    }
    case 'WIZARD_AUTO_ESC_CANCEL':
     if(f.failCancel){f.failCancel=false;b.autoEsc={...b.autoEsc,cancelUnverified:true,resultRetryAllowed:false,reason:'STORAGE_ERROR'};throw Error('Simulated cancellation save failure');}
     b.autoEsc={...b.autoEsc,state:'CANCELLED',phase:'OFF',outputsOff:true,resultPersisted:false,sequenceReady:false,cancelUnverified:false,reason:'NONE'};b.escConfirmationStaged=false;stop();break;
    case 'WIZARD_ESC_CONFIRM':
     if(a.a!=='AUTO_TONES_CONFIRMED'||a.b!==b.autoEsc.attemptId+':BATTERY_DISCONNECTED'||b.autoEsc.state!=='SEQUENCE_COMPLETE'||!b.autoEsc.resultPersisted)throw Error('ESC incomplete');
     b.escConfirmationStaged=true;break;
    case 'CAL_SLIDER':
     if(!b.escCalibrationSaved&&!b.autoEsc.sequenceReady)throw Error('Stored ESC controller sequence required');
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
     f.run++;if(!b.escConfirmationStaged)b.escCalibrationPending=false;if(!b.escCalibrationSaved&&['RUNNING','AWAITING_POWER_CYCLE'].includes(b.autoEsc.state))b.autoEsc={...b.autoEsc,state:'CANCELLED',phase:'OFF',resultPersisted:false,sequenceReady:false,outputsOff:true};stop();break;
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
      if((!b.escCalibrationSaved&&!b.autoEsc.sequenceReady)||pulse<1000||pulse>1500||selected.some(i=>f.candidates[i]!==pulse&&b.observedMinimumUs[i]!==pulse))throw Error('Stored ESC controller sequence and captured pulse required');
      b.observedMinimumUs=[...b.observedMinimumUs];for(const i of selected)b.observedMinimumUs[i]=pulse;
     }else if(scope.startsWith('RESET_')){
      if(a.a!=='CONFIRM_RESET')throw Error('Confirm reset');
      if(scope==='RESET_ACCEL'||scope==='RESET_ALL')b.accelModel=identityModel;
      if(scope==='RESET_ESC'||scope==='RESET_ALL'){b.escCalibrationSaved=false;b.autoEsc={...b.autoEsc,state:'CANCELLED',resultPersisted:false,sequenceReady:false};}
      if(['RESET_OUTPUT','RESET_ALL','RESET_ESC'].includes(scope))b.observedMinimumUs=[0,0,0,0];
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
  f.powerCycle=()=>{
   if(f.board.autoEsc.state!=='AWAITING_POWER_CYCLE')throw Error('No prepared request');
   kit.bootId+='-power';kit.connectionGeneration++;const b=f.board;b.bootId=kit.bootId;
   const publish=()=>window.dispatchEvent(new CustomEvent('zebjus:motor-state',{detail:{...b,receivedAt:Date.now(),motorsDisabled:b.mode==='DISABLED'}}));
   b.mode='AUTO_CAL_HIGH';b.pulseUs=[2000,2000,2000,2000];b.autoEsc={...b.autoEsc,state:'RUNNING',phase:'HIGH',outputsOff:false};publish();
   setTimeout(()=>{b.mode='AUTO_CAL_LOW';b.pulseUs=[1000,1000,1000,1000];b.autoEsc.phase='LOW';publish();},2000);
   setTimeout(()=>{stop('CAL_FINISHED');b.autoEsc={...b.autoEsc,state:'SEQUENCE_COMPLETE',phase:'OFF',outputsOff:true,resultPersisted:true,sequenceReady:true,confirmationSource:'CONTROLLER_SEQUENCE_ONLY'};publish();},4000);
  };

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
 assert.equal(await wizard.getByRole('heading',{name:'Input Signal Configuration'}).isVisible(),true);
 const inputCard=path=>wizard.locator(`[data-input-card="${path}"]`);
 const inputSave=button('select-input');
 assert.equal(await inputCard('PPM').getAttribute('aria-pressed'),'true');
 assert.equal(await inputCard('PPM').getAttribute('data-saved'),'true');
 assert.equal(await wizard.getByRole('button',{name:/^PWM .*Unsupported on A2/}).isDisabled(),true);
 assert.equal(await wizard.getByRole('button',{name:/^S\.Bus .*Unsupported on A2/}).isDisabled(),true);
 await expectText('.a2-input-source-values','GPIO18');
 assert.match(await wizard.locator('[data-channel="4"] b').textContent(),/^Auxiliary$/);
 await expectText('.a2-ppm-mapping','Roll 2 · Pitch 1 · Throttle 4 · Yaw 3');
 await expectText('.a2-ppm-throttle','1350 µs · lower');
 await expectText('[data-channel="0"] output','1530 µs');
 await expectText('[data-channel="2"] output','1350 µs');
 await fixture(()=>{__wizard.board.ppm.map=null;});
 await expectText('.a2-ppm-throttle','Throttle unverified');
 await expectText('[data-channel="2"] output','—');
 await fixture(()=>{__wizard.board.ppm.map=[2,1,4,3,5];__wizard.board.ppm.channels[3]=1000;});
 await expectText('.a2-ppm-throttle','1000 µs · LOW');
 await inputCard('ANDROID_AP').click();
 await expectText('#a2InputSettingsTitle','Android AP settings');
 await expectText('.a2-input-source-values','Kit hotspot');
 await expectText('.a2-input-save-status','Unavailable in STA mode');
 assert.equal(await inputSave.isDisabled(),true);
 assert.equal(await wizard.locator('.a2-input-monitor').isVisible(),false,'preview must not relabel the saved source’s channel bars');
 assert.equal(await button('input-settings-link').textContent(),'Open Wi-Fi & Network');
 await inputCard('ANDROID_WEBRTC').click();
 await expectText('.a2-input-source-values','Virtual simulator');
 assert.equal(await button('input-settings-link').textContent(),'Open Mobile Controller');
 assert.deepEqual(await fixture(()=>__wizard.inputSaves),[],'preview cards never write FC settings');
 await inputCard('WEB_STA').click();
 await expectText('.a2-input-source-values','a2-fixture.local');
 await fixture(()=>{__wizard.rejectInputSave=true;});
 await inputSave.click();await expectText('.a2-input-save-status','Simulated input save rejection');
 assert.equal(await inputCard('PPM').getAttribute('data-saved'),'true');
 assert.equal(await inputCard('WEB_STA').getAttribute('data-saved'),'false');
 await fixture(()=>{__wizard.rejectInputSave=false;});
 await inputSave.click();await expectText('.a2-input-save-status','Input source saved on FC');
 assert.equal(await inputCard('WEB_STA').getAttribute('data-saved'),'true');
 assert.deepEqual(await fixture(()=>__wizard.inputSaves.at(-1)),{path:'WEB_STA',options:{claimJoystick:false}});
 await inputCard('ANDROID_WEBRTC').click();
 await fixture(()=>{__wizard.kit.connectionGeneration++;});
 await expectText('#a2InputSettingsTitle','WebApp Joystick settings');
 assert.equal(await inputCard('WEB_STA').getAttribute('aria-pressed'),'true','reconnect loads the verified saved source');
 await inputCard('PPM').click();await inputSave.click();
 await expectText('.a2-ppm-throttle','1000 µs · LOW');
 assert.equal(await inputCard('PPM').getAttribute('data-saved'),'true');
 await page.setViewportSize({width:390,height:844});
 const inputBounds=await wizard.locator('[data-panel="2"] .a2-input-card-grid').first().boundingBox();
 assert.ok(inputBounds.x>=0&&inputBounds.x+inputBounds.width<=390,'receiver cards fit the mobile Wizard');
 await page.setViewportSize({width:1366,height:900});
 await fixture(()=>{__wizard.kit.flightModeState.stabilizationSupported=false;});
 await expectText('.a2-flight-mode-status','Angle stabilization unavailable on this firmware');
 assert.equal(await wizard.locator('#a2FlightMode option[value="angle"]').textContent(),'Angle · setup setting');
 await fixture(()=>{__wizard.kit.flightModeState.stabilizationSupported=true;});
 await wizard.locator('[data-panel="2"] [data-action="open-imu"]').click();
 await expectText('.a2-gyro-status','Gyro ready for this boot');
 await expectText('[data-save-page="3"]','Quick Level required for Angle');
 assert.equal(await wizard.locator('#a2AdvancedAccel').getAttribute('open'),null);
 assert.equal(await wizard.locator('[data-panel="3"] [data-action="save-page"]').isVisible(),true,'ACC Save is beside Quick Level');
 assert.equal(await button('save-page').isDisabled(),true,'runtime gyro bias is not persisted as accelerometer calibration');
 assert.equal(await button('imu-gyro').isDisabled(),true,'stationary confirmation is required');
 await fixture(()=>{__wizard.kit.controlAuthorized=false;});
 await check('a2Still');await expectText('.a2-imu-access','Authorize this A2 connection');
 assert.equal(await button('imu-gyro').isDisabled(),true);
 assert.equal(await button('imu-level').isDisabled(),true);
 await fixture(()=>{__wizard.kit.controlAuthorized=true;__wizard.board.ppm.channels[3]=1350;});
 await expectText('.a2-imu-access','Disarm the input and lower throttle');
 assert.equal(await button('imu-level').isDisabled(),true);
 await fixture(()=>{__wizard.board.ppm.channels[3]=1000;});
 await button('imu-gyro').click();
 await expectText('.a2-gyro-status','Gyro calibrating');
 assert.equal(await nav(1).isDisabled(),true,'Next waits for manual gyro calibration');
 await expectText('.a2-gyro-status','Gyro ready for this boot');
 assert.equal(await fixture(()=>__wizard.writes),1,'gyro bias is recalculated without a persistent write');
 const guideStatus='.a2-imu-guide-status',poseTitle='[data-pose-title]';
 await page.setViewportSize({width:390,height:844});
 await button('imu-start').click();await expectText(poseTitle,'Pose 1 of 6');
 assert.equal(await fixture(()=>__wizard.calls.filter(c=>c.action==='WIZARD_IMU'&&c.a==='CLEAR_ACCEL').length),0,
  'starting from an empty FC buffer does not require ownership of an earlier calibration session');
 assert.equal(await button('imu-level').isDisabled(),true,'level trim waits for the guided fit');
 await fixture(()=>{__wizard.faceFailure='WRONG_ORIENTATION';});
 await button('imu-face').click();await expectText(guideStatus,'Point the requested sensor axis up');
 assert.match(await wizard.locator(poseTitle).textContent(),/Pose 1 of 6/);
 assert.equal(await wizard.locator('[data-pose-state="captured"]').count(),0);
 await fixture(()=>{__wizard.delayFace=true;});
 await button('imu-face').click();await expectText(guideStatus,'Collecting samples');
 assert.match(await wizard.locator(poseTitle).textContent(),/Pose 1 of 6/);
 assert.equal(await button('imu-face').isDisabled(),true,'an older FC observation cannot complete a new pose');
 await fixture(()=>{__wizard.delayFace=false;__wizard.finishFace();});
 await expectText(poseTitle,'Pose 2 of 6');
 await button('imu-clear').click();await expectText(guideStatus,'Start when the gyro is ready');
 assert.equal(await wizard.locator('[data-pose-state="captured"]').count(),0);
 assert.equal(await fixture(()=>__wizard.writes),1,'cancelling captures preserves flash settings');
 await button('imu-start').click();await expectText(poseTitle,'Pose 1 of 6');
 const callAt=await fixture(()=>__wizard.calls.length);
 const poseOrder=[4,2,3,1,0,5];
 for(let i=0;i<poseOrder.length;i++){
  await expectText(poseTitle,'Pose '+(i+1)+' of 6');
  assert.equal(await wizard.locator('[aria-current="step"][data-pose-face]').getAttribute('data-pose-face'),String(poseOrder[i]));
  await button('imu-face').click();
 }
 await expectText(guideStatus,'6 / 6 captured');
 assert.equal(await wizard.locator('[data-pose-state="captured"]').count(),6);
 assert.deepEqual(await page.evaluate(at=>__wizard.calls.slice(at).filter(c=>c.action==='WIZARD_IMU'&&c.a==='FACE').map(c=>Number(c.b)),callAt),poseOrder);
 assert.equal(await fixture(()=>__wizard.writes),1,'collecting poses does not persist the fit');
 assert.equal(await nav(1).isDisabled(),true,'the fit must be saved separately from Level Horizon');
 assert.equal(await button('save-page').textContent(),'Save six-position fit');
 assert.equal(await wizard.locator('.a2-imu-guide [data-action="save-page"]').isVisible(),true);
 await button('save-page').click();await expectText(guideStatus,'Six-position fit saved on FC');
 await expectText('[data-save-page="3"]','Quick Level required for Angle');
 assert.match(await fixture(()=>__wizard.board.accelModel),/^1:0:/);
 assert.equal(await fixture(()=>__wizard.writes),2);
 await page.setViewportSize({width:1366,height:900});
 await check('a2LevelStill');await button('imu-level').click();
 await expectText('.a2-capture-status','Collecting level samples');
 assert.equal(await nav(1).isDisabled(),true,'Next waits for a fresh capture result');
 await expectText('.a2-capture-status','Unsaved accelerometer settings');await expectSaved(3,false);
 assert.equal(await button('save-page').textContent(),'Save ACC calibration');
 await nav(1).click();assert.equal(await wizard.locator('[data-panel="4"]').isVisible(),true);
 await fixture(()=>{if(__wizard.board.accelModel!=='1:1:0:0:0:1000:1000:1000:42:0:0')throw Error('Level save did not preserve the six-position fit');});
 assert.equal(await fixture(()=>__wizard.writes),3);
 await step(3).click();
 await page.waitForFunction(()=>document.querySelector('[data-imu-orient-status]')?.textContent.includes('FRESH'));
 await expectText('[data-save-page="3"]','Quick Level saved on FC');
 await wizard.locator('#a2AdvancedAccel summary').click();
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
 assert.equal(await fixture(()=>__wizard.board.accelModel),'1:1:0:0:0:1000:1000:1000:42:0:0:M:30:-10:80');
 assert.equal(await fixture(()=>__wizard.writes),4);
 await button('imu-zero-manual').click();await expectSaved(3,false);
 assert.equal(await wizard.locator('#a2ManualX').inputValue(),'0.000');
 await button('imu-restore-manual').click();await expectSaved(3);
 assert.equal(await wizard.locator('#a2ManualX').inputValue(),'0.030');
 assert.equal(await wizard.locator('#a2ManualY').inputValue(),'-0.010');
 assert.equal(await wizard.locator('#a2ManualZ').inputValue(),'0.080');
 assert.equal(await fixture(()=>__wizard.writes),4,'Restore Saved never writes hardware');
 await step(4).click();
 await nav(1).click();assert.equal(await wizard.locator('[data-panel="5"] h3').textContent(),'Automatic ESC Calibration');
 for(const id of ['a2EscProps','a2PowerOff','a2ReadProcedure','a2Tones','a2EscDisconnected'])
  assert.equal(await wizard.locator('#'+id).count(),0,'ESC page does not require checkbox '+id);
 assert.equal(await button('confirm-cal').count(),0,'no ESC-tone confirmation action');
 await fixture(()=>{delete __wizard.board.autoEsc.sequenceReady;__wizard.kit.version='1.7.11';});
 await button('auto-read').click();await expectText('.a2-phase','FlightCore 1.7.12+');
 assert.equal(await button('auto-prepare').isDisabled(),true,'old automatic API needs a firmware upgrade before a no-tone attempt');
 await fixture(()=>{__wizard.board.autoEsc.sequenceReady=false;__wizard.kit.version='1.7.13';});
 await button('auto-read').click();
 assert.equal(await button('auto-prepare').isDisabled(),false,'one guarded Prepare action is available');
 await step(6).click();assert.equal(await button('cal-slider').isDisabled(),true,'motor test blocked until stored ESC controller result');
 assert.equal(await button('skip-output').isVisible(),false,'Output cannot be skipped to Report before ESC sequence');
 await step(5).click();
 assert.equal(await button('high').count(),0);assert.equal(await button('low').count(),0);
 const prepareCount=await fixture(()=>__wizard.calls.filter(c=>c.action==='WIZARD_AUTO_ESC_PREPARE').length);
 await button('auto-prepare').click();await page.locator('[data-inline-cancel]').click();
 await page.waitForFunction(()=>!document.querySelector('[data-action="auto-prepare"]').disabled);
 assert.equal(await fixture(()=>__wizard.calls.filter(c=>c.action==='WIZARD_AUTO_ESC_PREPARE').length),prepareCount,'Cancel never stores a prepared attempt');
 await button('auto-prepare').click();await page.locator('[data-inline-accept]').waitFor();
 await button('stop').click();await page.locator('[data-inline-accept]').waitFor({state:'detached'});
 assert.equal(await fixture(()=>__wizard.calls.filter(c=>c.action==='WIZARD_AUTO_ESC_PREPARE').length),prepareCount,'header STOP cancels pending confirmation');
 await fixture(()=>{__wizard.dropPrepareAck=true;});
 await button('auto-prepare').click();
 await page.locator('[data-inline-accept]').click();await expectText('.a2-phase','Request stored');
 assert.equal(await fixture(()=>__wizard.board.mode),'DISABLED','Prepare never emits PWM');
 assert.equal(await button('save-page').isVisible(),false,'ESC page has no manual Save requirement');
 assert.equal(await nav(1).isDisabled(),true,'cannot continue before cold-start result');
 const pendingStops=await fixture(()=>__wizard.calls.filter(c=>c.action==='STOP').length);
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 await button('auto-read').click();
 assert.equal(await fixture(()=>__wizard.board.autoEsc.state),'AWAITING_POWER_CYCLE','leaving the page keeps the saved request');
 assert.equal(await fixture(()=>__wizard.calls.filter(c=>c.action==='STOP').length),pendingStops);
 await fixture(()=>{__wizard.failCancel=true;});await button('auto-cancel').click();
 await expectText('.a2-phase','Do not power cycle');
 assert.equal(await button('auto-prepare').isDisabled(),true);
 assert.equal(await button('auto-retry').isVisible(),false,'cancel failure cannot certify a result');
 assert.match(await button('auto-cancel').textContent(),/Retry cancelling/);
 await button('auto-cancel').click();await expectText('.a2-phase','cancelled');
 await button('auto-prepare').click();await page.locator('[data-inline-accept]').click();
 await fixture(()=>__wizard.powerCycle());await expectText('.a2-phase','HIGH · 2000 µs');
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 await expectText('.a2-phase','LOW · 1000 µs');
 await expectText('.a2-phase','Controller sequence stored');
 await expectSaved(5);
 assert.equal(await fixture(()=>__wizard.board.autoEsc.sequenceReady),true);
 assert.equal(await fixture(()=>__wizard.board.escCalibrationSaved),false,'do not fabricate ESC endpoint confirmation');
 assert.deepEqual(await fixture(()=>__wizard.calls.filter(c=>c.action==='WIZARD_ESC_CONFIRM')),[],
  'no tone-confirmation command is needed or sent for the automatic controller sequence');
 assert.match(await wizard.locator('.a2-auto-result').textContent(),/Acceptance not measured/);
 assert.equal(await button('confirm-cal').count(),0);
 assert.equal(await button('save-page').isVisible(),false);
 assert.equal(await fixture(()=>__wizard.writes),4,'automatic controller result requires no app-side ESC Save');
 assert.equal(await nav(1).isDisabled(),false,'stored controller result allows next stage');
 mkdirSync('test-output',{recursive:true});await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:'test-output/a2-auto-esc-desktop.png',fullPage:true});
 await button('stop').click();await expectSaved(5);
 assert.equal(await fixture(()=>__wizard.board.autoEsc.sequenceReady),true,'normal STOP preserves the verified stored result');
 for(const transport of ['ap','sta']){
  await page.evaluate(transport=>{__wizard.kit.transport=transport;__wizard.kit.connectionGeneration++;},transport);
  await button('auto-read').click();await expectSaved(5);
  assert.equal(await fixture(()=>__wizard.board.mode),'DISABLED','reconnecting never starts output');
 }
 await nav(1).click();await expectText('.a2-cal-target','Motor 1 of 4');
 assert.equal(await wizard.locator('[data-panel="6"]').isVisible(),true);
 const safety=wizard.locator('#a2OutputSafety'),startPromptCount=safetyPrompts.length;
 assert.equal(await safety.isVisible(),true);assert.equal(await safety.isChecked(),false);
 assert.equal(await button('cal-slider').isDisabled(),true,'Start requires the on-page safety confirmation');
 const beginsBeforeSafety=await fixture(()=>__wizard.calls.filter(c=>c.action==='WIZARD_BEGIN').length);
 await safety.check();
 await page.waitForFunction(()=>!document.querySelector('[data-action="cal-slider"]').disabled);
 assert.equal(await fixture(()=>__wizard.calls.filter(c=>c.action==='WIZARD_BEGIN').length),beginsBeforeSafety,'checking safety never starts a session');
 assert.equal(await fixture(()=>__wizard.board.mode),'DISABLED');
 await fixture(()=>{delete __wizard.board.calibrationSlideKeepsSession;});
 await page.waitForFunction(()=>document.querySelector('.a2-output-prerequisite')?.textContent.includes('FlightCore 1.7.13+'));
 assert.equal(await button('cal-slider').isDisabled(),true,'old firmware cannot start the new calibration flow');
 await fixture(()=>{__wizard.board.calibrationSlideKeepsSession=true;});
 await page.waitForFunction(()=>!document.querySelector('[data-action="cal-slider"]').disabled);
 assert.equal(await button('skip-output').isVisible(),true,'optional minimum output measurement may be skipped after stored sequence');
 assert.equal(await nav(1).isDisabled(),true);
 const pulse=wizard.locator('#a2CalPulse');
 assert.equal(await pulse.getAttribute('max'),'1500');assert.equal(await pulse.isDisabled(),true);
 const sliderStarts=await fixture(()=>__wizard.calls.filter(c=>c.action==='CAL_SLIDER').length);
 await fixture(()=>{__wizard.holdBegin=true;});await button('cal-slider').click();
 await page.waitForFunction(()=>typeof __wizard.releaseBegin==='function');
 await page.evaluate(()=>document.getElementById('tab-setup').classList.remove('active'));
 await page.waitForFunction(()=>!document.getElementById('a2OutputSafety').checked);
 await page.evaluate(()=>document.getElementById('tab-setup').classList.add('active'));
 await fixture(()=>{__wizard.holdBegin=false;__wizard.releaseBegin();});
 await expectText('.a2-message','Confirm the on-page safety check');
 await page.waitForFunction(()=>__wizard.board.mode==='DISABLED');
 assert.equal(await fixture(()=>__wizard.calls.filter(c=>c.action==='CAL_SLIDER').length),sliderStarts,'leaving the page during a delayed start revokes output permission');
 assert.equal(await button('cal-slider').isDisabled(),true);
 await safety.check();await page.waitForFunction(()=>!document.querySelector('[data-action="cal-slider"]').disabled);
 const capture=async value=>{
  await button('cal-slider').click();await expectText('.a2-cal-output','ACK 1000');
  await pulse.fill(value);await expectText('.a2-cal-output','ACK '+value);
  await button('cal-slider').click();await expectText('.a2-cal-output','Pending save');
 };
 await capture('1087');await expectSaved(6,false);
 assert.equal(safetyPrompts.length,startPromptCount,'Output Calibration never opens a native browser confirmation');
 assert.equal(await safety.isChecked(),true,'Stop keeps this visit’s safety confirmation');
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[0,0,0,0]);
 await fixture(()=>{__wizard.failSave=true;});await button('save-page').click();
 await expectText('.a2-message','Simulated NVS failure');await expectSaved(6,false);
 await button('save-page').click();await expectSaved(6);
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[1087,0,0,0]);
 await page.screenshot({path:'test-output/a2-output-inline-safety-desktop.png',fullPage:true});
 await nav(1).click();await expectText('.a2-cal-target','Motor 2 of 4');
 await nav(-1).click();await expectSaved(6);assert.equal(await pulse.inputValue(),'1087');
 assert.equal(await safety.isChecked(),true,'motor Back/Next retains the same page confirmation');
 const startsBeforeReconnect=await fixture(()=>__wizard.calls.filter(c=>c.action==='CAL_SLIDER').length);
 await fixture(()=>{__wizard.kit.connectionGeneration++;});
 await page.waitForFunction(()=>!document.getElementById('a2OutputSafety').checked);await expectSaved(6);
 assert.equal(await button('cal-slider').isDisabled(),true,'reconnect requires a fresh safety confirmation');
 assert.equal(await pulse.inputValue(),'1087');
 assert.equal(await fixture(()=>__wizard.calls.filter(c=>c.action==='CAL_SLIDER').length),startsBeforeReconnect,'reconnect never starts output');
 await safety.check();await page.waitForFunction(()=>!document.querySelector('[data-action="cal-slider"]').disabled);
 await button('cal-slider').click();await expectText('.a2-cal-output','ACK 1000');
 await button('resume-cal').click();await expectText('.a2-cal-output','ACK 1087');
 await fixture(()=>{__wizard.holdPulse='1125';});await pulse.fill('1125');await page.waitForFunction(()=>!!__wizard.release);
 await button('cal-slider').click();await expectText('.a2-cal-output','Repeat the attempt');await fixture(()=>__wizard.release());
 assert.equal(await pulse.inputValue(),'1087');assert.equal(await fixture(()=>__wizard.board.mode),'DISABLED');
 for(const [motor,value] of [[2,'1090'],[3,'1105'],[4,'1110']]){
  await nav(1).click();await expectText('.a2-cal-target',`Motor ${motor} of 4`);await capture(value);
 }
 await nav(1).click();assert.equal(await wizard.locator('[data-panel="7"] h3').textContent(),'Setup report');
 assert.equal(await button('save-page').isVisible(),false);assert.equal(await nav(1).isVisible(),false,'Report must be the last step');
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[1087,1090,1105,1110]);
 assert.doesNotMatch(await wizard.locator('.a2-report').textContent(),/Pending|Motor test/i);
 const readiness='.a2-readiness-grid',readStatus=()=>button('read-readiness').click();
 await fixture(()=>{__wizard.readinessBlocker='THROTTLE_HIGH';});
 await readStatus();await expectText(readiness,'UNQUALIFIED');
 await expectText(readiness,'THROTTLE_HIGH');await expectText(readiness,'1350 µs');await expectText(readiness,'OFF acknowledged');
 assert.match(await wizard.locator('.a2-readiness-physical').textContent(),/Physical validation pending/);
 await fixture(()=>{__wizard.experimental=true;__wizard.readinessBlocker='NONE';});
 await readStatus();await expectText(readiness,'Experimental PPM Rate');await expectText(readiness,'None reported');
 assert.match(await wizard.locator('.a2-readiness-physical').textContent(),/Physical validation pending/);
 await fixture(()=>{const previous=__wizard.readinessResponse;__wizard.readinessResponse=()=>{
  const response=previous();return {...response,mode:'FLIGHT_READINESS',receiverFresh:true,inputSource:'ANDROID',
   flight:{...response.flight,inputScope:'LOCAL_ACRO_ANGLE'},attitudeReady:true,levelCalibrated:true,
   flightModeState:{supported:true,saved:'angle',active:'angle',pending:null}};
 };});
 await readStatus();await expectText(readiness,'Experimental Acro / Angle');await expectText(readiness,'Saved ANGLE · Active ANGLE');
 await expectText(readiness,'ANDROID fresh');await expectText(readiness,'Ready · level saved');
 await fixture(()=>{__wizard.wrongBoot=true;});
 await readStatus();await expectText('.a2-readiness-status','mismatched readiness snapshot');
 assert.equal(await wizard.locator(readiness).textContent(),'');
 assert.equal(await fixture(()=>__wizard.readinessReads),4);
 await nav(-1).click();await expectText('.a2-cal-target','Motor 4 of 4');await expectSaved(6);
 assert.equal(await pulse.inputValue(),'1110');
 assert.equal(await safety.isChecked(),false,'returning from Report requires a new page confirmation');
 await safety.check();
 await wizard.locator('#a2CalAll').check();assert.equal(await pulse.inputValue(),'1000');
 await capture('1150');
 const previous=await fixture(()=>[...__wizard.board.observedMinimumUs]);
 await fixture(()=>{__wizard.failSave=true;});await button('save-page').click();
 await expectText('.a2-message','Simulated NVS failure');assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),previous);await expectSaved(6,false);
 await fixture(()=>{__wizard.dropSaveAck=true;});await nav(1).click();
 assert.equal(await wizard.locator('[data-panel="7"]').isVisible(),true);
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[1150,1150,1150,1150]);
 assert.equal(safetyPrompts.length,startPromptCount,'individual and all-motor starts stay free of native dialogs');
 const persisted=await fixture(()=>({...__wizard.board}));
 await page.reload();await wizard.locator('[data-step="0"]').waitFor();await page.evaluate(installFixture,{savedBoard:persisted,boot:'nextboot'});
 // Reconnect polling reads the stored result and may already open ESC. Do not
 // race that automatic navigation by clicking Refresh on the hidden Board page.
 await expectSaved(5);
 for(const index of [1,3,5,6]){await step(index).click();await expectSaved(index);}
 assert.equal(await pulse.inputValue(),'1150');assert.equal(await fixture(()=>__wizard.calls.filter(c=>c.action==='WIZARD_BEGIN').length),0,'reload never restarts output');
 assert.equal(await safety.isChecked(),false,'the safety confirmation is never persisted or restored');
 await wizard.locator('#a2CalAll').check();await expectSaved(6);
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>{
  const nav=document.querySelector('.a2-steps'),current=nav.querySelector('[aria-current="step"]');
  const viewport=nav.getBoundingClientRect(),button=current.getBoundingClientRect();return button.left>=viewport.left-1&&button.right<=viewport.right+1;
 });
 assert.equal(await button('save-page').isVisible(),true);assert.equal(await button('stop').isVisible(),true);
 mkdirSync('test-output',{recursive:true});await page.screenshot({path:'test-output/a2-page-save-mobile.png',fullPage:true});
 const safetyBox=await wizard.locator('.a2-output-safety').boundingBox();
 assert.ok(safetyBox.x>=0&&safetyBox.x+safetyBox.width<=390,'inline safety fits the mobile viewport');
 await page.screenshot({path:'test-output/a2-output-inline-safety-mobile.png',fullPage:true});
 await step(5).click();await expectSaved(5);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-output/a2-auto-esc-mobile.png',fullPage:true});
 await step(7).click();await wizard.locator('[data-panel="7"] summary').click();
 await button('reset-selected').click();await page.locator('[data-inline-accept]').click();await expectText('.a2-report-state','Reset saved on board');
 assert.match(await fixture(()=>__wizard.board.accelModel),/^0:0:/);
 await expectText('.a2-report','Quick Level required for Angle');
 await wizard.locator('[data-panel="7"] [data-action="open-imu"]').click();
 assert.equal(await wizard.locator('[data-panel="3"] h3').isVisible(),true);
 assert.equal(await wizard.locator('[data-step="3"] .a2-step-short').innerText(),'ACC/Gyro');
 await wizard.locator('#a2AdvancedAccel summary').click();
 await wizard.locator('#a2ManualX').fill('0.020');
 await button('save-page').click();await expectSaved(3);
 await expectText('[data-save-page="3"]','Quick Level required for Angle');
 assert.equal(await step(3).getAttribute('data-saved'),'false','manual offsets alone do not complete Angle calibration');
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[1150,1150,1150,1150]);assert.equal(await fixture(()=>__wizard.board.autoEsc.sequenceReady),true);
 await step(6).click();assert.equal(await wizard.locator('.a2-checks').count(),0);await step(7).click();
 await button('reset-all').click();await page.locator('[data-inline-accept]').click();await expectText('.a2-report-state','Reset saved on board');
 assert.deepEqual(await fixture(()=>__wizard.board.observedMinimumUs),[0,0,0,0]);assert.equal(await fixture(()=>__wizard.board.escCalibrationSaved),false);
 assert.equal(await wizard.locator('.a2-checks').count(),0,'reset does not restore the removed checklist');
 assert.deepEqual(await fixture(()=>__wizard.calls.filter(c=>c.action==='WIZARD_SAVE')),[]);
 assert.deepEqual(safetyPrompts,[],'the complete Wizard uses no native browser dialogs');
 assert.deepEqual(errors,[]);
 await step(7).click();assert.equal(await nav(1).isVisible(),false);
 const width=(await wizard.locator('.a2-readiness').boundingBox()).width;
 assert.ok(width<=390,'readiness fits the mobile viewport');
 await fixture(()=>{__wizard.holdReadiness=true;});
 await readStatus();await page.waitForFunction(()=>!!__wizard.releaseReadiness);
 await fixture(()=>{__wizard.kit.connectionGeneration++;__wizard.releaseReadiness();});
 await expectText('.a2-readiness-status','Read FC status to verify');
 assert.equal(await wizard.locator(readiness).textContent(),'','late previous-generation reply is discarded');
 await fixture(()=>{
  const f=__wizard,k=f.kit;f.usbLines=[];k.transport='usb';k.connectionGeneration++;
  window.ZebjusKits.getUsbMonitorState=()=>({...k});
  window.DroneLabSerial={isOpen:()=>true,isFlashing:()=>false,generation:()=>2,writeLine:async line=>{
   f.usbLines.push(line);
   if(line==='ZJFLIGHT,STATUS\n'){
    window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line:'ZJFLIGHT,STATUS,'+JSON.stringify(f.readinessResponse())}}));
   }
  }};
  // Click before the next Wizard poll can observe the new transport.
  document.querySelector('[data-action="read-readiness"]').click();
 });
 await expectText('.a2-readiness-status','· USB');
 await expectText(readiness,'UNQUALIFIED');
 assert.deepEqual(await fixture(()=>__wizard.usbLines.filter(line=>line.startsWith('ZJFLIGHT'))),['ZJFLIGHT,STATUS\n']);
 await fixture(()=>{
  const now=Date.now();Date.now=()=>now+11000;
 });
 await expectText('.a2-readiness-status','Observation is stale');
 assert.equal(await wizard.locator(readiness).textContent(),'','expired observation cannot supply a ready or OFF claim');
 assert.deepEqual(errors,[]);
 console.log('PASS guided ACC / Gyro, six poses and Level Horizon, verified saves, ESC prepare, output calibration, PPM mapping and readiness');
}finally{await browser.close();}
