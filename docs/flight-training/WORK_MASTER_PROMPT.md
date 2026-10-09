# ZEBJUS DroneLab — Work Implementation Assignment
## Unified Flight Training, Reliable Android WebRTC Joysticks, Realistic Tripod Physics, PID, Audio & UI/UX

**Assignment type:** IMPLEMENT, DEBUG, TEST AND RELEASE in the EXISTING repository. Not a design-only task; not a standalone prototype.  
**Primary repository:** https://github.com/chilchiltrips-boop/dronelab  
**Primary published website:** https://chilchiltrips-boop.github.io/dronelab/  
**Reference ONLY:** https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab  
**Audited baseline:** `main` commit `80bd3376c2b2201e77d9480b8affde149f3b2165`, WebApp release marker `1.6.0+23`, Android release `versionCode 11`, `versionName 1.6.0-virtual-flight`. Check live HEAD again before changing anything; these values are a snapshot, not an instruction to overwrite newer work.

## ROLE / MISSION

Act as lead Android/WebView engineer, WebRTC engineer, full-stack/frontend engineer, Three.js/3D artist, flight-control and control-theory engineer, numerical simulation developer, UI/UX and accessibility designer, security reviewer, QA engineer, and release engineer. Fix the current app end-to-end so a real Android phone controls THE SAME single Tripod training simulator visible in the WebApp. Pairing and control must work; joystick motion must be tactile and visible; all receiver-applied values and virtual throttle must mirror correctly; motor RPM, vertical force, drone tilt, airflow, sound, and PID response must reflect actual simulated mathematics rather than canned animations. Preserve the existing assembly, wiring, Python Lab, firmware updater, QR/code pairing, 3D assets, and Android update identity.

**This is an existing working project: refactor and improve it, do not rebuild it from scratch.** Inspect implementation before modifying. Read `EXISTING_CODE_AUDIT.md`, `TEST_MATRIX.md`, and the two included source reference guides. Look at the included APK only as a UI/interaction reference. Preserve licensing restrictions.

## NON-NEGOTIABLE SCOPE

1. **ONE** navigation destination for the drone training simulator: rename **Tripod PID Sim** to **Flight Training** (page heading **ZEBJUS Flight Training — F450 Tripod Simulator**). Remove the separate **Android Flight** simulator tab. Reuse one physics state and one 3D scene; no independent iframe simulator competing with another running page. The visible training UI can still have an embedded controller/mirror panel. Keep the stable publicly usable route `/tripod.html` as the preferred canonical entry. Redirect/deprecate `#simcontrol` cleanly to that canonical destination; don't break bookmarks or other app tabs.
2. WebRTC lives behind a clearly visible **gear icon in the top-right Flight Training header** (and accessible through the appropriate WebApp global header where applicable). Tapping opens a polished **Connection Settings** sheet/dialog, with Pair Mobile, existing QR and six-digit-code connection, verification/confirmation, permission grant, take/release control, disconnect, reconnect diagnostics, remote STOP, and link statistics. Not a separate simulation tab. Connection/setup options also accessible from Android via its settings/pair control. Preserve the EXISTING QR/code signaling and actual WebRTC channel.
3. **REMOVE Virtual LED features in full** from both the WebApp and Android App UX: no LED navigation tab, no bulb, no LED ON/OFF buttons, no LED pairing copy, no header LEDs. Carefully prune dead JS/events/tests/messages only after auditing references. **Do not remove general physical wiring LED components/examples from Assembly, Wiring or Python Lab**; the removal concerns ONLY the legacy **WebRTC Virtual LED demo**. Preserve session security, control ownership and pairing APIs even if historically associated with LED.
4. App and WebApp **dual floating joysticks must visibly move on actual touch**. They must also be testable visually when disconnected/unarmed in an explicitly marked **INPUT PREVIEW / NO FLIGHT COMMAND** state. Disconnected/unarmed UI must never send ARM or spin virtual motors, but must not appear frozen. First touch anchors base at exact touch point; stick knob starts at zero displacement; then follows every pointer move at the same frame, clamped to a circle. Both thumbs concurrently, with separate pointer IDs, no touch stealing. Real control output only when authenticated, ownership granted, simulator ready and virtual armed. Apply STOP and motor safety without delay.
5. With authenticated Android mobile ownership, **mirror Android LEFT/RIGHT sticks on the WebApp Flight Training page**: animated knobs, center/anchor or equivalent normalized indicator, percent readouts, effective throttle `1000..2000 µs`, flight mode, ARM status, simulator accepted/ACK sequence and RTT. A 1300-µs phone throttle must show 1300 µs in WebApp (not a locally computed unrelated number). Mirror from **receiver-applied validated snapshots**; do not merely move the Web stick from an unacknowledged send. The drone 3D model, PID, four motors, sound, graphs and visual effects must consume that SAME authoritative simulation state. All controls should return neutral appropriately; throttle only holds on normal touch release.
6. **Make increasing throttle physically meaningful** while tethered to a tripod: response in commanded motor RPM, individual thrust, total thrust vs weight, visual up/down slider/flex along the stand's permitted travel, a numerical vertical displacement (cm), velocity and acceleration, prop blur, air flow, ground wash and sound. Do **not** pretend the clamped simulator is a free-flying aircraft. At OFF throttle: zero motor motion/sound/wash; when armed: calibrated idle if physically modeled; progressive thrust with time, motor lag, load and battery sensitivity. See detailed physics contract below.
7. Preserve and improve **pure ACRO / RATE**, **ANGLE → RATE cascade**, distinct Roll/Pitch/Yaw rate PID and Roll/Pitch angle PID, live Apply, meaningful P/I/D tuning and A/B comparison. No fake stability: demonstrably different traces, settling, overshoot, noise sensitivity and motor response for low/high P, I, D. Yaw polarity must match the current **reversed-yaw v1.5.3** convention, not the older Aerion reference sign. No yaw angle-hold loop.
8. Refine Android **landscape cockpit** UI: professional modern ZEBJUS identity, 5-second nonblocking intro, smooth low-latency touch animation, reachability, safe insets, readable status and STOP, no LED leftovers or irrelevant hardware/AP/STA settings. Slow/Medium/Fast are the only user-facing sensitivity presets. Use the old Aerion sources/APK as *visual/interaction references only*, not their transport, physical control, application ID, package or signing identity.
9. **WebRTC DataChannel only** for mobile↔Web control: do not introduce UDP, AP/STA, hotspot, REST polling for sticks, new backend or second pairing scheme. Code signaling may continue to use the existing service, but control must not depend on that signaling service after a successfully established direct DataChannel (subject to network conditions). No real ESP32 ESC/firmware commands. All flight output is **virtual** in this release.
10. Deliver tested source, screenshots/screens recordings or reproducible evidence, reviewable PR, signed new Android release APK with incremented versionCode and same verified production signing cert, and successful WebApp deployment **only after required tests pass**. If physical-phone/manual tests cannot be run, report that explicitly; never claim they passed. Do not merge broken code. Do not leak secrets.

