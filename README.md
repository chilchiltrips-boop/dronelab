# DroneLab — Assembly Lab & 2D Wiring

A static, two-page ES-module application extracted from the supplied ZEBJUS V18.3.82 UI reference. No backend, account, npm installation or build step is required. All models, thumbnails and Three.js are local.

## Run

Extract this folder, open a terminal inside it, and run either:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/`. Alternatively, with Node 18+:

```sh
npm run dev
```

Open `http://localhost:4173/`. Use HTTP rather than double-clicking `index.html`: ES modules and GLB fetching require an HTTP origin. For the 3D workbench, use a browser with WebGL enabled. When WebGL is unavailable, a clearly labelled recovery panel keeps logical assembly and wiring usable; it never presents an image or cube as the 3D bench.

## Use

- **ASSEMBLY LAB:** Guided mode follows 17 ordered steps. Select or drag a shelf component, then click/drop near its highlighted snap target. One drag installs the full 12-frame-screw or 16-motor-screw set. Installed parts leave the shelf. Select installed parts and press Delete to return them. Undo/Redo cover both pages. Object, Wiring map, Frame/FC X-ray, Top, Front, 3D, Exploded and Auto rotate use the original Three scene.
- **2D WIRING:** Drag objects in the 1500×900 SVG canvas. Click the mode badge or press W to enable connections, then select two endpoints. F flips connector sides without mirroring text; R rotates the selected object. Delete removes selected wires or attached objects. Reset layout preserves wiring; Clear wires preserves installed parts; Reference wiring adds the original 34 fixed connections plus the optional-device reference plan. The small-screen toolbars and canvas scroll horizontally as in the source.
- **Virtual testing:** Correct phase and battery/PDB connections make each motor ready. Run the PWM test and raise throttle to at least 1100 µs. Each motor checkbox works independently; swapping two phases reverses its direction. M1 front-left / CW, M2 front-right / CCW, M3 rear-right / CW, M4 rear-left / CCW. Tests stop when leaving the wiring page, hiding the tab or losing focus. Battery and motor actions are virtual only.
- **Shared state:** Edits autosave under `dronelab.assembly-wiring.project.v1`. The new key contains logical assembly, connections, layout, optional devices, GPS reference mode and shared Undo/Redo snapshots. Reset is undoable. No source storage keys or saved network/account values are imported.

## Short file map

| File | Role |
| --- | --- |
| `index.html` | Only Assembly Lab and 2D Wiring DOM |
| `styles.css`, `lab-workflow.css` | Complete source CSS, including every later override, in original order |
| `project.css` | Small scoped shell, accessibility and narrow-screen corrections after source CSS |
| `js/app.js`, `js/ui-controls.js` | Boot, page switching, keyboard shortcuts, responsive layout and controls |
| `js/catalog.js` | Component data, 17 steps, physical snap datums and local orbit controls |
| `js/project-state.js` | Shared logical state, transactions, persistence, reset, Undo/Redo |
| `js/model-assets.js` | GLB preloading, source datum normalization and material-preserving cloning |
| `js/assembly-scene.js` | Three scene, bench, placement, screw animations, x-rays, wiring overlays and cameras |
| `js/shared-ui.js` | Shelf, Current Step, Build Check and assembly/wiring progress synchronization |
| `js/wiring-renderer.js` | SVG nodes, connector geometry, routing, transforms and optional pin plan |
| `js/wiring-validation.js` | Electrical validation, phase permutations, SVG refresh and virtual PWM animation |
| `js/sound-power.js` | Synthetic audio and virtual XT60/LED effects |
| `js/config.js` | Project branding, shop links and storage key |
| `*.glb`, `thumb_*.png`, `ref_*.png`, `fc_top_layout.png` | Local component and image assets actually used by this implementation |
| `three.module.min.js`, `glb-loader.js`, `THREE-LICENSE.txt` | Local Three runtime, supplied loader and vendor license |
| `tools/` | Dependency-free model, state and electrical regression checks |
| `CHECKS.md` | Verification results and the WebGL inspection limitation |

The reference intentionally draws its current arc guards and bright CW/CCW propellers with detailed procedural Three geometry rather than the older packaged meshes. This implementation preserves that source visual override; all 15 supplied GLBs are preloaded and decoded, and the other model-backed components use their original GLB meshes and materials.

## Configuration and GitHub Pages hosting

Edit `js/config.js` for the brand name, logo letter, watermark and external shop link. Set `shopUrl` to an empty string to hide shop links. Actual component/model descriptions still identify the referenced hardware.

All browser asset and module URLs are relative. The same folder works at `/dronelab/` or another repository subdirectory without a bundler or router configuration. GitHub Pages serves the repository root from `main`. The `.nojekyll` file keeps these static assets unchanged.

Live app: https://chilchiltrips-boop.github.io/dronelab/lab.html

`lab.html` is an identical entry point for the same two-page app. The root `index.html` also serves the app; the explicit entry avoids a cached foundation homepage after an update.

## Checks

With Node 22+:

```sh
npm run check
npm test
```

There are no install-time dependencies. Python, flight, hardware I/O, firmware, provisioning, relay and Android runtime/vendor files are excluded.
