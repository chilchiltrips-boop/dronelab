# Tripod Simulator: WebApp Port Guide and Build Prompt

**Purpose:** Build a standalone WebApp Tripod simulator in another project, carrying over the existing 3D scene, visible motion, sound, two browser joysticks, live feedback, and Roll/Pitch/Yaw PID learning behavior. The destination uses pure ACRO Rate mode and ANGLE level hold. It has no AP/STA setup, kit pairing, Android app, firmware or hardware control. This document distinguishes reusable source behavior from the requested changes and includes a copy/paste implementation prompt.

**Source inspected:** `aerion/app.js` (Tripod section near `buildTripod`, `advanceSimPhysics`, `simLoop`, `bindStick`), `aerion/index.html` (`#tab-sim`), `aerion/control-sticks.js`, `aerion/styles.css`, `aerion/pid-tuning.js`, and `aerion/tools/test_tripod_direction.js`. Source package version: `18.3.83`. The current source calls its rate behavior **RATE HOLD**. The requested destination changes that behavior to **pure ACRO / RATE** while preserving the 3D animation, input feel, motor effects, sound and PID teaching UI. This document distinguishes the two; neither behavior is a measured physical drone model.

## 1. What the user sees

The page has a large orbitable 3D view of an F450 style quadcopter clamped to a three-legged stand. A dark floor/grid, several lights, soft shadows, dust, translucent propeller disks, concentric downwash rings, cones and ground wash disks make motor response visible. The model tilts in Roll and Pitch, turns in Yaw, and moves a small amount vertically for a thrust cue; it does **not** fly freely around a 3D world. Camera orbit and zoom are available. A manual disturbance mode changes pointer dragging from camera movement to direct drone tilt.

Next to the view are flight mode, Run/Stop, Reset and calibrate controls; virtual left and right sticks; current angles, targets, yaw rate, throttle/lift, four motor percentages; Roll/Pitch/Yaw Rate PID and Roll/Pitch Angle PID controls; battery, payload, center-of-gravity offset, wind and motor-lag sliders; P/I/D explanations, tuning presets, diagnoses, and a scrolling target-versus-response chart. Sound can be enabled/disabled and the master volume adjusted.

The original WebApp integrates a paired kit and Android transmitter. The **destination is browser-only**: provide a local virtual-arm/run control, keep all outputs inside the simulation, and omit AP/STA switching, Wi-Fi settings, kit discovery/pairing, Android controls and firmware requests entirely. The current source's `startSimRuntime` and `AerionFcTraining` checks are tied to its kit session and must be removed from the port.

## 2. Scene objects and placement

| Object | Construction and appearance | Motion or feedback |
| --- | --- | --- |
| Tripod | Three radial feet spaced 120°, rods from a low hub to each foot, center post to approximately `y=3.46`; dark metallic cylinders and foot caps | Static; drone pivots at the top |
| Drone | `THREE.Group` with F450 bottom and top plates, red front arms, white rear arms, four guards, four motors/ESCs, controller, tape, battery straps/battery and four propellers | Group rotates around `sPivot` at `(0, 3.48, 0)`, with order `YXZ`; small vertical lift cue |
| Ground and camera | 28×28 plane plus grid; perspective camera FOV 46 at about `(9, 6.4, 10.8)` looking near `(0, 2.7, 0)`; ambient, hemisphere, directional, rim, fill and warm point lighting | Orbit/zoom control, resize with container |
| Propellers | Four independent groups; counter-rotating pairs | `rotation.y += (i odd ? +1 : -1) * dt * (1 + speed * 138)`; translucent circular blur rises with motor speed |
| Wash/dust | Eight moving torus rings per motor, one cone and one disc per motor; 180 dust points near floor | Opacity, ring scale/travel and dust outward motion follow each motor's speed and ground factor; clear on Stop |
| Feedback | On-screen targets, angles, four motor percentages, response chart and diagnosis | Numeric UI about every 100 ms; chart sample about every 75 ms (up to 180 samples) |