## A. INVESTIGATE FIRST: IDENTIFIED BASELINE DEFECTS

The following findings are from actual `main` source inspection. Verify each again; do not assume a proposed fix is already complete:

- `companion-flight.js` `setupStick()` rejects `pointerdown` unless `isOwned() && armed && !halted`. Result: **the sticks appear dead** before a complete connect + Web remote ready + explicit ARM. This contradicts expected responsive visual preview; split **visual input** from authorized **transmitted flight input**.
- `js/tripod-page.js` `renderStickKnobs()` reads a local `pointers` map, but remote control writes `s.cmdRoll/s.cmdPitch/s.cmdYaw` without populating the displayed stick values. Result: Android axes may change flight physics but **Web joystick graphics stay still**. Add a receiver-applied visual mirror with explicit source/ownership and no double-input processing.
- `index.html` has both a `#simcontrol` tab (embedded `tripod.html?embedded=1` iframe) and a separate `/tripod.html` nav link. `pairing-web.js` forwards to the iframe. Result: two UI destinations, fragile readiness/navigation and potential state loss when switching pages. Design a single canonical training page with the WebRTC host bound to that page and no second physics instance. Do not rely on a cross-document connection surviving a full navigation automatically.
- `index.html#tab-led`, `companion.html#mobileLedOn/#mobileLedOff`, `pairing-core.js` LED fields/actions and associated tests still exist. Remove the old virtual demo end-to-end without removing authentication/ownership.
- `tripod.html` currently has document title **Tripod PID Simulator** and visible **Tripod PID Simulator F450** heading; the nav active state/heading styling should be audited for the unwanted line/underline. New visible nav title: **FLIGHT TRAINING**; new document title: **ZEBJUS Flight Training | F450 Tripod**. Remove accidental decorative text underline/active-tab line only; **retain focus-visible outlines** for accessibility.
- `js/tripod-page.js` already has 250-Hz fixed-step physics, ANGLE/ACRO, audio, A/B, motors and input handling. Preserve and extend rather than replacing with basic toy physics. Existing vertical cue must be reviewed: users want distinct up/down thrust behavior with correct constraints. Do not present an arbitrary scene offset as physical lift.
- `pairing-core.js` already has `SIM_CONTROL`, `SIM_ACK`, owner gate, sequence/session checks and `simulatorReady`; `pairing-web.js` currently forwards by `window.postMessage()` to iframe and times out pending iframe ACKs. Keep protocol semantics or version and migrate BOTH ends in one commit. Audit stale readiness after disconnect, timer leaks, timeout mismatches and ownership transitions.
- Android production app is `in.zebjus.dronelab.companion`; baseline Android release `versionCode 11`, `versionName 1.6.0-virtual-flight`. Preserve app ID and **same ZEBJUS release signing certificate** to support update installation. **DO NOT reuse Aerion APK signing material**.
- The supplied older Aerion sources/docs have `RATE HOLD` logic and a DIFFERENT yaw sign. They are for 3D, touch appearance and audio reference. The final system uses true ACRO and reversed yaw sign.

Produce a file-by-file audit table: already working / missing / incorrectly wired / dangerous / obsolete; cite repo paths, call sites and tests. Then execute the remediation in phases below.

## B. DESIRED FINAL WEBAPP INFORMATION ARCHITECTURE

**Main navigation** retains Assembly Lab, 2D Wiring, Python Lab, Firmware, and the existing general settings features that are unrelated to Virtual LED. It contains **one** `FLIGHT TRAINING` destination only. Remove separate `ANDROID FLIGHT` and `VIRTUAL LED` tab links and their obsolete panels/handlers. Do not break the rest of navigation or back/forward behavior.

