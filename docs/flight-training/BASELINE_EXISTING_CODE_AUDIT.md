# DroneLab V1.6.0 Existing-Code Audit — Work Implementation Guidance

**Repository inspected:** `chilchiltrips-boop/dronelab` `main`, baseline HEAD `80bd3376c2b2201e77d9480b8affde149f3b2165`.  
**Comparison/reference:** `chilchiltrips-boop/zebjus-drone-simulator-lab` `main`, user-provided Aerion v18.3.83 Android APK and two `.md` prompt/source guides.  
**Method:** GitHub file/tree inspection and user-provided document review. This is a **source-level audit**, **NOT proof of a successful on-device multi-touch test**, physical flight validation or logged motor-force calibration. Work must reproduce each suspected bug and demonstrate the fix.

## Current state vs requested state

| Area | What is present in target source | What Work must change / verify | Status |
|---|---|---|---|
| Android virtual joystick UI | `companion.html` includes `#flightLeftZone`, `#flightRightZone`, `#flightLeftKnob`, `#flightRightKnob`, landscape cockpit and `#flightSettings` | Make touch animation work even when disconnected/unarmed (preview), audit actual WebView multitouch, stop pointer conflicts | **UI present; user reports dead touch** |
| Touch authorization gate | `companion-flight.js` `setupStick()` denies `pointerdown` unless `isOwned() && armed && !halted` | Decouple rendering from ARM/connection; only transmission/motor action needs gate | **Confirmed code-level blocking condition** |
| Throttle control | `flight-input.js` has elapsed-time throttle integration and Slow/Medium/Fast; `companion-flight.js` stores throttle | Test real phone Y movement, instant first-touch zero, hold on release, STOP reset, consistent mirrored applied throttle | **Logic present, not phone verified** |
| Reversed yaw | `flight-input.js` sends negative of left X shape; Web `js/tripod-page.js` reverses `left.x` and D/A keys | Preserve identical sign for local control, Android source, receiver and Web mirror | **Existing mapping found; protect with tests** |
| Web mirrored knobs | Web `renderStickKnobs()` uses local `pointers`; remote handler directly sets `s.cmdRoll/Pitch/Yaw` | Render authenticated applied mobile values in two Web joystick indicators; neutral/ownership updates | **Missing** |
| Web throttle mirror | Remote handler sets `s.throttle=m.throttle`; Web UI has own throttle display | Verify display actually reads authoritative state and never drifts; remove parallel local throttle updates during remote control | **Wiring exists; end-to-end verify** |
| Duplicate destinations | Web `index.html` contains `#simcontrol`, an embedded iframe, plus a separate `tripod.html` route and navigation link | One canonical Flight Training page only, with peer connection attached to its live simulation | **Duplicate UX present** |
| WebRTC pairing gear | `index.html#tab-settings` contains full QR/code pairing workflow; `tripod.html` has no integrated connection settings drawer | Move/reuse pairing UX behind top-right gear on canonical Flight Training; keep old QR/codes/security | **Needs migration** |
| Legacy LED WebApp | `index.html#tab-led`, `pairing-core.js` `led`/`toggleWebLed`/`commandLed` and `pairing-web.js` LED handlers | Remove **virtual LED demo only**; do not remove physical LED wiring/Python examples | **Obsolete** |
| Legacy LED Android | `companion.html` `Mobile LED Controller`, `#mobileLedOn`, `#mobileLedOff`, bulb/status UI; `companion.js` handlers | Rename pairing, remove LED panel/buttons/copy, keep connection and owner permissions | **Obsolete** |
| WebRTC control protocol | `pairing-core.js` supports `SIM_CONTROL`, `SIM_ACK`, `sessionId`, `seq`, `controller`, `simulatorReady` | Preserve packet contract or migrate both ends; stale, backpressure and owner-change checks | **Present but needs hardening** |
| Embedded receiver | `pairing-web.js` `forwardSimulatorControl()` sends `ZJ_SIM_CONTROL` via `postMessage` to `#simRemoteFrame`; `js/tripod-page.js` listens and ACKs | Refactor to canonical same-page direct receiver; delete obsolete iframe, stale timers/ready flags | **Working architecture with duplication risk** |
| Pure ACRO | `js/tripod-physics.js` rate targets are `s.cmdRoll*220`, `s.cmdPitch*220`; angle targets only in ANGLE | Retain zero angular-rate command when centered; do not import old Aerion `RATE HOLD` helper | **Source indicates correct mode differentiation** |
| ANGLE cascade | `js/tripod-physics.js` computes outer angle to requested rate then inner rate PID; Yaw rate only | Validate actual outer/inner telemetry, live gain changes and P/I/D ranges numerically | **Implemented, quality needs empirical tests** |
| Live PID | Existing Tripod PID form, A/B experiments, `js/tripod-experiments.js` | Ensure low/high P/I/D give measured response changes and no plot-only effects; preserve Apply without state reset | **Feature present, validation needed** |
| Vertical cue | `js/tripod-physics.js` exposes lift; 3D scene includes small vertical cue | Add documented constrained-rig vertical physics with forces, mast motion and accurate cm readouts | **Partial visual cue; not validated physical model** |
| 3D F450 | `js/tripod-assembly-model.js`, `js/tripod-realism.js`, `js/tripod-page.js` assemble existing GLB parts, visual effects | Improve lighting/physical motor effects without duplicating model, controls, or floating direction text | **Existing reusable implementation** |
| Audio | `js/tripod-audio.js` has motor voices; RPM wired to `audioEngine.update(s.motors,s.motorRPM)` | Softer QUIET default, filters, no click, no repeating annoyance, actual-RPM coupling and lifecycle cleanup | **Existing; subjective comfort unresolved** |
| Title styling | `tripod.html` `<title>Tripod PID Simulator` and heading; nav has `.active` styling in CSS | Rename page `ZEBJUS Flight Training`; fix unintended line/underline, retain focus outlines | **Current old title** |
| Android packaging | `mobile-android/app/build.gradle` app ID `in.zebjus.dronelab.companion`, versionCode 11, permanent release signing from secrets | Increment versionCode, same certificate/app ID; install on previous version in-place | **Must preserve** |
| App offline/cache | Web app has `sw.js`, `app-version.json`; Android asset bundling in `.github/workflows/build-qr-android.yml` | Invalidate old assets/cache, precache new modules, confirm WebView no stale JS | **Regression sensitive** |

