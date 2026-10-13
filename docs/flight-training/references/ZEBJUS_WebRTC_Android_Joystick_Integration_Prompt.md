# Android joystick integration prompt — WebRTC simulator and AP/STA kit

ഈ prompt പുതിയ project-ിലെ Android App + Web App-ിലേക്ക് joystick-ഉം പഴയ AP/STA kit connection flow-ഉം ചേർക്കാനാണ്. Simulator-ലേക്ക് Android ↔ Web App control/feedback **WebRTC DataChannel** വഴിയാണ്. Kit connection-ന് **AP direct** അല്ലെങ്കിൽ **STA local network** തിരഞ്ഞെടുക്കാം. ഈ രണ്ടു വഴികളും വ്യക്തമായി വേർതിരിച്ച്, ഒരേ സമയം ഒരു active control destination മാത്രം ഉപയോഗിക്കണം. താഴെയുള്ള English prompt coding assistant-ന് അതേപടി നൽകാം.

## Reference from the existing Aerion controller

The source controller's Android activity uses `sensorLandscape`. Its WebView flight screen has a dark cockpit, two touch zones, floating cyan joystick bases, a five-second Aerion splash, and a 10-channel control vector. Left stick controls yaw and gradual throttle; right controls roll and pitch. The left throttle holds its value on release; yaw, roll, and pitch center. The source transmits at a nominal 40 ms tick. The new project's Android ↔ Web App simulator uses **WebRTC DataChannel**. Restore the older kit's AP/STA connection flows as separate, authenticated network paths; inspect the current kit firmware and both client protocols before choosing addresses, message framing, or authentication. Reuse the useful interaction and channel semantics without conflating the WebRTC simulator and physical-kit transports. Source locations: `android-app/app/src/main/AndroidManifest.xml`, `tools/flight_app_source.html`, and `control-sticks.js` in the Aerion repository. The profile numbers and JSON examples below are **proposed target specifications**, not claims about the old app.

## Copy/paste implementation prompt

You are modifying my **existing Android app and its existing Web App simulator**. Add the Android flight joystick controller, restore the previous **AP and STA kit connection flows in both Android and Web App**, and retain the WebRTC DataChannel simulator integration. Preserve the project's current framework, existing connection/signaling flow, simulator scene, kit firmware interfaces, and established message schemas wherever possible. Inspect the actual Android, Web App, and firmware files before editing. Identify (1) the exact DataChannel-to-simulator path and (2) the existing kit connection, authorization, RC, telemetry, and failsafe paths. Integrate into those paths; do not make a separate demo or replace the app.

### Scope and transport

- Keep **Android ↔ Web App simulator** control and feedback over the existing WebRTC DataChannel. Reuse the connected peer/channel and its signaling. Do not introduce HTTP polling, a new signaling service, or an assumed backend for simulator joystick frames.
- Restore **kit connection over AP or STA** in both clients. AP: phone/computer joins the kit's advertised access point and reaches its firmware-provided local endpoint. STA: kit joins a user-selected infrastructure Wi-Fi network; Android and Web App discover/reach it on the local network under the project's supported topology. Reuse the firmware's authenticated control/telemetry protocol (whether it uses HTTP, WebSocket, UDP, or another existing transport); verify it from source. Do not blindly send WebRTC JSON to the kit or route kit RC through an untrusted browser relay.
- Put the two destinations behind an explicit controller interface: **SIMULATOR (WebRTC)** or **KIT (AP/STA)**. The AP/STA switch selects the kit's network mode; it does not change the WebRTC DataChannel protocol. Only one destination can own/transmit control at a time. Make the target and actual connection visible before enabling ARM or sticks.
- Preserve virtual ARM/STOP in simulator mode and the firmware's separate authorized ARM/STOP/failsafe rules in kit mode. A virtual ARM packet must never be forwarded to physical hardware. Do not enable hardware control merely because a phone joined the AP or discovered a STA IP.
- If existing messages, channel units, security handshakes, pairing/ownership, ACKs, or receiver APIs differ, document and honor them. The JSON examples later in this prompt are simulator-side reference shapes, not a mandate for kit firmware.