The current source builds the drone from local GLBs through its assembly asset loader with procedural fallback for missing components. Relevant asset names include `f450_bottom_pdb.glb`, `f450_arm_red.glb`, `f450_arm_white.glb`, `f450_top_plate.glb`, `f450_prop_guard.glb`, `a2212_1000kv_motor.glb`, `esc_30a.glb`, `zebjus_flight_controller.glb`, `lipo_2200_3s.glb`, `prop_1045_cw.glb`, and `prop_1045_ccw.glb`. The main source loads local `three.module.min.js`. When porting, copy only assets you are authorized to reuse; adapt the destination project's asset loader or construct an equivalent procedural model. Preserve front colors, body orientation, and propeller ordering.

**Coordinate contract:** world up is `+Y`, model nose is `+Z`, model right is `-X`. M1 is front-left `(-X,+Z)`, M2 front-right `(+X,+Z)`, M3 rear-right `(+X,-Z)`, M4 rear-left `(-X,-Z)`. The positive-Roll rendering rotates about `+Z` and lowers the model's right side; positive Pitch rotates about `+X` and lowers its nose. Yaw rotates about `+Y`; use Euler order `YXZ` and `pivot.rotation.set(rad(pitch), rad(yaw), rad(roll), 'YXZ')`. These signs have an existing automated direction test.

## 3. Controls and input contract

| Input | Meaning | Existing mapping |
| --- | --- | --- |
| Right stick X | Roll command `[-1,+1]` | Left/Right arrows; positive X requests positive Roll |
| Right stick Y | Pitch command `[-1,+1]` after inverting screen Y | Up/Down arrows; pointer `cmdPitch = -screenY` |
| Left stick X | Yaw rate command `[-1,+1]` | A/D keys |
| Left stick Y | Throttle step while held; pulse remains where last set | W/S keys adjust 25 µs per keydown; pointer updates `throttle -= screenY * throttleSpeed * dt` |
| Run/Stop | Start or stop virtual motors | R key or button; reset sends throttle to 1000 and zeroes motion |
| Manual tilt | Drag the 3D canvas to disturb Roll/Pitch | Roll `startRoll + dx*0.12`, Pitch `startPitch - dy*0.12`, limited to ±38° |

Throttle is 1000–2000 µs; Roll/Pitch/Yaw commands are clamped to ±1. Pointer sticks use a radial unit circle, optional floating center, pointer capture, a default 0.04 deadband, 0.2 cubic expo, sensitivity 1, and 400 µs/s throttle speed. Both sticks release their directional X/Y input to center; throttle **holds** its last value. Keyboard input is ignored while typing in form controls. Blur, page hide, tab change and pointer cancel release directional commands. The destination accepts its two on-page sticks and keyboard only; it has no companion app, receiver, network connection or external control owner.

Virtual arm must be explicit and start with throttle low. Stop/Reset and loss of input must mute audio, stop the propellers, reset motor outputs and clear accumulated controller error. Simulator motor values remain in browser memory.

## 4. PID and teaching behavior

| Mode | Roll/Pitch setpoint | Loop | Yaw |
| --- | --- | --- | --- |
| **ANGLE** | `levelTrim + stick * 26°`; zero stick returns to calibrated level | Outer angle PID produces desired angular rate (clamp ±220°/s), then inner Rate PID drives motion | `stickYaw * 180°/s` through Rate PID |
| **ACRO / RATE** | Desired Roll/Pitch rate is always `stick * 220°/s`; centered stick means **0°/s**, regardless of current angle | Inner Rate PID only; no attitude target or return-to-angle helper | Same Yaw Rate PID, no heading lock |

**Requested difference from the source:** Its `rateHoldTargetRate()` captures the released Roll/Pitch attitude and requests a return rate using gain `5.2`. **Do not port that helper into ACRO / RATE.** In the destination, releasing the stick stops commanded rotation; a tilted drone stays at its new angle once angular rate settles. Manual disturbance may change the angle and Rate PID damps the angular rate without leveling the model. Only ANGLE mode maintains an angle/level. This is the user's explicit correction to the source behavior.