### Flight Training header and page

```
ZEBJUS DroneLab  /  FLIGHT TRAINING                 ● WebRTC OFFLINE  ⚙ CONNECTION
F450 Tripod Simulator • TRAINING ONLY       [ANGLE / ACRO] [ARM] [STOP]
┌───────────────────── 3D F450 DRONE ON TRIPOD ──────────────────────────┐
│  Camera presets / Follow      Red arrow: FRONT only                    │
│  Large physical drone, lighting, shadow, 4 motors, blur and downwash   │
│  Vertical mast extension / displacement, thrust/weight vector         │
└────────────────────────────────────────────────────────────────────────┘
[CONTROL SOURCE: WEB / ANDROID (MIRROR) / PREVIEW / STOPPED]  [RTT / ACK]
[LEFT STICK YAW + THROTTLE]   [Throttle µs / thrust N / lift cm]   [RIGHT ROLL + PITCH]
[Four motor RPM + thrust + prop flow]   [Attitude and Rate/Angle PID graphs]
[PID bank, P/I/D live apply, A/B presets] [Battery/Payload/CG/Wind/Lag]
```

Use a clean dark navy/glass dashboard, restrained cyan and mint status, danger red only for STOP and true warnings, crisp typography, no clutter, consistent spacing/labels. The F450 assembly must match the Assembly Lab's actual GLB parts and coordinates; use a single clearly visible red forward-facing arrow only (no FRONT/BACK/LEFT/RIGHT floating text). Camera view presets and Follow Drone remain responsive. 3D is the dominant visual. Desktop is primary; mobile portrait/landscape WebApp must adapt without overlapping panels.

### WebRTC Connection Settings (header ⚙)

Provide a real keyboard-accessible modal/sheet/drawer with these states:

- **DISCONNECTED**: Pair Mobile; show existing QR or 6-digit code; explain camera/online signaling requirements correctly; cancel safely; clear old request data and camera stream.
- **PAIRING**: Step 1 → Step 2 response scanning OR code → user compares safety PIN → explicit Confirm Pairing. Show progress and understandable error/retry. Web webcam activates only on deliberate user action. QR focus/detection fast; preserve previous autofocus fixes.
- **CONNECTED, NOT OWNER**: peer identity if trustworthy, DataChannel open/RTT, `Take Web Control` / `Grant Mobile Control` / `Release` actions as permitted, with unambiguous owner state. Respect the existing one-owner-at-a-time lease.
- **MOBILE CONTROL ACTIVE**: session, ACK age, last applied seq, remote mode/throttle, ability to emergency STOP from desktop, connection warnings, release control.
- **RECONNECTING / TIMED OUT**: clear authority, neutral virtual commands, disarmed; don't show stale green connected UI. Retry signaling/peer according to the supported existing mechanism. **Never auto-arm on restoration**.

Use a top-right gear in the Flight Training page, plus a visible compact link status indicator in the header. Do NOT put virtual LED buttons in Settings. Preserve non-WebRTC general settings elsewhere. The gear must not obscure STOP or change drone throttle simply by opening/closing the panel.

## C. SINGLE SIMULATION ENGINE & ACTUAL REPORTED MIRROR

Choose a **single canonical host** and document why. Preferred: make `/tripod.html` own both the existing WebRTC session and the Tripod simulator directly (reuse `pairing-core.js`, safe portions of `pairing-web.js`, and `js/tripod-page.js`), and make old `#simcontrol` redirect to `/tripod.html`. Alternative acceptable: SPA shell with one Tripod instance and persistent peer, but absolutely no two simultaneous simulator runtimes. Do not leave the old iframe receiver as an invisible second engine. Keep the pairing UI attached to the same live page as the simulation.

Create a strict source-of-truth contract:

```
Android Touch -> local input preview + normalized axes + throttle
 -> authorized RTCDataChannel SIM_CONTROL(seq, sessionId, mode, armed, axes, throttle)
 -> WebRTC owner/session/sequence/range gate
 -> SINGLE simulator state update (physics engine)
 -> canonical APPLIED_STATE snapshot (mode,armed,throttle,axes,angles,rates,motors,vertical)
 -> SIM_ACK (applied seq + state) / TELEMETRY on existing channel as appropriate
 -> Android applied/readout + WebApp mirrored knobs/readouts
 -> one 3D renderer + sound + charts
```

Make one shared normalized stick state schema on the Web page; include `{source:'mobile'|'web'|'preview', left:{x,y}, right:{x,y}, throttle, mode, armed, seq, appliedAt}`. `left.x` is derived from applied **reversed yaw** via the inverse of the selected shaping curve if necessary, OR carry bounded raw stick vector as a **display-only** field with authentication. Never let an untrusted decorative field bypass the command gate. If exact anchor pixel location is not transmitted, use a normalized mirrored knob position; don't claim exact phone pixel positions on a different-sized Web display. Label axes and include last accepted/last applied timestamps. Throttle must be mirrored from authoritative values, not numerically integrated on both devices independently.