### Restored AP/STA kit connection in Android and Web App

Build the same clear setup and control-state model on both surfaces, reusing working code and firmware endpoints from the old implementation after auditing what still exists. Do not invent a kit password, fixed IP, DNS name, device ID, or new security protocol.

| Destination | Network / link | What can transmit | Visible state |
|---|---|---|---|
| Simulator | Existing Android ↔ Web App WebRTC DataChannel | Simulator joystick/feedback and virtual ARM | Peer/channel, grant, ACK, simulator state |
| Kit · AP | Client joins this kit's AP; kit local endpoint | Firmware-approved, owner-authorized RC/telemetry | SSID, device ID, AP connected, auth, ownership, firmware status |
| Kit · STA | Kit and client have an approved reachable LAN path | Same authorized kit commands/telemetry as AP | SSID/LAN reachability, device ID, STA connected, auth, ownership, firmware status |

- Expose a compact **Simulator / Kit** destination control and, under Kit, an **AP / STA** segmented toggle on the connection/settings panel in both Android and Web App. Show the selected mode and **actual** link state separately; a selected tab does not mean connected. Keep the flight header on one readable line on landscape screens; move detailed setup into a panel rather than stretching the header. Control activation is separate from connection.
- **Identify a kit by its immutable device ID**, verify identity during every reconnect, and show its human-friendly FlightCore name/board when available. Keep a saved kit list and the user's last selected kit, without auto-selecting a different device with the same friendly name. Do not require an obsolete invitation or pairing code when the firmware's current authorized setup flow does not use it; retain required authentication.
- **AP flow:** Discover/identify the selected kit's advertised SSID using platform-permitted APIs; display it and guide/perform connection using the operating system's Wi-Fi permission and network-selection UX. Ask for the configured AP password securely if required; do not log or embed it in the prompt/UI. Determine the firmware's actual AP address/endpoint from source or a verified discovery response. Probe identity and readiness, complete the existing authorization/ownership handshake, then offer explicit **Connect** and **Enable Control**. Android networking must bind the kit request/socket to the selected Wi-Fi network when necessary, even if that network has no internet; never assume mobile data is the kit. In a browser, respect that a site cannot silently switch the computer's Wi-Fi; give precise join instructions and validate reachability afterward.
- **STA flow:** In the kit's authorized setup mode, show scanned SSIDs when the firmware supports scanning; allow manual SSID entry for hidden networks, secure password entry, **Test**, then **Save and switch to STA** only after a verified test. Show test error without overwriting the last known-good saved credentials. Track the switch/disconnect, rediscover the *same device ID* using the project's supported mDNS/discovery/list of known endpoints or explicit address entry, verify local reachability/auth, then offer explicit **Connect** and **Enable Control**. Android must work over STA in addition to AP; the Web App must work when the browser can reach the kit on LAN. Describe HTTPS/local-network permission and mixed-content constraints where applicable instead of pretending a blocked browser request succeeded.
- **STA-first kit boot with AP fallback**, if supported by the existing firmware: attempt stored, verified STA credentials for a bounded time; expose reason/status; fall back to AP setup if STA cannot connect. Re-enter AP safely for recovery; preserve the last known-good STA credentials until a new network passes Test + Save. Make the mode switch an acknowledged firmware operation, not a local label change. If this behavior is absent, implement it in the kit firmware as part of this task and document the reboot/handover rules; never claim it works based on UI state alone.
- When switching AP ↔ STA, switching kit ↔ simulator, changing kit, losing authentication/ownership, or changing the Android Wi-Fi network: **neutralize output, set throttle to minimum, disarm/STOP through the existing safety path, stop the old stream, release touches, close/rebind old sockets, and require explicit reconnect and ARM**. Verify that the previous destination cannot receive delayed frames. Suppress stale telemetry/ACKs using device ID and session/epoch checks. Firmware must independently enforce command freshness and failsafe. Never carry an armed or throttle-held state across a network handover.
- Kit telemetry should report real controller readiness, authorized ownership, applied channels, mode, ARM, RSSI/link age where available, and failsafe/stop reason. Differentiate **Wi-Fi associated**, **kit endpoint reachable**, **authenticated**, **control granted**, and **RC ACK fresh**. Errors should suggest the next concrete step without exposing secrets.
- Keep firmware flashing, OTA, and configuration permissions behind their existing authorized flows; adding AP/STA flight connection must not grant flashing rights. Do not make a flashing UI or assume OTA over AP is allowed just because control connects. Keep credential storage in the platform's secure mechanism and avoid echoing passwords in logs/exports.

