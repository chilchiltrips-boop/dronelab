# Android joystick integration prompt — existing WebRTC app

ഈ prompt പുതിയ project-ിലെ നിലവിലുള്ള Android App + Web App-ിലേക്ക് joystick കൂട്ടിച്ചേർക്കാനാണ്. ഇപ്പോഴത്തെ communication **WebRTC DataChannel** ആണ്. AP/STA selection അല്ലെങ്കിൽ Wi-Fi setup ഈ scope-ിൽ ഉൾപ്പെടുന്നില്ല. താഴെയുള്ള English prompt coding assistant-ന് അതേപടി നൽകാം.

## Reference from the existing Aerion controller

The source controller's Android activity uses `sensorLandscape`. Its WebView flight screen has a dark cockpit, two touch zones, floating cyan joystick bases, a five-second Aerion splash, and a 10-channel control vector. Left stick controls yaw and gradual throttle; right controls roll and pitch. The left throttle holds its value on release; yaw, roll, and pitch center. The source transmits at a nominal 40 ms tick. The new project's WebRTC DataChannel is a **different transport**: reproduce the useful interaction and channel semantics, then adapt the wire format to the new project's existing protocol. Source locations: `android-app/app/src/main/AndroidManifest.xml`, `tools/flight_app_source.html`, and `control-sticks.js` in the Aerion repository. The profile numbers and JSON examples below are **proposed target specifications**, not claims about the old app.

## Copy/paste implementation prompt

You are modifying my **existing Android app and its existing Web App simulator**. Add the Android flight joystick controller and its WebRTC DataChannel integration. Preserve the project's current framework, connection/signaling flow, DataChannel configuration, simulator scene, and established message schema wherever possible. Inspect those files first and identify the precise path from DataChannel input to simulator control and feedback. Integrate into that path; do not make a separate demo or replace the app.

### Scope and transport

- Android App ↔ Web App control and feedback currently travel through **WebRTC DataChannel**. Reuse the already connected peer and channel. Do not add HTTP polling, UDP, a second signaling system, or an assumed backend for joystick commands.
- There must be **no AP/STA mode picker, hotspot onboarding, network settings, kit pairing, or Wi-Fi connection flow** in this release. Design the controller/transport boundary so a future AP transport adapter can be added without rewriting joystick logic, but do not implement, expose, or require AP now.
- This is a simulator controller. Use the existing app's virtual ARM, STOP, control ownership, and simulator safety model if present. Do not accidentally route the new controls to physical hardware.
- If the current WebApp already defines message names, units, channel count, sequence fields, acknowledgements, or a receiver API, document and use those. Treat the example message later in this prompt as a reference only; changing the existing wire format requires updating both ends together.

### Screen and opening animation

- Keep the Android controller in **landscape** (including reverse landscape when supported), handle display cutouts and bottom/system safe insets, and retain the app's proper Android lifecycle behavior. If launched in portrait before orientation settles, present a simple rotate cue; never leave joysticks squeezed into a portrait layout.
- Show a roughly **five-second** nonblocking startup sequence: deep navy/black background, subtle cyan technical grid, centered drone mark/logo (use a licensed asset already in the project, or a clean geometric placeholder), faint orbit, four brief rotor glows, a horizontal scan, AERION-style title treatment, and a slim progress line. Reveal the controller with a short fade around 4.65–5 seconds. Respect reduced-motion settings. The controller must render even when WebRTC is disconnected; show a clear disconnected state rather than keeping the splash up.
- Visual language: dark cockpit, cyan/teal luminous joystick ring, pale blue/white knob, restrained blue glow while held, high-contrast labels, a distinct state for disabled/disconnected controls. Animation should be smooth and follow the pointer without lag; do not animate the command itself past the user's position. Red is reserved for STOP/warnings, not normal joystick motion.
- Top bar: current DataChannel connection state, controller ownership if the app supports it, virtual ARM/DISARM, ANGLE/ACRO (RATE) selector, STOP, and one settings button. Keep the flight field uncluttered. Do not display obsolete kit, firmware, or AP/STA controls.

### Joystick geometry and touch behavior