**Control ownership arbitration:** Web controls operate while Web owns/stands alone; when Mobile is owner, Web sticks and keyboard are VIEW-ONLY and follow Mobile state. When control reverts to Web, release remote source, zero directional targets, preserve safe throttle policy, and require explicit ARM after any link loss. Reject unauthorized/stale/out-of-order frames, wrong session, malformed/nonfinite/out-of-range values, replayed seq and oversized JSON. Keep real physical hardware isolated.

**Rendering vs authority:** 60/90/120-Hz pointer animation must update immediately. Sender transmission remains bounded near 25 Hz on existing channel. Web applied mirror should update on each accepted control snapshot and optionally visually interpolate **display only** between snapshots; do not introduce delayed/filtered control into physics. Show `SENT`, `APPLIED`, `ACK`, `RTT`, `STALE`. Test actual Android ↔ Web, not mock-only loops.

## D. ANDROID LANDSCAPE COCKPIT, TOUCH AND EXPERIENCE

Retain current Android WebView wrapper, stable app ID, release identity and WebRTC. Use the included Aerion APK as **interaction and styling reference only**, not as runnable part of the target build. Read the old source `control-sticks.js` and `tools/flight_app_source.html` for floating stick styling. Do NOT port its old AP/STA physical transport or any kit security keys.

**Opening:** professional animated ZEBJUS mark / F450 rotor outline on deep blue-black background with subtle blueprint grid, 4 asynchronous rotor pulses, thin progress scan, tasteful cyan teal reflection, transition to controller at ~5 seconds. No annoying music; no autoplay motor audio. Animation must NEVER block STOP, connection/QR or safety events, and must respect reduced motion and instant skip after relevant lifecycle changes.

**Portrait:** prefer sensorLandscape with reverse landscape if supported. Provide a compact rotate-phone fallback before orientation completes. Use actual Android display cutout, gesture inset and WebView viewport data; prevent joystick hidden beneath navigation/system bars. Test short/wide screen sizes. Do not show AP/STA controls.

**Top control strip:** ZEBJUS Flight Control logo, link badge `DISCONNECTED / PAIRING / CONNECTED / SIM READY / CONTROL GRANTED / RECONNECTING`, live `RTT`, selected input source, ANGLE/ACRO, virtual ARM/DISARM, very prominent always-visible STOP and top-right ⚙ Settings/Pair. View-only vs active states must be obvious, not merely color. Keep touch controls large, reachable, well-separated from STOP. Use subtle HapticFeedback for ARM confirmation, pairing success and errors if user enabled (not on every control packet); no irritating repeating sound.

**Connection screen in Android gear:** QR scan, 6-digit code, manual response fallback, confirm safety PIN, request/grant control status, Disconnect, Last ACK, internet/ICE guidance. Existing QR camera permission autofocus workflow remains intact. Rename old **Mobile LED Controller** pairing title to **ZEBJUS Flight Controller Pairing**. Remove all LED demo hints/controls, keeping QR onboarding and logs useful.

**Joysticks (MUST FIX not moving):** always visually interact in INPUT PREVIEW mode without flight authority; show `PREVIEW ONLY • MOTORS OFF` whenever unpaired or unarmed. Left: X yaw reversed from Aerion older reference; Y gradual throttle; right: X roll, Y pitch. Exact initial pointerdown point becomes temporary base center; knob begins centered (zero). Separate captures by `pointerId`; both zones may be touched simultaneously. Store each anchor in screen coordinates. Handle 2+ pointers and reject steal in the same zone; visible knob follows drag without easing that lags controls. Bound radial displacement to 1; do not allow decorative ring clipping near edges, use an overlay layer or safe offset while keeping mathematical anchor unchanged. Position labels should show normalized X/Y, effective axis output, and local touch-relative anchor. Return base to comfortable default location on release while zeroing directional values; throttle holds on ordinary touch release. STOP/loss resets throttle 1000 and disarms. On mode/preset change, safely release active pointers to avoid jumps. Use `touch-action:none`, correct pointer capture/lostcapture, no preventDefault on unrelated UI and safe WebView multigesture behavior.

Only three response profiles in Settings (default Medium, persisted):

| Preset | deadband | expo | full up throttle increment |
|---|---:|---:|---:|
| Slow | 0.05 | 0.40 | 200 µs/s |
| Medium | 0.04 | 0.20 | 400 µs/s |
| Fast | 0.03 | 0.05 | 600 µs/s |

`shape(v)=sign(v)*[(1-expo)*n+expo*n^3]`, where `n=max(0,(abs(v)-deadband)/(1-deadband))`. Throttle `T_next=clamp(T_previous-shape(leftScreenY)*speed*dt,1000,2000)` with bounded real elapsed `dt`. Do not integrate frame-rate-dependently. Centered Y preserves throttle. Initial touch causes NO increase. Preview touches must not integrate real commanded throttle or send commands; optional separate local PREVIEW indicators must be explicitly labeled and cannot ARM.

**Yaw contract:** for normalized on-screen left X, `yaw=-shape(leftX)` (current DroneLab v1.5.3 reversed convention). Right X = `+shape(rightX)` roll; right upward motion = positive pitch. Both Web and mobile must match one authoritative axis mapping. Never silently flip physical gyro frame or motor mixer when only stick polarity should change.

## E. WEBRTC QUALITY, SECURITY & FAILSAFE

