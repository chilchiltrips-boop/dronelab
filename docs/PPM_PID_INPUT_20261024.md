# PPM receiver input in the PID simulator

## Confirmed cause

Live Inputs already normalized firmware-accepted PPM correctly over STA. The
shared simulator cache only admitted Android input over AP/STA; PPM and Web
input were admitted over USB only. The simulator source chooser also had no
PPM path and labeled all network Kit input as Android. Thus a receiver could
move Live Inputs while the PID simulator used WebApp input instead.

Hardware view-only behavior is intentional: PPM owns the physical RC input,
so the WebApp must not obtain competing diagnostic control. Reading that
accepted input into the virtual plant requires no hardware control grant.

## Change

- Accepted PPM over a verified selected USB/AP/STA Kit feeds a distinct PPM
  simulator source. Auto detects it before Android preview; an explicit
  **PPM Receiver** option is also available.
- Labels identify PPM and the monitoring transport separately. Stick preview,
  low-throttle WebApp Run, local mode/PID edits and explicit Stop work while
  the physical Kit remains view-only.
- The running producer includes Device ID, transport, boot, RC source and
  owner. Replacement stops the virtual plant rather than handing it over.
- Receiver loss or PPM mirror expiry stops and neutralizes the virtual plant.
  Poll duplicates cannot renew freshness. A bounded 1000 ms browser mirror
  grace covers brief polling jitter; it never changes the firmware's 150 ms
  PPM loss policy. Reconnection requires explicit low-throttle Run.
- No firmware, Android, authentication, RC ownership, watchdog, motor-output
  or hardware PID behavior changes. Service-worker cache generation advances.

## Verification

- `node --test tools/ppm-simulator-input.test.mjs`: 11 behavioral tests for
  A1/A2 across STA/AP/USB, read-only preview, low throttle, explicit Run/Stop,
  source precedence, identity/transport/boot changes, receiver loss, stale
  and duplicate input, reacquisition and WebApp input isolation.
- Local `npm test`: 587 passed, 2 skipped because local JDK tooling is
  incomplete. The mandatory authoritative protocol CI job installs JDK 17.
- Local `npm run check`: all 47 ES modules parse, referenced assets exist,
  both page DOMs validate and 15/15 GLBs decode.
- `tools/ppm-pid-browser.mjs`, added to authoritative browser CI, exercises
  the production Live Inputs/shared-store/embedded-PID flow with simulated
  verified A2 STA, A1 STA, A2 AP and A2 USB replies. It checks Auto/explicit
  PPM, preview, low-throttle Run rejection, TRPY/virtual motor response, live
  PID edit, Stop, receiver/polling loss, recovery without auto-run and zero
  hardware writes. Evidence is uploaded by that workflow. The local browser
  download was unavailable, so browser verification runs in GitHub CI.

## Physical validation remaining

Repeat the documented receiver test on real A1/A2 hardware and record Kit ID,
running firmware, receiver model, signal voltage, channel mapping and observed
loss/recovery timing. Browser fixtures do not prove PPM electrical quality,
150 ms physical loss timing, motor control or flight readiness. Existing
`docs/release-acceptance.evidence.json` hardware records remain unchanged.
