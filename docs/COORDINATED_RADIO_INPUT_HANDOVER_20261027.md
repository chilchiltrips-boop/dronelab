# Coordinated radio and input handover

WebApp v1.13, Android 1.8.18 (versionCode 56), FlightCore 1.5.13.

## User behavior

- Explicit AP selection saves Android AP as the target input before the Kit changes its radio. Leaving STA remembers its selected PPM, WebApp STA, or Android WebRTC path; returning to STA restores that path. The default remembered STA path is Android WebRTC.
- The firmware requires disarmed input, throttle at or below 1050 µs, a low physical PPM ARM switch, no other Web/Android owner, no maintenance and no conflicting network/OTA operation. A client may release its own disarmed, low-throttle lease. It cannot release another controller.
- One versioned NVS value stores mode, target input, remembered STA input and revision. Failed writes leave the previous controller and radio intact. The signed acknowledgement confirms the saved profile and paused input before the existing 400ms radio transition.
- A fresh physical safety check runs before the radio transition. Changed controls abort application and retain paused input. AP startup or STA-router failure is visible as FAILED; no old input session or ARM is restored.
- After the new radio is verified, the selected path becomes available. Android/Web need a new explicit claim/ARM; PPM retains its physical low-throttle/ARM-OFF admission handshake. Saved profiles survive reboot; controller leases and ARM do not.
- The browser still needs its computer to join the matching Wi-Fi network and approve connection to the same Kit. Android likewise verifies its pinned Wi-Fi and Kit identity. No OS network change is inferred from a selector alone.
- Older firmware displays an update-required message before attempting the coordinated operation.

## Freshness and diagnostics

The shared header keeps its 400ms accepted-input freshness limit. While observing an external active controller, bounded read-only RC snapshots refresh between 2200ms status polls. Only one observer read is in flight, and late responses from another connection, boot, controller epoch or older sequence are ignored. WebApp-owned RC uses its existing acknowledgements instead of adding GET traffic. Hidden pages stop observer polling. Failed reads never create a fresh sample.

AUTO is labeled Auto. A paused radio handover is distinct from teacher maintenance. Diagnostics record sampled input channels, selection and actual source, PPM age/sequence/loss/fault counters, loss/recovery events, real header freshness transitions, and radio-profile request/ACK/error/state. Passwords, SSIDs, addresses, device IDs and session credentials remain excluded. Bounded storage and success sampling remain enabled.

## Verification

The native C++ host executes the actual PPM/access/profile code for failed NVS writes, unsafe throttle/ARM, an ARM change after ACK, exclusion of PPM after AP selection, remembered STA input, new controller claims and corrupt/rebooted profiles. Browser tests execute the real header switch, encrypted request/response verification, persistent pairing and same-Kit reconnect consent, plus a full slow-poll interval of steady PPM display.

Release requires rebuilt catalog-matched A1/A2 APP/FACTORY images, all existing exact-source APK checks, pinned production signing, native signed upgrade/touch in both landscape directions and API30 networking. Physical A1/A2 radio switching, handset Wi-Fi, actual PPM loss and interrupted OTA remain NOT_RUN until real-device evidence is recorded.