### Screen and opening animation

- Keep the Android controller in **landscape** (including reverse landscape when supported), handle display cutouts and bottom/system safe insets, and retain the app's proper Android lifecycle behavior. If launched in portrait before orientation settles, present a simple rotate cue; never leave joysticks squeezed into a portrait layout.
- Show a roughly **five-second** nonblocking startup sequence: deep navy/black background, subtle cyan technical grid, centered drone mark/logo (use a licensed asset already in the project, or a clean geometric placeholder), faint orbit, four brief rotor glows, a horizontal scan, AERION-style title treatment, and a slim progress line. Reveal the controller with a short fade around 4.65–5 seconds. Respect reduced-motion settings. The controller must render even when the selected WebRTC or kit link is disconnected; show a clear disconnected state rather than keeping the splash up.
- Visual language: dark cockpit, cyan/teal luminous joystick ring, pale blue/white knob, restrained blue glow while held, high-contrast labels, a distinct state for disabled/disconnected controls. Animation should be smooth and follow the pointer without lag; do not animate the command itself past the user's position. Red is reserved for STOP/warnings, not normal joystick motion.
- Top bar: destination (Simulator or selected kit), actual WebRTC/AP/STA link state, controller ownership, mode, ARM/DISARM, STOP, and settings/connection access. Show AP/STA selection in the Kit connection panel with enough detail to operate it. Keep the flight field uncluttered and do not expose firmware flashing in the flight controls.

### Joystick geometry and touch behavior

- Provide two independent large thumb zones. **Left: throttle (vertical) + yaw (horizontal). Right: pitch (vertical) + roll (horizontal).** Label each axis visibly. Both sticks must work simultaneously with different pointer IDs.
- When idle, show each base at a comfortable **default location**: low on its side, inward enough for thumb reach, with enough space above the bottom gesture/navigation inset and away from the top controls, center readouts, and STOP. Calculate positions from available landscape dimensions and safe insets instead of fixed pixels. Recalculate on rotation, resize, and inset changes. Scale the rings modestly on short screens; do not put them under system bars.
- On the first valid `pointerdown` inside a zone, move that stick's **base center to the exact touch point** and place its knob at that same point. That touch is zero displacement: no control jump or first-frame spike. The point where the user touches becomes that stick's drag origin until release. Do not recenter the base continuously while dragging. Keep the touch anchor in screen coordinates and pointer capture per stick. A second finger cannot steal an occupied stick; the other stick continues independently.
- Compute `(dx, dy) = currentPointer - initialTouch`, divide by the active stick radius, clamp the vector length to 1, and use screen-down-positive `dy`. The knob follows this bounded vector. Handle edge touches with a suitable rendering layer/safe-area sizing: do not silently change the control origin because a decorative ring would clip. Avoid scroll, selection, and browser gestures over the zones (`touch-action: none` where appropriate).
- Show **position text while touched** near each joystick without covering the thumb: normalized `X/Y` (-100…100%), touch anchor position within its zone (for UI/debug only), axis names, and the mapped output (CH values or their established equivalent). Keep a compact persistent readout for roll, pitch, yaw, throttle, mode, simulator virtual ARM or kit ARM as appropriate, selected destination, AP/STA/DataChannel status, and feedback latency. Do not send raw screen pixels as flight commands.
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

