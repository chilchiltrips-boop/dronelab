"use strict";

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