Defaults in the source:

| PID bank | Roll | Pitch | Yaw |
| --- | --- | --- | --- |
| Rate mode, inner | `P=.9, I=15, D=.03` | `P=.9, I=15, D=.03` | `P=3, I=15, D=0` |
| Angle mode, inner | `P=.9, I=15, D=.03` | `P=.9, I=15, D=.03` | `P=3, I=15, D=0` |
| Angle mode, outer | `P=3, I=0, D=0` | `P=3, I=0, D=0` | No Yaw Angle bank |

At each fixed physics step, `error=target-measured`, `integral=clamp(integral+error*dt)`, `derivative=(error-previousError)/dt` (use zero on the first step). Outer angle integrator limits are ±45 and its output is `P*error + I*integral + D*derivative`, clamped to ±220. Inner rate integrator limits are ±110 and its output is `P*error + I*integral*0.012 + D*derivative`. Reset integrators/previous errors on Run, Stop, Reset, mode switch and PID apply. Provide live P, I, D, error, target, actual and selected loop values. The source uses distinct `rateRoll/Pitch/Yaw`, `angleRateRoll/Pitch/Yaw`, and `angleRoll/Pitch` banks. Yaw never uses an outer angle loop.

The browser model steps physics at **4 ms (250 Hz)** with an elapsed-time accumulator capped at 64 ms; rendering follows `requestAnimationFrame`. Thus a display running at 30, 60 or 120 FPS should produce approximately the same state after equal simulated time. The original tests assert this. Clamp Roll/Pitch angles to ±45° and wrap Yaw to ±180°.

Simplified plant: throttle authority is `clamp((throttle-1050)/650, 0, 1)`; PID effectiveness is `(.10+.90*authority) * clamp(batteryV/12.6,.65,1)^2`. Payload increases inertia (`1+payloadG/900`, with Pitch ×1.08 and Yaw ×1.35). Wind adds smooth sinusoidal Roll/Pitch disturbances; CG X/Y add steady Roll/Pitch bias; drag damps angular rates (Roll/Pitch 0.38, Yaw 0.34). Angular rates integrate into angles. This is an educational response model, not calibrated aerodynamics.

Motor display: compute base percentage `clamp((throttle-1000)/10,0,100)` when running. Let `rc=clamp(uR*.058,-36,36)`, `pc=clamp(uP*.058,-36,36)`, `yc=clamp(uY*.038,-26,26)`. Command M1..M4 as `[base+rc-pc+yc, base-rc-pc-yc, base-rc+pc+yc, base+rc+pc-yc]`, each clamped to 0–100. Smooth each actual motor with `actual += (command-actual)*(1-exp(-renderDt/motorLag))`; default lag `0.12 s` (UI range `.04–.30 s`). The small vertical cue follows a **quadratic** normalized throttle curve modulated by battery and payload. Motor bank values drive both prop/wash animation and sound.

Provide the current training sliders with browser defaults: battery 12.2 V (9.6–12.6), payload 0 g (0–800), CG X/Y 0 mm (−25 to +25), wind 0% (0–100), lag 0.12 s (.04–.30). Quick PID inputs, Stable/Low P/High P/Low I/High I/Low D/High D presets, and a coach explain weak correction, oscillation, persistent offset, overshoot and noise. The labels are educational heuristics based on set values; measured traces and motor outputs are separate feedback.

## 5. Sound and motion coupling

Use Web Audio after a user gesture. The existing sound design has (a) a three-oscillator motor layer with low-pass filter whose pitch, brightness and gain follow average motor output and motor imbalance, and (b) four independent sine/triangle oscillators with slight detuning, each following one motor. The four-motor bank uses approximately `70 + speed*440 + motorIndex*3 Hz`, low-pass `800 + speed*3000 Hz` and gain `(.0015 + speed*.0065)*masterVolume`; update around 30 Hz with smooth parameter targets. Master volume defaults to 55%. Provide mute/volume controls, gentle ramps to avoid clicks, and disconnect/stop oscillators when the simulator stops or page closes. Never play a continuous motor sound when motors are off. Component pick/drop/connector beeps exist in the larger assembly lab; they are optional when porting only the Tripod page.