If the simulator or kit uses normalized axes rather than these 10 channels, implement a separate explicit conversion for each verified receiver schema and show the effective values in the UI. Do not assume the kit accepts the simulator's CH5/CH6 encoding. Never send both representations and apply both as duplicate commands. Do not silently change existing receiver values for mode or ARM; inspect its definitions first.

- **ACRO / RATE is pure acro.** Stick displacement commands angular rate. A centered roll/pitch/yaw stick commands zero angular rate; it does **not** auto-level and does not hold a target angle. Integrate angular rate into simulated attitude with the simulator's existing time step, damping/physics, and limits.
- **ANGLE maintains angle/level behavior.** Centered roll/pitch seeks level; stick displacement sets a bounded target angle, with the existing angle controller maintaining that angle. Yaw follows the established simulator mapping.
- Make mode changes unambiguous in the UI, DataChannel control state, receiver, and returned feedback. Apply the project's safe transition policy (for example, requiring disarm before changing mode) if it already exists.

### Simulator DataChannel sender and feedback

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

### Safety and lifecycle

- On fresh startup, disconnected state, or loss of control: directional channels centered, throttle 1000, virtual ARM off for simulator and firmware-approved disarm/failsafe for kit. Explicit ARM is allowed only when the **active destination** has a fresh authenticated link, control ownership, confirmed readiness, and throttle at or below its verified safe threshold (Aerion reference: 1050). Never auto-arm after reconnect, AP/STA handover, or foreground resume. Kit ARM additionally requires the firmware's independent authorization and safety checks.
- STOP immediately makes the local command neutral with throttle 1000, virtual ARM off in simulator mode or a firmware-approved disarm in kit mode, clears active touches, sends the safe state/critical event when possible, and requires a new deliberate ARM. Both simulator receiver and kit firmware must independently fall back to a safe state if the sender disappears. Keep normal joystick-release throttle hold distinct from STOP/disconnect behavior.
- Use simulator feedback or real kit telemetry, according to the active destination, to explain refused ARM, timeout, stale ACK, and mode mismatch in concise UI text. The splash and decorative animation must never delay STOP handling.

### Delivery and acceptance checks

Implement the feature in the existing Android and Web App project and provide a short file-by-file summary of the changes and the exact message fields used. Include focused checks for the touch origin, dual-pointer independence, radial clamp, no first-touch command jump, throttle hold, immediate directional recenter, three presets, landscape/safe insets, DataChannel reconnect/backpressure, sequence validation, feedback display, STOP, both simulation modes, AP and STA connection/authorization, Android STA kit control, browser STA reachability, AP↔STA handover, and kit failsafe. Verify on a real or emulated landscape Android screen and an actual Android↔WebApp WebRTC DataChannel session. Hardware-dependent claims require actual kit/network tests; label emulator or mocked checks accurately.

Acceptance examples:

1. First touch at any valid point on the left zone places the center **at that point**; outputs stay neutral until the finger moves. Right stick can be held at the same time.
2. Right/up produces positive roll/positive pitch according to the existing receiver convention; left/right produces yaw; left/up raises throttle gradually. Releasing all fingers centers roll/pitch/yaw and preserves throttle until STOP or loss of control.
3. Slow, Medium, Fast feel distinct, selected preset persists, and the settings page contains exactly those three response choices.
4. On ACRO, releasing roll/pitch to center yields zero commanded angular rate and the simulation does not self-level. On ANGLE, centered roll/pitch returns toward level and maintains its target angle.
5. An acknowledged control frame visibly matches the applied receiver state. A stale or closed DataChannel triggers the safe state; reconnect alone never arms.
6. Both clients show Kit AP/STA selection. AP reaches the selected kit's verified device ID; STA Test does not overwrite working credentials on failure, and after Save/switch both clients can rediscover that same kit on LAN and explicitly claim control.
7. A handover or link failure disarms, sends/maintains safe output, expires old sessions, and cannot auto-rearm or send control to the previous destination. The simulator remains on WebRTC DataChannel and kit controls use only the kit's validated firmware protocol.
