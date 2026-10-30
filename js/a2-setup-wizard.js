import {motorClient,confirmMotor} from './motor-setup.js';
const root=document.getElementById('a2SetupRoot');
if(root){
 const steps=['Board','Wiring','Input','ESC calibration','Motor test','Report'];
 let step=0,state=null,polling=false,working=false;
 root.innerHTML=`<div class="a2-title"><div><small>AERION · A2</small><h2>Setup Wizard</h2></div><button class="btn danger" data-action="stop">STOP outputs</button></div>
 <div class="a2-status" role="status">Connect a verified A2 in Devices &amp; Firmware.</div>
 <nav class="a2-steps" aria-label="Setup steps">${steps.map((s,i)=>`<button data-step="${i}">${i+1}. ${s}</button>`).join('')}</nav>
 <div class="a2-columns"><div class="a2-content">
 <section data-panel="0"><h3>Connected board</h3><p>USB, AP or STA uses your selected, verified Kit. USB setup requires Teacher Unlock in Devices &amp; Firmware.</p><pre class="a2-identity"></pre><button class="btn" data-action="detect">Refresh board</button><button class="btn ghost" data-action="connect">Open connection</button></section>
 <section data-panel="1"><h3>Motor layout &amp; wiring</h3><p>Quad X · top view. Match the forward arrow to the front of the frame.</p><table><thead><tr><th>Motor</th><th>Position</th><th>Signal</th><th>Rotation</th></tr></thead><tbody><tr><td>M1</td><td>Front left</td><td>D0</td><td>CW</td></tr><tr><td>M2</td><td>Front right</td><td>D1</td><td>CCW</td></tr><tr><td>M3</td><td>Back right</td><td>D2</td><td>CW</td></tr><tr><td>M4</td><td>Back left</td><td>D3</td><td>CCW</td></tr></tbody></table><p>Connect each ESC signal to its marked D pin and the signal ground to GND. Verify the actual connector orientation and power circuit before connecting a BEC/5V lead. Direction is confirmed by observing each motor.</p><button class="btn" data-action="layout">Save A2 Quad X</button></section>
 <section data-panel="2"><h3>Selected input</h3><p class="a2-input">Waiting for firmware input status.</p><label>Throttle <meter min="1000" max="2000" value="1000"></meter></label><p>PPM: throttle low, yaw centre, then yaw right for 2 seconds to enable the test; yaw left at low throttle stops. Android AP / WebApp STA: enable input ARM at low throttle after starting the test.</p><p>Android WebRTC bench: CH5 low before starting, then CH5 high enables output; the paired phone and fresh frames remain locked to this session. Input selection follows the header. Source or connection changes stop the test.</p></section>
 <section data-panel="3"><h3>ESC endpoint calibration</h3><p>Supported profile: 50 Hz PWM, 1000–2000 µs. Confirm that your ESC manual supports this profile and power-on endpoint calibration.</p><label><input type="checkbox" id="a2PowerOff"> Motor battery disconnected; controller has separate, verified power</label><button class="btn" data-action="high">Start calibration · HIGH</button><button class="btn" data-action="low">Heard prompt · Send LOW</button><p class="a2-phase">Calibration not started.</p><label><input type="checkbox" id="a2Tones"> I heard the success tones after LOW</label><p>Battery connection and tones are user observations. The board reports the signal phase.</p></section>
 <section data-panel="4"><h3>Motor test · propellers removed</h3><div class="a2-fields"><label>Motor<select id="a2Motor"><option value="1">M1 · D0</option><option value="2">M2 · D1</option><option value="3">M3 · D2</option><option value="4">M4 · D3</option></select></label><label>Test pulse (µs)<input id="a2Pulse" type="number" min="1000" max="1200" step="10" value="1050"></label></div><button class="btn" data-action="single">Test selected motor · 800 ms</button><p>Observe position and rotation. Pulse percentage is not measured RPM.</p><label><input type="checkbox" id="a2Rotation"> Selected motor position and direction confirmed</label><button class="btn ghost" data-action="record">Record observation</button><hr><p>Input test applies throttle to all four motors, capped at 1200 µs. It ends after 10 seconds.</p><button class="btn" data-action="input">Test selected input · all motors</button></section>
 <section data-panel="5"><h3>Setup report</h3><p>Records firmware status and your observations. Physical flight acceptance remains pending.</p><pre class="a2-observations">No motor observations recorded.</pre><button class="btn" data-action="download">Download report</button></section>
 <div class="a2-checks"><label><input type="checkbox" id="a2Props"> All propellers removed</label><label><input type="checkbox" id="a2Pins"> D0–D3 wiring and power connections verified</label><label><input type="checkbox" id="a2Profile"> ESC manual supports 50 Hz / 1000–2000 µs calibration</label></div>
 <p class="a2-message" role="status" aria-live="polite">Detect the board to read motor setup support.</p></div>
 <aside class="a2-visual"><svg viewBox="0 0 400 400" role="img" aria-label="Quad X motor layout, top view"><path d="M200 75V25m-12 16 12-16 12 16" stroke="#62dfc4" stroke-width="5" fill="none"/><text x="200" y="95" text-anchor="middle">FRONT</text><path d="m95 125 210 190m0-190L95 315" stroke="#38546a" stroke-width="25"/><rect x="158" y="180" width="84" height="80" rx="12" fill="#16354a" stroke="#62dfc4"/><text x="200" y="225" text-anchor="middle">A2</text>${[[95,125,1,'D0','CW'],[305,125,2,'D1','CCW'],[305,315,3,'D2','CW'],[95,315,4,'D3','CCW']].map(([x,y,m,p,d])=>`<g data-motor="${m}"><circle cx="${x}" cy="${y}" r="49" fill="#102637" stroke="#6093ae" stroke-width="2"/><text x="${x}" y="${y-10}" text-anchor="middle">M${m} · ${p}</text><text x="${x}" y="${y+15}" text-anchor="middle">${d}</text></g>`).join('')}</svg><b>Commanded output</b><div class="a2-pulses">M1 — · M2 — · M3 — · M4 —</div><small>Actual rotation and speed require observation or sensors.</small></aside></div>
 <footer class="a2-footer"><button class="btn ghost" data-nav="-1">Back</button><button class="btn" data-nav="1">Next</button></footer>
 <details><summary>Diagnostics</summary><pre class="a2-diagnostics">No firmware response.</pre></details>`;
 const $=s=>root.querySelector(s),observations={};
 const message=t=>$('.a2-message').textContent=t;
 function show(n){step=Math.max(0,Math.min(5,n));root.querySelectorAll('[data-panel]').forEach(p=>p.hidden=Number(p.dataset.panel)!==step);root.querySelectorAll('[data-step]').forEach(b=>b.setAttribute('aria-current',Number(b.dataset.step)===step?'step':'false'));}
 function render(s){
  state=s;const k=window.ZebjusKits?.getState?.();
  $('.a2-status').textContent=`${k?.board||'A2'} · ${k?.transport?.toUpperCase()||'—'} · Firmware ${k?.version||'not reported'} · ${s.mode||'UNKNOWN'} · Input ${s.selectedInput||'not reported'}`;
  $('.a2-identity').textContent=[k?.kitName,s.kitId,s.bootId,s.supported?'Motor setup supported':'Motor setup unavailable · flash A2 1.6.0+'].filter(Boolean).join('\n');
  $('.a2-input').textContent=`Selected ${s.selectedInput} · Receiving ${s.inputSource} · ${s.inputAgeMs==null?'No fresh signal':s.inputAgeMs+' ms old'} · Input ${s.inputArmed?'armed':'disarmed'}`;
  $('meter').value=s.throttle||1000;
  $('.a2-pulses').textContent=(s.pulseUs||[]).map((p,i)=>`M${i+1} ${p? p+' µs':'OFF'}`).join(' · ');
  $('.a2-phase').textContent=s.mode==='CAL_HIGH'?`HIGH active · ${Math.ceil(s.remainingMs/1000)} s remaining. Connect motor battery and listen for the ESC calibration prompt.`:s.mode==='CAL_LOW'?`LOW active · ${Math.ceil(s.remainingMs/1000)} s remaining.`:`${s.mode} · ${s.reason}`;
  $('.a2-diagnostics').textContent=JSON.stringify(s,null,2);
  root.querySelectorAll('[data-motor]').forEach(g=>g.classList.toggle('output-active',(s.pulseUs?.[Number(g.dataset.motor)-1]||0)>1000));
  $('[data-action="low"]').disabled=s.mode!=='CAL_HIGH'||working;
 }
 function checked(){if(!['#a2Props','#a2Pins','#a2Profile'].every(s=>$(s).checked))throw Error('Confirm propellers, wiring/power and the supported ESC profile first.');}
 async function prepare(){checked();if(!motorClient.active)await motorClient.begin('wizard');if(motorClient.owner!=='wizard')throw Error('Python owns motor setup. Stop Python first.');}
 async function act(name){
  if(name==='stop'){await motorClient.stop();message('STOP acknowledged. Start a new test to continue.');return;}
  if(name==='connect'){location.hash='firmware';window.ZebjusDevicesWorkspace?.open('connection');return;}
  if(name==='detect'){render(await motorClient.status());return;}
  if(name==='record'){if(!$('#a2Rotation').checked)throw Error('Observe and confirm position / direction first.');observations[$('#a2Motor').value]={positionAndDirection:'user confirmed',at:new Date().toISOString()};$('.a2-observations').textContent=JSON.stringify(observations,null,2);return;}
  if(name==='download'){const blob=new Blob([JSON.stringify({at:new Date().toISOString(),firmware:state,observations,escSuccessTones:$('#a2Tones').checked?'user confirmed':'not confirmed',physicalFlightTested:false},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='a2-setup-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  if(name==='high'&&!$('#a2PowerOff').checked)throw Error('Disconnect the motor battery and confirm the controller power arrangement.');
  if(name==='input')await confirmMotor('Start a 10-second throttle test on ALL FOUR motors? Remove all propellers, lower throttle and disarm the selected input. Output is capped at 1200 µs.');
  await prepare();
  const commands={layout:['LAYOUT',['A2_QUAD_X']],high:['CAL_HIGH',['POWER_DISCONNECTED']],low:['CAL_LOW',[]],single:['SINGLE',[$('#a2Motor').value,$('#a2Pulse').value,800]],input:['INPUT',['selected',10000,'CONFIRM_ALL_MOTORS']]};
  const [action,args]=commands[name];render(await motorClient.command(action,args));message('Firmware acknowledged '+action+'. '+(name==='input'?'Enable input ARM at low throttle, or use the PPM yaw gesture.':''));
  if(name==='layout')await motorClient.stop();
 }
 root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.step!==undefined){show(Number(b.dataset.step));return;}if(b.dataset.nav){show(step+Number(b.dataset.nav));return;}if(!b.dataset.action)return;
  if(working&&b.dataset.action!=='stop')return;working=true;
  act(b.dataset.action).catch(async e=>{message(e.message);if(b.dataset.action!=='detect')await motorClient.stop('wizard').catch(()=>{});}).finally(()=>{working=false;if(state)render(state);});
 });
 window.addEventListener('zebjus:motor-state',e=>render(e.detail));
 const observe=()=>{if(!document.getElementById('tab-setup')?.classList.contains('active')||document.hidden){if(motorClient.owner==='wizard')void motorClient.stop().catch(()=>{});return;}if(polling||motorClient.active||working)return;polling=true;motorClient.status().then(render).catch(e=>message(e.message)).finally(()=>polling=false);};
 setInterval(observe,1200);new MutationObserver(observe).observe(document.getElementById('tab-setup'),{attributes:true,attributeFilter:['class']});show(0);observe();
}