The scene ties motor percentage to prop rotation, propeller blur, wash ring opacity/radius/travel, ground wash opacity, dust flow, and audio pitch/level. Controller quality adds a subtle attitude vibration cue. A Roll or Pitch target step should visibly tilt the drone, change opposite motor pairs, move the numeric attitude and trace, and alter sound in the same time window.

## 6. Suggested module boundaries for the destination

1. `tripod-model`: 3D scene, asset/procedural drone, stand, lights, camera, propellers and wash. Accept one immutable visual state; no PID logic.
2. `tripod-physics`: pure fixed-step state transition, separate controller banks, motor mixer and environment; no DOM, Web Audio or network calls.
3. `tripod-input`: pointer sticks, keyboard, owner tracking and safe release; outputs a normalized command object.
4. `tripod-audio`: user-gesture activation, four-motor synth, master volume and cleanup.
5. `tripod-ui`: controls, telemetry, PID chart and coach. Apply simulator PID locally and label it **Simulator only**.
6. Keep the destination self-contained: no kit adapter, network settings, firmware commands or Android-specific code.

Recommended state shape: `{running, flightMode, throttle, cmdRoll, cmdPitch, cmdYaw, roll, pitch, yaw, rollRate, pitchRate, yawRate, targetRoll, targetPitch, targetRollRate, targetPitchRate, targetYawRate, levelTrimRoll, levelTrimPitch, motorActual:[4], pid, environment, pidLive}`. Angle targets are relevant only in ANGLE mode; the ACRO display must show requested/measured angular rate. Expose one `getSnapshot()` for 3D/audio/UI. Keep source and target axes explicit and documented.

## 7. Acceptance checklist

- Standalone page opens locally with offline Three.js/assets and visibly renders the tripod, F450 drone, four props, grid, lights and responsive camera; there is no AP/STA, kit or Android workflow.
- Right stick or arrows change Roll/Pitch in the correct directions; left stick or A/D changes Yaw rate; W/S and vertical left-stick motion update holding throttle. Directional axes recenter safely.
- In ANGLE, releasing Roll/Pitch returns toward calibrated level. In ACRO / RATE, releasing Roll/Pitch requests zero angular velocity and the existing attitude remains; manual tilt does not trigger leveling. Yaw has no heading lock in either mode.
- At default PID, motor percentages, prop/wash/dust, sound, angles and chart react consistently; changing P/I/D and adding wind/CG/payload visibly changes the response. 30/60/120 FPS produce comparable physics for an equal time interval.
- Reset/Stop and blur/hidden page remove directional commands, stop motor animation and audio, and reset controller state. All simulation state remains local to the browser.
- Target/actual chart and live P/I/D terms match the chosen axis and loop. Mobile/touch layout remains usable; graphics fall back to a simpler scene when assets/WebGL are unavailable, with a visible diagnostic.

---

# Copy/paste implementation prompt for the other project

