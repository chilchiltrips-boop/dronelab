const instruments = [
  ['link', 'LINK', 'KIT OFFLINE'],
  ['flight', 'FLIGHT ARM', 'ARM UNKNOWN'],
  ['input', 'RC INPUT', 'RC INPUT'],
  ['caution', 'MASTER CAUTION', 'CAUTION N/A'],
  ['mode', 'FLIGHT MODE', 'MODE —'],
  ['imu', 'IMU', 'IMU'],
  ['output', 'MOTOR OUTPUT', 'OUTPUT']
];

const pfdPoint = (cx, cy, radius, degrees) => {
  const radians = degrees * Math.PI / 180;
  return [cx + radius * Math.sin(radians), cy - radius * Math.cos(radians)]
    .map(value => value.toFixed(2)).join(' ');
};

function arcTicks(cx, cy, radius, limit, step, major) {
  return Array.from({length: 2 * limit / step + 1}, (_, index) => {
    const angle = index * step - limit;
    const length = angle % major === 0 ? 7 : 3;
    return `M${pfdPoint(cx, cy, radius, angle)}L${pfdPoint(cx, cy, radius - length, angle)}`;
  }).join('');
}

function sideTape(x, label, unit) {
  const ticks = Array.from({length: 17}, (_, index) => {
    const y = 31 + 6 * index;
    return `M${x + 29} ${y}h-${index % 4 === 0 ? 7 : 4}`;
  }).join('');
  return `<g>
    <rect x="${x}" y="25" width="29" height="117" fill="#07101b" fill-opacity=".35" stroke="#acc4ce" stroke-width=".5"/>
    <path class="fd-pfd-lines" d="${ticks}"/>
    <text x="${x + 14.5}" y="34" class="fd-pfd-label">${label}</text>
    <path d="M${x} 69h23l8 10-8 10h-23z" fill="#090b0a" stroke="#e7f1f6" stroke-width=".8"/>
    <text x="${x + 13}" y="82" class="fd-pfd-label">—</text>
    <rect x="${x}" y="131" width="29" height="11" fill="#070908" fill-opacity=".85"/>
    <text x="${x + 14.5}" y="139" class="fd-pfd-unit">${unit}</text>
  </g>`;
}

const horizon = `
  <rect x="-540" y="-590" width="1400" height="668" fill="url(#fd-sky)"/>
  <rect x="-540" y="78" width="1400" height="668" fill="url(#fd-ground)"/>
  <path d="M-540 78H860" class="fd-pfd-lines fd-pfd-horizon-line"/>
  <path d="M138 39h44m-34 19h24m-15 10h6m-15 30h24m-25 19h26m-35 20h44"
    class="fd-pfd-lines fd-pfd-pitch"/>
  <g class="fd-pfd-ladder">
    <text x="132" y="42">20</text><text x="188" y="42">20</text>
    <text x="139" y="61">10</text><text x="181" y="61">10</text>
    <text x="160" y="100">−10</text><text x="160" y="119">−15</text><text x="160" y="139">−20</text>
  </g>`;

const scene = `
  <svg class="fd-pfd-scene" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="fd-sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="78">
        <stop stop-color="#053065"/><stop offset="1" stop-color="#086ac9"/>
      </linearGradient>
      <linearGradient id="fd-ground" gradientUnits="userSpaceOnUse" x1="0" y1="78" x2="0" y2="200">
        <stop stop-color="#814304"/><stop offset="1" stop-color="#261508"/>
      </linearGradient>
    </defs>
    <g data-pfd-reference>${horizon}</g>
    <g id="fd-horizon-world" visibility="hidden">${horizon}</g>
    <g class="fd-pfd-lines">
      <path d="M115 40A52 52 0 0 1 205 40 ${arcTicks(160, 58, 38, 60, 15, 30)}"/>
      <path d="M115 198A45 45 0 0 1 205 198 ${arcTicks(160, 199, 42, 90, 5, 30)}"/>
      <path d="M286 28Q304 79 286 133 M287 33l7-2 M291 48l8-2 M293 63l8-1 M294 79h10 M293 95l8 1 M290 112l8 2 M287 128l7 2"/>
    </g>
    <g class="fd-pfd-ladder">
      <text x="294" y="29">3</text><text x="301" y="47">2</text><text x="305" y="63">1</text>
      <text x="306" y="97">−1</text><text x="302" y="115">−2</text><text x="297" y="132">−3</text>
      <text x="127" y="182">W</text><text x="160" y="166">N</text><text x="193" y="182">E</text>
    </g>
    <path d="M156 15h8l-4 8z" fill="#fff"/>
    <path d="M110 78h17m66 0h17m-64 7 14-7 14 7m-20-4h12" fill="none" stroke="#ffea37" stroke-width="1.6"/>
    <path d="M160 185l1.3 5 4 2v1l-4-.7v2.8l1.5 1.1v.7l-2.8-.7-2.8.7v-.7l1.5-1.1v-2.8l-4 .7v-1l4-2z" fill="#fff"/>
    ${sideTape(45, 'SPD', 'm/s')}
    ${sideTape(245, 'ALT', 'm')}
  </svg>`;

function flightArmStatus(data) {
  if (!data.output.fresh) return ['ARM UNKNOWN', 'unknown', 'Fresh flight arm status unavailable'];
  if (data.flight?.state === 'FAILSAFE') return ['FAILSAFE', 'error', 'FlightCore reports failsafe'];
  if (data.flight?.state === 'ARMED' && data.flight.authorized === true && data.output.disabled === false) {
    return ['ARMED', 'warning', 'FlightCore reports physical flight output authorized'];
  }
  if (data.flight?.state === 'DISARMED') return ['DISARMED', 'good', 'FlightCore reports flight disarmed'];
  return ['ARM UNKNOWN', 'unknown', 'Flight arm status unconfirmed'];
}

