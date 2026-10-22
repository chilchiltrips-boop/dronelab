# Android AP input mirror — Web-owned Tripod simulator

The Tripod simulator consumes a read-only copy of Android joystick commands.
WebApp Run, Stop, Reset, flight mode and PID edits affect only the browser model.
They never arm, claim, release, stop, or configure FlightCore or the Android Kit
session. The simulator's `hardwareInput()` intentionally returns `null`.

## Operation

1. Install the permanently signed Android **1.8.12-input-mirror (code 50)** or later.
2. For AP without Internet, connect the phone and laptop to a reachable local
   network (normally the same Kit AP, with client-to-client communication enabled).
   Load/cache DroneLab before leaving Internet access, and use two-way QR pairing.
   Six-digit code signaling requires Internet; a direct WebRTC route is still needed.
3. Compare and approve the pairing PIN. No Android Take Control or Web Grant
   Mobile Control is required for this mirror. An old APK is rejected before its
   SDP answer is applied, with an update-required message.
4. In PID Tuning choose **Auto / WebApp / Android AP** before Run. Auto prefers
   fresh paired Android input, otherwise WebApp keyboard/joysticks. The actual
   Android transport is displayed (AP, STA, or preview without a Kit).
5. Lower the chosen input throttle to 1000 µs (the existing simulator tolerance
   is 1025 µs), then press Run in WebApp. The source stays locked during a run.
6. Stop/Reset in WebApp resets the virtual model. Android input preview remains
   visible and the independent Kit stream continues. A fresh stream never
   restarts the model automatically.

Opening Android Connection Settings clears captured sticks but preserves an
already active Kit session and its held throttle so pairing does not release
AP control. Explicit Android STOP, real app background/pause, native input
expiry, authorization and firmware safety behavior retain their own meanings.

## Data contract and load

- Android uses the same final shaped TRPY values supplied to native Kit input.
  The diagnostic AP throttle is distinct from the legacy virtual-flight throttle;
  the snapshot deliberately selects the physical input while that session exists.
- A phone without a physical control session can supply preview TRPY for the
  simulator without claiming or arming any hardware.
- The existing Android scheduler offers physical input first, then mirrors a
  small snapshot at approximately 20 Hz. No new hardware poll or native thread
  is added. There is a small additional WebRTC forwarding cost.
- `INPUT_MIRROR` uses the existing unordered, non-retransmitting realtime channel.
  It has a 4096-byte send-buffer bound, no reliable-channel fallback, no per-frame
  ACK, no resend queue and no dependence on receiver feedback.
- Fields: mirrorVersion, pairing sessionId, increasing seq, kitId, transport,
  command/preview kind, inputAgeMs, and integer TRPY channels in 1000–2000 µs.
  WebApp validates these at both the transport and shared input cache boundaries.
- The cache is shared by the top-level host, embedded Tripod page and diagnostics;
  it does not depend on the Live Inputs panel being open. Hardware-received Live
  Inputs remains a separate confirmed-RX display, without relabeling TX as RX.
- Axes map once using `(pulse - 1500) / 500`. Existing Android deadband, expo,
  sensitivity and yaw convention are not applied again. ANGLE/ACRO and PID remain
  local WebApp settings; commanded channels are not measured aircraft attitude.

The selected source, input values, packet age and approximate receive rate are
shown before and during Run. `ANDROID COMMAND` means a sender-side command
snapshot, **not** firmware RX/APPLIED confirmation. `ANDROID PREVIEW` means no
physical control session supplies the snapshot.

Simulator freshness and physical input safety are separate. Paired Android
WebRTC input older than 450 ms and authenticated Kit RC snapshots older than
1000 ms are marked STALE. After a user-initiated WebApp Run, a read-only
mirror/snapshot gap does **not** stop the virtual model or change its locked
source to Web control. The virtual model visibly holds the last validated
channels until a fresh frame from the same producer arrives. This virtual
hold is not proof that Kit RC is active or armed. The display must not label
held/old input as LIVE or use it to issue hardware commands.

Explicit WebApp Stop/Reset, confirmed WebRTC pairing authorization loss,
Kit/transport/producer identity changes, and hidden browser/embedded simulator
views still stop the virtual run. A Web-driven Run ignores Android arrival/loss.
No incoming mirror packet restarts a stopped simulator automatically.
The FlightCore/Android hardware input freshness checks, release rules,
ownership and emergency stops are completely unchanged; no WebApp mirror
data or ACK state can arm or disarm a physical Kit.

## Validation

`tools/simulator-input.test.mjs` checks Web-owned Run/Stop, Auto locking,
low-throttle entry, precise pulse mapping, replay/session/range/freshness rejection,
source identity changes, local mode/PID independence and old-client handling.
`tools/pairing-lifecycle.test.mjs` checks mirror negotiation, no ownership or
per-frame ACK, local-only STOP, and rejection of an old APK before SDP application.

`tools/flight-controller-browser.mjs` uses real Chromium encrypted WebRTC with a
native AP boundary double that never returns firmware ACKs. It checks concurrent
AP input offers, exact held throttle, local Run/Stop/mode/PID, no physical commands,
source locking, backpressure, freshness and operation without hardware ARM.
QR and embedded PID shell browser tests exercise the same new input flow.

Physical Kit radio timing, AP client isolation and sustained Poco X2 performance
still require the actual phone and hardware. Browser/native boundary doubles do
not establish physical flight performance. FlightCore firmware is unchanged.
