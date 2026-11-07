// Schematic airframe projected into SVG. The preview camera is independent of
// the measured gravity tilt, and the propellers stay fixed in both views.
const centerX = 280;
const centerY = 108;
const defaultOrbit = -112;
const radians = degrees => degrees * Math.PI / 180;
const axes = ['roll', 'pitch', 'orbit'];

function solid(faces, outline, base, top, surface, side) {
  const lower = outline.map(([x, z]) => [x, base, z]);
  const upper = outline.map(([x, z]) => [x, top, z]);
  faces.push({ points: lower, fill: side }, { points: upper, fill: surface });
  for (let i = 0; i < outline.length; i++) {
    const next = (i + 1) % outline.length;
    faces.push({ points: [lower[i], lower[next], upper[next], upper[i]], fill: side });
  }
}

function circle(x, z, radius) {
  return Array.from({ length: 12 }, (_, index) => {
    const angle = index * Math.PI / 6;
    return [x + radius * Math.cos(angle), z + radius * Math.sin(angle)];
  });
}

function arm(x, z) {
  const length = Math.hypot(x, z);
  const alongX = x / length;
  const alongZ = z / length;
  return [[27, -12], [length, -8], [length, 8], [27, 12]].map(([along, offset]) => [
    along * alongX - offset * alongZ,
    along * alongZ + offset * alongX
  ]);
}

function airframe() {
  const faces = [];
  for (const [x, z] of [[-97, -97], [97, -97], [97, 97], [-97, 97]]) {
    const front = z < 0;
    solid(faces, arm(x, z), -8, 5, front ? '#ef846d' : '#b4cad9', front ? '#9d4d43' : '#5c7487');
    solid(faces, circle(x, z, 20), -9, 6, '#304b5f', '#152b3a');
    solid(faces, circle(x, z, 14), 6, 19, '#c0d4e1', '#496679');
    solid(faces, circle(x, z, 9), 19, 22, front ? '#ffb49b' : '#8cd7cf', '#415e70');
    // Blade angle is an illustration, independent of controller output.
    const direction = x * z > 0 ? 1 : -1;
    const blades = [[-45, -4], [-25, -9], [1, -3], [45, -3], [25, 9], [-1, 3]];
    solid(faces, blades.map(([a, b]) => [x + a, z + b + a * direction / 5]), 23, 25, '#87b4c8', '#3c657a');
    solid(faces, circle(x, z, 5), 25, 30, '#ebf5fa', '#586f82');
  }
  const plate = [[-36, -33], [-20, -49], [20, -49], [36, -33], [36, 29], [23, 43], [-23, 43], [-36, 29]];
  solid(faces, plate, -14, -8, '#356172', '#213949');
  solid(faces, plate, 7, 14, '#294a5c', '#132b3a');
  solid(faces, [[-22, -22], [22, -22], [22, 22], [-22, 22]], 14, 19, '#203b4c', '#102734');
  faces.push({ points: [[-13, 20, 7], [0, 20, -11], [13, 20, 7], [0, 20, 1]], fill: '#70ead3' });
  faces.push({ points: [[-12, 15, -36], [0, 15, -48], [12, 15, -36]], fill: '#ffab91' });
  return faces;
}

const frameFaces = airframe();
const gridLines = [];
for (let i = -125; i <= 125; i += 25) {
  gridLines.push([[-125, -38, i], [125, -38, i]], [[i, -38, -125], [i, -38, 125]]);
}

function projection(roll, pitch, orbit) {
  const rollCos = Math.cos(radians(roll));
  const rollSin = Math.sin(radians(roll));
  const pitchCos = Math.cos(radians(pitch));
  const pitchSin = Math.sin(radians(pitch));
  const orbitCos = Math.cos(radians(orbit));
  const orbitSin = Math.sin(radians(orbit));
  const elevationCos = Math.cos(radians(13));
  const elevationSin = Math.sin(radians(13));
  return ([x, y, z], vehicle) => {
    if (vehicle) {
      [x, y] = [rollCos * x + rollSin * y, rollCos * y - rollSin * x];
      [y, z] = [pitchCos * y - pitchSin * z, pitchSin * y + pitchCos * z];
    }
    [x, z] = [orbitCos * x + orbitSin * z, orbitCos * z - orbitSin * x];
    const height = elevationCos * y - elevationSin * z;
    const depth = elevationSin * y + elevationCos * z;
    const scale = 550 / (620 - depth);
    return { x: centerX + x * scale, y: centerY - height * scale, depth };
  };
}

