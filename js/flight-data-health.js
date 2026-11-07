const rows = [
  [
    ['attitude', 'ATTI', 'Attitude'],
    ['stabilization', 'STAB', 'Stabilization'],
    ['path', 'PATH', 'Navigation path'],
    ['plan', 'PLAN', 'Flight plan']
  ],
  [
    ['gps', 'GPS', 'GPS'],
    ['imu', 'SENSOR', 'IMU sensor'],
    ['airspeed', 'AIRSPD', 'Airspeed'],
    ['magnetometer', 'MAG', 'Magnetometer']
  ],
  [
    ['input', 'INPUT', 'Receiver input'],
    ['output', 'OUTPUT', 'Motor output'],
    ['i2c', 'I²C', 'I²C bus'],
    ['link', 'TELEMETRY', 'Telemetry link']
  ],
  [
    ['battery', 'BATT', 'Battery'],
    ['timing', 'TIME', 'Control timing'],
    ['setup', 'CONFIG', 'Saved setup'],
    ['qualification', 'QUAL', 'Physical qualification']
  ],
  [
    ['boot', 'BOOT', 'Boot health'],
    ['memory', 'MEM', 'Memory'],
    ['stack', 'STACK', 'Stack'],
    ['event', 'EVENT', 'Events'],
    ['cpu', 'CPU', 'CPU']
  ]
];

const statusNames = {good: 'OK', warning: 'Warning', error: 'Fault', unknown: 'Unavailable'};

export function createFlightDataHealth(container) {
  const tiles = new Map();
  const heading = document.createElement('h2');
  heading.textContent = 'System Health';
  const details = document.createElement('output');
  details.className = 'fd-system-health-detail';
  details.hidden = true;
  let selected = null;

  function describe(key) {
    const tile = tiles.get(key);
    return [tile.name + ' · ' + statusNames[tile.state], tile.label, tile.detail].filter(Boolean).join(' · ');
  }

  function renderDetails() {
    details.hidden = selected === null;
    if (selected !== null) {
      const description = describe(selected);
      if (details.textContent !== description) details.textContent = description;
    }
  }

  for (const [index, entries] of rows.entries()) {
    if (index === 2) container.append(heading);
    const row = document.createElement('div');
    row.className = 'fd-system-health-row';
    for (const [key, text, name] of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'viewer-allowed';
      button.textContent = text;
      button.dataset.health = key;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (selected !== null) tiles.get(selected).button.setAttribute('aria-pressed', 'false');
        selected = selected === key ? null : key;
        if (selected !== null) button.setAttribute('aria-pressed', 'true');
        renderDetails();
      });
      tiles.set(key, {button, name});
      row.append(button);
    }
    container.append(row);
  }
  container.append(details);

  function update(data) {
    for (const [key, tile] of tiles) {
      const reading = data?.health?.[key];
      const state = Object.hasOwn(statusNames, reading?.state) ? reading.state : 'unknown';
      const label = reading?.label || '';
      const detail = reading?.detail || '';
      if (tile.state === state && tile.label === label && tile.detail === detail) continue;
      Object.assign(tile, {state, label, detail});
      tile.button.dataset.tone = state;
      const description = describe(key);
      tile.button.title = description;
      tile.button.setAttribute('aria-label', description);
    }
    renderDetails();
  }
  update();
  return {update};
}
