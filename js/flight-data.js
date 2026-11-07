import {appendFlightSample, buildFlightData} from './flight-data-model.js';
import {createFlightDataVehicle} from './flight-data-vehicle.js';
import {createFlightDataPfd} from './flight-data-pfd.js';
import {createFlightDataHealth} from './flight-data-health.js';
import {createFlightDataMap} from './flight-data-map.js';

const page = document.getElementById('tab-telemetry');
const byId = name => page.querySelector('#fd-' + name);
const axes = ['roll', 'pitch', 'yaw'];
const historyMs = 60000;
const pathLabels = {
  AUTO: 'Automatic', PPM: 'PPM RX', ANDROID_AP: 'Android AP',
  ANDROID_WEBRTC: 'Android WebRTC', WEB_STA: 'WebApp STA'
};
const transportLabels = {ap: 'Wi-Fi AP', sta: 'Wi-Fi STA', usb: 'USB', 'android-relay': 'Android relay'};
const set = (name, value) => {
  const node = byId(name);
  if (node.textContent !== value) node.textContent = value;
};
function pill(node, text, tone) {
  if (node.textContent !== text) node.textContent = text;
  node.dataset.tone = tone;
}
const fixed = (n, unit, digits = 0) => Number.isFinite(n) ? n.toFixed(digits) + unit : '—';

let samples = [];
let vehicle;
let instruments;
let systemHealth;
let timer;

function renderChart(data, now) {
  // Polling changes only display age; fresh observations have their own sequence.
  // A stale interval breaks the trace, so a line never bridges a link gap.
  samples = data.sample ? appendFlightSample(samples, data).filter(sample => now - sample.at <= historyMs) : [];
  const plotted = samples.length > 1;
  const scale = Math.max(10, ...samples.flatMap(sample => sample.rates.map(Math.abs)));
  for (const [axis, name] of axes.entries()) {
    const points = plotted ? samples.map(sample => {
      const x = 600 * (1 - (now - sample.at) / historyMs);
      const y = 63 - 51 * sample.rates[axis] / scale;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ') : '';
    byId('line-' + name).setAttribute('points', points);
  }
  byId('chart-empty').hidden = plotted;
  set('chart-note', plotted
    ? `Last 60 s · ±${Math.ceil(scale)} °/s · WebApp observations. Controller tick traces are in Diagnostics.`
    : 'Recent WebApp observations. Controller tick traces are in Diagnostics.');
}

function render() {
  const now = Date.now();
  const data = buildFlightData(window.ZebjusKits?.getState?.(), now);
  const {health, rc, flight, output, timing, tilt} = data;
  pill(byId('link'), health.link.label, health.link.state);
  set('kit', data.kitName || '—');
  set('kit-id', data.kitId || 'No verified identity');
  set('version', data.version ? 'v' + data.version : '—');
  set('transport', transportLabels[data.transport] || 'No connection');
  const inputArm = rc.inputArmed === true ? 'Input armed' : rc.inputArmed === false ? 'Input disarmed' : '—';
  set('input', rc.state === 'delayed' && rc.inputArmed !== null ? inputArm + ' · last observed' : inputArm);
  const path = pathLabels[rc.selectedPath];
  set('input-path', path || rc.source
    ? [path && 'Selected ' + path, rc.source && 'Observed ' + rc.source].filter(Boolean).join(' · ')
    : 'Source unavailable');
  let flightLabel = '—';
  if (flight && output.fresh) {
    if (flight.state === 'FAILSAFE') flightLabel = 'Failsafe';
    else if (flight.state === 'ARMED' && flight.authorized === true && output.disabled !== true) flightLabel = 'Rate flight armed';
    else if (flight.state === 'DISARMED') flightLabel = 'Flight disarmed';
  }
  set('flight', flightLabel);
  set('output', output.label.startsWith('Last observed')
    ? output.label + ' · ' + fixed(output.observedAgeMs, ' ms ago') : output.label);
  set('loop', fixed(timing.measuredHz, ' Hz', 1));
  set('loop-detail', timing.targetHz
    ? 'Target ' + fixed(timing.targetHz, ' Hz') + (timing.dtUs ? ' · ' + fixed(timing.dtUs, ' µs') : '')
    : 'Timing unavailable');
  const inputChannels = rc.channels;
  set('rc-caption', inputChannels ? 'Accepted input · ' + fixed(rc.ageMs, ' ms ago') : 'Accepted input');
  for (const [i, channel] of ['roll', 'pitch', 'throttle', 'yaw'].entries()) {
    set('rc-' + channel, fixed(inputChannels?.[i], ' µs'));
  }
  instruments.update(data);
  systemHealth.update(data);
  vehicle.update({tilt, visible: true});
  axes.forEach((axis, i) => set('rate-' + axis, fixed(data.rates?.[i], ' °/s', 1)));
  pill(byId('sample-age'), data.rates ? 'Sample age ' + fixed(data.imuAgeMs, ' ms') : 'No fresh sample',
    data.rates ? 'good' : health.imu.state);
  renderChart(data, now);
}

function refreshVisibility() {
  const visible = page.classList.contains('active') && !document.hidden;
  if (visible && !timer) {
    if (!instruments) {
      instruments = createFlightDataPfd(byId('pfd'));
      systemHealth = createFlightDataHealth(byId('health'));
      createFlightDataMap(byId('map'));
      vehicle = createFlightDataVehicle(byId('vehicle'));
    }
    render();
    timer = window.setInterval(render, 250);
  } else if (!visible && timer) {
    window.clearInterval(timer);
    timer = undefined;
    samples = [];
    vehicle.update({tilt: null, visible: false});
  }
}

byId('details-toggle').addEventListener('click', event => {
  const details = byId('details');
  details.hidden = !details.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!details.hidden));
});
byId('setup').addEventListener('click', () => document.querySelector('.tab[data-tab="setup"]').click());
byId('diagnostics').addEventListener('click', () => window.ZebjusDevicesWorkspace?.open('diagnostics'));
window.addEventListener('dronelab:tab', refreshVisibility);
window.addEventListener('dronelab:kit-link', () => { if (timer) render(); });
document.addEventListener('visibilitychange', refreshVisibility);
refreshVisibility();
