"use strict";

// The original control demo runs only on Forge. No hardware transport.
if (document.getElementById("connect")) {

// Browser simulation only. This file sends no hardware commands.
const $ = (id) => document.getElementById(id);
const state = { connected:false, armed:false, recovering:false, throttle:1000, roll:0, pitch:0, yaw:0, heading:0 };
const inputs = ["roll", "pitch", "throttle", "yaw"];
let recoveryTimer = null, stickPointer = null, previousTime = performance.now();

function message(text) { $("message").textContent = text; }
function resetControls() {
  state.armed = false;
  state.throttle = 1000;
  state.roll = state.pitch = state.yaw = state.heading = 0;
  inputs.forEach((id) => { $(id).value = state[id]; });
  stickPointer = null;
}
function render() {
  $("connectionState").textContent = state.recovering ? "Reconnecting…" : state.connected ? "Connected · demo" : "Disconnected";
  $("connect").textContent = state.connected ? "Disconnect" : "Connect demo";
  $("connect").disabled = state.recovering;
  $("timeout").disabled = !state.connected;
  $("arm").disabled = !state.connected;
  $("arm").textContent = state.armed ? "Disarm demo" : "Arm demo";
  $("armState").textContent = state.armed ? "ARMED · DEMO" : "DISARMED";
  inputs.forEach((id) => { $(id).disabled = !state.connected; });
  $("stick").classList.toggle("inactive", !state.connected);
  $("knob").style.transform = `translate(${state.roll * 3.5}px, ${state.pitch * 3.5}px)`;
  $("rollValue").textContent = `${state.roll}°`;
  $("pitchValue").textContent = `${state.pitch}°`;
  $("throttleValue").textContent = `${state.throttle} µs`;
  $("yawValue").textContent = `${state.yaw}°/s`;
  const active = state.connected && state.armed;
  const motor = active ? Math.round((state.throttle - 1000) / 10) : 0;
  $("motorValue").innerHTML = `${motor}<small>%</small>`;
  $("motorBar").style.width = `${motor}%`;
  document.querySelector(".motor-bar").setAttribute("aria-valuenow", motor);
  $("telemetryRoll").innerHTML = `${(active ? state.roll : 0).toFixed(1)}<small>°</small>`;
  $("telemetryPitch").innerHTML = `${(active ? state.pitch : 0).toFixed(1)}<small>°</small>`;
  $("telemetryYaw").innerHTML = `${state.heading.toFixed(1)}<small>°</small>`;
  $("horizon").style.transform = active ? `translateY(${state.pitch * 2}px) rotate(${-state.roll}deg)` : "none";
}
$("connect").addEventListener("click", () => {
  state.connected = !state.connected;
  resetControls();
  message(state.connected ? "Demo connected. Keep throttle at 1000 µs to arm." : "Demo disconnected. Controls reset.");
  render();
});
$("arm").addEventListener("click", () => {
  if (!state.connected) return;
  if (state.armed) { resetControls(); message("Disarmed. All controls reset."); }
  else if (state.throttle !== 1000) { message("Set throttle to 1000 µs before arming."); }
  else { state.armed = true; message("Demo armed. Try the joystick and throttle."); }
  render();
});
$("stop").addEventListener("click", () => {
  clearTimeout(recoveryTimer);
  state.recovering = false;
  resetControls();
  message("Stopped and disarmed. All controls reset.");
  render();
});
$("timeout").addEventListener("click", () => {
  if (!state.connected) return;
  state.connected = false;
  state.recovering = true;
  resetControls();
  message("Demo link lost. Disarmed and reset. Retrying in 3 seconds…");
  render();
  recoveryTimer = setTimeout(() => {
    state.connected = true;
    state.recovering = false;
    message("Demo link restored. Controls are ready. Arm again to resume.");
    render();
  }, 3000);
});
inputs.forEach((id) => $(id).addEventListener("input", () => {
  if (!state.connected) return;
  state[id] = Number($(id).value);
  render();
}));
function moveStick(event) {
  if (!state.connected || event.pointerId !== stickPointer) return;
  const box = $("stick").getBoundingClientRect();
  let x = event.clientX - box.left - box.width / 2;
  let y = event.clientY - box.top - box.height / 2;
  const length = Math.hypot(x, y), limit = 70;
  if (length > limit) { x *= limit / length; y *= limit / length; }
  state.roll = Math.round(x / limit * 20);
  state.pitch = Math.round(y / limit * 20);
  $("roll").value = state.roll;
  $("pitch").value = state.pitch;
  render();
}
$("stick").addEventListener("pointerdown", (event) => {
  if (!state.connected || stickPointer !== null) return;
  stickPointer = event.pointerId;
  $("stick").setPointerCapture(event.pointerId);
  moveStick(event);
});
$("stick").addEventListener("pointermove", moveStick);
function releaseStick(event) {
  if (event.pointerId !== stickPointer) return;
  stickPointer = null;
  state.roll = state.pitch = 0;
  $("roll").value = $("pitch").value = 0;
  render();
}
["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => $("stick").addEventListener(type, releaseStick));
// Losing focus stops this simulation rather than preserving active inputs.
function pauseDemo() {
  if (!state.armed && stickPointer === null) return;
  resetControls();
  message("Demo paused and disarmed because the page lost focus.");
  render();
}
window.addEventListener("blur", pauseDemo);
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseDemo(); });
window.addEventListener("keydown", (event) => { if (event.key === "Escape") $("stop").click(); });
setInterval(() => {
  const now = performance.now(), dt = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  if (state.connected && state.armed && state.yaw) {
    state.heading = (state.heading + state.yaw * dt + 360) % 360;
    render();
  }
}, 50);
render();


}

