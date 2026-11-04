import {motorClient,cancelMotorConfirmations} from './motor-setup.js';
import {createSetupCues} from './setup-cues.js';
import {setupMonitorSample} from './input-monitor.js';
import {layouts,stepVisual,updateMotorDiagram,wizardVisual,imuCalibrationVisual,updateImuCalibrationVisual} from './a2-setup-visuals.js';
const root=document.getElementById('a2SetupRoot');
if(root){
 const steps=['Board','Wiring','Inputs','IMU Calibration','Output Signal','ESC Calibration','Output Calibration','Report'];
 const shortSteps=['Board','Wiring','Inputs','IMU','Signal','ESC Cal.','Output Cal.','Report'];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const defaults=()=>({layout:'A2_QUAD_X',layoutPins:['D0','D1','D2','D3'],rotations:['CW','CCW','CW','CCW']});
 const axes=['+X','−X','+Y','−Y','+Z','−Z'];
 const manualAxis=['X','Y','Z'];
 const modelParts=record=>{
  const code=String(record||''),[base,manualSuffix]=code.split(':M:');
  const v=base.split(':').map(Number),manual=manualSuffix?manualSuffix.split(':').map(Number):[0,0,0];
  if(v.length!==11||!v.every(Number.isFinite)||manual.length!==3||!manual.every(Number.isSafeInteger))return null;
  return {base,offset:v.slice(2,5).map(n=>n/1000),scale:v.slice(5,8).map(n=>n/1000),trim:v.slice(8,11).map(n=>n/1000),manual};
 };
 const manualSuffix=values=>values.some(Boolean)?':M:'+values.join(':'):'';
 const correctedAcceleration=(raw,model,manual)=>Array.isArray(raw)&&model?raw.map((value,i)=>(value-model.offset[i])*model.scale[i]-manual[i]/1000):null;
 function syncManualFields(record){
  const model=modelParts(record);if(!model||manualEditing||manualLoadedModel===record)return;
  manualOffsets=[...model.manual];manualLoadedModel=record;manualError='';
  manualAxis.forEach((axis,i)=>{const field=$('#a2Manual'+axis);if(field)field.value=(manualOffsets[i]/1000).toFixed(3);});
 }
 function readManualFields(){
  const vals=[];
  for(const axis of manualAxis){
   const field=$('#a2Manual'+axis),text=field?.value?.trim()??'',n=Number(text);
   const valid=text!==''&&Number.isFinite(n)&&Math.abs(n)<=0.25&&Math.abs(n*1000-Math.round(n*1000))<1e-6;
   if(field)field.setAttribute('aria-invalid',String(!valid));
   if(!valid)return null;
   vals.push(Math.round(n*1000));
  }
  return vals;
 }
 function updateManualDraft(){
  manualEditing=true;
  const vals=readManualFields(),savedManual=modelParts(saved?.accelModel)?.manual||[0,0,0];
  manualError=vals?'':'Enter a valid number from −0.250 to +0.250 g with up to 3 decimals.';
  if(vals){manualOffsets=vals;accelAction=vals.every((v,i)=>v===savedManual[i])?'KEEP':'MANUAL:'+vals.join(':');}
  else accelAction='MANUAL_INVALID';
 }
 const motors=[1,2,3,4];
 const visited=new Set([0]),history=[];
 let step=0,state=null,saved=null,draft=defaults(),minimums=[null,null,null,null],base=null,identity='',contextKit='';
 let lastStateAt=0,historyAt=0,polling=false,working='',readError='',operationError='',nextPollAt=0,readFailures=0;
 let calMotor=1,calAll=false,calTarget=1000,activeRun=null,operation=0;
 let escDraft=false,escAttempt=false,accelAction='KEEP',captureRequest=null,saveState='',ambiguousSave=null,conflict=false;
 let manualOffsets=[0,0,0],manualEditing=false,manualLoadedModel='',manualError='',imuHistory=[],imuHistorySeq=0;
 let visualStep=-1,visualMarkup='';
 const slider=(id,max)=>`<div class="a2-slider"><label for="${id}"><span>Output pulse</span><output id="${id}Value">1000 µs</output></label><input id="${id}" type="range" min="1000" max="${max}" step="1" value="1000" disabled><div><span>1000</span><span>${max} µs</span></div></div>`;
 const pageStatus=n=>`<p class="a2-page-save" data-save-page="${n}" role="status"></p>`;
 const soundButton='<button class="btn ghost" data-action="sound" aria-pressed="true">Sound on</button>';
 root.innerHTML=`<header class="a2-title"><div class="a2-toolbar-main"><h2>A2 Setup Wizard</h2><div class="a2-status" role="status">Waiting for controller</div>
 <nav class="a2-steps" aria-label="Setup steps">${steps.map((s,i)=>`<button data-step="${i}" aria-label="${s}"><span class="a2-step-number">${i+1}</span><span class="a2-step-long">${s}</span><span class="a2-step-short">${shortSteps[i]}</span></button>`).join('')}</nav></div><button class="btn danger" data-action="stop">STOP outputs</button></header>
 <div class="a2-columns"><main class="a2-content">
 <section data-panel="0"><h3>Board connection</h3><div class="a2-identity"></div><div class="a2-actions"><button class="btn" data-action="detect">Refresh board</button><button class="btn ghost" data-action="connect">Open connection</button></div></section>
 <section data-panel="1"><h3>Frame &amp; wiring</h3>${pageStatus(1)}
 <label class="a2-layout-field">Frame layout<select id="a2Layout"><option value="A2_QUAD_X">Quad X</option><option value="A2_QUAD_PLUS">Quad +</option></select></label>
 <div class="a2-table-wrap"><table class="a2-wiring"><thead><tr><th>Motor / position</th><th>Signal pin</th><th>Direction</th></tr></thead><tbody>${[1,2,3,4].map((m,i)=>`<tr><td><b>M${m}</b><small data-position="${i}"></small></td><td><select data-pin="${i}" aria-label="M${m} signal pin">${[0,1,2,3].map(n=>`<option value="D${n}" ${n===i?'selected':''}>D${n}</option>`).join('')}</select></td><td><select data-rotation="${i}" aria-label="M${m} expected rotation"><option ${i%2===0?'selected':''}>CW</option><option ${i%2?'selected':''}>CCW</option></select></td></tr>`).join('')}</tbody></table></div>
 <p class="a2-wiring-validation" role="status"></p><p class="a2-save-state"></p></section>
 <section data-panel="2"><h3>Live inputs</h3><p class="a2-input">No selected input</p><div class="a2-channel-list">${['Roll','Pitch','Throttle','Yaw','Aux / ARM','Aux / mode','Aux 7','Aux 8'].map((name,i)=>`<div class="a2-channel" data-channel="${i}"><span>CH${i+1} <b>${name}</b></span><div class="a2-channel-track"><i></i></div><output>—</output></div>`).join('')}</div><details class="a2-input-details"><summary>Signal details</summary><div class="a2-input-health" role="status"></div></details></section>
 <section data-panel="3" class="a2-imu-page">
 <div class="a2-imu-heading"><h3>IMU Calibration</h3><span class="a2-imu-badge">MPU6050 · 0x68 · 250 Hz target</span></div>${pageStatus(3)}
 <div class="a2-imu-card">
  <div class="a2-imu-card-head"><strong>Gyroscope zero-bias</strong><small>Automatic on boot · 2000 samples</small></div>
  <progress class="a2-gyro-progress" max="2000" value="0" aria-label="Gyroscope calibration progress"></progress>
  <p class="a2-gyro-status" role="status">Waiting for verified IMU</p>
  <table class="a2-imu-table" aria-label="Gyroscope values in degrees per second"><thead><tr><th>Axis</th><th>Raw °/s</th><th>Bias °/s</th><th>Corrected °/s</th></tr></thead>
   <tbody>${['X / Roll','Y / Pitch','Z / Yaw'].map((axis,i)=>`<tr><td>${axis}</td><td data-gyro-raw="${i}">—</td><td data-gyro-bias="${i}">—</td><td data-gyro-corrected="${i}">—</td></tr>`).join('')}</tbody></table>
  <label class="a2-check"><input type="checkbox" id="a2Still"> Board stationary for calibration / capture</label>
  <div class="a2-actions"><button class="btn" data-action="imu-gyro">Start gyro calibration</button><button class="btn ghost" data-action="imu-cancel">Cancel</button><button class="btn ghost" data-action="imu-reset">Reset gyro</button></div>
 </div>
 <div class="a2-imu-card">
  <div class="a2-imu-card-head"><strong>Accelerometer XYZ</strong><small>Manual offset · g</small></div>
  <p class="a2-imu-manual-note">Enter the bias to SUBTRACT. Example: X = 0.030 means corrected X = calibrated X − 0.030 g. Each value: −0.250 to +0.250 g.</p>
  <div class="a2-imu-offset-grid">
   ${['X','Y','Z'].map((axis,i)=>`<label for="a2Manual${axis}">Acc${axis} offset (g)<input id="a2Manual${axis}" data-manual-axis="${i}" type="number" min="-0.250" max="0.250" step="0.001" inputmode="decimal" value="0.000"></label>`).join('')}
  </div>
  <p class="a2-imu-manual-warning" role="status"></p>
  <table class="a2-imu-table" aria-label="Live accelerometer raw and corrected measurements in g"><thead><tr><th>Axis</th><th>Raw g</th><th>After saved fit g</th><th>Draft corrected g</th></tr></thead>
  <tbody>${['X','Y','Z'].map((axis,i)=>`<tr><td>Acc${axis}</td><td data-accel-raw="${i}">—</td><td data-accel-fitted="${i}">—</td><td data-accel-corrected="${i}">—</td></tr>`).join('')}</tbody></table>
  <div class="a2-actions"><button class="btn ghost" data-action="imu-zero-manual">Zero manual offsets</button></div>
  <p class="a2-imu-manual-note" data-imu-manual-status>Edited values are a preview until Save on this page is verified by the board.</p>
 </div>
 <div class="a2-imu-card">
  <div class="a2-imu-card-head"><strong>Sensor calibration</strong><small>Quick Level / Full 6-position</small></div>
  <div class="a2-imu-face-row"><label for="a2Face">Face up <select id="a2Face">${axes.map((axis,i)=>`<option value="${i}" ${i===4?'selected':''}>${axis} up</option>`).join('')}</select></label>
   <div class="a2-actions"><button class="btn" data-action="imu-level">Quick Level (+Z)</button><button class="btn" data-action="imu-face">Capture face</button><button class="btn ghost" data-action="imu-clear">Clear captures</button></div>
  </div>
  <p class="a2-capture-status" role="status"></p>
  <p class="a2-imu-manual-note">Quick Level provides inclination trim, not 3-axis scale calibration. Capture all six faces for the future Angle mode. Save a completed capture before editing manual offsets.</p>
 </div>
 <details class="a2-input-details"><summary>Advanced IMU diagnostics</summary><pre class="a2-imu-values"></pre></details>
 <details class="a2-input-details"><summary>Capture validation</summary><p>128 fresh samples per pose; stationary, expected gravity direction, axis stability and bounded fit required. Motor outputs must be OFF.</p></details></section>
 <section data-panel="4"><h3>Output Signal</h3><div class="a2-signal-status" role="status"></div>
 <div class="a2-profile-cards"><article><h4>Standard PWM · 50 Hz</h4><p>Production profile · 20 ms period · 1000–2000 µs. Step 7 limits calibration to 1500 µs.</p></article><article><h4>Rapid PWM · 250 Hz</h4><p>4 ms period · 1000–2000 µs. Prepared · hardware validation required.</p></article><article><h4>OneShot125</h4><p>Separate protocol · Not supported.</p></article></div></section>
 <section data-panel="5"><div class="a2-panel-heading"><h3>ESC Calibration</h3>${soundButton}</div>${pageStatus(5)}
 <p class="a2-calibration-summary" role="status"></p><small class="a2-sound-note">App cues accompany board phases. Listen for the ESC’s own tones.</small>
 <ol class="a2-cal-steps"><li data-cal-stage="power"><b>Remove all propellers</b><span>Disconnect the motor battery. Keep the A2 powered by USB.</span></li><li data-cal-stage="high"><b>Start with battery disconnected</b><span>After HIGH is acknowledged, connect the battery and listen for the calibration prompt.</span></li><li data-cal-stage="low"><b>Press Stop after the prompt</b><span>Wait for the ESC success tones and the PWM-off acknowledgement.</span></li><li data-cal-stage="tones"><b>Confirm and disconnect</b><span>Confirm the success tones, then disconnect the motor battery.</span></li></ol>
 <label class="a2-check"><input type="checkbox" id="a2EscProps"> All propellers removed</label>
 <label class="a2-check"><input type="checkbox" id="a2PowerOff"> Motor battery disconnected and A2 powered by USB</label>
 <label class="a2-check"><input type="checkbox" id="a2ReadProcedure"> ESC wiring verified · HIGH/LOW procedure understood</label>
 <div class="a2-phase-scale"><span>Low / Off</span><meter aria-label="ESC calibration phase" min="0" max="2" value="0"></meter><span>High</span></div>
 <p class="a2-phase" role="status"></p>
 <div class="a2-actions"><button class="btn" data-action="high">Start</button><button class="btn" data-action="low" disabled>Stop</button><small>Sends LOW to complete ESC calibration</small></div>
 <label class="a2-check"><input type="checkbox" id="a2Tones" disabled> ESC success tones heard</label>
 <label class="a2-check"><input type="checkbox" id="a2EscDisconnected" disabled> Motor battery disconnected after calibration</label>
 <button class="btn ghost" data-action="confirm-cal" disabled>Confirm calibration</button></section>
 <section data-panel="6"><div class="a2-panel-heading"><h3>Output Calibration</h3>${soundButton}</div>${pageStatus(6)}
 <p>Press Start, then raise the slider slowly until the motor spins steadily. Press Stop to record the value, then press Save to store it on the controller.</p>
 <label class="a2-check"><input id="a2CalAll" type="checkbox"> Calibrate all motor outputs at the same time</label>
 <p class="a2-cal-target"></p><p class="a2-cal-result"></p>${slider('a2CalPulse',1500)}
 <div class="a2-actions a2-test-actions"><button class="btn a2-test-toggle" data-action="cal-slider">Start</button></div>
 <div class="a2-actions"><button class="btn ghost" data-action="resume-cal" hidden>Resume recorded pulse</button></div>
 <p class="a2-cal-output a2-test-state" role="status"></p></section>
 <section data-panel="7"><h3>Setup report</h3><p class="a2-report-state" role="status"></p><div class="a2-report"></div>
 <div class="a2-actions"><button class="btn ghost" data-action="download">Download report</button></div>
 <details class="a2-secondary-test"><summary>Reset setup</summary>
 <p>Reset writes the selected defaults to the controller after confirmation. ESC endpoints are stored in the ESCs.</p>
 <label for="a2ResetScope">Calibration to clear</label><select id="a2ResetScope"><option value="accel">Accelerometer</option><option value="esc">ESC confirmation</option><option value="minimums">Motor starting pulses</option></select>
 <div class="a2-actions"><button class="btn ghost" data-action="reset-selected">Reset selected calibration</button><button class="btn ghost" data-action="reset-all">Reset all Wizard settings</button></div></details></section>
 </main><aside class="a2-visual" aria-label="Current setup step visualization"><h3 class="a2-visual-title"></h3><div class="a2-visual-scene"></div><div class="a2-pulses"></div></aside></div>
 <p class="a2-message" role="status" aria-live="polite"></p><footer class="a2-footer"><button class="btn ghost" data-nav="-1">Back</button><span class="a2-step-count"></span><button class="btn ghost" data-action="verify-save" hidden>Verify / retry save</button><button class="btn ghost" data-action="save-page" hidden>Save</button><button class="btn" data-nav="1">Next</button><details class="a2-diagnostics-box"><summary>Firmware diagnostics</summary><pre class="a2-diagnostics">No firmware response.</pre></details></footer>`;
 let soundEnabled=true;try{soundEnabled=localStorage.getItem('zebjus.setup.sound')!=='off';}catch{}
 const cues=createSetupCues({enabled:soundEnabled});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cues.stop();});
 const $=s=>root.querySelector(s),message=t=>$('.a2-message').textContent=t;
 const kit=()=>window.ZebjusKits?.getState?.()||{};
 const live=()=>document.getElementById('tab-setup')?.classList.contains('active')&&!document.hidden;
 function selectedInput(){
  const s=state||{};
  if(s.selectedInput==='ANDROID_WEBRTC'&&kit().connected){
   const p=window.ZebjusSimulatorInputs?.snapshot?.(),sample=p?.sample;
   if(p?.fresh&&p.ageMs<=300&&p.peer?.approved&&(!sample?.kitId||sample.kitId===kit().kitId))return {source:'Android WebRTC · paired phone',reported:true,monitoring:true,valid:true,age:p.ageMs,channels:sample?.channels?[sample.channels.roll,sample.channels.pitch,sample.channels.throttle,sample.channels.yaw,sample.aux?.ch5,sample.aux?.ch6,null,null]:[]};
  }
  return setupMonitorSample(state,lastStateAt,kit());
 }
 const view=(label,rows)=>`<dl aria-label="${esc(label)}">${rows.map(([a,b])=>`<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>`;
 const config=s=>s?.layout in layouts?{layout:s.layout,layoutPins:[...s.layoutPins],rotations:[...s.rotations]}:defaults();
 const validPulse=p=>Number.isInteger(p)&&p>=1000&&p<=1500;
 const sameWiring=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const wiringValid=()=>new Set(draft.layoutPins).size===4;
 const wiringCompatible=()=>!!saved?.configValid&&sameWiring(draft,config(saved));
 const pulses=()=>minimums.map((p,i)=>p??(wiringCompatible()?saved.observedMinimumUs?.[i]||0:0));
 const effectivePulses=()=>pulses().map(p=>validPulse(p)?p:0);
 const activeEsc=()=>escDraft===true||escDraft===false&&wiringCompatible()&&saved.escCalibrationSaved===true;
 const escCleared=()=>escDraft==='cleared';
 const compatibleEsc=()=>!escCleared()&&activeEsc();
 const outputOff=s=>s?.mode==='DISABLED'&&s.motorsDisabled===true&&s.pulseUs?.length===4&&s.pulseUs.every(p=>p===0);
 const observedOff=()=>outputOff(state)&&Date.now()-lastStateAt<2400&&!motorClient.busy;
 const boardReady=()=>kit().connected&&saved?.wizardVersion===1&&saved.pageSaveVersion===1&&saved.supported&&saved.configVerified!==false&&base?.bootId===saved.bootId&&!conflict&&!ambiguousSave;
 const canStart=()=>boardReady()&&observedOff()&&saved.configValid&&wiringValid();
 const checkList=ids=>ids.every(id=>$(id).checked);
 // Trust the verified board profile, not three repeated UI checkbox proofs.
 const outputChecks=()=>saved?.outputSignal?.profile==='PWM_50HZ_1000_2000'&&saved.outputSignal.hz===50&&saved.outputSignal.minUs===1000&&saved.outputSignal.maxUs===2000;
 const escChecks=()=>outputChecks()&&checkList(['#a2EscProps','#a2PowerOff','#a2ReadProcedure']);
 const mask=(motor,all)=>all?15:1<<(motor-1);
 const targetMotors=(motor,all)=>all?motors:[motor];
 const currentResult=()=>{
  const values=targetMotors(calMotor,calAll).map(n=>pulses()[n-1]);
  return values.every(p=>p===values[0]&&validPulse(p))?values[0]:1000;
 };
 const encode=(w,values=[0,0,0,0])=>[w.layout==='A2_QUAD_PLUS'?'P':'X',w.layoutPins.map(p=>p.slice(1)).join(''),w.rotations.map(r=>r==='CW'?0:1).join(''),...values].join(':');
 function readWiring(){
  return {layout:$('#a2Layout').value,layoutPins:[...root.querySelectorAll('[data-pin]')].map(x=>x.value),rotations:[...root.querySelectorAll('[data-rotation]')].map(x=>x.value)};
 }
 function loadWiring(){
  $('#a2Layout').value=draft.layout;
  draft.layoutPins.forEach((p,i)=>$('[data-pin="'+i+'"]').value=p);
  draft.rotations.forEach((r,i)=>$('[data-rotation="'+i+'"]').value=r);
 }
 function setCalPulse(pulse){
  calTarget=pulse;
  $('#a2CalPulse').value=pulse;
  $('#a2CalPulseValue').textContent=pulse+' µs';
 }
 function resetContext(){
  ++operation;
  state=saved=base=null;
  draft=defaults();minimums=[null,null,null,null];loadWiring();
  calMotor=1;calAll=false;setCalPulse(1000);
  lastStateAt=historyAt=nextPollAt=readFailures=0;history.length=0;
  activeRun=null;escDraft=escAttempt=false;accelAction='KEEP';captureRequest=null;
  manualOffsets=[0,0,0];manualEditing=false;manualLoadedModel='';manualError='';imuHistory=[];imuHistorySeq=0;
  conflict=false;saveState=readError=operationError='';ambiguousSave=null;
  visited.clear();visited.add(0);
  root.querySelectorAll('input[type="checkbox"]').forEach(input=>input.checked=false);
 }
 function refreshIdentity(){
  const k=kit(),key=[k.kitId,k.bootId,k.transport,k.connectionGeneration,k.connected].join('|');
  if(key===identity)return;
  identity=key;
  if(!base||k.kitId&&k.kitId!==contextKit||k.bootId&&base.bootId!==k.bootId)resetContext();
  else{
   // Preserve editable values for the same boot. Retire transport-bound
   // proofs and do not enable any write until a new verified status arrives.
   ++operation;state=saved=null;lastStateAt=nextPollAt=0;activeRun=null;
   escAttempt=false;captureRequest=null;
   if(escDraft===true)escDraft=false;
   if(accelAction.startsWith('CAPTURED:'))accelAction='KEEP';
   root.querySelectorAll('input[type="checkbox"]').forEach(input=>input.checked=false);
  }
  if(k.kitId)contextKit=k.kitId;
 }
 function receive(s){
  refreshIdentity();
  if(!s||s.kitId&&s.kitId!==kit().kitId)return;
  if(base&&s.bootId&&s.bootId!==base.bootId)resetContext();
  const old=state;
  state=s;lastStateAt=s.receivedAt||Date.now();
  if(s.mode!=='UNCONFIRMED')readError='';
  if(s.wizardVersion===1){
   saved=s;syncManualFields(s.accelModel);
   if(s.imu?.imuValid===true&&Number.isSafeInteger(s.imu.sampleSequence)&&s.imu.sampleSequence>0&&s.imu.sampleSequence!==imuHistorySeq&&
    Array.isArray(s.imu.accelRawG)&&s.imu.accelRawG.length===3&&s.imu.accelRawG.every(Number.isFinite)){
    imuHistorySeq=s.imu.sampleSequence;imuHistory.push([...s.imu.accelRawG]);if(imuHistory.length>45)imuHistory.shift();
   }
   if(!base){
    base={bootId:s.bootId,revision:s.configRevision};draft=config(s);loadWiring();setCalPulse(currentResult());
   }else if(s.configRevision!==base.revision&&!ambiguousSave)conflict=true;
   if(step===6&&!activeRun&&!working)setCalPulse(currentResult());
   updateCapture(s.capture);
  }
  // The safety invalidation is visible in ordinary motor acknowledgements too.
  if(saved&&s.escCalibrationSaved===false&&old?.escCalibrationSaved!==false)saved={...saved,escCalibrationSaved:false};
  if(old?.mode==='CAL_LOW'&&outputOff(s)&&s.reason==='CAL_FINISHED')cues.play('finished');
  if(escAttempt&&outputOff(s)&&s.reason!=='CAL_FINISHED'&&!s.escCalibrationPending)escAttempt=false;
  if(activeRun&&outputOff(s)&&s.reason!=='NONE'&&!working){
   setCalPulse(currentResult());
   activeRun=null;
  }
  if(ambiguousSave&&s.wizardVersion===1&&!working)checkSaveReadback(s);
  render();
 }
 function updateCapture(capture){
  if(!captureRequest?.sequence)return;
  if(capture?.sequence!==captureRequest.sequence){
   if(Date.now()-captureRequest.at>7000)captureRequest=null;
   return;
  }
  if(capture.running)return;
  if(capture.ready&&capture.model&&capture.state==='CAPTURED')accelAction='CAPTURED:'+capture.model;
  captureRequest=null;
 }
 function renderVisual(){
  const scene=$('.a2-visual-scene'),input=selectedInput();
  const safe=Date.now()-lastStateAt<2400?state||{}:{...state,mode:'UNCONFIRMED',pulseUs:[]};
  const motorStep=step===6;
  const selection=mask(calMotor,calAll);
  const selectedMask=['ALL_TEST','INPUT_TEST'].includes(safe.mode)?15:selection;
  const testing=['SLIDER_TEST','SINGLE_TEST','ALL_TEST','INPUT_TEST'].includes(safe.mode);
  const v=step===3?{title:'3D orientation & XYZ graph',html:imuCalibrationVisual()}:step>=4&&step<=5
   ?wizardVisual(step,{mode:safe.mode,escAttempt,powerOff:$('#a2PowerOff').checked})
   :stepVisual(step===7?5:motorStep?4:step,{kit:kit(),state:motorStep?{...safe,...draft}:safe,draft,input,history,selectedMask,interactive:false});
  $('.a2-visual-title').textContent=v.title;
  if(visualStep!==step||!motorStep&&step!==1&&step!==2&&visualMarkup!==v.html){
   scene.innerHTML=v.html;visualMarkup=v.html;
  }
  if(step===2){
   const values=input.channels||[],thr=values[2],roll=values[0],pitch=values[1];
   const throttle=scene.querySelector('[data-input-throttle]'),sticks=scene.querySelector('[data-input-sticks]');
   scene.querySelector('[data-input-source] text').textContent=input.source||'NO SIGNAL';
   throttle.setAttribute('cy',Number.isFinite(thr)?197-(thr-1000)/10:147);
   sticks.setAttribute('cx',Number.isFinite(roll)?290+(roll-1500)/10:290);
   sticks.setAttribute('cy',Number.isFinite(pitch)?147-(pitch-1500)/10:147);
   for(const marker of [throttle,sticks])marker.setAttribute('class',input.monitoring?'a2-stick-knob':'a2-off-dot');
   scene.querySelector('[data-input-history]').setAttribute('points',history.map((value,i)=>`${28+i*344/Math.max(1,history.length-1)},${340-(value-1000)*.08}`).join(' '));
  }
  if(step===3){
   const model=modelParts(saved?.accelModel),fresh=imuFresh(),imu=saved?.imu||{};
   const sample=fresh?correctedAcceleration(imu.accelRawG,model,manualOffsets):null;
   const history=imuHistory.map(raw=>correctedAcceleration(raw,model,manualOffsets)).filter(Boolean);
   updateImuCalibrationVisual(scene,sample,Number($('#a2Face').value),saved?.capture?.mask||0,history);
  }
  if(step===1||motorStep)updateMotorDiagram(scene,draft,motorStep?safe.pulseUs:[],motorStep&&testing,{
   selectedMask:motorStep?selectedMask:0,preview:step===1,interactive:false,locked:!!working||motorClient.busy,
   results:motorStep?pulses().map((p,i)=>validPulse(p)?`${p} µs · ${minimums[i]?'DRAFT':'SAVED'}`:''):[]});
  visualStep=step;
  $('.a2-pulses').hidden=!motorStep;
  $('.a2-pulses').textContent=safe.mode==='UNCONFIRMED'?'Output state unconfirmed':(safe.pulseUs||[]).map((p,i)=>`M${i+1} ${p?p+' µs':'OFF'}`).join(' · ');
 }
 function imuFresh(){
  return saved?.imu?.imuValid===true&&Date.now()-(saved.receivedAt||0)<1600;
 }
 function renderImu(){
  const imu=saved?.imu||{},capture=saved?.capture||{},model=modelParts(saved?.accelModel);
  const gyroActive=imu.manualGyro||['SETTLING','CALIBRATING'].includes(imu.state);
  const ready=boardReady()&&observedOff()&&!working;
  const fresh=imuFresh(),fmt=n=>Number.isFinite(n)?Number(n).toFixed(3):'—';
  const xyz=v=>Array.isArray(v)?v.map(fmt).join(' / '):'—';
  const put=(selector,value)=>{const el=$(selector);if(el&&el.textContent!==value)el.textContent=value;};
  const raw=fresh&&Array.isArray(imu.accelRawG)&&imu.accelRawG.length===3?imu.accelRawG:null;
  const fitted=raw&&model?correctedAcceleration(raw,model,[0,0,0]):null;
  const preview=raw&&model?correctedAcceleration(raw,model,manualOffsets):null;
  $('[data-action="imu-gyro"]').textContent=imu.state==='READY'?'Recalibrate gyro':'Start gyro calibration';
  $('[data-action="imu-gyro"]').disabled=!ready||gyroActive||capture.running||!$('#a2Still').checked;
  $('[data-action="imu-cancel"]').disabled=!ready||!gyroActive;
  $('[data-action="imu-reset"]').disabled=!ready||gyroActive;
  for(const a of ['imu-face','imu-level'])$('[data-action="'+a+'"]').disabled=!ready||!fresh||!$('#a2Still').checked||capture.running||!!captureRequest||accelAction!=='KEEP';
  $('[data-action="imu-clear"]').disabled=!ready;
  $('[data-action="imu-zero-manual"]').disabled=!!working||!model;
  root.querySelectorAll('[data-manual-axis]').forEach(input=>input.disabled=!!working||!!ambiguousSave);
  const progress=Math.max(0,Math.min(2000,Number(imu.samples)||0));
  $('.a2-gyro-progress').value=progress;
  $('.a2-gyro-status').textContent=`${imu.state||'Waiting for verified IMU'} · ${imu.samples??'—'} / 2000 samples${imu.error&&imu.error!=='NONE'?' · '+imu.error:''}`;
  $('.a2-capture-status').textContent=`${capture.state||'Waiting for IMU'} · ${capture.samples??0} / 128 samples · Faces ${axes.filter((_,i)=>capture.mask&(1<<i)).join(', ')||'—'}${accelAction.startsWith('CAPTURED:')?' · Unsaved accelerometer settings':''}${saved?.configValid===false?' · Invalid setup record, identity correction active':''}`;
  for(let i=0;i<3;i++){
   put('[data-gyro-raw="'+i+'"]',fresh?fmt(imu.raw?.[i]):'—');
   put('[data-gyro-bias="'+i+'"]',fmt(imu.bias?.[i]));
   put('[data-gyro-corrected="'+i+'"]',fresh?fmt(imu.corrected?.[i]):'—');
   put('[data-accel-raw="'+i+'"]',raw?fmt(raw[i]):'—');
   put('[data-accel-fitted="'+i+'"]',fitted?fmt(fitted[i]):'—');
   put('[data-accel-corrected="'+i+'"]',preview?fmt(preview[i]):'—');
  }
  put('.a2-imu-manual-warning',manualError);
  const pending=accelAction.startsWith('MANUAL:');
  put('[data-imu-manual-status]',pending?'Draft only · Save to apply offsets on board; motor outputs remain OFF.':
   accelAction==='MANUAL_INVALID'?'Invalid manual offset · Save is blocked.':
   model?.manual.some(Boolean)?'Manual X/Y/Z offsets are saved on this board.':'Manual correction: 0.000 g · no additional subtraction.');
  const tilt=preview?[Math.atan2(preview[1],preview[2])*180/Math.PI,Math.atan2(-preview[0],Math.hypot(preview[1],preview[2]))*180/Math.PI]:null;
  $('.a2-imu-values').textContent=[
   fresh?'Fresh XYZ':'Live sample stale or unavailable',
   'Gyroscope raw / bias / corrected (°/s)',
   `${fresh?xyz(imu.raw):'—'} | ${xyz(imu.bias)} | ${fresh?xyz(imu.corrected):'—'}`,
   'Accelerometer raw / saved fit / manual preview (g)',
   `${raw?xyz(raw):'—'} | ${fitted?xyz(fitted):'—'} | ${preview?xyz(preview):'—'}`,
   `Saved six-position offset · ${model?xyz(model.offset):'—'} g · scale · ${model?xyz(model.scale):'—'}`,
   `Manual offset draft · ${xyz(manualOffsets.map(v=>v/1000))} g`,
   `Gravity magnitude · ${preview?Math.hypot(...preview).toFixed(3)+' g':'—'}`,
   `Accelerometer inclination preview · ${tilt?tilt.map(v=>v.toFixed(1)+'°').join(' roll / '):'—'}`,
   `Gyro quality σ · ${xyz(imu.stddev)} °/s · restarts ${imu.restarts??'—'}`,
   `Rate · ${imu.imuActualHz??'—'} / ${imu.imuTargetHz??'—'} Hz · sample age ${imu.imuSampleAgeUs??'—'} µs`,
   `Missed ${imu.imuMissedNormalSamples??'—'} · I²C read errors ${imu.readFailures??'—'} · write errors ${imu.writeFailures??'—'}`,
   `DLPF ${imu.imuDlpFilter??'—'} · gyro ±${imu.gyroRangeDps??'—'} °/s · accel ±${imu.accelRangeG??'—'} g`
  ].join('\n');
 }
 function renderEsc(){
  const high=state?.mode==='CAL_HIGH',low=state?.mode==='CAL_LOW';
  const canConfirm=escAttempt&&observedOff()&&state.escCalibrationPending===true&&!compatibleEsc();
  $('.a2-calibration-summary').textContent=escDraft===true?'Confirmed · Save this page':compatibleEsc()?'Saved on board · same wiring':'Not calibrated';
  $('.a2-calibration-summary').dataset.saved=String(escDraft!==true&&compatibleEsc());
  $('.a2-phase-scale meter').value=high?2:low?1:0;
  $('.a2-phase').textContent=high?'HIGH · 2000 µs. Connect the motor battery and wait for the ESC calibration tones.'
   :low?'LOW · 1000 µs. Wait for ESC success tones and PWM off.'
   :canConfirm?'PWM off. Confirm the ESC success tones and disconnect the motor battery.'
   :outputOff(state)?'PWM off · '+(state.reason==='CAL_TIMEOUT'?motorStopDescription(state):'ready for instruction')
   :'PWM state unconfirmed';
  root.querySelectorAll('[data-cal-stage]').forEach(li=>li.classList.toggle('current',li.dataset.calStage===(high?'high':low?'low':canConfirm?'tones':'power')));
  const start=$('[data-action="high"]');
  start.textContent=compatibleEsc()?'Recalibrate':'Start';
  start.disabled=!canStart()||!wiringCompatible()||!escChecks()||!!working||canConfirm;
  $('[data-action="low"]').disabled=!high||motorClient.owner!=='wizard'||!!working;
  $('#a2Tones').disabled=$('#a2EscDisconnected').disabled=!canConfirm;
  $('[data-action="confirm-cal"]').disabled=!canConfirm||!!working||!checkList(['#a2Tones','#a2EscDisconnected']);
 }
 function renderOutputs(){
  const fresh=Date.now()-lastStateAt<750;
  const running=state?.mode==='SLIDER_TEST'&&motorClient.owner==='wizard';
  const calLive=running&&!!activeRun;
  const busy=!!working||motorClient.busy;
  const disabled=!canStart()||!outputChecks()||busy;
  const time=Math.max(0,Math.ceil(((state?.remainingMs||0)-(Date.now()-lastStateAt))/1000));
  const text=operationError||(!observedOff()&&!fresh?'Output state unconfirmed · verify STOP or reconnect.':outputOff(state)?'Outputs off':state?.mode||'Waiting for board');
  $('#a2CalAll').checked=calAll;$('#a2CalAll').disabled=busy;
  $('#a2CalPulse').disabled=!calLive||!!working;
  const cal=$('[data-action="cal-slider"]');
  cal.textContent=working==='cal-slider'?(calLive?'Stopping…':'Starting…'):calLive?'Stop':'Start';
  cal.disabled=!!working||(!calLive&&(disabled||!compatibleEsc()));cal.classList.toggle('danger',calLive);
  const value=pulses()[calMotor-1],recorded=calAll?targetMotors(calMotor,true).every(n=>validPulse(pulses()[n-1])):validPulse(value);
  const pending=targetMotors(calMotor,calAll).some(n=>validPulse(minimums[n-1]));
  $('.a2-cal-target').textContent=calAll?'M1–M4 · Wait for all four motors to spin steadily. Stop replaces all four draft values.':`Motor ${calMotor} of 4 · ${layouts[draft.layout].positions[calMotor-1]} · ${draft.layoutPins[calMotor-1]} · ${draft.rotations[calMotor-1]}`;
  const overRange=targetMotors(calMotor,calAll).filter(n=>pulses()[n-1]>1500);
  $('.a2-cal-result').textContent=overRange.length?overRange.map(n=>`M${n} · ${pulses()[n-1]} µs saved · recalibration required`).join(' · '):pending?'Pending save':recorded?'Saved on board':'No compatible pulse recorded';
  const ack=activeRun?.motors.map(n=>state?.pulseUs?.[n-1])||[];
  $('.a2-cal-output').textContent=calLive&&fresh?`Live · ACK ${ack[0]??'—'} µs · ${time} s`:outputOff(state)&&pending&&!operationError?'Outputs off · Pending save':text;
  const resume=$('[data-action="resume-cal"]');
  resume.hidden=!calLive||!activeRun.ready||activeRun.resume===1000||activeRun.target!==1000;
  resume.disabled=!!working||!fresh;
  if(!resume.hidden)resume.textContent=`Resume ${activeRun.resume} µs`;
 }
 function reportRows(){
  const k=kit(),signal=saved?.outputSignal,values=pulses(),stored=saved?.observedMinimumUs||[];
  const pulseText=p=>p?p+' µs':'Not calibrated';
  return [
   ['Kit',`${k.kitId||'Offline'} · ${k.board||'—'} · ${k.version||'—'} · ${k.transport||'—'}`],
   ['Frame',`${layouts[draft.layout].name} · ${wiringCompatible()?'Saved on board':'Pending'}`],
   ...motors.map((n,i)=>[`M${n} wiring`,`${draft.layoutPins[i]} · ${draft.rotations[i]}${wiringCompatible()?'':` · pending (board ${saved?.layoutPins?.[i]||'—'} · ${saved?.rotations?.[i]||'—'})`}`]),
   ['Inputs',`${selectedInput().source||'—'} · live observation`],
   ['IMU',`Gyro ${saved?.imu?.state||'unknown'} · runtime only · Accelerometer ${accelAction==='KEEP'?'board-saved':'draft pending'} · Manual X/Y/Z ${manualOffsets.map(n=>(n/1000).toFixed(3)).join(' / ')} g`],
   ['Output signal',signal?`${signal.hz} Hz · ${signal.minUs}–${signal.maxUs} µs`:'Unverified'],
   ['ESC',escDraft===true?'Confirmed · Pending save':compatibleEsc()?'Saved on board':escCleared()?'Not calibrated · Pending reset':'Not calibrated'],
   ...motors.map((n,i)=>[`M${n} minimum`,minimums[i]!==null?`${pulseText(values[i])} · Pending (board ${pulseText(stored[i])})`:values[i]>1500?`${pulseText(values[i])} · Recalibration required`:values[i]?`${pulseText(values[i])} · Saved on board`:'Not calibrated']),
   ['Physical acceptance','Not verified by software']
  ];
 }
 function renderInputs(){
  const m=state||{},input=selectedInput(),ppm=input.receiver;
  const age=Number.isFinite(input.age)?(input.ageUpperBound?'≤ ':'')+Math.round(input.age)+' ms':'unknown';
  const monitoring=input.monitoring?'MONITORING':input.reported?'LAST SAMPLE':kit().connected?'WAITING FOR INPUT':'KIT OFFLINE';
  $('.a2-input').textContent=`${input.source} · ${monitoring}${input.reported?' · sample age '+age:''} · Input ${m.inputArmed?'armed':'disarmed'}`;
  root.querySelectorAll('[data-channel]').forEach(row=>{
   const value=input.channels?.[Number(row.dataset.channel)],reported=Number.isFinite(value)&&value>=1000&&value<=2000;
   row.dataset.fresh=String(reported&&input.monitoring);
   row.querySelector('output').textContent=reported?value+' µs':'—';
   row.querySelector('i').style.width=reported?(value-1000)/10+'%':'0%';
  });
  $('.a2-input-health').textContent=(input.receiverHealth||'PPM signal diagnostics are not verified yet.')+
   (ppm?` · ${ppm.captureBackend||'receiver'} · ${ppm.captureHz??'—'} Hz (target 50 Hz) · ${ppm.captureReady===false?'capture unavailable · ':''}losses ${ppm.losses||0} · invalid intervals ${ppm.faults||0}`:'')+
   (readError?' · Status refresh delayed.':'')+(m.selectedInput==='ANDROID_AP'?' · Android AP owns input.':'');
  if(step===2&&input.monitoring&&Number.isFinite(input.channels?.[2])&&lastStateAt!==historyAt){
   historyAt=lastStateAt;history.push(input.channels[2]);if(history.length>48)history.shift();
  }
 }
 const calibrationComplete=()=>effectivePulses().every(validPulse);
 const validCurrent=()=>targetMotors(calMotor,calAll).every(n=>validPulse(pulses()[n-1]));
 const pageScope=()=>step===3?(accelAction.startsWith('MANUAL')?'ACCEL_MANUAL':'ACCEL'):
  ({1:'WIRING',5:'ESC',6:calAll?'ALL':'M'+calMotor})[step]||'';
 const accelSaved=()=>saved?.accelModel?.split(':').slice(0,2).some(value=>value==='1')||!!modelParts(saved?.accelModel)?.manual.some(Boolean);
 function pageSaved(page){
  if(!boardReady()||!saved.configValid)return false;
  if(page===1)return saved.configRevision>0&&wiringCompatible();
  if(page===3)return accelAction==='KEEP'&&accelSaved();
  if(page===5)return wiringCompatible()&&saved.escCalibrationSaved===true&&escDraft!=='cleared'&&!escAttempt;
  if(page===6)return wiringCompatible()&&saved.escCalibrationSaved===true&&!activeRun&&
   targetMotors(calMotor,calAll).every(n=>minimums[n-1]===null&&validPulse(pulses()[n-1])&&pulses()[n-1]===saved.observedMinimumUs[n-1]);
  return false;
 }
 function canSaveScope(scope){
  if(!scope||!boardReady()||!observedOff()||captureRequest||saved.capture?.running||saved.imu?.manualGyro)return false;
  if(scope==='RESET_ALL')return true;
  if(!saved.configValid)return false;
  if(scope.startsWith('RESET_'))return true;
  if(scope==='WIRING')return wiringValid();
  if(scope==='ACCEL')return accelAction.startsWith('CAPTURED:')&&saved.capture?.ready&&'CAPTURED:'+saved.capture.model===accelAction;
  if(scope==='ACCEL_MANUAL')return !manualError&&accelAction.startsWith('MANUAL:')&&!!modelParts(saved.accelModel);
  if(scope==='ESC')return wiringCompatible()&&escDraft===true;
  const selected=scope==='ALL'?motors:[Number(scope.slice(1))];
  return wiringCompatible()&&saved.escCalibrationSaved===true&&selected.every(n=>validPulse(pulses()[n-1]));
 }
 function canAdvance(){
  if([1,5,6].includes(step))return pageSaved(step);
  return step!==3||accelAction==='KEEP';
 }
 function renderPageSaves(){
  root.querySelectorAll('[data-save-page]').forEach(node=>{
   const page=Number(node.dataset.savePage),verified=pageSaved(page);
   node.dataset.saved=String(verified);
   node.textContent=ambiguousSave?.page===page?saveState||'Checking the board before retry':verified?'✓ Saved on board':
    !boardReady()?'Connect A2 with page-save firmware':page===3&&accelAction==='KEEP'?'Capture accelerometer values or enter manual offsets to save. Gyro bias is runtime-only.':'Unsaved · use Save on this page';
  });
 }
 function render(){
  refreshIdentity();
  const k=kit(),m=state||{};
  $('.a2-status').textContent=k.connected?`${k.kitName||k.board||'A2'} · ${k.transport?.toUpperCase()} · ${k.version||'—'}`:'No Kit connected';
  $('.a2-status').title=$('.a2-status').textContent;
  $('.a2-identity').innerHTML=view('Verified board',[
   ['Board',k.board||'Not detected'],['Kit',k.kitId||'—'],['Firmware',k.version||'—'],['Connection',k.connected?k.transport?.toUpperCase():'OFFLINE'],
   ['Wizard API',saved?.pageSaveVersion===1?'Supported · page saves':k.connected?'FlightCore 1.7.9+ required for page saves':'Waiting for verified A2'],
   ['USB Teacher',k.transport==='usb'?(k.adminUnlocked?'UNLOCKED':'Unlock in Devices & Firmware'):'—']
  ]);
  layouts[draft.layout].positions.forEach((p,i)=>$('[data-position="'+i+'"]').textContent=p);
  $('.a2-wiring-validation').textContent=wiringValid()?'':'Use each D0–D3 pin once.';
  $('.a2-wiring-validation').dataset.valid=String(wiringValid());
  $('.a2-save-state').textContent=wiringCompatible()?'Wiring saved on board':'Unsaved wiring · Save before output calibration';
  renderInputs();renderImu();renderEsc();renderOutputs();
  const signal=saved?.outputSignal;
  $('.a2-signal-status').innerHTML=view('Verified signal',[
   ['Active profile',signal?.profile||'Waiting for board'],['Period',signal?.hz?1000/signal.hz+' ms':'—'],
   ['Pulse range',signal?`${signal.minUs}–${signal.maxUs} µs`:'—'],['LEDC',signal?`Timer ${signal.timer} · ${signal.resolutionBits} bit`:'—'],
   ['M1–M4 pins',draft.layoutPins.join(' · ')],['Outputs',outputOff(m)?'PWM off':m.mode||'Unconfirmed'],
   ['Alternate profile compatibility','Physical validation pending']
  ]);
  $('.a2-report').innerHTML=view('Wizard review',reportRows());
  $('.a2-report-state').textContent=conflict?'Board configuration changed. Refresh board to reload its verified setup.':saveState||'Board-saved setup summary. Return to a page to save any pending changes.';
  const lock=!!working||motorClient.busy;
  $('[data-nav="-1"]').disabled=step===0||!!working;
  const scope=pageScope(),next=$('[data-nav="1"]'),saveButton=$('[data-action="save-page"]');
  const retry=!!ambiguousSave&&ambiguousSave.scope===scope;
  saveButton.hidden=!scope;
  saveButton.disabled=!!working||(!retry&&(!canSaveScope(scope)||pageSaved(step)));
  saveButton.textContent=['save-page','save-next'].includes(working)?'Saving…':retry?'Verify save':'Save';
  $('[data-action="verify-save"]').hidden=!ambiguousSave||retry;
  $('[data-action="verify-save"]').disabled=!!working;
  next.hidden=step===7;
  next.textContent=scope&&(canSaveScope(scope)||pageSaved(step))?'Save & Next':'Next';
  next.disabled=!!working||step===7||!(canAdvance()||canSaveScope(scope)||retry);
  $('#a2Layout').disabled=lock;
  root.querySelectorAll('[data-pin],[data-rotation]').forEach(input=>input.disabled=lock);
  renderPageSaves();
  const completed=[boardReady(),pageSaved(1),visited.has(2),pageSaved(3),!!signal,pageSaved(5),calibrationComplete()&&wiringCompatible()&&minimums.every(value=>value===null),visited.has(7)];
  root.querySelectorAll('[data-step]').forEach((button,i)=>{
   const done=visited.has(i)&&completed[i];
   button.dataset.completed=String(!!done);button.dataset.saved=String([1,3,5].includes(i)?pageSaved(i):i===6&&completed[6]);
   button.querySelector('.a2-step-number').textContent=button.dataset.saved==='true'?'✓':String(i+1);button.title=button.dataset.saved==='true'?'Saved on board':done?'Complete':'';
  });
  for(const a of ['reset-selected','reset-all'])$(`[data-action="${a}"]`).disabled=!boardReady()||!observedOff()||lock||!!ambiguousSave;
  for(const button of root.querySelectorAll('[data-action="sound"]')){
   button.textContent=cues.available?(cues.enabled?'Sound on':'Sound off'):'Sound unavailable';
   button.setAttribute('aria-pressed',String(cues.enabled&&cues.available));button.disabled=!cues.available;
  }
  $('.a2-diagnostics').textContent=state?JSON.stringify(step===3&&saved?saved:state,null,2):'No firmware response.';
  renderVisual();
 }
 function show(next){
  step=next;root.dataset.step=String(step);visited.add(step);operationError='';
  if(step===6)setCalPulse(currentResult());
  root.querySelectorAll('[data-panel]').forEach(p=>p.hidden=Number(p.dataset.panel)!==step);
  root.querySelectorAll('[data-step]').forEach(b=>{
   const n=Number(b.dataset.step);
   b.setAttribute('aria-current',n===step?'step':'false');
   b.dataset.visited=String(visited.has(n));
  });
  $('.a2-step-count').textContent=`${step+1} / ${steps.length}`;
  render();
  revealStep();
 }
 function revealStep(){
  const nav=$('.a2-steps'),active=nav.querySelector('[aria-current="step"]');
  if(!active)return;
  const viewport=nav.getBoundingClientRect(),button=active.getBoundingClientRect();
  if(button.left<viewport.left)nav.scrollLeft+=button.left-viewport.left;
  else if(button.right>viewport.right)nav.scrollLeft+=button.right-viewport.right;
 }
 async function navigate(next,footer=false,afterSave=false){
  if(working&&!afterSave)return;
  if(footer&&next>step&&!canAdvance())return;
  const run=++operation;
  cancelMotorConfirmations();
  if(motorClient.owner==='wizard'){
   activeRun=null;escAttempt=false;
   if(!outputOff(await motorClient.stop('wizard')))throw Error('PWM state is unconfirmed.');
  }
  if(run!==operation)return;
  if(step===6&&footer&&!calAll&&(next>step&&calMotor<4||next<step&&calMotor>1)){
   calMotor+=Math.sign(next-step);setCalPulse(currentResult());render();return;
  }
  show(Math.max(0,Math.min(steps.length-1,next)));
 }
 async function prepare(kind){
  if(!canStart()||!wiringCompatible()||!(kind==='esc'?escChecks():outputChecks()))throw Error('Save wiring, verify PWM is off and use the supported 50 Hz ESC profile. Complete the ESC procedure checks when calibrating ESCs.');
  await motorClient.begin('wizard',null,{...base,mapping:encode(draft)});
 }
 function ensureOperation(run){
  if(run!==operation||!live())throw Error('Wizard operation cancelled.');
 }
 function captureStable(run){
  if(!run?.ready||Date.now()-lastStateAt>=750||state.mode!=='SLIDER_TEST'||state.sliderMask!==run.mask)return 0;
  return run.motors.every(n=>state.pulseUs?.[n-1]===calTarget)&&validPulse(calTarget)?calTarget:0;
 }
 async function sliderAction(runId){
  if(activeRun&&motorClient.owner==='wizard'&&state?.mode==='SLIDER_TEST'){
   const run=activeRun,confirmed=captureStable(run);
   activeRun=null;
   const stopped=await motorClient.stop('wizard',{captureCalibration:true});
   ensureOperation(runId);
   if(!outputOff(stopped))throw Error('PWM state is unconfirmed.');
   if(confirmed&&stopped.stoppedSlider===true&&stopped.stoppedMask===run.mask&&stopped.stoppedPulseUs===confirmed){
    for(const n of run.motors)minimums[n-1]=confirmed;
    saveState='';setCalPulse(confirmed);
    message('Outputs off · Pending save');
   }else{
    setCalPulse(currentResult());
    throw Error('Outputs off. Repeat the attempt and wait for the displayed pulse acknowledgement before Stop.');
   }
   cues.play('stop');return;
  }
  if(!wiringCompatible()||saved?.escCalibrationSaved!==true||escAttempt)throw Error('Save wiring and ESC calibration before starting output calibration.');
  if(!window.confirm('Start '+(calAll?'all four motors':'motor M'+calMotor)+' at minimum pulse? Remove all propellers, verify motor/ESC wiring and power, and keep a physical power cutoff ready.'))return;
  const resume=currentResult();
  ensureOperation(runId);
  setCalPulse(1000);
  const run={mask:mask(calMotor,calAll),motors:targetMotors(calMotor,calAll),resume,ready:false,target:1000,ramp:0,rampPulse:1000};
  activeRun=run;
  await prepare('cal');ensureOperation(runId);
  await motorClient.startSlider(run.mask,()=>{
   if(activeRun!==run)throw Error('Slider cancelled.');
   if(!run.ramp)return calTarget;
   const acknowledged=state?.pulseUs?.[run.motors[0]-1];
   if(Date.now()>=run.ramp&&acknowledged===run.rampPulse)run.rampPulse=Math.min(calTarget,run.rampPulse+15);
   return run.rampPulse;
  },'wizard',30000,true);
  ensureOperation(runId);
  run.ready=true;run.lowSince=Date.now();
  cues.play('start');message('Live · board acknowledged 1000 µs.');
 }
 function snapshotSave(scope){
  const expectedWiring=config(saved),values=[...saved.observedMinimumUs];
  const intent={...base,scope,page:step,mapping:'',esc:saved.escCalibrationSaved,accel:saved.accelModel,payload:'',draft:config(draft),action:accelAction,motors:[]};
  if(scope==='WIRING'){
   intent.payload=encode(draft);
   if(!wiringCompatible()){values.fill(0);intent.esc=false;}
   Object.assign(expectedWiring,config(draft));
  }else if(scope==='ACCEL'){
   intent.payload=accelAction;intent.accel=accelAction.slice(9);
  }else if(scope==='ACCEL_MANUAL'){
   const model=modelParts(saved.accelModel);
   intent.payload=accelAction;
   intent.accel=model.base+manualSuffix(manualOffsets);
  }else if(scope==='ESC'){
   intent.payload='TONES_CONFIRMED';intent.esc=true;
  }else if(scope.startsWith('RESET_')){
   intent.payload='CONFIRM_RESET';
   if(scope==='RESET_ALL'){Object.assign(expectedWiring,defaults());values.fill(0);intent.esc=false;intent.accel='0:0:0:0:0:1000:1000:1000:0:0:0';}
   if(scope==='RESET_ACCEL')intent.accel='0:0:0:0:0:1000:1000:1000:0:0:0';
   if(scope==='RESET_ESC')intent.esc=false;
   if(scope==='RESET_OUTPUT')values.fill(0);
  }else{
   intent.motors=scope==='ALL'?motors:[Number(scope.slice(1))];
   intent.pulse=pulses()[intent.motors[0]-1];intent.payload=String(intent.pulse);
   for(const motor of intent.motors)values[motor-1]=intent.pulse;
  }
  intent.mapping=encode(expectedWiring,values);return intent;
 }
 function checkSaveReadback(board){
  const intent=ambiguousSave;
  if(!intent||!outputOff(board)||board.configVerified===false)return false;
  if(board.bootId!==intent.bootId||![intent.revision,intent.revision+1].includes(board.configRevision)||!board.configValid||
   encode(config(board),board.observedMinimumUs)!==intent.mapping||board.escCalibrationSaved!==intent.esc||board.accelModel!==intent.accel){
   if(board.configRevision!==intent.revision)conflict=true;
   return false;
  }
  base={bootId:board.bootId,revision:board.configRevision};saved=board;
  if(intent.scope==='WIRING'&&sameWiring(draft,intent.draft)){draft=config(board);loadWiring();}
  if(['ACCEL','ACCEL_MANUAL'].includes(intent.scope)&&accelAction===intent.action)accelAction='KEEP';
  if(intent.scope==='ACCEL_MANUAL'){
   manualEditing=false;manualLoadedModel='';syncManualFields(board.accelModel);
  }
  if(intent.scope==='ACCEL'){
   manualEditing=false;manualLoadedModel='';syncManualFields(board.accelModel);
  }
  if(intent.scope==='ESC')escDraft=false;
  for(const motor of intent.motors)if(minimums[motor-1]===intent.pulse)minimums[motor-1]=null;
  if(intent.scope==='RESET_ALL'){draft=config(board);loadWiring();minimums=[null,null,null,null];accelAction='KEEP';escDraft=escAttempt=false;
   manualEditing=false;manualLoadedModel='';syncManualFields(board.accelModel);}
  if(intent.scope==='RESET_ACCEL'){accelAction='KEEP';captureRequest=null;manualEditing=false;manualLoadedModel='';syncManualFields(board.accelModel);}
  if(intent.scope==='RESET_ESC')escDraft=escAttempt=false;
  if(intent.scope==='RESET_OUTPUT')minimums=[null,null,null,null];
  ambiguousSave=null;saveState=intent.scope.startsWith('RESET_')?'Reset saved on board':'Saved on board';conflict=false;operationError='';
  message('✓ '+saveState);cues.play('saved');return true;
 }
 async function save(scope){
  if(ambiguousSave){
   const pending=ambiguousSave,readback=await motorClient.wizardStatus();
   if(checkSaveReadback(readback)){
    if(pending.scope===scope)return;
   }else{
    if(ambiguousSave!==pending||readback.configVerified===false||readback.configRevision!==pending.revision)throw Error('Board state changed or readback is unverified.');
    ambiguousSave=null;
   }
  }
  if(scope===pageScope()&&pageSaved(step))return;
  if(!canSaveScope(scope))throw Error('Complete this page and verify PWM is off before saving.');
  const intent=snapshotSave(scope);
  ambiguousSave=intent;saveState='Saving this page · verifying board readback';
  render();
  let error='';
  try{
   await motorClient.wizardCommand('WIZARD_SAVE_PAGE',[intent.payload,intent.revision,`${intent.bootId}:${intent.scope}`],intent.bootId);
  }catch(e){error=e.message;}
  try{
   const readback=await motorClient.wizardStatus();
   if(checkSaveReadback(readback))return;
   if(readback.configVerified!==false&&readback.configRevision===intent.revision){
    ambiguousSave=null;saveState='Save failed · previous board settings verified. Page draft retained.';
   }else saveState='Save unverified · board readback differs from this page.';
  }catch{saveState='Save unverified · read back the board before retrying.';}
  throw Error(error||saveState);
 }
 async function act(name,run){
  if(name==='stop'){
   ++operation;activeRun=null;
   if(escAttempt&&escDraft!==true)escAttempt=false;
   const stopped=await motorClient.stop();
   if(!outputOff(stopped))throw Error('PWM state unconfirmed after STOP.');
   setCalPulse(currentResult());cues.play('stop');message('STOP acknowledged · PWM off.');return;
  }
  if(name==='connect'){location.hash='firmware';window.ZebjusDevicesWorkspace?.open('connection');return;}
  if(name==='detect'){
   if(conflict)resetContext();
   await motorClient.wizardStatus();message('Verified board status refreshed.');return;
  }
  if(name==='download'){
   const data={at:new Date().toISOString(),review:Object.fromEntries(reportRows()),physicalAcceptance:'NOT_VERIFIED'};
   const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');
   a.href=url;a.download='a2-setup-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
  }
  if(name==='save-page'||name==='save-next'){
   const scope=pageScope();
   if(scope&&(canSaveScope(scope)||ambiguousSave))await save(scope);
   if(name==='save-next')await navigate(step+1,true,true);
   return;
  }
  if(name==='verify-save'){if(ambiguousSave)await save(ambiguousSave.scope);return;}
  if(name.startsWith('reset-')){
   const selected=name==='reset-all'?'all':$('#a2ResetScope').value;
   const scope={all:'RESET_ALL',accel:'RESET_ACCEL',esc:'RESET_ESC',minimums:'RESET_OUTPUT'}[selected];
   if(!canSaveScope(scope))throw Error('Verify the board and outputs before resetting setup.');
   if(!window.confirm(`Reset ${selected==='all'?'all Wizard settings':selected} on the controller now?`))return;
   await save(scope);return;
  }
  if(name==='imu-zero-manual'){
   for(const axis of manualAxis)$('#a2Manual'+axis).value='0.000';
   updateManualDraft();message('Zero manual offsets staged. Save this page to apply to the board.');return;
  }
  if(name.startsWith('imu-')){
   const actions={'imu-gyro':'GYRO','imu-cancel':'CANCEL_GYRO','imu-reset':'RESET_GYRO','imu-level':'LEVEL','imu-face':'FACE','imu-clear':'CLEAR_ACCEL'};
   const capture=['imu-level','imu-face'].includes(name);
   if((capture||name==='imu-gyro')&&!$('#a2Still').checked)throw Error('Confirm the board is stationary in the requested pose.');
   if(name==='imu-clear'){
    captureRequest=null;
    if(accelAction.startsWith('CAPTURED:'))accelAction='KEEP';
   }
   const ack=await motorClient.wizardCommand('WIZARD_IMU',[actions[name],Number($('#a2Face').value),base.bootId],base.bootId);
   ensureOperation(run);
   if(capture){
    if(accelAction.startsWith('CAPTURED:'))accelAction='KEEP';
    captureRequest={sequence:ack.imuRequestSequence,at:Date.now()};
    updateCapture(ack.capture);
   }
   $('#a2Still').checked=false;return;
  }
  if(name==='high'){
   if(compatibleEsc()&&!window.confirm('Recalibrate ESC endpoints? Starting HIGH clears the previous confirmation on the board.'))return;
   await prepare('esc');ensureOperation(run);
   escDraft='cleared';escAttempt=true;$('#a2Tones').checked=$('#a2EscDisconnected').checked=false;
   await motorClient.command('CAL_HIGH',['POWER_DISCONNECTED']);ensureOperation(run);
   $('#a2PowerOff').checked=false;cues.play('high');message('HIGH acknowledged. Connect the motor battery.');return;
  }
  if(name==='low'){
   await motorClient.command('CAL_LOW');ensureOperation(run);cues.play('low');message('LOW acknowledged. Wait for PWM off and ESC success tones.');return;
  }
  if(name==='confirm-cal'){
   if(!escAttempt||!observedOff()||!checkList(['#a2Tones','#a2EscDisconnected']))throw Error('Confirm ESC success tones and battery disconnection after PWM off.');
   const ack=await motorClient.wizardCommand('WIZARD_ESC_CONFIRM',['TONES_CONFIRMED','BATTERY_DISCONNECTED',base.bootId],base.bootId);
   ensureOperation(run);
   if(!ack.escConfirmationStaged)throw Error('ESC confirmation was not acknowledged.');
   escDraft=true;escAttempt=false;saveState='';message('Confirmed · Save this page');return;
  }
  if(name==='cal-slider'){await sliderAction(run);return;}
  if(name==='resume-cal'){
   const sliderRun=activeRun;
   if(!sliderRun?.ready||!validPulse(sliderRun.resume)||sliderRun.resume===1000||!state?.pulseUs?.some(p=>p===1000))throw Error('Start at minimum before resuming a recorded pulse.');
   sliderRun.ramp=Math.max(Date.now(),sliderRun.lowSince+500);
   sliderRun.rampPulse=1000;sliderRun.target=sliderRun.resume;setCalPulse(sliderRun.resume);return;
  }
 }
 function perform(name){
  if(working&&name!=='stop')return;
  if(name==='stop'&&working==='stop')return;
  const run=operation;working=name;operationError='';render();
  act(name,run).catch(async e=>{
   if(run!==operation&&name!=='stop')return;
   operationError=e.message;message(e.message);
   if(['cal-slider','high','low'].includes(name)){
    activeRun=null;escAttempt=false;
    if(motorClient.owner==='wizard')await motorClient.stop('wizard').catch(()=>{});
    setCalPulse(currentResult());cues.play('error');
   }
  }).finally(()=>{if(working===name)working='';render();});
 }
 root.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;cues.unlock();
  const action=b.dataset.action;
  if(action==='sound'){
   cues.setEnabled(!cues.enabled);
   try{localStorage.setItem('zebjus.setup.sound',cues.enabled?'on':'off');}catch{}
   if(cues.enabled)cues.play('start');
   render();return;
  }
  if(action){perform(action);return;}
  if(b.dataset.nav==='1'&&step!==7&&pageScope()){perform('save-next');return;}
  if(b.dataset.step!==undefined||b.dataset.nav){
   const next=b.dataset.nav?step+Number(b.dataset.nav):Number(b.dataset.step);
   if(next!==step)void navigate(next,!!b.dataset.nav).catch(e=>message(e.message));
  }
 });
 root.addEventListener('input',e=>{
  if(e.target.id==='a2CalAll')return;
  if(e.target.matches('[data-manual-axis]')){updateManualDraft();render();return;}
  if(e.target.matches('#a2Layout,[data-pin],[data-rotation]')){
   draft=readWiring();minimums=[null,null,null,null];if(escDraft===true)escDraft=false;
   escAttempt=false;saveState='';
   setCalPulse(currentResult());
  }else if(e.target.id==='a2CalPulse'&&activeRun){
   activeRun.ramp=0;activeRun.target=Number(e.target.value);setCalPulse(activeRun.target);
  }
  render();
 });
 root.addEventListener('change',e=>{
  if(e.target.id==='a2CalAll'&&!motorClient.busy){calAll=e.target.checked;setCalPulse(currentResult());}
  if(e.target.id==='a2Face')$('#a2Still').checked=false;
  render();
 });
 window.addEventListener('zebjus:motor-state',e=>{if(live())receive(e.detail);});
 const observe=()=>{
  if(!live()){
   if(working)cancelMotorConfirmations();
   if(motorClient.owner==='wizard'){++operation;activeRun=null;escAttempt=false;void motorClient.stop('wizard').catch(()=>{});}
   return;
  }
  render();
  if(!kit().connected||polling||motorClient.busy||working||Date.now()<nextPollAt)return;
  polling=true;const started=Date.now();
  const read=step===2?motorClient.status():motorClient.wizardStatus();
  read.then(()=>{readFailures=0;nextPollAt=Math.max(Date.now(),started+(step===2?100:step===3?300:850));})
   .catch(e=>{readError=e.message;readFailures=Math.min(5,readFailures+1);nextPollAt=Date.now()+Math.min(2400,100*2**readFailures);render();})
   .finally(()=>{polling=false;});
 };
 setInterval(observe,100);
 window.addEventListener('resize',revealStep);
 new MutationObserver(()=>{observe();revealStep();}).observe(document.getElementById('tab-setup'),{attributes:true,attributeFilter:['class']});
 show(0);observe();
}