Reuse one existing RTCDataChannel and exact protocol versioning; currently `SIM_CONTROL`/`SIM_ACK` plus host `STATE`/owner/ready. Add an optional throttled `SIM_TELEMETRY` type only if needed, built on the same DataChannel; do not introduce REST/UDP for flight. Preserve QR/codes, PIN verification, control grant. Receiver must validate `sessionId`, monotonically increasing `seq`, `mode in {angle,acro}`, armed boolean, integer throttle 1000..2000, finite normalized axes -1..1, ownership, readiness, channel state; place a strict maximum message size and bounded replay/ACK maps. ACK only after applied to the SINGLE simulation engine. Critical `STOP` is locally immediate on both ends; use reliable critical control with ACK/retry budget if needed, while independent Web-side timeout guarantees STOP if messages disappear. Do NOT equate `send()` enqueue success with an applied ACK.

Use monotonic local timestamps for RTT `now - sentAt(seq)`; never subtract Android's system clock from Web's clock. Avoid unbounded `RTCDataChannel.bufferedAmount` and avoid queueing obsolete axes. Do not let a delayed ACK to an older session re-arm or change new session state. Show link owner, connected vs approved vs ready vs armed distinctly. Do not force pairing through a new signaling server. Discuss local QR candidate connection limitations and firewall/mobile data behavior accurately.

Address known risks explicitly:

- `SIM_CONTROL` must not become a second hidden input producer competing with local `inputAxes()` or local throttle integration.
- Existing Web `postMessage` iframe forwarding is removable if canonical single page owns RTC; clean up all timers, listeners, stale `simulatorReady`, pending promises and old iframe paths. If any message bridging remains, validate origin, source, session and message schema.
- Mobile `onStatus`, `onAck`, `doStop` and `send()` must distinguish preview vs armed authoritative state, stale ACK, **critical DISARM**, timers, foreground/background and heartbeat. Current `isOwned()` gating should gate transmission/arming, not all touch visualization.
- A receiver STOP/reconnect must require a NEW explicit ARM, with throttle <=1050 µs. No reconnect auto-resume. STOP always works locally even with a closed channel.
- On loss/blur/background/rotation, immediately neutral directional axes; disarm and set throttle 1000 under STOP/disconnect/ownership-loss policy. Reflect safe state in both UIs.
- Do not expose sensitive device data in logs/QR URLs; prevent replay and unauthorized control. Ensure any Android WebView JavaScript bridge/native handler doesn't expose controls to unexpected origins. No insecure broad cleartext network exceptions.

## F. MATHEMATICAL TRIPOD THRUST, HEIGHT & MOTOR MODEL

The real drone is **mechanically held on a tripod**. Build a quantitative virtual constrained-rig response, NOT a free-flight height-hold/autopilot. Choose consistent SI units in physics and convert to UI: meters→cm, rad/s→RPM, N and kg. Explain that all coefficients are educational unless measured calibration data exists.

### F1. Motor/prop actuator state

For each motor `i=1..4` at fixed `dt=0.004 s`:

- `u_i = clamp(throttleBase + roll/pitch/yaw mixer correction, idle .. max)` from current 250-Hz PID/mixer.
- Convert `u_i` to voltage-aware requested shaft speed `omega_cmd_i` within realistic bounded calibration, including battery and load. Define clearly what happens for DISARM (zero) and ARM-at-idle.
- **Actual** angular velocity follows `d omega_i / dt = (omega_cmd_i - omega_i) / tau_motor` (or exact exponential `omega_i += (omega_cmd_i-omega_i)*(1-exp(-dt/tau_motor))`). No instant jumps. Test motor-lag slider.
- Thrust `F_i = k_T * omega_i^2` and reactive yaw torque `Q_i = spinSign_i * k_Q * omega_i^2`; render RPM from actual `omega`, not just command. Keep the existing right/left/front motor labeling and CW/CCW spin direction consistent with the canonical F450 assets/mixer. Add bounded derivative filtering as needed. Real coefficient values `k_T,k_Q,omega_max` must be explicit/configurable with a documented baseline; if uncalibrated, label **educational estimate**.
- Net vertical thrust `F_up = sum_i(F_i) * max(0, cos(roll)cos(pitch))`; weight `W=(m_frame+m_payload)*g`; `thrustToWeight=F_up/W` (for a free flight interpretation, informational only).
- A throttle increase must progressively update `u_i→RPM_i→F_i→F_up`; all four readouts, sound, downwash and vertical gauge use the same actual state. Throttle 1000 DISARM gives zero outputs.

### F2. Vertical motion on constrained tripod

Implement a restrained slider/flex DOF of the mount instead of detaching the quadcopter. Let `z` be **mount vertical deflection/slider travel**, not world flight altitude. Model for example:

`m_eff*z_ddot = F_up - W - k_spring*z - c_damper*z_dot + F_support(z)`

with nonpenetration and hard-stop constraints `z in [0, z_max]` (select modest `z_max`, e.g. 0.08–0.20 m, appropriate to model); stable contact projection/implicit or semi-implicit integration; continuous acceleration/velocity and no jumps or jitter. For a fully rigid clamp alternative, show only millimeters/cm of elastic stand deflection, and clearly label it. At low thrust bottom stop supports weight; high thrust compresses/extends against the upper stop, never launches off the stand. Add visible sliding mast/telescopic sleeve or spring/flex connector so the drone does not appear to float detached. Keep drone pivot origin correctly attached to support at all heights.