function point({ x, y }) {
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

export function createFlightDataVehicle(container) {
  container.innerHTML = `
    <svg class="flight-data-vehicle-scene" viewBox="0 32 560 152" role="img" aria-label="Schematic 3D Quad X airframe. Coral arms mark the front.">
      <g data-vehicle-grid fill="none" stroke="#295064" stroke-width="1"></g>
      <g data-vehicle-frame stroke="#102834" stroke-width=".65" stroke-linejoin="round"></g>
    </svg>
    <div class="flight-data-vehicle-controls">
      <button type="button" class="viewer-allowed" data-vehicle-preview aria-pressed="false">Orbit preview</button>
      <button type="button" class="viewer-allowed" data-vehicle-left aria-label="Rotate preview left" hidden>↶</button>
      <button type="button" class="viewer-allowed" data-vehicle-right aria-label="Rotate preview right" hidden>↷</button>
    </div>
    <p class="flight-data-vehicle-caption" data-vehicle-caption></p>`;

  const grid = container.querySelector('[data-vehicle-grid]');
  const frame = container.querySelector('[data-vehicle-frame]');
  const caption = container.querySelector('[data-vehicle-caption]');
  const previewButton = container.querySelector('[data-vehicle-preview]');
  const leftButton = container.querySelector('[data-vehicle-left]');
  const rightButton = container.querySelector('[data-vehicle-right]');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const neutral = { roll: 0, pitch: 0, orbit: defaultOrbit };
  let current = { ...neutral };
  let target = { ...neutral };
  let start = { ...neutral };
  let startedAt = 0;
  let animation = 0;
  let preview = false;
  let orbit = defaultOrbit;
  let tilt = null;
  let visible = false;
  let hasTilt = false;
  let drawnOrbit = null;

  function draw() {
    const project = projection(current.roll, current.pitch, current.orbit);
    if (drawnOrbit !== current.orbit) {
      grid.innerHTML = gridLines.map(line => `<path d="M${point(project(line[0], false))} L${point(project(line[1], false))}"/>`).join('');
      drawnOrbit = current.orbit;
    }
    frame.innerHTML = frameFaces.map(face => {
      const projected = face.points.map(vertex => project(vertex, true));
      const depth = projected.reduce((total, vertex) => total + vertex.depth, 0) / projected.length;
      return { depth, fill: face.fill, outline: projected.map(point).join(' ') };
    }).sort((a, b) => a.depth - b.depth)
      .map(face => `<polygon fill="${face.fill}" points="${face.outline}"/>`).join('');
  }

  function cancelAnimation() {
    if (animation) cancelAnimationFrame(animation);
    animation = 0;
  }

  function active() {
    return visible && !document.hidden;
  }

  function step(time) {
    animation = 0;
    if (!active()) return;
    const progress = Math.min(1, (time - startedAt) / 200);
    const ease = 1 - (1 - progress) ** 3;
    for (const axis of axes) current[axis] = start[axis] + (target[axis] - start[axis]) * ease;
    draw();
    if (progress < 1) animation = requestAnimationFrame(step);
  }

  function refresh(snap = false) {
    const live = !preview && tilt;
    const nextCaption = preview
      ? 'Interactive airframe preview · use the arrow buttons to orbit.'
      : live
        ? `Stationary tilt · Roll ${tilt.roll.toFixed(1)}° · Pitch ${tilt.pitch.toFixed(1)}°`
        : 'Reference airframe · no tilt data';
    if (caption.textContent !== nextCaption) caption.textContent = nextCaption;
    const next = { roll: live ? tilt.roll : 0, pitch: live ? tilt.pitch : 0, orbit: preview ? orbit : defaultOrbit };
    if (!snap && axes.every(axis => next[axis] === target[axis])) return;
    cancelAnimation();
    target = next;
    if (!active()) return;
    if (snap || reducedMotion.matches) {
      current = { ...target };
      draw();
      return;
    }
    start = { ...current };
    // Follow the shorter path when a sensor angle crosses ±180°.
    start.roll += Math.round((target.roll - start.roll) / 360) * 360;
    start.orbit += Math.round((target.orbit - start.orbit) / 360) * 360;
    startedAt = performance.now();
    animation = requestAnimationFrame(step);
  }

  function togglePreview() {
    preview = !preview;
    orbit = defaultOrbit;
    previewButton.setAttribute('aria-pressed', String(preview));
    leftButton.hidden = rightButton.hidden = !preview;
    refresh(true);
  }

  function turnLeft() { orbit = (orbit + 330) % 360; refresh(); }
  function turnRight() { orbit = (orbit + 30) % 360; refresh(); }
  function visibilityChanged() { refresh(true); }

  previewButton.addEventListener('click', togglePreview);
  leftButton.addEventListener('click', turnLeft);
  rightButton.addEventListener('click', turnRight);
  document.addEventListener('visibilitychange', visibilityChanged);
  reducedMotion.addEventListener('change', visibilityChanged);
  refresh();
  draw();

  return {
    update({ tilt: nextTilt, visible: nextVisible = true } = {}) {
      const visibilityChanged = visible !== nextVisible;
      visible = nextVisible;
      tilt = nextTilt && Number.isFinite(nextTilt.roll) && Math.abs(nextTilt.roll) <= 180
        && Number.isFinite(nextTilt.pitch) && Math.abs(nextTilt.pitch) <= 90 ? nextTilt : null;
      const lostTilt = hasTilt && !tilt;
      hasTilt = !!tilt;
      refresh(visibilityChanged || (!preview && lostTilt));
    },
    destroy() {
      cancelAnimation();
      document.removeEventListener('visibilitychange', visibilityChanged);
      reducedMotion.removeEventListener('change', visibilityChanged);
      container.replaceChildren();
    }
  };
}