- Provide two independent large thumb zones. **Left: throttle (vertical) + yaw (horizontal). Right: pitch (vertical) + roll (horizontal).** Label each axis visibly. Both sticks must work simultaneously with different pointer IDs.
- When idle, show each base at a comfortable **default location**: low on its side, inward enough for thumb reach, with enough space above the bottom gesture/navigation inset and away from the top controls, center readouts, and STOP. Calculate positions from available landscape dimensions and safe insets instead of fixed pixels. Recalculate on rotation, resize, and inset changes. Scale the rings modestly on short screens; do not put them under system bars.
- On the first valid `pointerdown` inside a zone, move that stick's **base center to the exact touch point** and place its knob at that same point. That touch is zero displacement: no control jump or first-frame spike. The point where the user touches becomes that stick's drag origin until release. Do not recenter the base continuously while dragging. Keep the touch anchor in screen coordinates and pointer capture per stick. A second finger cannot steal an occupied stick; the other stick continues independently.
- Compute `(dx, dy) = currentPointer - initialTouch`, divide by the active stick radius, clamp the vector length to 1, and use screen-down-positive `dy`. The knob follows this bounded vector. Handle edge touches with a suitable rendering layer/safe-area sizing: do not silently change the control origin because a decorative ring would clip. Avoid scroll, selection, and browser gestures over the zones (`touch-action: none` where appropriate).
- Show **position text while touched** near each joystick without covering the thumb: normalized `X/Y` (-100…100%), touch anchor position within its zone (for UI/debug only), axis names, and the mapped output (CH values or their established equivalent). Keep a compact persistent readout for roll, pitch, yaw, throttle, mode, virtual ARM, DataChannel status, and feedback latency. Do not send raw screen pixels as flight commands.
- On `pointerup`, `pointercancel`, lost pointer capture, screen blur, app background, or orientation change, release the affected pointers. Roll, pitch, and yaw immediately return to neutral; **throttle retains its last bounded value** on an ordinary touch release. The base returns smoothly to its default visual position. On STOP, disconnect, or ownership loss, apply the safety behavior below rather than retaining throttle.

### Exactly three response presets

The settings UI contains only **Slow, Medium, Fast** for joystick response. Default is **Medium**; persist the selection locally. Do not expose separate sensitivity, deadband, expo, or throttle-speed sliders in this version. Implement these presets as an internal table, with the project's simulator limits taking precedence:

| Preset | Deadband | Expo | Directional response | Throttle change at full vertical input |
|---|---:|---:|---|---:|
| Slow | 0.05 | 0.40 | gentler near center; use existing simulator's lower rate/slew setting | 200 channel units/s |
| Medium (default) | 0.04 | 0.20 | normal response | 400 channel units/s |
| Fast | 0.03 | 0.05 | quick response; use existing simulator's upper allowed rate/slew setting | 600 channel units/s |

For an axis input `v` in `[-1,1]`, use `n = max(0, (abs(v) - deadband)/(1 - deadband))` and `shape(v) = sign(v) * ((1 - expo)*n + expo*n^3)`. Then apply the existing simulator's bounded rate/sensitivity convention for the selected preset. Do not unexpectedly alter the simulator's maximum safe output. Throttle is **integrated with elapsed seconds**, not tied to render frame count: `throttle = clamp(throttle - shape(leftY) * throttleUnitsPerSecond * dt, 1000, 2000)`. Thus pushing up (negative screen Y) increases throttle. Avoid a large jump after a paused frame by bounding/resetting `dt`. A preset change while a stick is held must not create a spike; reset directional output to neutral or apply the new curve at a safe boundary. STOP overrides every preset immediately.

### Control mapping and simulation modes

Map the normalized joystick state to the existing receiver's schema. If the Web App uses the Aerion-style 10-channel vector, use this mapping and clamp/validate every entry:

| Channel | Meaning | Neutral / initial | Command |
|---|---|---:|---|
| CH1 | Roll | 1500 | `round(1500 + shapedRightX*500)` |
| CH2 | Pitch | 1500 | `round(1500 - shapedRightY*500)` |
| CH3 | Throttle | 1000 | integrated and clamped `1000…2000`; holds on touch release |
| CH4 | Yaw | 1500 | `round(1500 + shapedLeftX*500)` |
| CH5 | Virtual ARM | 1000 | 1000 disarmed, 2000 armed |
| CH6 | Mode | 1000 | 1000 ANGLE, 1500 ACRO/RATE, if the receiver uses these values |
| CH7–CH10 | Reserved | 1000, 1000, 1500, 1000 | Preserve receiver semantics; never reinterpret without checking |

If this project uses normalized axes rather than these 10 channels, implement an explicit conversion at the transport/receiver boundary and show the same effective values in the UI. Never send both representations and apply both as duplicate commands. Do not silently change existing receiver values for mode or ARM; inspect its definitions first.

- **ACRO / RATE is pure acro.** Stick displacement commands angular rate. A centered roll/pitch/yaw stick commands zero angular rate; it does **not** auto-level and does not hold a target angle. Integrate angular rate into simulated attitude with the simulator's existing time step, damping/physics, and limits.
- **ANGLE maintains angle/level behavior.** Centered roll/pitch seeks level; stick displacement sets a bounded target angle, with the existing angle controller maintaining that angle. Yaw follows the established simulator mapping.
- Make mode changes unambiguous in the UI, DataChannel control state, receiver, and returned feedback. Apply the project's safe transition policy (for example, requiring disarm before changing mode) if it already exists.

### DataChannel sender and feedback