Show: throttle µs, four requested/actual motor RPM, net thrust N, weight N, thrust/weight, `z` cm, `v_z` cm/s, up/down trend arrow, mount stop state (`BOTTOM / MOVING / UPPER STOP`), and optional force-vector cue. Don't add barometer/GPS altitude hold or pretend this is an actual free-flying altitude controller. Validate mass/forces and throttle increasing vs decreasing via reproducible numeric traces. Rendering should clearly show up/down response; magnify the *visual* travel a little only if clearly declared and never distort numerical units.

### F3. Body dynamics and PID/mixer coupling

Use torque sum about actual motor arm vectors `tau = Σ(r_i × F_i) + tau_yaw + tau_disturbance`; rotations via inertial dynamics `J*omegaDot = tau - omega×(J omega) - damping` (or a justified simplified rigid-body approximation). Integrate at fixed 250 Hz; display `roll/pitch/yaw`, rates deg/s, target and measured, motor saturation and integrator histories. Center of gravity, battery, payload, wind and motor lag must influence this actual plant. Ensure single motor torque/mixer sign consistency through automated 3D-direction tests: positive Roll lowers designated side, positive Pitch lowers nose, reversed input Yaw produces expected nose rotation, CW/CCW pair torque works. The tripod's roll/pitch limits and yaw capability must be represented as physical constraints; don't make the aircraft fly away.

**Energy:** motor sound/visuals must use actual `omega_i`; battery droop and payload should change response. Wind should perturb tilt, not arbitrarily rotate a fixed visual object independently of physics. Slow throttle decrease must physically reduce RPM/lift with lag; STOP must bring all outputs to zero rapidly and safely with fade rather than residual perpetual spinning.

## G. CONTROL THEORY — RATE, ANGLE, CASCADE & PID FEEL

There are **distinct PID banks** for Roll Rate, Pitch Rate, Yaw Rate and, in ANGLE, Roll Angle and Pitch Angle plus the ANGLE-mode inner rate banks if currently separate. Inspect `js/tripod-physics.js` defaults and use current known stable gains as educational defaults; do not overwrite user-tuned presets with arbitrary values. Units/scaling must be written down.

**Pure ACRO/RATE**: `desiredRollRate = shapedRoll * 220 deg/s`, `desiredPitchRate = shapedPitch * 220 deg/s`, `desiredYawRate = shapedYaw * 180 deg/s` (adapt only if already bounded differently and explain). Center stick → desired rate exactly zero; **no attitude hold, auto-level or capturing a release-angle setpoint**. A tilted drone remains tilted after angular rate settles, unless mechanical limits/disturbances dictate otherwise.

**ANGLE cascade**: `desiredAngle = trim + shapedStick * 26 degrees` for Roll/Pitch. `angleError=desiredAngle-measuredAngle`; outer angle PID generates bounded desired rate; inner Rate PID tracks gyro angular velocity; mixer drives four motors. Yaw goes directly to Rate PID; **no yaw angle PID**. Zero Roll/Pitch stick → calibrated level target. Display the outer and inner errors and P/I/D terms separately.

Use `error = target - measurement`, scaled integral accumulation `I_state += error*dt`, antiwindup conditional/back-calculation or clamping, filtered D on measurement (mitigate derivative kick), PID output saturation, motor authority drop/saturation, and mode-transition handling. Preserve live PID Apply while running: update gains without instantly resetting attitude, throttle or RPM; reconcile integrator state safely (bumpless transfer or explicitly documented integral reset only). `Reset Integrators` is a separate explicit action. Physical response must come from the controller equations and plant, not visual noise inserted solely based on preset name.

**Observable low/high tuning differences (use same initial state, test disturbance, load, battery and timestep):**

- **Low P:** slower/smaller rate correction, longer rise and recovery, larger disturbance error.
- **High P:** stronger/faster response; near/above stability range gives overshoot/hunting/oscillation and motor saturation. Do not falsely guarantee instability at every high value; demonstrate chosen test values actually straddle a meaningful dynamic range.
- **Low I:** sustained bias/disturbance causes long-lived nonzero error or droop.
- **High I:** removes bias faster but can wind up / rebound / oscillate under saturation; antiwindup limits numerical explosion.
- **Low D:** less damping and overshoot control.
- **High D:** increased damping and noise sensitivity (with explicit filtered gyro noise model), potentially chattering motor commands. Distinguish D effects from merely modifying audio.
- **Cascaded ANGLE:** outer-loop correction should be visibly distinct from inner rate response. Hold/level convergence demonstrable even after perturbation; ACRO must not level.
- **Yaw:** separate rate PID and physically correct reactive motor torque, proper reversed-stick sign; test release to zero commanded yaw rate.

Provide Stable/Low P/High P/Low I/High I/Low D/High D presets and clear A/B test with identical deterministic noise seed, throttle, initial angles/velocities, load, battery, CG and disturbance. Expose traces and measured metrics: rise time, settling time, overshoot %, RMS error, peak angular rate, motor saturation duration, steady-state bias, RMS motor command jitter, vertical displacement and disturbance recovery. Present `N/A` if a metric cannot be meaningfully determined; never invent values or infer stabilization from static labels.

