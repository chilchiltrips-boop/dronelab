# Verification — 2026-10-08

The required README, FILE_GUIDE, all page-layout fragments, original index, complete stylesheet cascade, lab-workflow stylesheet and relevant app.js routines were inspected before implementing the new app. The original `reference-runtime/preview.html` was served over HTTP and opened alongside the extracted app.

## Passed

- Direct desktop comparison: original three-column Assembly panel proportions, shelf cards/thumbnails, stage toolbar, Current Step and Build Check; original large wiring SVG, toolbar and sidebar. The two original stylesheets are preserved in full and loaded in source order before scoped project rules.
- Browser: page switching, guided rejection of the wrong component, installation and progress, Free mode, shelf availability, Undo/Redo, wire endpoint creation, selected-wire deletion and Wire undo.
- Browser: real pointer drag of a battery node, F connector flip, R rotation, Reset layout, Clear wires and recovery, reference wiring (34 fixed connections), assembly sync (4/4), electrical validation, optional servo insertion/deletion and shared undo, local project/undo restoration after reload.
- Browser: virtual XT60 disconnect/reconnect, complete 16-screw set installation and undo, virtual PWM test at 2000 µs, independent M2 disable with M1/M3/M4 running, correct CW/CCW state, stopped test on page/focus changes, keyboard W ignored while a select is focused.
- Browser: desktop 1363×936, tablet 768×850, mobile 390×850 and narrow 320×850. No page-width overflow or overlapping action buttons; narrow toolbar/canvas overflow stays within the intended scroll containers.
- Assets: 15/15 real GLBs loaded in the browser and decoded by the actual supplied loader; 35 literal model/image references exist; shelf images have no failed loads. No missing backend or unused original vendor runtime.
- Static checks: 11 ES modules parse, unique DOM IDs, no unrelated hardware UI.
- Automated regression suite: all 10 tests pass — actual GLB geometry/materials/bounds, motor positions, phase direction, electrical faults, wire color/gauge, exact installed datums/straps, cross-page optional deletion/undo, full screw-set transaction/undo, orbit-camera presets/exploded restoration, individual PWM toggles.

## Inspection limit

The cloud Chrome environment reports `GL_RENDERER = Disabled`, so both the untouched source preview and the new app cannot create a WebGL context there. Browser Assembly installation checks therefore used the clearly labelled WebGL recovery controls. Actual model decoding, material cloning, scene installation, snap datums, straps, screw transactions, camera presets and exploded positions were separately verified using the real Three.js engine and supplied GLB loader.

Rendered 3D lighting, camera appearance, pointer snapping and screw animation appearance still need a visual pass in a WebGL-enabled browser. This is an environment limit, not a claim that those visuals were browser-verified. The recovery path catches this failure; no uncaught application errors were observed in the remaining browser interactions. Browser-extension logging is outside this application's code.

## Deliberate extraction corrections

- Camera presets synchronize the local orbit state, so its next animation update preserves Top/Front/3D camera positions.
- PDB negative wires are consistently thick brown-black rather than falling through to orange.
- Motor checkboxes are independent of the master checkbox.
- All project/history writes use one new storage key; resets never delete another application's data.
- Undo cancels stale screw-completion callbacks.
- Shortcuts ignore inputs, textareas, selects and editable text.
- Only the two requested page trees are initialized. Branding/shop settings are local configuration.