## Critical interactions in current code

1. `companion-flight.js`: `isOwned()` checks live peer `connected`, `paired`, `controller==='mobile'`, `simulatorReady===true`; `setupStick('left'|'right')` checks ownership **AND** armed. This gate is sufficient to explain visibly frozen joystick when the app is still pairing, lacks control, or unarmed. The new UX should be explicit preview rather than suggesting a physically armed mode.
2. `companion-flight.js`: first touch stores `cx/cy=e.clientX/e.clientY` and zero displacement; then `F.vector` processes drag. This is a good basis. Test actual pointer capture, Android WebView layers, `lostpointercapture`, CSS overlay and parent scroll. Do not claim bug fully fixed merely by moving the gate.
3. `pairing-core.js`: mobile sends `{type:'SIM_CONTROL', seq, sessionId, mode, armed, throttle, axes:{roll,pitch,yaw}}`; host verifies current controller/session and responds `SIM_ACK` after the simulation callback returns an applied state. This exact normalized format is the target transport; the Aerion source guide's 10-channel JSON is **illustrative only**.
4. `pairing-web.js`: `forwardSimulatorControl()` currently returns a pending Promise whose timeout is 650 ms. A separate watchdog checks the last forwarded timestamp. On single-page migration, review timer policy and the risk of falsely reporting readiness after the iframe was stopped, left, reloaded or switched.
5. `js/tripod-page.js`: local input calls `inputAxes()` every render frame when no fresh remote frame, and local displayed knob position is derived from local `pointers`. Fix exclusive input ownership and mirror; avoid a 'mobile stick reflects then snaps back to center' jitter on every frame.
6. `tripod.html` is a complete detailed standalone Tripod PID page; preserve its physics, graphs, environment sliders and 3D assets while making it the canonical WebRTC-enabled screen. A link to a standalone page does not by itself preserve an RTC session created in the SPA index document.

## Uploaded old-reference materials

- `references/Aerion_V18_3_83_UI_REFERENCE_ONLY.apk` (~2 MB): separate Android app. Archive contains `assets/flight/index.html` and `assets/android-transport.js`, and old Aerion source repo has `control-sticks.js` plus `tools/flight_app_source.html`. These demonstrate visual/control interaction style, but old transport logic and app identity must not be copied. An APK archive contains runnable code; do not install/execute automatically or treat its signing material as approved for target release.
- `references/ZEBJUS_Tripod_Simulator_Port_Guide_and_Prompt.md`: scene geometry, F450 orientation, fixed timestep, inner/outer PID, motor visual/sound details and explicit pure ACRO correction. Its 'no Android' limitation applies ONLY to its earlier destination scenario and does not apply to this integrated assignment.
- `references/ZEBJUS_WebRTC_Android_Joystick_Integration_Prompt.md`: landscape/touch/preview/presets/WebRTC/ACK/safety acceptance checks. Adapt mapping to the target app's actual `SIM_CONTROL` format and reversed yaw.

## Compatibility rules

- Older reference yaw sign / `RATE HOLD` must not regress v1.5.3 reversed Yaw and true ACRO.
- Keep the Web RTC pairing methods and safety PIN verification while deleting Virtual LED; avoid accidentally deleting live ownership / approval callbacks because LED once used the same socket.
- Maintain working physical LED parts and scripts for Python Lab and 2D wiring; only delete unrelated remote LED demo.
- Main app route and old bookmarks must not silently break. If old hash `#simcontrol` remains, route it to `/tripod.html`.
- Do NOT try to use the user-provided Aerion APK for the new target app's signing or application ID.

## What source audit cannot establish yet

The source review alone cannot confirm: exact Android phone pointer events/overlay hit targets, camera focusing on the tested phone, perceived touch latency, subjective audio harshness, stability of real throttling traces with individual PID values, measured physical thrust constants, on-device UI safe insets and in-place install compatibility. Work must test and disclose these separately.