// Local learning workspace. No network, GPIO mapping, flashing or device writes.
(() => {
  const byId = (id) => document.getElementById(id);
  const defaults = { kitName:'zebjus_drone_1', frame:'F450', board:'ESP32-C3', imu:'MPU6050' };
  const stages = [
    { name:'Frame', description:'Plan the frame and confirm its orientation.', tasks:['Identify the front of the frame.','Check the plates, arms and mounting hardware.','Keep the assembly unpowered.'] },
    { name:'Motors', description:'Plan one motor at each arm position.', tasks:['Identify four motor positions in your build.','Check motor mounting against the frame instructions.','Keep propellers removed during bench work.'] },
    { name:'Power system', description:'Plan the ESC and power distribution positions.', tasks:['Choose a position for the ESC and power distribution.','Plan cable routing and insulation.','Leave the battery disconnected.'] },
    { name:'Controller + IMU', description:'Plan controller orientation and the sensor mount.', tasks:['Identify the controller forward direction.','Plan the IMU orientation for your firmware.','Identify signal connections using the exact board pinout.'] },
    { name:'Final checks', description:'Review the assembly plan before continuing.', tasks:['Review fasteners, cable routing and connector labels.','Confirm that no propellers are installed for bench checks.','Continue to Trace for logical wiring practice.'] }
  ];
  const nets = [
    { id:'out1', from:'OUT1', to:'ESC1 input', color:'#44e0bd' },
    { id:'out2', from:'OUT2', to:'ESC2 input', color:'#67c8fa' },
    { id:'out3', from:'OUT3', to:'ESC3 input', color:'#dca5ff' },
    { id:'out4', from:'OUT4', to:'ESC4 input', color:'#ffd080' },
    { id:'sda', from:'SDA', to:'IMU SDA', color:'#e5a0a0' },
    { id:'scl', from:'SCL', to:'IMU SCL', color:'#a9bfff' },
    { id:'power', from:'3V3 (demo)', to:'IMU VCC (demo)', color:'#ff917b' },
    { id:'ground', from:'GND', to:'Common GND', color:'#b2becb' }
  ];
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem('zebjus.lab.' + key)) ?? fallback; } catch { return fallback; } }
  function save(key, data) { try { localStorage.setItem('zebjus.lab.' + key, JSON.stringify(data)); return true; } catch { return false; } }
  function validSettings(data) {
    return data && typeof data.kitName === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(data.kitName) &&
      ['F450','QAV250','Custom'].includes(data.frame) && ['ESP32-C3','ESP32-C6','Custom'].includes(data.board) && ['MPU6050','LSM6DS3','ISM330DHCX','Custom'].includes(data.imu);
  }
  const stored = read('settings', defaults);
  let settings = validSettings(stored) ? stored : { ...defaults };
  byId('kitLabel').textContent = settings.kitName;

  if (document.body.dataset.page === 'forge') {
    const loaded = read('assembly', []);
    let completed = Array.from({length:5}, (_,i) => Array.isArray(loaded) && loaded[i] === true);
    let current = Math.max(0, completed.findIndex(v => !v));
    function renderAssembly() {
      const count = completed.filter(Boolean).length;
      byId('assemblyCount').textContent = `${count} / 5`;
      byId('assemblyProgress').value = count;
      byId('assemblySteps').replaceChildren();
      stages.forEach((stage,i) => {
        const button = document.createElement('button');
        button.className = 'step' + (i === current ? ' selected' : '');
        button.setAttribute('aria-pressed', String(i === current));
        const number = document.createElement('span'); number.textContent = String(i+1).padStart(2,'0');
        const name = document.createElement('strong'); name.textContent = stage.name;
        button.append(number, name);
        if (completed[i]) { const done = document.createElement('em'); done.textContent = 'Done'; button.append(done); }
        button.addEventListener('click', () => { current=i; renderAssembly(); });
        byId('assemblySteps').append(button);
        byId('layer'+i).classList.toggle('active', i === current);
        byId('layer'+i).classList.toggle('done', completed[i]);
      });
      byId('stageNumber').textContent = `STAGE ${String(current+1).padStart(2,'0')}`;
      byId('stageTitle').textContent = stages[current].name;
      byId('stageDescription').textContent = stages[current].description;
      byId('stageTasks').replaceChildren(...stages[current].tasks.map(text => { const li=document.createElement('li'); li.textContent=text; return li; }));
      byId('previousStage').disabled = current === 0;
      byId('nextStage').disabled = current === 4;
      byId('completeStage').textContent = completed[current] ? 'Mark incomplete' : 'Mark complete';
    }
    byId('previousStage').addEventListener('click', () => { current=Math.max(0,current-1); renderAssembly(); });
    byId('nextStage').addEventListener('click', () => { current=Math.min(4,current+1); renderAssembly(); });
    byId('completeStage').addEventListener('click', () => {
      completed[current] = !completed[current];
      const saved = save('assembly', completed);
      byId('assemblyMessage').textContent = saved ? (completed.every(Boolean) ? 'All five checklist stages complete. Continue to Trace.' : 'Checklist updated in this browser.') : 'Checklist updated for this session. Browser storage is unavailable.';
      renderAssembly();
    });
    byId('resetAssembly').addEventListener('click', () => { completed=Array(5).fill(false); current=0; const saved=save('assembly',completed); renderAssembly(); byId('assemblyMessage').textContent=saved?'Checklist reset.':'Checklist reset for this session. Browser storage is unavailable.'; });
    renderAssembly();
  }

  if (document.body.dataset.page === 'trace') {
    const loaded = read('wires', []);
    let wires = Array.isArray(loaded) ? [...new Set(loaded.filter(id => nets.some(n => n.id === id)))] : [];
    nets.forEach(net => {
      for (const [select,label] of [['wireFrom',net.from],['wireTo',net.to]]) {
        const option = document.createElement('option'); option.value=net.id; option.textContent=label; byId(select).append(option);
      }
    });
    function draw() {
      const svg = byId('wireDiagram');
      // All labels below come from the fixed demo net catalog, never user text.
      svg.innerHTML = '<title>Logical controller to component connections</title><rect x="10" y="15" width="150" height="400" rx="10" fill="#1b2b3d" stroke="#415771"/><rect x="360" y="15" width="170" height="400" rx="10" fill="#1b2b3d" stroke="#415771"/><text x="85" y="42" text-anchor="middle" fill="#edf4fc" font-size="15">CONTROLLER</text><text x="445" y="42" text-anchor="middle" fill="#edf4fc" font-size="15">COMPONENTS</text>';
      nets.forEach((net,i) => {
        const y=75+i*43, linked=wires.includes(net.id);
        svg.innerHTML += `<text x="26" y="${y+5}" fill="#dce6f2" font-size="14">${net.from}</text><text x="382" y="${y+5}" fill="#dce6f2" font-size="14">${net.to}</text><circle cx="160" cy="${y}" r="5" fill="${net.color}"/><circle cx="360" cy="${y}" r="5" fill="${net.color}"/>`;
        if(linked) svg.innerHTML += `<path d="M160 ${y} C220 ${y},300 ${y},360 ${y}" stroke="${net.color}" stroke-width="3" fill="none"/>`;
      });
    }
    function renderWires() {
      byId('wireCount').textContent=`${wires.length} / 8`;
      byId('wireList').replaceChildren();
      if (!wires.length) { const li=document.createElement('li'); li.className='empty'; li.textContent='No wires connected yet.'; byId('wireList').append(li); }
      wires.forEach(id => {
        const net=nets.find(n=>n.id===id), li=document.createElement('li'), span=document.createElement('span'), button=document.createElement('button');
        span.textContent=`${net.from} — ${net.to}`; button.textContent='Remove'; button.setAttribute('aria-label',`Remove ${net.from} connection`);
        button.addEventListener('click',()=>{wires=wires.filter(w=>w!==id); persistWires('Wire removed.');});
        li.append(span,button); byId('wireList').append(li);
      });
      draw();
    }
    function persistWires(text) { const saved=save('wires',wires); renderWires(); byId('wireMessage').textContent=text+(saved?'':' Browser storage unavailable; changes last for this session.'); }
    byId('wireForm').addEventListener('submit', event => {
      event.preventDefault();
      const from=byId('wireFrom').value,to=byId('wireTo').value,net=nets.find(n=>n.id===from);
      if (!net) return;
      if(from !== to) { byId('wireMessage').textContent=`Connection mismatch: ${net.from} matches ${net.to}.`; return; }
      if(wires.includes(from)) { byId('wireMessage').textContent='This wire is already connected.'; return; }
      wires.push(from); persistWires(wires.length===8?'All eight demo signal connections complete.':'Wire connected.');
    });
    byId('autoWire').addEventListener('click',()=>{wires=nets.map(n=>n.id);persistWires('Reference wiring shown: eight logical demo connections.');});
    byId('clearWires').addEventListener('click',()=>{wires=[];persistWires('All demo wires cleared.');});
    renderWires();
  }

  if (document.body.dataset.page === 'core') {
    function fillSettings() { Object.keys(defaults).forEach(key=>{byId(key).value=settings[key];}); byId('kitLabel').textContent=settings.kitName; }
    byId('settingsForm').addEventListener('submit', event => {
      event.preventDefault();
      const next=Object.fromEntries(Object.keys(defaults).map(key=>[key,byId(key).value]));
      if(!validSettings(next)) { byId('settingsMessage').textContent='Check the project name and profile selections.'; return; }
      settings=next; const saved=save('settings',settings); fillSettings();
      byId('settingsMessage').textContent=saved?'Workspace settings saved in this browser. No hardware settings changed.':'Settings applied for this session. Browser storage unavailable.';
    });
    byId('resetSettings').addEventListener('click',()=>{settings={...defaults};const saved=save('settings',settings);fillSettings();byId('settingsMessage').textContent=saved?'Workspace settings reset.':'Settings reset for this session. Browser storage unavailable.';});
    byId('exportSettings').addEventListener('click',()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:1,workspace:settings},null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='zebjus-workspace-settings.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      byId('settingsMessage').textContent='Downloaded current saved settings. Save form changes before downloading.';
    });
    byId('firmwareFile').addEventListener('change',()=>{
      const file=byId('firmwareFile').files[0];
      byId('firmwareName').textContent=file?.name || 'No file selected';
      byId('firmwareSize').textContent=file?`${(file.size/1024).toFixed(1)} KB`:'—';
      const valid=file && /\.bin$/i.test(file.name) && file.size>0 && file.size<=16*1024*1024;
      byId('firmwareStatus').textContent=!file?'Waiting for a file':valid?'File selected · compatibility unchecked':'File selection rejected';
      byId('firmwareMessage').textContent=!file?'Hardware flashing will be added in a later step.':valid?'File preview only. No firmware was flashed.':'Select a non-empty .bin file up to 16 MB. No file was flashed.';
    });
    fillSettings();
  }
})();
