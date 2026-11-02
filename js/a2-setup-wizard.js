import {motorClient,confirmMotor,cancelMotorConfirmations,motorStopDescription} from './motor-setup.js';
import {setupMonitorSample} from './input-monitor.js';
import {layouts,stepVisual,updateMotorDiagram} from './a2-setup-visuals.js';
const root=document.getElementById('a2SetupRoot');
if(root){
 const steps=['Board','Wiring','Inputs','ESC calibration','Motor test','Report'];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let step=0,state=null,lastStateAt=0,polling=false,working=false,draftDirty=false,identity='',readError='',historyAt=0,calFinished=false,calConfirmed=false,operationError='',selectedMotor=1,allMotors=false,selectionPending=false;
 let draft={layout:'A2_QUAD_X',layoutPins:['D0','D1','D2','D3'],rotations:['CW','CCW','CW','CCW']},visualStep=-1,visualMarkup='';
 const pendingMinimum={},observations={},history=[];
 root.innerHTML=`<header class="a2-title"><h2>A2 Setup Wizard</h2><button class="btn danger" data-action="stop">STOP outputs</button></header>
 <div class="a2-status" role="status">Waiting for controller</div>
 <nav class="a2-steps" aria-label="Setup steps">${steps.map((s,i)=>`<button data-step="${i}"><span>${i+1}</span>${s}</button>`).join('')}</nav>
 <div class="a2-checks" role="group" aria-label="Output checks"><span class="a2-check-count">0 / 3 confirmed</span>${[['a2Props','Propellers removed'],['a2Pins','Wiring & power verified'],['a2Profile','50 Hz PWM · 1000–2000 µs ESC']].map(([id,label])=>`<label class="a2-check"><input type="checkbox" id="${id}">${label}</label>`).join('')}</div>
 <div class="a2-columns"><main class="a2-content">
 <section data-panel="0"><h3>Board connection</h3><div class="a2-identity"></div><div class="a2-actions"><button class="btn" data-action="detect">Refresh board</button><button class="btn ghost" data-action="connect">Open connection</button></div></section>
 <section data-panel="1"><h3>Frame &amp; wiring</h3>
 <label class="a2-layout-field">Frame layout<select id="a2Layout"><option value="A2_QUAD_X">Quad X</option><option value="A2_QUAD_PLUS">Quad +</option></select></label>
 <div class="a2-table-wrap"><table class="a2-wiring"><thead><tr><th>Motor / position</th><th>Signal pin</th><th>Direction</th></tr></thead><tbody>${[1,2,3,4].map((m,i)=>`<tr><td><b>M${m}</b><small data-position="${i}"></small></td><td><select data-pin="${i}" aria-label="M${m} signal pin">${[0,1,2,3].map(n=>`<option value="D${n}" ${n===i?'selected':''}>D${n}</option>`).join('')}</select></td><td><select data-rotation="${i}" aria-label="M${m} expected rotation"><option ${i%2===0?'selected':''}>CW</option><option ${i%2?'selected':''}>CCW</option></select></td></tr>`).join('')}</tbody></table></div>
 <p class="a2-wiring-validation" role="status"></p><div class="a2-actions"><button class="btn" data-action="layout">Save wiring to board</button><button class="btn ghost" data-action="reload-layout">Load saved wiring</button></div><p class="a2-save-state">Not saved.</p></section>
 <section data-panel="2"><h3>Live inputs</h3><p class="a2-input">No selected input</p><div class="a2-channel-list">${['Roll','Pitch','Throttle','Yaw','Aux / ARM','Aux / mode','Aux 7','Aux 8'].map((name,i)=>`<div class="a2-channel" data-channel="${i}"><span>CH${i+1} <b>${name}</b></span><div class="a2-channel-track"><i></i></div><output>—</output></div>`).join('')}</div><details class="a2-input-details"><summary>Signal details</summary><div class="a2-input-health" role="status"></div></details></section>
 <section data-panel="3"><h3>ESC calibration</h3>
 <ol class="a2-cal-steps"><li data-cal-stage="power"><b>Disconnect motor battery</b><span>Keep the controller powered separately.</span></li><li data-cal-stage="high"><b>HIGH · 2000 µs</b><span>Start HIGH, connect the battery, wait for the ESC prompt.</span></li><li data-cal-stage="low"><b>LOW · 1000 µs</b><span>Send LOW after the prompt; wait for completion.</span></li><li data-cal-stage="tones"><b>Confirm success tones</b></li></ol>
 <label class="a2-check"><input type="checkbox" id="a2PowerOff"> Motor battery disconnected; controller powered</label>
 <div class="a2-actions"><button class="btn" data-action="high">Start calibration · HIGH</button><button class="btn" data-action="low" disabled>Heard prompt · Send LOW</button></div><p class="a2-phase" role="status">Calibration not started.</p>
 <label class="a2-check"><input type="checkbox" id="a2Tones" disabled> Success tones heard after LOW</label><button class="btn ghost" data-action="confirm-cal" disabled>Record successful calibration</button></section>
 <section data-panel="4"><h3>Motor test</h3>
 <div class="a2-output-selection"><div class="a2-motor-selection"><span>Motor selection</span><div><output id="a2MotorSelection" data-selection="1">M1</output><button class="btn ghost" data-action="next-motor">Save &amp; next · M2 →</button></div></div><label>Pulse (µs)<input id="a2Pulse" type="number" min="1000" max="2000" step="1" value="1000"></label></div>
 <label class="a2-check a2-all-output"><input id="a2AllMotors" type="checkbox"> All motors</label><div class="a2-target-note" role="status"></div>
 <div class="a2-slider"><label for="a2PulseSlider"><span>Output pulse</span><output id="a2PulseValue">1000 µs</output></label><input id="a2PulseSlider" type="range" min="1000" max="2000" step="1" value="1000" disabled><div><span>1000</span><span>1500</span><span>2000 µs</span></div></div>
 <div class="a2-actions a2-test-actions"><button class="btn a2-test-toggle" data-action="slider">Start motor test · 30 s</button></div><p class="a2-test-state" role="status">Outputs off.</p></section>
 <section data-panel="5"><h3>Setup report</h3><div class="a2-report"></div><button class="btn" data-action="download">Download setup report</button></section>
 </main><aside class="a2-visual" aria-label="Current setup step visualization"><h3 class="a2-visual-title"></h3><div class="a2-visual-scene"></div><div class="a2-pulses"></div></aside></div>
 <section class="a2-output-extras" data-extra="4" hidden><div class="a2-minimum-card"><div class="a2-minimum-heading"><h4>Minimum starting pulses</h4><div class="a2-minima"></div></div><div class="a2-minimum-controls"><label>Observed motor<select id="a2ObservedMotor">${[1,2,3,4].map(m=>`<option value="${m}">M${m}</option>`).join('')}</select></label><label class="a2-check"><input id="a2Spinning" type="checkbox"> I observe this motor spinning</label><button class="btn ghost" data-action="observe-min">Record observed minimum</button><button class="btn" data-action="save-min">Stop &amp; save minimum pulses</button></div></div>
 <details class="a2-secondary-test"><summary>Additional output tests</summary><div class="a2-actions"><button class="btn ghost" data-action="single">Pulse test · 800 ms</button><button class="btn ghost" data-action="input">Test selected input · all motors</button></div><small>Input test: 10 s, maximum 1200 µs. Start with low throttle and disarmed input.</small></details></section>
 <p class="a2-message" role="status" aria-live="polite"></p><footer class="a2-footer"><button class="btn ghost" data-nav="-1">Back</button><span class="a2-step-count"></span><button class="btn" data-nav="1">Next</button><details class="a2-diagnostics-box"><summary>Firmware diagnostics</summary><pre class="a2-diagnostics">No firmware response.</pre></details></footer>`;
 const $=s=>root.querySelector(s),message=t=>$('.a2-message').textContent=t;
 const kit=()=>window.ZebjusKits?.getState?.()||{};
 const live=()=>document.getElementById('tab-setup')?.classList.contains('active')&&!document.hidden;
 const config=s=>({layout:s?.layout in layouts?s.layout:'A2_QUAD_X',layoutPins:s?.layoutPins||['D0','D1','D2','D3'],rotations:s?.rotations||['CW','CCW','CW','CCW']});
 function loadDraft(){draft=config(state);draftDirty=false;$('#a2Layout').value=draft.layout;draft.layoutPins.forEach((p,i)=>$(`[data-pin="${i}"]`).value=p);draft.rotations.forEach((r,i)=>$(`[data-rotation="${i}"]`).value=r);renderDraft();}
 function renderDraft(){const l=layouts[draft.layout];l.positions.forEach((p,i)=>$(`[data-position="${i}"]`).textContent=p);const unique=new Set(draft.layoutPins).size===4;$('.a2-wiring-validation').textContent=unique?'':'Use each D0–D3 pin once.';$('.a2-wiring-validation').dataset.valid=String(unique);$('[data-action="layout"]').disabled=!unique||working;renderVisual();}
 const selectionValue=()=>allMotors?'all':String(selectedMotor);
 const selectionLocked=()=>selectionPending||working||motorClient.busy&&motorClient.owner!=='wizard';
 function selectedMotorMask(){return ['INPUT_TEST','ALL_TEST'].includes(state?.mode)||allMotors?15:1<<(selectedMotor-1);}
 async function selectMotor(motor,all=false,{save=false}={}){
  if(selectionLocked()){render();return;}
  if(motor===selectedMotor&&all===allMotors&&!save)return;
  selectionPending=true;render();
  try{
   let savePending=false;
   if(save){
    if($('#a2Spinning').checked)await act('observe-min');
    const motors=allMotors?[1,2,3,4]:[selectedMotor];
    if(motors.some(n=>!pendingMinimum[n]&&!state?.observedMinimumUs?.[n-1]))throw Error('Observe spinning and record a starting pulse before Save & next.');
    savePending=Object.keys(pendingMinimum).length>0;
   }
   // A mask change retires the old slider pump and waits for STOP before
   // changing the selection. Selecting another output never starts it.
   if(motorClient.busy||kit().connected&&state?.mode&&state.mode!=='DISABLED'){message('Stopping outputs…');await motorClient.stop(motorClient.owner==='wizard'?'wizard':undefined);}
   if(savePending)await act('save-min');
   selectedMotor=motor;allMotors=all;setPulse(1000);$('#a2ObservedMotor').value=String(motor);$('#a2Spinning').checked=false;
   operationError='';message(all?'All motors selected.':save?`Minimum saved · M${motor} selected.`:`M${motor} selected.`);
  }catch(e){operationError=e.message;message(e.message);if(save&&motorClient.owner==='wizard')await motorClient.stop('wizard').catch(()=>{});}
  finally{selectionPending=false;render();}
 }
 function selectedInput(){
  const s=state||{};
  if(s.selectedInput==='ANDROID_WEBRTC'&&kit().connected){
   const p=window.ZebjusSimulatorInputs?.snapshot?.(),sample=p?.sample;
   if(p?.fresh&&p.ageMs<=300&&p.peer?.approved&&(!sample?.kitId||sample.kitId===kit().kitId))return {source:'Android WebRTC · paired phone',reported:true,monitoring:true,valid:true,age:p.ageMs,channels:sample?.channels?[sample.channels.roll,sample.channels.pitch,sample.channels.throttle,sample.channels.yaw,sample.aux?.ch5,sample.aux?.ch6,null,null]:[]};
  }
  return setupMonitorSample(state,lastStateAt,kit());
 }
 function renderVisual(){
  const k=kit(),input=selectedInput(),safe=Date.now()-lastStateAt<1200?state||{}:{...state,mode:'UNCONFIRMED',pulseUs:[]};
  const v=stepVisual(step,{kit:k,state:safe,draft,input,history,calConfirmed,selectedMask:selectedMotorMask()});
  $('.a2-visual-title').textContent=v.title;
  // Keep rotor elements alive across heartbeat frames so their animation is continuous.
  const scene=$('.a2-visual-scene');
  const visualConfig=JSON.stringify(config(safe));
  if(step===2&&scene.querySelector('[data-input-throttle]')){
   // Move the existing SVG nodes; rebuilding the sticks/trace every read
   // caused a visible flash even when the receiver observation stayed valid.
   const values=input.channels||[],thr=values[2],roll=values[0],pitch=values[1];
   const throttle=scene.querySelector('[data-input-throttle]'),sticks=scene.querySelector('[data-input-sticks]');
   scene.querySelector('[data-input-source] text').textContent=input.source||'NO SIGNAL';
   throttle.setAttribute('cy',Number.isFinite(thr)?197-(thr-1000)/10:147);
   sticks.setAttribute('cx',Number.isFinite(roll)?290+(roll-1500)/10:290);
   sticks.setAttribute('cy',Number.isFinite(pitch)?147-(pitch-1500)/10:147);
   for(const marker of [throttle,sticks])marker.setAttribute('class',input.monitoring?'a2-stick-knob':'a2-off-dot');
   scene.querySelector('[data-input-history]').setAttribute('points',history.map((value,i)=>`${28+i*344/Math.max(1,history.length-1)},${340-(value-1000)*.08}`).join(' '));
  }else if((step===1||step===4)&&scene.querySelector('[data-frame-diagram]')){
   updateMotorDiagram(scene,step===1?draft:safe,step===1?[]:safe.pulseUs,['SLIDER_TEST','SINGLE_TEST','ALL_TEST','INPUT_TEST'].includes(safe.mode),
    {selectedMask:step===1?0:selectedMotorMask(),preview:step===1,locked:selectionLocked()});
  }else{
   // Preserve static SVG nodes so connection/ESC animations survive status polls.
   if(visualStep!==step||visualMarkup!==v.html){scene.innerHTML=v.html;visualMarkup=v.html;}
   scene.dataset.layout=step===1||step===4?visualConfig:'';
  }
  if(step===4&&scene.querySelector('[data-frame-diagram]'))updateMotorDiagram(scene,safe,safe.pulseUs,['SLIDER_TEST','SINGLE_TEST','ALL_TEST','INPUT_TEST'].includes(safe.mode),{selectedMask:selectedMotorMask(),locked:selectionLocked()});
  visualStep=step;
  $('.a2-pulses').hidden=step!==4;
  $('.a2-pulses').textContent=safe.mode==='UNCONFIRMED'?'Output state unconfirmed':(safe.pulseUs||[]).map((p,i)=>`M${i+1} ${p?p+' µs':'OFF'}`).join(' · ');
 }
 function show(n){
  const next=Math.max(0,Math.min(5,n));if(next!==step){cancelMotorConfirmations();if(motorClient.owner==='wizard')void motorClient.stop('wizard').catch(e=>message(e.message));}step=next;root.dataset.step=String(step);
  root.querySelectorAll('[data-panel]').forEach(p=>p.hidden=Number(p.dataset.panel)!==step);
  root.querySelectorAll('[data-step]').forEach(b=>b.setAttribute('aria-current',Number(b.dataset.step)===step?'step':'false'));
  $('.a2-checks').hidden=![1,3,4].includes(step);root.querySelectorAll('[data-extra]').forEach(p=>p.hidden=Number(p.dataset.extra)!==step);$('.a2-step-count').textContent=`${step+1} / ${steps.length}`;
  $('[data-nav="-1"]').disabled=step===0;$('[data-nav="1"]').disabled=step===5;render();
 }
 function render(s){
  if(s){
   if(readError&&$('.a2-message').textContent.startsWith('Status refresh delayed ·'))message('Status refresh recovered.');
   state=s;lastStateAt=s.receivedAt||Date.now();readError='';
  }
  const k=kit(),key=[k.kitId,k.bootId||state?.bootId,k.transport,k.connectionGeneration].join('|');
  if(key!==identity){identity=key;state=s||null;nextPollAt=0;readFailures=0;draftDirty=false;calFinished=calConfirmed=false;history.length=0;historyAt=0;readError='';for(const group of [pendingMinimum,observations])for(const key of Object.keys(group))delete group[key];if(state)loadDraft();}
  if(state&&!draftDirty){const next=config(state);if(JSON.stringify(next)!==JSON.stringify(draft))loadDraft();}
  const m=state||{},connected=k.connected===true;
  $('[data-action="layout"]').disabled=working||new Set(draft.layoutPins).size!==4;
  $('.a2-status').textContent=connected?`${k.board||'Kit'} · ${k.transport?.toUpperCase()} · Firmware ${k.version||'—'} · ${m.mode||'READING STATUS'}`:'No Kit connected';
  $('.a2-identity').innerHTML=`<dl>${[['Board',k.board||'Not detected'],['Kit name',k.kitName||'—'],['Device ID',k.kitId||'—'],['Firmware',k.version||'—'],['Connection',connected?(k.transport||'').toUpperCase():'OFFLINE'],['Motor setup',m.supported?(m.version>=2?'Supported · configurable wiring & sliders':'Firmware update required'):'Waiting for verified A2'],['USB Teacher',k.transport==='usb'?(k.adminUnlocked?'UNLOCKED':'Unlock in Devices & Firmware'):'—']].map(([a,b])=>`<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>`;
  const remaining=Math.max(0,(m.remainingMs||0)-(lastStateAt?Date.now()-lastStateAt:0));
  const input=selectedInput(),inputAge=Number.isFinite(input.age)?(input.ageUpperBound?'≤ ':'')+Math.round(input.age)+' ms':'unknown';
  const inputState=input.monitoring?'MONITORING':input.reported?'LAST SAMPLE':connected?'WAITING FOR INPUT':'KIT OFFLINE';
  $('.a2-input').textContent=`${input.source} · ${inputState}${input.reported?' · sample age '+inputAge:''} · Input ${m.inputArmed?'armed':'disarmed'}`;
  root.querySelectorAll('[data-channel]').forEach(row=>{const value=input.channels?.[Number(row.dataset.channel)],reported=Number.isFinite(value)&&value>=1000&&value<=2000;row.dataset.fresh=String(reported&&input.monitoring);row.querySelector('output').textContent=reported?value+' µs':'—';row.querySelector('i').style.width=reported?((value-1000)/10)+'%':'0%';});
  const ppm=input.receiver;
  $('.a2-input-health').textContent=(input.receiverHealth||'PPM signal diagnostics are not verified yet.')+
   (ppm?` · ${ppm.captureBackend||'receiver'} · ${ppm.captureHz??'—'} Hz (target 50 Hz) · ${ppm.captureReady===false?'capture unavailable · ':''}losses ${ppm.losses||0} · invalid intervals ${ppm.faults||0} · observation ${Math.round(Math.max(0,Date.now()-input.receiverObservedAt))} ms old.`:'')+
   (readError?' Status refresh delayed; showing a bounded last observation.':'')+
   (m.selectedInput==='ANDROID_AP'?' Android AP is selected; PPM does not control the motors.':'');
  if(step===2&&input.monitoring&&Number.isFinite(input.channels?.[2])&&s&&lastStateAt!==historyAt){historyAt=lastStateAt;history.push(input.channels[2]);if(history.length>48)history.shift();}
  if(m.mode==='CAL_LOW')calFinished=false;
  if(m.mode==='DISABLED'&&m.reason==='CAL_FINISHED')calFinished=true;
  $('.a2-phase').textContent=m.mode==='CAL_HIGH'?`HIGH active · ${Math.ceil(remaining/1000)} s. Connect the motor battery and listen for the calibration prompt.`:m.mode==='CAL_LOW'?`LOW active · ${Math.ceil(remaining/1000)} s remaining.`:calFinished?'CAL_FINISHED · Output ended. Confirm the ESC success tones.':`${m.mode||'OFF'} · ${m.reason||'Calibration not started'}`;
  root.querySelectorAll('[data-cal-stage]').forEach(li=>li.classList.toggle('current',li.dataset.calStage===(m.mode==='CAL_HIGH'?'high':m.mode==='CAL_LOW'?'low':calFinished?'tones':'power')));
  $('[data-action="low"]').disabled=m.mode!=='CAL_HIGH'||working;$('#a2Tones').disabled=!calFinished;$('[data-action="confirm-cal"]').disabled=!calFinished||!$('#a2Tones').checked;
  $('[data-action="high"]').disabled=working||['CAL_HIGH','CAL_LOW'].includes(m.mode);
  const sliding=m.mode==='SLIDER_TEST'&&motorClient.owner==='wizard',locked=motorClient.busy;
  $('#a2AllMotors').disabled=selectionLocked();$('#a2AllMotors').checked=allMotors;$('#a2PulseSlider').disabled=!sliding||selectionPending;
  const selected=selectedMotor,layout=layouts[m.layout]||layouts.A2_QUAD_X;
  $('#a2MotorSelection').dataset.selection=selectionValue();$('#a2MotorSelection').textContent=allMotors?'All motors':'M'+selected;
  $('.a2-target-note').textContent=allMotors?'M1 · M2 · M3 · M4':`${layout.positions[selected-1]} · ${m.layoutPins?.[selected-1]||'D'+(selected-1)} · ${m.rotations?.[selected-1]||(['CW','CCW','CW','CCW'][selected-1])}`;
  $('.a2-check-count').textContent=['#a2Props','#a2Pins','#a2Profile'].filter(id=>$(id).checked).length+' / 3 confirmed';
  $('[data-action="next-motor"]').disabled=selectionLocked();$('[data-action="next-motor"]').textContent='Save & next · M'+(allMotors?1:selected%4+1)+' →';
  const toggle=$('[data-action="slider"]');toggle.textContent=sliding?'Stop motor test':'Start motor test · 30 s';toggle.classList.toggle('danger',sliding);
  $('[data-action="slider"]').disabled=selectionPending||working&&!sliding||m.version<2||!m.supported||locked&&!sliding;
  $('[data-action="single"]').disabled=working||selectionPending||motorClient.active;$('[data-action="input"]').disabled=working||selectionPending||motorClient.active;
  $('.a2-test-state').textContent=operationError?(m.mode==='UNCONFIRMED'?'Output state unconfirmed · ':'Motor test · ')+operationError:sliding?(Date.now()-lastStateAt>=750?'Waiting for motor ACK · output state unconfirmed. STOP or verify the connection.':`LIVE · ${Math.ceil(remaining/1000)} s · ACK ${m.roundTripMs??'—'} ms`):m.mode==='UNCONFIRMED'?'Output state unconfirmed · '+(m.reason||'Reconnect before testing.'): `Outputs ${m.motorsDisabled===true||m.mode==='DISABLED'?'off':m.mode||'not reported'} · ${motorStopDescription(m)}`;
  $('.a2-minima').innerHTML=[1,2,3,4].map((n,i)=>`<div><b>M${n}</b><span>${m.observedMinimumUs?.[i]?m.observedMinimumUs[i]+' µs saved':'Not recorded'}</span>${pendingMinimum[n]?`<em>${pendingMinimum[n]} µs pending</em>`:''}</div>`).join('');
  $('.a2-report').innerHTML=`<dl>${[['Board',k.kitId||'Not connected'],['Saved frame',layouts[m.layout]?.name||'Not reported'],['Saved pins',(m.layoutPins||[]).map((p,i)=>'M'+(i+1)+' → '+p).join(' · ')||'—'],['ESC calibration',calConfirmed?'Success tones confirmed by operator':'Not confirmed'],['Minimum pulses',(m.observedMinimumUs||[]).map((p,i)=>'M'+(i+1)+': '+(p?p+' µs':'—')).join(' · ')||'Not recorded'],['Physical flight test','Not recorded']].map(([a,b])=>`<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>`;
  $('.a2-diagnostics').textContent=state?JSON.stringify(state,null,2):'No firmware response.';renderVisual();
 }
 function checked(){if(!['#a2Props','#a2Pins','#a2Profile'].every(id=>$(id).checked))throw Error('Confirm the three output checks above.');}
 async function prepare(modern=false){checked();if(modern&&state?.version<2)throw Error('Flash A2 FlightCore 1.7.0+ for editable wiring and slider tests.');if(!motorClient.active)await motorClient.begin('wizard');if(motorClient.owner!=='wizard')throw Error('Python owns motor setup. Stop Python first.');}
 function setPulse(value){const p=Number(value);$('#a2Pulse').value=value;$('#a2PulseSlider').value=value;$('#a2PulseValue').textContent=Number.isInteger(p)?p+' µs':'Enter a valid pulse';}
 async function act(name){
  if(name==='slider'&&state?.mode==='SLIDER_TEST'&&motorClient.owner==='wizard'){await motorClient.stop('wizard');setPulse(1000);message('Test stopped. Outputs ended. Record or save your observed minimum.');return;}
  if(name==='stop'){await motorClient.stop();setPulse(1000);message('STOP acknowledged. Outputs ended.');return;}
  if(name==='connect'){location.hash='firmware';window.ZebjusDevicesWorkspace?.open('connection');return;}
  if(name==='detect'){render();render(await motorClient.status());message('Board status refreshed.');return;}
  if(name==='reload-layout'){render(await motorClient.status());loadDraft();message('Loaded board-saved layout.');return;}
  if(name==='confirm-cal'){if(!calFinished||!$('#a2Tones').checked)throw Error('Complete LOW and confirm the success tones first.');calConfirmed=true;observations.calibration={successTones:'user confirmed',at:new Date().toISOString()};message('Calibration success tones recorded.');render();return;}
  if(name==='observe-min'){
   const motor=Number($('#a2ObservedMotor').value),pulse=state?.pulseUs?.[motor-1];
   if(state?.mode!=='SLIDER_TEST'||!(state.sliderMask&(1<<(motor-1)))||Date.now()-lastStateAt>600||!$('#a2Spinning').checked||!Number.isInteger(pulse)||pulse<1000)throw Error('During a live slider test, select a running motor and confirm you observe spinning.');
   pendingMinimum[motor]=pulse;observations['M'+motor]={minimumPulseUs:pulse,basis:'user observed spinning',at:new Date().toISOString()};$('#a2Spinning').checked=false;message('Recorded M'+motor+' at '+pulse+' µs. Stop & save to persist it on the board.');render();return;
  }
  if(name==='download'){const data={at:new Date().toISOString(),kit:kit().kitId,firmware:state,observations,pendingMinimum,calibrationUserConfirmed:calConfirmed,physicalFlightTested:false},url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='a2-setup-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  if(name==='layout'){
   if(new Set(draft.layoutPins).size!==4)throw Error('Use each D0–D3 pin once.');await prepare(true);
   const result=await motorClient.command('LAYOUT',[draft.layout,draft.layoutPins.map(p=>p.slice(1)).join(''),draft.rotations.map(r=>r==='CW'?'0':'1').join('')]);
   draftDirty=false;render(result);loadDraft();await motorClient.stop('wizard');$('.a2-save-state').textContent='Wiring saved & verified.';message('Wiring saved and verified.');return;
  }
  if(name==='save-min'){
   const entries=Object.entries(pendingMinimum);if(!entries.length)throw Error('Record an observed minimum pulse first.');await motorClient.stop('wizard');await prepare(true);
   for(const [motor,pulse] of entries){render(await motorClient.command('MINIMUM',[motor,pulse,'OBSERVED_SPIN']));delete pendingMinimum[motor];}
   await motorClient.stop('wizard');message('Minimum pulses saved in the board.');render();return;
  }
  if(name==='high'){
   if(!$('#a2PowerOff').checked)throw Error('Disconnect motor-battery power and confirm the controller power arrangement.');await prepare();calFinished=calConfirmed=false;$('#a2Tones').checked=false;$('#a2PowerOff').checked=false;
   render(await motorClient.command('CAL_HIGH',['POWER_DISCONNECTED']));message('HIGH acknowledged. Connect motor battery.');return;
  }
  if(name==='low'){await prepare();render(await motorClient.command('CAL_LOW'));message('LOW acknowledged. Wait for output to end and confirm success tones.');return;}
  if(name==='slider'){
   checked();await confirmMotor('Start a 30-second motor slider test? Remove all propellers and secure the frame. Selection: '+(selectionValue()==='all'?'ALL FOUR MOTORS':'M'+selectionValue())+'. You may command 1000–2000 µs. '+(state?.timedBenchSupported===true?'The board holds the last commanded pulse until STOP or the 30-second limit, even if browser updates are delayed. ':'Legacy firmware stops on delayed updates; flash FlightCore 1.7.2+ for a board-timed manual test. ')+'Keep a physical power cutoff ready.');if(!live())throw Error('Motor start cancelled: return to Setup Wizard and start again.');
   setPulse(1000);await prepare(true);const mask=selectionValue()==='all'?15:1<<(Number(selectionValue())-1);
   await motorClient.startSlider(mask,()=>Number($('#a2Pulse').value));message('Live test started at 1000 µs.');return;
  }
  if(name==='single'){
   const motor=selectionValue(),pulse=Number($('#a2Pulse').value);if(!Number.isInteger(pulse)||pulse<1000||pulse>(state?.maxTestPulseUs||1200)||pulse%10)throw Error('For the 800 ms pulse test enter a 1000–'+(state?.maxTestPulseUs||1200)+' µs value in steps of 10. The live slider supports 1 µs steps.');
   checked();await confirmMotor('Run '+(motor==='all'?'ALL FOUR motors':'motor '+motor)+' at '+pulse+' µs for 800 ms? Confirm all propellers are removed.');await prepare();render(await motorClient.command(motor==='all'?'ALL':'SINGLE',[motor==='all'?1:motor,pulse,800]));return;
  }
  if(name==='input'){checked();await confirmMotor('Start a 10-second selected-input throttle test on ALL FOUR motors? Lower throttle and disarm input first. Output is capped at 1200 µs.');await prepare();render(await motorClient.command('INPUT',['selected',10000,'CONFIRM_ALL_MOTORS']));message('Selected-input test started.');}
 }
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.action==='next-motor'){void selectMotor(allMotors?1:selectedMotor%4+1,false,{save:true});return;}if(b.dataset.step!==undefined){show(Number(b.dataset.step));return;}if(b.dataset.nav){show(step+Number(b.dataset.nav));return;}if(!b.dataset.action||selectionPending&&b.dataset.action!=='stop'||working&&b.dataset.action!=='stop'&&!(b.dataset.action==='slider'&&state?.mode==='SLIDER_TEST'&&motorClient.owner==='wizard'))return;working=true;
  operationError='';
  act(b.dataset.action).catch(async e=>{operationError=e.message==='stop_maintenance_lower_throttle_and_disarm_input'?'Start blocked: lower receiver/controller throttle, turn ARM off and stop maintenance, then confirm again.':e.message;message(operationError);if(!['detect','reload-layout','observe-min'].includes(b.dataset.action))await motorClient.stop('wizard').catch(()=>{});}).finally(()=>{working=false;render();});
 });
 root.addEventListener('input',e=>{
  if(e.target.matches('#a2Layout,[data-pin],[data-rotation]')){draftDirty=true;draft={layout:$('#a2Layout').value,layoutPins:[...root.querySelectorAll('[data-pin]')].map(x=>x.value),rotations:[...root.querySelectorAll('[data-rotation]')].map(x=>x.value)};$('.a2-save-state').textContent='Unsaved changes';renderDraft();}
  if(e.target.id==='a2Pulse'||e.target.id==='a2PulseSlider')setPulse(e.target.value);
  if(e.target.id==='a2Tones'){if(!e.target.checked){calConfirmed=false;delete observations.calibration;}render();}
 });
 root.addEventListener('change',e=>{if(e.target.id==='a2AllMotors')void selectMotor(selectedMotor,e.target.checked);});
 const chooseDiagramMotor=e=>{const motor=e.target.closest('[data-motor]');if(step!==4||!motor||selectionLocked()||e.type==='keydown'&&!['Enter',' '].includes(e.key))return;e.preventDefault();void selectMotor(Number(motor.dataset.motor));};
 $('.a2-visual-scene').addEventListener('click',chooseDiagramMotor);$('.a2-visual-scene').addEventListener('keydown',chooseDiagramMotor);
 window.addEventListener('zebjus:motor-state',e=>{if(live())render(e.detail);});
 let nextPollAt=0,readFailures=0;
 const observe=()=>{
  if(!live()){if(working)cancelMotorConfirmations();if(motorClient.owner==='wizard')void motorClient.stop('wizard').catch(()=>{});return;}
  render();if(polling||motorClient.active||working||selectionPending||Date.now()<nextPollAt)return;
  polling=true;const started=Date.now();
  motorClient.status().then(()=>{readFailures=0;nextPollAt=Math.max(Date.now(),started+(step===2?100:1000));})
   .catch(e=>{readError=e.message;readFailures=Math.min(5,readFailures+1);nextPollAt=Date.now()+Math.min(2400,100*2**readFailures);message(kit().connected?'Status refresh delayed · '+e.message:'');render();})
   .finally(()=>{polling=false;});
 };
 setInterval(observe,100);new MutationObserver(observe).observe(document.getElementById('tab-setup'),{attributes:true,attributeFilter:['class']});renderDraft();show(0);observe();
}
