# ZEBJUS Drone Lab · Foundation v0.1

Three connected pages for building a drone learning workspace, step by step.
Plain HTML, CSS and JavaScript; no dependencies, npm or build step.

| Page | File | Working features |
| --- | --- | --- |
| **Forge** | `index.html` | Five assembly stages, layer schematic, checklist progress and retained control simulation |
| **Trace** | `trace.html` | Logical 2D wiring practice, connection checks, reference wiring and remove/clear controls |
| **Core** | `core.html` | Firmware file preview and editable workspace settings |

All pages share `style.css` and `script.js`. Open `index.html` locally or serve
this repository root as a static website. Links and asset paths are relative,
so GitHub Pages project paths work without routing configuration.

## Forge

Select an assembly stage, use Previous/Next, and mark each stage complete.
Checklist progress survives reloads in the same browser. Reset affects only
this checklist. The assembly layer view is a schematic; this release does not
include interactive 3D models, component placement or a physics simulator.

Expand **Control simulation** to use the original joystick demo. Connect,
arm at minimum throttle, adjust the inputs, and simulate link loss. The demo
resets and disarms, reconnects after 3 seconds, and enables inputs again.
Rearming remains explicit. Stop cancels recovery; Escape or focus loss also
stops an active simulation. No device commands are sent.

## Trace

Choose the controller and component endpoints, then connect the wire. The app
rejects mismatched and duplicate connections. Show reference wiring draws all
eight demo signal connections. Individual wires can be removed or all cleared.
Connections survive reloads in the same browser.

This is a logical practice map. OUT1–OUT4 are abstract signal labels, not GPIO
numbers. IMU power and reference endpoints are illustrative. It is not a verified
board pinout, complete power circuit or electrical simulator. Exact hardware
pinouts, voltage compatibility and motor/power wiring need a later hardware
integration step.

## Core

Set the project name, frame, controller and IMU profile. Save settings to this
browser; the project name appears across all three pages. Download exports the
saved settings as JSON. Reset restores the workspace defaults.

Firmware selection displays the file name and size. It accepts a non-empty
`.bin` file up to 16 MB for preview, but does not verify firmware authenticity,
board compatibility, image structure or partition layout. No firmware is flashed.
No firmware binaries are included in this repository.

## Storage and device scope

Storage uses the `zebjus.lab.*` browser storage keys. If storage is unavailable,
changes work for the current page session and the interface reports that they
were not persisted. Malformed saved data falls back to defaults. No credentials,
network configuration or active controls are saved.

There is no USB/OTA transport, ESP32/AP/STA connection, cloud backend or APK in
this foundation release. Settings never write to a flight controller.

## GitHub Pages

In **Settings → Pages**, choose **Deploy from a branch**, branch **main**,
folder **/(root)**, then Save. GitHub displays the deployed URL after the build.
This source update does not change Pages settings.

## Validation

- JavaScript syntax and all three pages' local links, IDs and asset references.
- Programmatic DOM tests for checklist navigation/persistence, wiring checks,
  settings persistence/export/reset, firmware selection guards, storage failure
  recovery and the retained connection-loss simulation.
- Local HTTP responses for all three pages.
- Visual browser QA was unavailable in the authoring environment. Layout uses
  responsive CSS, with a single-column lab layout on smaller screens.

## Next steps

Replace the assembly schematic with a proper interactive model, extend the
wiring workspace with component movement, then add verified hardware transport
and firmware release handling. These are future implementation steps, not
features of v0.1.