```text
Implement a self-contained Tripod PID Simulator page in THIS web application. First inspect this project's framework, rendering setup, design system, input conventions, tests, and asset licensing. Integrate with those conventions. Build a functional browser simulator, not just a visual mockup. This new project has NO AP/STA modes, Wi-Fi selection, kit pairing, Android app, firmware, server API or network connection. Do not implement those features. Keep simulated motor values in browser memory.

Use the accompanying “Tripod Simulator: WebApp Port Guide” as the behavior specification. Recreate the same recognizable F450 quadcopter on a three-legged dark tripod, camera orbit, grid/lights, four separately animated propellers, speed-based blur, translucent downward wash rings/cones/discs, floor dust, subtle vibration, and slight vertical thrust cue. Use local Three.js and authorized local GLB assets if available; otherwise build an equivalent procedural drone. Preserve axes: +Y up, +Z nose, -X drone right; M1 front-left, M2 front-right, M3 rear-right, M4 rear-left; Euler YXZ with roll about Z, pitch about X, yaw about Y. Positive Roll must lower the drone's right side; positive Pitch must lower the nose.

Implement two touch/mouse virtual sticks and keyboard: right X Roll, right Y Pitch (invert screen Y); left X Yaw rate, left Y throttle with held last value. Arrow keys control Roll/Pitch, A/D Yaw, W/S throttle in 25 microsecond steps, R Run/Stop. Normalize directional sticks to [-1,1], throttle to 1000..2000 microseconds; use 0.04 deadband, 0.2 cubic expo and pointer capture. Recenter directional commands on release, blur, hidden page, tab exit and cancel. Start with motors off and throttle low. Add explicit Run/Stop, Reset, Level calibration and Manual tilt buttons. Inputs come from this browser page only.

Use a 4 ms fixed physics timestep independent of render FPS. Implement ANGLE: Roll/Pitch target = levelTrim + stick*26 degrees, outer Angle PID produces target rate clamped to +/-220 deg/s, inner Rate PID responds to measured rate. Implement **pure ACRO / RATE**: Roll/Pitch target rate = stick*220 deg/s at every physics step, including 0 deg/s at centered sticks. Feed this target directly to the Roll/Pitch inner Rate PID. Do not capture attitude on stick release; do not use an angle hold or auto-level helper in ACRO. A manual tilt or wind disturbance may leave the drone at a new angle after its angular velocity settles. Yaw always commands stick*180 deg/s through Rate PID, with no heading lock. Label the mode ACRO / RATE, not RATE HOLD.

Use distinct mode-specific PID banks. Default Rate and Angle-inner Roll/Pitch P=.9 I=15 D=.03; Yaw P=3 I=15 D=0; outer Angle Roll/Pitch P=3 I=0 D=0. Integral/derivative and clamps follow the guide (Angle I +/-45, output +/-220; Rate I +/-110 with I multiplier .012). Clear integrators and derivative history on Run/Stop/Reset/mode change/PID apply. Angle limits +/-45 degrees, Yaw wrap +/-180 degrees. Include motor mixing, exponential lag, battery/payload/CG/wind effects and quadratic lift cue from the guide. Show four motor percentages. Make the physics a pure testable module.

Build the live learning UI: ANGLE/ACRO RATE selector, Roll/Pitch/Yaw Rate P/I/D inputs, Roll/Pitch Angle P/I/D inputs only in ANGLE, simulator-only Apply, Stable/Low/High P/I/D presets, battery 9.6..12.6 V, payload 0..800 g, CG X/Y -25..25 mm, wind 0..100%, motor lag .04..0.30 s, current Roll/Pitch/Yaw and angular rates, target values, throttle/lift, P/I/D/error/target/actual values and educational coach. In ANGLE graph target and measured Roll/Pitch angle; in ACRO graph target and measured Roll/Pitch rate. Yaw graphs rate in both modes. State prominently that PID editing affects the virtual model only.

Use Web Audio initiated after a gesture. Synthesize four slightly detuned motor voices driven by M1..M4, plus a soft blended motor layer. Smooth pitch/filter/gain changes, default volume 55%, and provide mute/volume. No loop continues after Stop or page teardown. Couple motor state to props, wash, dust, numbers, graph and sound every frame. Design responsive layouts and reasonable low-performance/WebGL fallback.

Deliver the integrated page and source modules, with focused tests for roll/pitch sign, ANGLE level return, ACRO centered-stick zero target rate and no angle return after disturbance, yaw-rate-only behavior, 30/60/120 FPS consistency, stick release/blur safety, zero motors/audio after Stop, and absence of network/hardware calls. Run the project's relevant build/test checks. Explain how to start the page and identify any unavailable original assets or behavior approximated procedurally. Keep this implementation local to the destination project until its normal review/deployment process is requested.
```

