const worldImage = new URL('../assets/flight-data-world.svg', import.meta.url).href;
const worldWidth = 720;
const worldHeight = 360;
const overview = {x: 368, y: 164, zoom: 2};
const maxZoom = 6;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createFlightDataMap(container) {
  container.innerHTML = `
    <div class="fd-map-toolbar">
      <h2>Map</h2>
      <span>Offline preview</span>
      <button type="button" data-map-reset class="viewer-allowed" title="Reset map view" aria-label="Reset map view">⌂</button>
    </div>
    <div class="fd-map-body">
      <div class="fd-map-viewport" tabindex="0" role="region"
        aria-label="Offline world map. Drag or use the arrow keys to pan. Use plus and minus to zoom.">
        <svg class="fd-map-canvas" aria-hidden="true" viewBox="221 45 294 238">
          <image width="720" height="360" href="${worldImage}"/>
        </svg>
      </div>
      <svg class="fd-map-compass" aria-hidden="true" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="11" fill="#4c5056" stroke="#9b9ba3"/>
        <path d="m25 12 3.5 9.5L38 25l-9.5 3.5L25 38l-3.5-9.5L12 25l9.5-3.5z" fill="#a3a3a9" stroke="#353a41"/>
        <path d="m25 12 3.5 9.5L25 25l-3.5-3.5z" fill="#8aadeb"/>
        <circle cx="25" cy="25" r="4" fill="#7499d5" stroke="#353a41"/>
        <g fill="#f1f1f1" text-anchor="middle" font-size="10" font-weight="bold">
          <text x="25" y="10">N</text><text x="43" y="28">E</text>
          <text x="25" y="48">S</text><text x="7" y="28">W</text>
        </g>
      </svg>
      <div class="fd-map-zoom" role="group" aria-label="Map zoom">
        <button type="button" class="viewer-allowed" data-map-zoom-in aria-label="Zoom in">+</button>
        <input type="range" min="0" max="${maxZoom}" value="${overview.zoom}" class="viewer-allowed" aria-label="Map zoom level">
        <button type="button" class="viewer-allowed" data-map-zoom-out aria-label="Zoom out">−</button>
      </div>
    </div>
    <div class="fd-map-footer">
      <strong>No GPS</strong><span>Position — · Altitude — · Speed —</span>
      <span class="fd-map-credit">Natural Earth</span>
    </div>`;

  const viewport = container.querySelector('.fd-map-viewport');
  const canvas = container.querySelector('.fd-map-canvas');
  const range = container.querySelector('input');
  const zoomIn = container.querySelector('[data-map-zoom-in]');
  const zoomOut = container.querySelector('[data-map-zoom-out]');
  let {x, y, zoom} = overview;
  let viewWidth = 294;
  let viewHeight = 238;
  let drag;

  function draw() {
    if (viewport.clientWidth && viewport.clientHeight) {
      viewHeight = worldHeight / (1.23 ** zoom);
      viewWidth = viewHeight * viewport.clientWidth / viewport.clientHeight;
      x = viewWidth >= worldWidth ? worldWidth / 2 : clamp(x, viewWidth / 2, worldWidth - viewWidth / 2);
      y = viewHeight >= worldHeight ? worldHeight / 2 : clamp(y, viewHeight / 2, worldHeight - viewHeight / 2);
      canvas.setAttribute('viewBox', `${x - viewWidth / 2} ${y - viewHeight / 2} ${viewWidth} ${viewHeight}`);
    }
    range.value = String(zoom);
    zoomIn.disabled = zoom >= maxZoom;
    zoomOut.disabled = zoom <= 0;
  }

  function changeZoom(value) {
    zoom = clamp(value, 0, maxZoom);
    draw();
  }

  function reset() {
    ({x, y, zoom} = overview);
    draw();
  }

  zoomIn.addEventListener('click', () => changeZoom(zoom + 1));
  zoomOut.addEventListener('click', () => changeZoom(zoom - 1));
  range.addEventListener('input', () => changeZoom(Number(range.value)));
  container.querySelector('[data-map-reset]').addEventListener('click', reset);
  viewport.addEventListener('keydown', event => {
    switch (event.key) {
      case 'ArrowLeft': x -= viewWidth * 0.08; break;
      case 'ArrowRight': x += viewWidth * 0.08; break;
      case 'ArrowUp': y -= viewHeight * 0.08; break;
      case 'ArrowDown': y += viewHeight * 0.08; break;
      case '+': case '=': changeZoom(zoom + 1); break;
      case '-': changeZoom(zoom - 1); break;
      case 'Home': reset(); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    draw();
  });
  viewport.addEventListener('pointerdown', event => {
    if (drag || event.button !== 0) return;
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    x -= (event.clientX - drag.x) * viewWidth / viewport.clientWidth;
    y -= (event.clientY - drag.y) * viewHeight / viewport.clientHeight;
    drag.x = event.clientX;
    drag.y = event.clientY;
    draw();
  });
  viewport.addEventListener('lostpointercapture', event => {
    if (drag?.id === event.pointerId) drag = undefined;
  });
  new ResizeObserver(draw).observe(viewport);
  draw();
}