Provide selected-axis and selected-loop graphs, target vs actual, outer-loop setpoint, inner-loop measured rate, P/I/D contributions, PID sum, motor M1..M4 output, battery/RPM/thrust, and up/down displacement over time. Graph pause/reset must not stop flight simulation. P/I/D editing and A/B computations must be usable with the app's Android controller connected; local Web PID tuning updates only the virtual plant, never firmware.

## H. 3D GRAPHICS, AIRFLOW, LIGHTING & PHYSICAL FEEDBACK

Use the same GLBs and assembly-derived transforms as the existing `js/tripod-assembly-model.js`, authoritative motor origins/directions, propeller ordering and bright but restrained blue reference lighting. Drone should occupy more of the viewport with realistic material roughness, rim/fill lights, contact shadow, subtle HDR-style tone mapping where supported, high-resolution antialiasing, optimized GPU load and zoom/orbit presets. Preserve the stand, floor, gridded plane, and large clean visual layout. Red nose arrow only; no FRONT/BACK/LEFT/RIGHT text overlay. The front indicator must rotate with the aircraft, be clearly attached, not float or duplicate.

Every motor should have its own rotor spin, speed-based motion blur, translucent thrust tube/downwash cone, layered animated vortex rings, floor dust and subtle ground wash. Effects intensity should use actual individual thrust and vertical gap; fade when throttle declines and clear on STOP. Show roll/pitch torque effects through different motor speeds and directionally relevant wash; show thrust-induced vertical mast deflection and recoil/damping. Use accessible optional effect intensity presets and adaptive quality for weak Android WebViews. Maintain one render/update loop, clean disposal and no duplicate audio oscillators.

**Audio**: current users find motor sound irritating. Default QUIET (~20–30% of safe in-app master level); modes QUIET / NORMAL / DETAILED, plus Mute. Start only after a user gesture. Use four gentle layered motor voices with actual simulated RPM for frequency, moderate low-pass filtered prop wash/noise for speed, small motor asymmetry spread, smoothing for gain/frequency and compressor/limiter to avoid shrill harsh tones and clipping. Avoid loud beep on startup, hard square waves, repeated UI chimes and excessive high frequencies. True zero after STOP/disarm / page teardown. Test master volume, mute persistence and quiet default. Make sound changes perceptible for P/I/D-induced motor corrections without letting poor tuning simply create an artificial alarm.

## I. UI POLISH — WEB AND ANDROID

Create responsive polished production UI: consistent ZEBJUS colors with dark navy foundation, crisp white type, teal/cyan motion highlights; red only for STOP/error. Accurate link/ARM/OWNER status, tooltips and visual disabled states that do not make preview sticks appear frozen. Adapt phone heights, rotate/reverse landscape, cutouts, notches, gesture bar, camera permission screens, browser `prefers-reduced-motion`, loading/error/skeleton states, `focus-visible`, ARIA labels and keyboard fallback. Ensure 3D camera drag does not steal joystick touch and connection gear does not overlap any critical control. Remove stray underline under old TRIPOD PID SIM navigation and replace title/active semantics cleanly without hiding true focus indicators.

Include professionally composed UI screenshots for: Web disconnected, connection drawer Step 1/2, Web mobile-controlled mirrored sticks and numeric throttle, PID/vertical test with props/wash, Android connected landscape, Android preview disconnected, Android gear pairing, STOP/stale state. Include clear annotated control/data-flow architecture and joystick/physics flow diagrams in documentation. A simple vector drawing or screenshots of actual render are preferable to random stock imagery. No licensing-unclear images or external runtime dependency required. The supplied `diagrams/` SVG files are concepts, not finalized design.

## J. RELEASE ENGINEERING AND REGRESSION

**Safe execution order:** (1) capture repo HEAD and test baseline; (2) audit stale code and root-cause pointer bug; (3) choose single-page route/ownership architecture; (4) remove Virtual LED *only* from WebRTC feature; (5) merge WebRTC gear/modal into canonical Flight Training; (6) implement bidirectional authoritative mirrored controls; (7) math/vertical thrust/PID improvements; (8) UI/lighting/audio; (9) test; (10) review PR; (11) publish when green.

