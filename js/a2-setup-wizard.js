import {motorClient,confirmMotor} from './motor-setup.js';
import {layouts,stepVisual} from './a2-setup-visuals.js';
const root=document.getElementById('a2SetupRoot');
if(root){
 const steps=['Board','Wiring','Inputs','ESC calibration','Motor test','Report'];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let step=0,state=null,lastStateAt=0,polling=false,working=false,draftDirty=false,identity='',calFinished=false,calConfirmed=false;
 let draft={layout:'A2_QUAD_X',layoutPins:['D0','D1','D2','D3'],rotations:['CW','CCW','CW','CCW']};
 const pendingMinimum={},observations={},history=[];
 root.innerHTML=`<header class="a2-title"><div><small>AERION · HARDWARE SETUP</small><h2>A2 Setup Wizard</h2></div><button class="btn danger" data-action="stop">STOP outputs</button></header>
 <div class="a2-status" role="status">Waiting for a verified controller</div>
 <nav class="a2-steps" aria-label="Setup steps">${steps.map((s,i)=>`<button data-step="${i}"><span>${i+1}</span>${s}</button>`).join('')}</nav>
 <div class="a2-columns"><main class="a2-content">
 <section data-panel="0"><small class="a2-eyebrow">01 / IDENTIFY</small><h3>Connect your board</h3><p>Connect in Devices &amp; Firmware. This page follows the selected, verified Kit over USB, AP or STA.</p><div class="a2-identity"></div><div class="a2-actions"><button class="btn" data-action="detect">Refresh board</button><button class="btn ghost" data-action="connect">Open connection</button></div><div class="a2-note">USB setup requires Teacher Unlock. Android Relay provides monitoring only. Initial USB access needs browser permission.</div></section>
 <section data-panel="1"><small class="a2-eyebrow">02 / CONFIGURE</small><h3>Layout &amp; ESC wiring</h3><p>Choose the frame and assign each logical motor to one A2 ESC signal pin. The preview follows your edits.</p>
 <label class="a2-layout-field">Frame layout<select id="a2Layout"><option value="A2_QUAD_X">Quad X</option><option value="A2_QUAD_PLUS">Quad +</option></select></label>
 <div class="a2-table-wrap"><table class="a2-wiring"><thead><tr><th>Motor / position</th><th>Signal pin</th><th>Expected direction</th></tr></thead><tbody>${[1,2,3,4].map((m,i)=>`<tr><td><b>M${m}</b><small data-position="${i}"></small></td><td><select data-pin="${i}" aria-label="M${m} signal pin">${[0,1,2,3].map(n=>`<option value="D${n}" ${n===i?'selected':''}>D${n}</option>`).join('')}</select></td><td><select data-rotation="${i}" aria-label="M${m} expected rotation"><option ${i%2===0?'selected':''}>CW</option><option ${i%2?'selected':''}>CCW</option></select></td></tr>`).join('')}</tbody></table></div>
 <p class="a2-wiring-validation" role="status"></p><div class="a2-note">Signal → selected D pin · signal ground → GND. Verify connector orientation and the board power circuit before attaching a BEC/5V lead. Rotation is a wiring expectation; change motor phase wires or supported ESC settings to reverse it.</div>
 <div class="a2-actions"><button class="btn" data-action="layout">Save wiring to board</button><button class="btn ghost" data-action="reload-layout">Load saved wiring</button></div><p class="a2-save-state">Not saved in this session. Changing wiring clears saved minimum-pulse observations.</p></section>
 <section data-panel="2"><small class="a2-eyebrow">03 / MONITOR</small><h3>Live input channels</h3><p class="a2-input">Waiting for a selected input.</p><div class="a2-channel-list">${['Roll','Pitch','Throttle','Yaw','Aux / ARM','Aux / mode','Aux 7','Aux 8'].map((name,i)=>`<div class="a2-channel" data-channel="${i}"><span>CH${i+1} <b>${name}</b></span><div class="a2-channel-track"><i></i></div><output>—</output></div>`).join('')}</div><div class="a2-note">Select the source in the header: PPM RX/TX, Android AP, Android WebRTC or WebApp Joystick. This step reads channels and does not start motors.</div><p>Move each stick and check direction, centre and endpoints. Unreported channels remain blank; stale data is not shown as live.</p></section>
 <section data-panel="3"><small class="a2-eyebrow">04 / CALIBRATE</small><h3>ESC endpoint calibration</h3><p>Use only ESCs that support 50 Hz PWM and 1000–2000 µs power-on calibration. Follow the tone sequence in the ESC manual.</p>
 <ol class="a2-cal-steps"><li data-cal-stage="power"><b>Separate controller power</b><span>Remove motor-battery power. Keep the A2 powered through a verified separate supply.</span></li><li data-cal-stage="high"><b>Send HIGH · 2000 µs</b><span>Start HIGH, then connect the motor battery. Wait for the ESC calibration prompt.</span></li><li data-cal-stage="low"><b>Send LOW · 1000 µs</b><span>After hearing the prompt, send LOW and wait for the 3-second phase to end.</span></li><li data-cal-stage="tones"><b>Confirm success tones</b><span>Only an operator or sensors can confirm the ESC accepted its endpoints.</span></li></ol>
 <label class="a2-check"><input type="checkbox" id="a2PowerOff"> Motor battery disconnected; controller power verified</label>
 <div class="a2-actions"><button class="btn" data-action="high">Start calibration · HIGH</button><button class="btn" data-action="low" disabled>Heard prompt · Send LOW</button></div><p class="a2-phase" role="status">Calibration not started.</p>
 <label class="a2-check"><input type="checkbox" id="a2Tones" disabled> I heard the success tones after LOW</label><button class="btn ghost" data-action="confirm-cal" disabled>Record successful calibration</button></section>
 <section data-panel="4"><small class="a2-eyebrow">05 / TEST</small><h3>Motor test &amp; minimum pulse</h3><p>Propellers removed. Secure the frame and keep a physical power cutoff within reach.</p>
 <div class="a2-fields"><label>Motor selection<select id="a2Motor"><option value="1">M1</option><option value="2">M2</option><option value="3">M3</option><option value="4">M4</option><option value="all">All four motors</option></select></label><label>Pulse (µs)<input id="a2Pulse" type="number" min="1000" max="2000" step="1" value="1000"></label></div>
 <div class="a2-slider"><label for="a2PulseSlider">Live test pulse <output id="a2PulseValue">1000 µs</output></label><input id="a2PulseSlider" type="range" min="1000" max="2000" step="1" value="1000" disabled><div><span>1000 · minimum</span><span>1500</span><span>2000 · maximum</span></div></div>
 <div class="a2-actions"><button class="btn" data-action="slider">Start live slider test · 30 s</button><button class="btn ghost" data-action="single">Pulse test · 800 ms</button></div><p class="a2-test-state" role="status">Outputs off. A live test always starts at 1000 µs.</p>
 <div class="a2-minimum-card"><h4>Find the minimum starting pulse</h4><p>Raise the slider slowly. When a motor starts reliably, select it below, confirm you observed spinning, and record its acknowledged pulse.</p><div class="a2-fields"><label>Observed motor<select id="a2ObservedMotor">${[1,2,3,4].map(m=>`<option value="${m}">M${m}</option>`).join('')}</select></label><label class="a2-check"><input id="a2Spinning" type="checkbox"> I observe this motor spinning</label></div><div class="a2-actions"><button class="btn ghost" data-action="observe-min">Record observed minimum</button><button class="btn" data-action="save-min">Stop &amp; save minimum pulses</button></div><div class="a2-minima"></div><small>Saved as observed starting pulses, not measured RPM. Saving stops the test first.</small></div>
 <div class="a2-secondary-test"><h4>Test from the selected input</h4><p>All four motors follow throttle for 10 seconds, capped at 1200 µs. Start with low, disarmed input. PPM: centre yaw, then hold yaw right 2 seconds; yaw left at low throttle stops. Android/WebApp: enable input ARM at low throttle. WebRTC: CH5 low at start, then high.</p><button class="btn ghost" data-action="input">Test selected input · all motors</button></div></section>
 <section data-panel="5"><small class="a2-eyebrow">06 / REVIEW</small><h3>Your setup report</h3><p>Saved board configuration, calibration observations and minimum starting pulses.</p><div class="a2-report"></div><button class="btn" data-action="download">Download setup report</button></section>
 <div class="a2-checks">${[['a2Props','All propellers removed'],['a2Pins','D0–D3 wiring and power connections verified'],['a2Profile','ESC supports 50 Hz / 1000–2000 µs PWM']].map(([id,label])=>`<label class="a2-check"><input type="checkbox" id="${id}">${label}</label>`).join('')}</div><p class="a2-message" role="status" aria-live="polite">Connect the board to begin.</p></main>
 <aside class="a2-visual" aria-label="Current setup step visualization"><div class="a2-visual-heading"><small>STEP VISUAL</small><h3 class="a2-visual-title"></h3></div><div class="a2-visual-scene"></div><div class="a2-pulses"></div><p class="a2-visual-description"></p></aside></div>
 <footer class="a2-footer"><button class="btn ghost" data-nav="-1">Back</button><span class="a2-step-count"></span><button class="btn" data-nav="1">Next</button></footer><details class="a2-diagnostics-box"><summary>Firmware diagnostics</summary><pre class="a2-diagnostics">No firmware response.</pre></details>`;
 const $=s=>root.querySelector(s),message=t=>$('.a2-message').textContent=t;
 const kit=()=>window.ZebjusKits?.getState?.()||{};
 const live=()=>document.getElementById('tab-setup')?.classList.contains('active')&&!document.hidden;
 const config=s=>({layout:s?.layout in layouts?s.layout:'A2_QUAD_X',layoutPins:s?.layoutPins||['D0','D1','D2','D3'],rotations:s?.rotations||['CW','CCW','CW','CCW']});
 function loadDraft(){draft=config(state);draftDirty=false;$('#a2Layout').value=draft.layout;draft.layoutPins.forEach((p,i)=>$(`[data-pin="${i}"]`).value=p);draft.rotations.forEach((r,i)=>$(`[data-rotation="${i}"]`).value=r);renderDraft();}
 function renderDraft(){const l=layouts[draft.layout];l.positions.forEach((p,i)=>$(`[data-position="${i}"]`).textContent=p);const unique=new Set(draft.layoutPins).size===4;$('.a2-wiring-validation').textContent=unique?'Four unique ESC outputs · D0–D3':'Each motor needs a different pin. Duplicate assignments cannot be saved.';$('.a2-wiring-validation').dataset.valid=String(unique);$('[data-action="layout"]').disabled=!unique||working;renderVisual();}
 function selectedInput(){
  const s=state||{},valid=s.inputValid===true&&Date.now()-lastStateAt<1000;
  if(s.selectedInput==='ANDROID_WEBRTC'){
   const p=window.ZebjusSimulatorInputs?.snapshot?.(),sample=p?.sample;
   if(p?.fresh&&p.ageMs<=300&&p.peer?.approved&&(!sample?.kitId||sample.kitId===kit().kitId))return {source:'Android WebRTC · paired phone',valid:true,age:p.ageMs,channels:sample?.channels?[sample.channels.roll,sample.channels.pitch,sample.channels.throttle,sample.channels.yaw,sample.aux?.ch5,sample.aux?.ch6,null,null]:[]};
  }
  return {source:s.selectedInput||'Not selected',valid,age:s.inputAgeMs,channels:valid?(s.channels||[]):[]};
 }
 function renderVisual(){
  const k=kit(),input=selectedInput(),safe=Date.now()-lastStateAt<1200?state||{}:{...state,mode:'UNCONFIRMED',pulseUs:[]};
  const v=stepVisual(step,{kit:k,state:safe,draft,input,history,calConfirmed});
  $('.a2-visual-title').textContent=v.title;$('.a2-visual-description').textContent=v.description;
  // Keep rotor elements alive across heartbeat frames so their animation is continuous.
  const scene=$('.a2-visual-scene');
  const visualConfig=JSON.stringify(config(safe));
  if(step===4&&scene.dataset.layout===visualConfig&&scene.querySelector('[data-motor]')){
   const active=['SLIDER_TEST','SINGLE_TEST','ALL_TEST','INPUT_TEST'].includes(safe.mode);
   scene.querySelectorAll('[data-motor]').forEach(g=>{const n=Number(g.dataset.motor)-1,p=safe.pulseUs?.[n]||0,r=g.querySelector('.a2-rotor');g.classList.toggle('output-active',active&&p>1000);r?.classList.toggle('spinning',active&&p>1000);r?.style.setProperty('--spin',Math.max(.12,1.5-(p-1000)/750)+'s');const label=g.querySelector('.a2-svg-small');if(label)label.textContent=(safe.rotations?.[n]||(['CW','CCW','CW','CCW'][n]))+' · '+(p?p+' µs':'OFF');});
  }else{scene.innerHTML=v.html;scene.dataset.layout=step===4?visualConfig:'';}
  $('.a2-pulses').hidden=step!==4;
  $('.a2-pulses').textContent=safe.mode==='UNCONFIRMED'?'Output state unconfirmed':(safe.pulseUs||[]).map((p,i)=>`M${i+1} ${p?p+' µs':'OFF'}`).join(' · ');
 }
 function show(n){
  const next=Math.max(0,Math.min(5,n));if(next!==step&&motorClient.owner==='wizard')void motorClient.stop('wizard').catch(e=>message(e.message));step=next;
  root.querySelectorAll('[data-panel]').forEach(p=>p.hidden=Number(p.dataset.panel)!==step);
  root.querySelectorAll('[data-step]').forEach(b=>b.setAttribute('aria-current',Number(b.dataset.step)===step?'step':'false'));
  $('.a2-checks').hidden=![1,3,4].includes(step);$('.a2-step-count').textContent=`${step+1} / ${steps.length}`;
  $('[data-nav="-1"]').disabled=step===0;$('[data-nav="1"]').disabled=step===5;render();
 }
 function render(s){
  if(s){state=s;lastStateAt=Date.now();}
  const k=kit(),key=[k.kitId,k.bootId||state?.bootId,k.transport].join('|');
  if(key!==identity){identity=key;state=s||null;draftDirty=false;calFinished=calConfirmed=false;history.length=0;for(const group of [pendingMinimum,observations])for(const key of Object.keys(group))delete group[key];if(state)loadDraft();}
  if(state&&!draftDirty){const next=config(state);if(JSON.stringify(next)!==JSON.stringify(draft))loadDraft();}
  const m=state||{},connected=k.connected===true;
  $('.a2-status').textContent=connected?`${k.board||'Kit'} · ${k.transport?.toUpperCase()} · Firmware ${k.version||'—'} · ${m.mode||'READING STATUS'}`:'No verified Kit connected · Open Devices & Firmware';
  $('.a2-identity').innerHTML=`<dl>${[['Board',k.board||'Not detected'],['Kit name',k.kitName||'—'],['Device ID',k.kitId||'—'],['Firmware',k.version||'—'],['Connection',connected?(k.transport||'').toUpperCase():'OFFLINE'],['Motor setup',m.supported?(m.version>=2?'Supported · configurable wiring & sliders':'Supported · update to 1.7.0 for editable wiring/sliders'):'Waiting for verified A2'],['USB Teacher',k.transport==='usb'?(k.adminUnlocked?'UNLOCKED':'Unlock in Devices & Firmware'):'Not required for authorized AP/STA control']].map(([a,b])=>`<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>`;
  const input=selectedInput();$('.a2-input').textContent=`${input.source} · ${input.valid?'LIVE · '+Math.round(input.age||0)+' ms':'NO FRESH SIGNAL'} · Input ${m.inputArmed?'armed':'disarmed'}`;
  root.querySelectorAll('[data-channel]').forEach(row=>{const value=input.channels?.[Number(row.dataset.channel)],valid=input.valid&&Number.isFinite(value)&&value>=1000&&value<=2000;row.dataset.fresh=String(valid);row.querySelector('output').textContent=valid?value+' µs':'—';row.querySelector('i').style.width=valid?((value-1000)/10)+'%':'0%';});
  if(step===2&&input.valid&&Number.isFinite(input.channels?.[2])&&s){history.push(input.channels[2]);if(history.length>48)history.shift();}
  if(m.mode==='CAL_LOW')calFinished=false;
  if(m.mode==='DISABLED'&&m.reason==='CAL_FINISHED')calFinished=true;
  $('.a2-phase').textContent=m.mode==='CAL_HIGH'?`HIGH active · ${Math.ceil(m.remainingMs/1000)} s. Connect the motor battery and listen for the calibration prompt.`:m.mode==='CAL_LOW'?`LOW active · ${Math.ceil(m.remainingMs/1000)} s remaining.`:calFinished?'CAL_FINISHED · Output ended. Confirm the ESC success tones.':`${m.mode||'OFF'} · ${m.reason||'Calibration not started'}`;
  root.querySelectorAll('[data-cal-stage]').forEach(li=>li.classList.toggle('current',li.dataset.calStage===(m.mode==='CAL_HIGH'?'high':m.mode==='CAL_LOW'?'low':calFinished?'tones':'power')));
  $('[data-action="low"]').disabled=m.mode!=='CAL_HIGH'||working;$('#a2Tones').disabled=!calFinished;$('[data-action="confirm-cal"]').disabled=!calFinished||!$('#a2Tones').checked;
  const sliding=m.mode==='SLIDER_TEST'&&motorClient.owner==='wizard';$('#a2Motor').disabled=sliding;$('#a2PulseSlider').disabled=!sliding;
  $('[data-action="slider"]').disabled=working||m.version<2||!m.supported||sliding;
  $('.a2-test-state').textContent=sliding?`LIVE · ${Math.ceil((m.remainingMs||0)/1000)} s left · Firmware-acknowledged pulses shown at right.`:m.mode==='UNCONFIRMED'?'Output state unconfirmed. Reconnect before testing.':`Outputs ${m.motorsDisabled===true||m.mode==='DISABLED'?'off':m.mode||'not reported'} · ${m.reason||'Start at 1000 µs'}`;
  $('.a2-minima').innerHTML=[1,2,3,4].map((n,i)=>`<div><b>M${n}</b><span>${m.observedMinimumUs?.[i]?m.observedMinimumUs[i]+' µs saved':'Not recorded'}</span>${pendingMinimum[n]?`<em>${pendingMinimum[n]} µs pending</em>`:''}</div>`).join('');
  $('.a2-report').innerHTML=`<dl>${[['Board',k.kitId||'Not connected'],['Saved frame',layouts[m.layout]?.name||'Not reported'],['Saved pins',(m.layoutPins||[]).map((p,i)=>'M'+(i+1)+' → '+p).join(' · ')||'—'],['ESC calibration',calConfirmed?'Success tones confirmed by operator':'Not confirmed'],['Minimum pulses',(m.observedMinimumUs||[]).map((p,i)=>'M'+(i+1)+': '+(p?p+' µs':'—')).join(' · ')||'Not recorded'],['Physical flight acceptance','Pending']].map(([a,b])=>`<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join('')}</dl>`;
  $('.a2-diagnostics').textContent=state?JSON.stringify(state,null,2):'No firmware response.';renderVisual();
 }
 function checked(){if(!['#a2Props','#a2Pins','#a2Profile'].every(id=>$(id).checked))throw Error('Confirm propellers removed, wiring/power and the supported ESC profile below.');}
 async function prepare(modern=false){checked();if(modern&&state?.version<2)throw Error('Flash A2 FlightCore 1.7.0+ for editable wiring and slider tests.');if(!motorClient.active)await motorClient.begin('wizard');if(motorClient.owner!=='wizard')throw Error('Python owns motor setup. Stop Python first.');}
 function setPulse(value){const p=Number(value);$('#a2Pulse').value=value;$('#a2PulseSlider').value=value;$('#a2PulseValue').textContent=Number.isInteger(p)?p+' µs':'Enter a valid pulse';}
 async function act(name){
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
   draftDirty=false;render(result);loadDraft();await motorClient.stop('wizard');$('.a2-save-state').textContent='Saved to board and read back. Minimum observations reset if wiring changed.';message('Wiring saved and verified.');return;
  }
  if(name==='save-min'){
   const entries=Object.entries(pendingMinimum);if(!entries.length)throw Error('Record an observed minimum pulse first.');await motorClient.stop('wizard');await prepare(true);
   for(const [motor,pulse] of entries){render(await motorClient.command('MINIMUM',[motor,pulse,'OBSERVED_SPIN']));delete pendingMinimum[motor];}
   await motorClient.stop('wizard');message('Minimum pulses saved in the board.');render();return;
  }
  if(name==='high'){
   if(!$('#a2PowerOff').checked)throw Error('Disconnect motor-battery power and confirm the controller power arrangement.');await prepare();calFinished=calConfirmed=false;$('#a2Tones').checked=false;
   render(await motorClient.command('CAL_HIGH',['POWER_DISCONNECTED']));message('HIGH acknowledged. Connect the motor battery now and listen for the calibration prompt.');return;
  }
  if(name==='low'){await prepare();render(await motorClient.command('CAL_LOW'));message('LOW acknowledged. Wait for output to end and confirm success tones.');return;}
  if(name==='slider'){
   checked();await confirmMotor('Start a 30-second motor slider test? Remove all propellers and secure the frame. Selection: '+($('#a2Motor').value==='all'?'ALL FOUR MOTORS':'M'+$('#a2Motor').value)+'. You may command 1000–2000 µs. Keep a physical power cutoff ready.');
   setPulse(1000);await prepare(true);const mask=$('#a2Motor').value==='all'?15:1<<(Number($('#a2Motor').value)-1);
   await motorClient.startSlider(mask,()=>Number($('#a2Pulse').value));message('Live test started at 1000 µs. Raise the slider slowly; STOP ends the test.');return;
  }
  if(name==='single'){
   const motor=$('#a2Motor').value,pulse=Number($('#a2Pulse').value);if(!Number.isInteger(pulse)||pulse<1000||pulse>(state?.maxTestPulseUs||1200)||pulse%10)throw Error('For the 800 ms pulse test enter a 1000–'+(state?.maxTestPulseUs||1200)+' µs value in steps of 10. The live slider supports 1 µs steps.');
   checked();await confirmMotor('Run '+(motor==='all'?'ALL FOUR motors':'motor '+motor)+' at '+pulse+' µs for 800 ms? Confirm all propellers are removed.');await prepare();render(await motorClient.command(motor==='all'?'ALL':'SINGLE',[motor==='all'?1:motor,pulse,800]));return;
  }
  if(name==='input'){checked();await confirmMotor('Start a 10-second selected-input throttle test on ALL FOUR motors? Lower throttle and disarm input first. Output is capped at 1200 µs.');await prepare();render(await motorClient.command('INPUT',['selected',10000,'CONFIRM_ALL_MOTORS']));message('Input test started. Enable input ARM at low throttle or use the PPM yaw gesture.');}
 }
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.step!==undefined){show(Number(b.dataset.step));return;}if(b.dataset.nav){show(step+Number(b.dataset.nav));return;}if(!b.dataset.action||working&&b.dataset.action!=='stop')return;working=true;
  act(b.dataset.action).catch(async e=>{message(e.message);if(!['detect','reload-layout','observe-min'].includes(b.dataset.action))await motorClient.stop('wizard').catch(()=>{});}).finally(()=>{working=false;render();});
 });
 root.addEventListener('input',e=>{
  if(e.target.matches('#a2Layout,[data-pin],[data-rotation]')){draftDirty=true;draft={layout:$('#a2Layout').value,layoutPins:[...root.querySelectorAll('[data-pin]')].map(x=>x.value),rotations:[...root.querySelectorAll('[data-rotation]')].map(x=>x.value)};renderDraft();}
  if(e.target.id==='a2Pulse'||e.target.id==='a2PulseSlider')setPulse(e.target.value);
  if(e.target.id==='a2Tones'){if(!e.target.checked){calConfirmed=false;delete observations.calibration;}render();}
 });
 window.addEventListener('zebjus:motor-state',e=>{if(live())render(e.detail);});
 let lastPoll=0;
 const observe=()=>{
  if(!live()){if(motorClient.owner==='wizard')void motorClient.stop('wizard').catch(()=>{});return;}
  render();if(polling||motorClient.active||working||Date.now()-lastPoll<(step===2?250:1000))return;
  polling=true;lastPoll=Date.now();motorClient.status().then(render).catch(e=>{message(e.message);lastStateAt=0;render();}).finally(()=>polling=false);
 };
 setInterval(observe,250);new MutationObserver(observe).observe(document.getElementById('tab-setup'),{attributes:true,attributeFilter:['class']});renderDraft();show(0);observe();
}