- Reuse the existing live `RTCDataChannel` instance. Send the **latest full control state** on a nominal 40 ms (25 Hz) tick when the channel is open and control is owned. Match an established project frequency if it differs. Never build an unbounded queue: inspect `readyState`/`bufferedAmount`, skip obsolete continuous frames under backpressure, and resume with the newest state. Sequence numbers must increase within a session. Validate and bound every number before serialization.
- The following JSON is an **illustrative adapter**, not a mandate to break the current schema. If the receiver supports 10 channels, a single control snapshot may be:

```json
{
  "v": 1,
  "type": "control",
  "sessionId": "current-peer-session",
  "seq": 184,
  "mode": "ACRO",
  "virtualArmed": false,
  "preset": "Medium",
  "channels": [1500, 1500, 1000, 1500, 1000, 1500, 1000, 1000, 1500, 1000]
}
```

- CH1–CH10 above are the actual commanded state; the on-screen normalized X/Y and anchor coordinates are **local presentation data**. Add normalized axes to the wire format only when the existing receiver expressly expects them. If using `sentAt` or equivalent, measure round-trip latency from a locally retained send time matched to an acknowledged `seq`; do not subtract independently running device clocks.
- Receiver: reject malformed payloads, wrong session, out-of-order/stale sequence values, nonfinite or out-of-range channels, and control from an unauthorized peer. Apply each accepted snapshot once. Use the project's existing WebRTC reconnection handling. Include a simulator-side stale-control timeout and a safe state on lost channel/ownership.
- Return feedback over the existing DataChannel message handler: the accepted sequence, applied mode, virtual ARM status, accepted/applied channels or normalized axes, simulator status if available, and a warning/reject reason. Example shape to adapt to the existing protocol:

```json
{
  "v": 1,
  "type": "control_ack",
  "sessionId": "current-peer-session",
  "ackSeq": 184,
  "accepted": true,
  "mode": "ACRO",
  "virtualArmed": false,
  "appliedChannels": [1500, 1500, 1000, 1500, 1000, 1500, 1000, 1000, 1500, 1000]
}
```

- Display **sent vs acknowledged** state, measured round-trip time, and a visible stale/no-feedback indication. Do not label a frame “applied” solely because `send()` returned. Keep a short in-memory `seq -> localSentTime` map and expire old entries. Rate-limit or coalesce UI updates without delaying control.
- Treat ARM/DISARM and STOP as critical state changes: use the established reliable message/ack mechanism, repeat until acknowledged if the existing protocol requires it, and ensure STOP/neutral is applied locally immediately. If a separate reliable DataChannel is already present, use it; otherwise use the project's existing channel contract. Do not create an incompatible second channel just for this feature.

### Virtual safety and lifecycle

- On fresh startup, disconnected state, or loss of control: directional channels centered, throttle 1000, virtual ARM off. Explicit ARM is allowed only when the channel and ownership are ready, the WebApp confirms readiness, and throttle is at or below the existing safe threshold (Aerion reference: 1050). Never auto-arm after reconnect or foreground resume.
- STOP immediately makes the local command neutral with throttle 1000 and virtual ARM off, clears active touches, sends the safe state/critical event when possible, and requires a new deliberate ARM. The receiver's stale timeout must independently fall back to a safe state if the sender disappears. Keep normal joystick-release throttle hold distinct from STOP/disconnect behavior.
- Use the WebApp's current simulator feedback to explain refused ARM, timeout, stale ACK, and mode mismatch in concise UI text. The splash and decorative animation must never delay STOP handling.

### Delivery and acceptance checks

Implement the feature in the existing Android and Web App project and provide a short file-by-file summary of the changes and the exact message fields used. Include focused checks for the touch origin, dual-pointer independence, radial clamp, no first-touch command jump, throttle hold, immediate directional recenter, three presets, landscape/safe insets, DataChannel reconnect/backpressure, sequence validation, feedback display, STOP, and both simulation modes. Verify on a real or emulated landscape Android screen and an actual Android↔WebApp WebRTC DataChannel session.

Acceptance examples:

1. First touch at any valid point on the left zone places the center **at that point**; outputs stay neutral until the finger moves. Right stick can be held at the same time.
2. Right/up produces positive roll/positive pitch according to the existing receiver convention; left/right produces yaw; left/up raises throttle gradually. Releasing all fingers centers roll/pitch/yaw and preserves throttle until STOP or loss of control.
3. Slow, Medium, Fast feel distinct, selected preset persists, and the settings page contains exactly those three response choices.
4. On ACRO, releasing roll/pitch to center yields zero commanded angular rate and the simulation does not self-level. On ANGLE, centered roll/pitch returns toward level and maintains its target angle.
5. An acknowledged control frame visibly matches the applied receiver state. A stale or closed DataChannel triggers the safe state; reconnect alone never arms.
6. No AP/STA option or AP setup appears anywhere in the new feature. The project stays ready for a transport adapter later without adding it now.