- Keep all current Assembly Lab, wiring, Python Lab, Firmware, QR/code methods and Android permissions working. Update nav tests, service worker precache, app-version release stamp and README; remove stale links/labels.
- Native Android package must remain **`in.zebjus.dronelab.companion`** and use the **existing production ZEBJUS signing key**, not the attached Aerion development/NewKey APK. Increment `versionCode` above `11`; appropriately bump versionName, APK filename, app UI version and release metadata. Do not expose keystore or secrets; use existing GitHub secret-backed workflow; verify certificate fingerprint and in-place upgrade compatibility, rather than promise it without proof.
- Required automated: `npm test`, `npm run check`, Python Lab regression, existing firmware/assembly/offline validation, tripod physics/3D browser tests, real two-browser encrypted WebRTC QR/code pairing, actual receiver ACK/STOP and duplicate-owner rejection, Android compile/signing and emulator multi-touch where possible. Add deterministic P/I/D and vertical thrust numerical unit tests and end-to-end display checks.
- Use emulator/actual phone at **multiple aspect ratios and refresh rates**: 16:9, 19.5:9 landscape; sensor/reverse landscape; two simultaneous pointers; moving over zones; focus/blur; background/foreground; QR camera; temporary and prolonged disconnect; jitter 80–300 ms, packet loss and backpressure. Performance budgets documented, e.g. 25 Hz command protocol under normal link, 250 Hz fixed physics, UI readout 10–20 Hz, smooth render when possible. Measure actual latency instead of promising zero lag.
- Ensure real Android screenshots and logs are gathered where available. A successful desktop Playwright pointer test does **not** prove native Android touch is functioning. If phone testing isn't accessible, mark it **UNVERIFIED**, explain exactly how user should verify and avoid automatically declaring final release ready if this is a release blocker.
- Work in a feature branch, commit reviewable phases, open PR. Merge/publish `main`, GitHub Pages and signed APK **only when mandatory CI and available device acceptance pass and after reconciling any concurrent changes**. When blocked, leave PR with explicit checklist and next actions rather than force-push or claim completion. Confirm real published URLs/build IDs, not assumed paths. Report changed files, test evidence, screenshots, release package hash, signing verification and remaining limitations.

## K. REQUIRED TESTS (DEFINITION OF DONE)

Use `TEST_MATRIX.md` as exhaustive test tracking. At minimum these MUST PASS:

1. Cold-open Android **without connection**: both joysticks visibly follow fingers in PREVIEW ONLY; both return to visual defaults; no simulator ARM, no commands to real motors.
2. After full existing QR/code connect + PIN approval + ownership + receiver ready, Android ARM works only at throttle <=1050. A new input causes actual authoritative command and ACK.
3. Android left stick up: `1000→1100→1300→1500` over suitable durations; release holds at exactly last applied throttle within quantization; WebApp displayed throttle mirrors Android; four motors respond with lag; thrust N rises; visible tripod constrained `z` goes up; dust/downwash/audio change consistently.
4. Android left stick down: motor thrust and vertical displacement decrease, damped return. STOP: local immediate OFF and Web zero motors/sound/airflow/axes; cannot silently auto-ARM after restore.
5. Hold two thumbs simultaneously (left throttle+yaw, right pitch+roll); both visual knobs update independent pointer IDs and Web mirror follows same valid axes. Release right then left: axes neutral, throttle retained. Invalid pointers/second touches cannot steal active controls.
6. Yaw right uses **reversed DroneLab sign** on BOTH app and Web. ANGLE centers toward trim; ACRO zeroes target rate with no automatic leveling.
7. Change Roll/Pitch/Yaw inner Rate PID and outer ANGLE PID live while running: graph, response, motor output and audio reflect adjustments. Different P/I/D presets yield quantitative measured differences under controlled disturbance and A/B. No fake graphic-only oscillation.
8. Mobile controlling: Web input is clearly VIEW ONLY and cannot override; releasing mobile control safely transitions to Web. Stale packet/incorrect owner/wrong session is rejected and never applied.
9. WebRTC gear opens on the **single Flight Training page**; QR/code, verify, grant/release and disconnect work; no separate Android Flight tab, no WebRTC Virtual LED UI anywhere, and no underline or old title. Old `#simcontrol` bookmarks direct users to canonical page.
10. 3D F450 GLBs, nose arrow, 4 motors, constrained tripod mast, camera, mobile layout, sound stop/restart, muted quiet default, graphics fallbacks, and service-worker update all work offline where previously supported (signaling still needs network when using codes).
11. Production in-place APK upgrade validates same app ID/signature and increased versionCode. No copied Aerion certificate; no firmware/ESP32 flash changes.

**Do not report done until all applicable acceptance items show evidence**. Output (a) audit, (b) implementation diff/PR, (c) automated and device testing, (d) screenshots and numeric trace comparison, (e) deployed Web and signed APK links plus hashes, (f) incomplete issues clearly labeled. Any simulated thrust/PID parameter not physically calibrated must be labeled an educational estimate rather than real-flight validation.

## REFERENCE HIERARCHY / RESOLVING CONTRADICTIONS

1. **This assignment** overrides conflicting recommendations in older attached guides where the scope evolved.
2. Current `dronelab/main` source/protocol is authoritative for the target application's infrastructure and safety.
3. Attached `ZEBJUS_WebRTC_Android_Joystick_Integration_Prompt.md` provides detailed touch, three profiles, WebRTC, safety and landscape design. It contains an example 10-channel transport **ONLY as a hypothetical alternative**; target currently uses normalized `SIM_CONTROL` with `axes`.
4. Attached `ZEBJUS_Tripod_Simulator_Port_Guide_and_Prompt.md` provides scene/PID/physics reference, but its standalone browser-only/no Android and older RATE HOLD details are **not** valid for final integrated scope. Here we REQUIRE single integrated WebRTC Flight Training and pure ACRO.
5. Aerion v18.3.83 repository/APK supplies joystick visuals, rotor/airflow/3D and good UX ideas, not licensing-unclear media, physical kit adapters, ESP32 firmware, AP/STA onboarding, signing identity, runtime build dependencies or arbitrary sensor assumptions.

**Finish the implementation. No standalone mockup, no duplicated simulator, no static screenshot passed off as working joystick, and no false green link/ACK.**