export function createFlightDataPfd(container) {
  container.innerHTML = `
    <div class="fd-pfd-top">
      <div class="fd-pfd-gps" title="GPS position unavailable on A2">
        <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
          <path d="m10 6 3-3 4 4-3 3m-3 2 5 5 3-3-5-5m-6 1-5 5 5 5 5-5m1-12 6 6M2 18l4 4" fill="none" stroke="currentColor" stroke-width="1.4"/>
        </svg>
        <div><strong>NO GPS</strong><span class="fd-pfd-signal" aria-hidden="true"></span></div>
      </div>
      <div class="fd-pfd-dist" title="Distance unavailable without verified GPS"><span>SUM<br>DIST</span><strong>— m</strong></div>
      <div class="fd-pfd-heading" title="Heading unavailable on A2"><span>HDG</span><strong>—°</strong></div>
    </div>
    <div class="fd-pfd-main" data-tilt="unavailable">
      ${scene}
      <div class="fd-pfd-tilt" id="fd-tilt-overlay">
        <strong id="fd-tilt-status">NO ATTITUDE DATA</strong>
        <span>Reference display</span>
      </div>
      <div class="fd-pfd-tilt-readout" hidden>
        <span data-pfd-tilt-label>STATIONARY TILT</span>
        <span>R <output id="fd-roll" aria-label="Roll">—</output></span>
        <span>P <output id="fd-pitch" aria-label="Pitch">—</output></span>
      </div>
      <span class="fd-pfd-sr">Speed, altitude and heading unavailable on A2.</span>
    </div>
    <div class="fd-pfd-status" aria-label="Flight annunciators">
      ${instruments.map(([key, label, value]) => `
        <span data-pfd-status="${key}" data-tone="unknown" title="${label} · unavailable">${value}</span>`).join('')}
    </div>`;

  const select = selector => container.querySelector(selector);
  const annunciators = Object.fromEntries(instruments.map(([key]) => [key, select(`[data-pfd-status="${key}"]`)]));
  const world = select('#fd-horizon-world');
  const reference = select('[data-pfd-reference]');
  const main = select('.fd-pfd-main');
  const overlay = select('#fd-tilt-overlay');
  const readout = select('.fd-pfd-tilt-readout');
  const tiltLabel = select('[data-pfd-tilt-label]');
  const roll = select('#fd-roll');
  const pitch = select('#fd-pitch');
  const set = (node, value) => {
    if (node.textContent !== value) node.textContent = value;
  };
  const flag = (key, value, tone, title) => {
    const node = annunciators[key];
    set(node, value);
    if (node.dataset.tone !== tone) node.dataset.tone = tone;
    if (node.title !== title) node.title = title;
    node.setAttribute('aria-label', title);
  };

  function update(data) {
    const {health, tilt} = data;
    const hasTilt = tilt && Number.isFinite(tilt.roll) && Number.isFinite(tilt.pitch);
    main.dataset.tilt = hasTilt ? tilt.stationary ? 'stationary' : 'accel-reference' : 'unavailable';
    world.setAttribute('visibility', hasTilt ? 'visible' : 'hidden');
    reference.setAttribute('visibility', hasTilt ? 'hidden' : 'visible');
    overlay.hidden = Boolean(hasTilt);
    readout.hidden = !hasTilt;
    if (hasTilt) {
      const description = tilt.stationary ? 'Stationary tilt estimate'
        : 'Accelerometer reference. Motion can distort the estimate.';
      if (readout.title !== description) readout.title = description;
      set(tiltLabel, tilt.stationary ? 'STATIONARY TILT' : 'ACCEL REFERENCE');
      world.setAttribute('transform', `rotate(${-tilt.roll} 160 78) translate(0 ${tilt.pitch * 1.95})`);
    } else {
      world.removeAttribute('transform');
    }
    set(roll, hasTilt ? tilt.roll.toFixed(1) + '°' : '—');
    set(pitch, hasTilt ? tilt.pitch.toFixed(1) + '°' : '—');

    flag('link', data.connected ? data.transport.toUpperCase() : 'KIT OFFLINE', health.link.state, health.link.label);
    flag('flight', ...flightArmStatus(data));
    const inputLabel = data.rc.state === 'fresh' ? data.rc.source
      : data.rc.state === 'waiting' ? 'PPM WAIT' : 'RC INPUT';
    flag('input', inputLabel, health.input.state, health.input.label);
    const adverse = Object.values(health).filter(row => ['error', 'warning'].includes(row.state));
    const caution = adverse.some(row => row.state === 'error') ? 'error' : adverse.length ? 'warning' : 'unknown';
    flag('caution', 'MASTER CAUTION', caution, adverse.length
      ? adverse.map(row => row.label).join(' · ') : 'No current caution reported');
    flag('mode', data.mode?.toUpperCase() || 'MODE —', 'unknown', data.mode ? 'Flight mode ' + data.mode : 'Flight mode unavailable');
    flag('imu', 'IMU', health.imu.state, health.imu.label);
    flag('output', data.output.fresh && data.output.disabled === true ? 'PWM OFF' : 'OUTPUT',
      health.output.state, health.output.label);
  }

  return {update};
}
