# UDP reference review and communication proposal — 20 October 2026

Status: partial analysis and two read-only monitor fixes. This document is not a completed inspection of the uploaded archives, a firmware/Android communication-policy implementation, or a flight acceptance report.

## Sources actually accessible

Current main reviewed: `59f542d6a6187d59d2d83a34f62d313e9367d988`.
Current Android source uses separate 50 Hz TX and RX executors, v2 feedback stop 750 ms, legacy feedback stop 500 ms, and independent UI input freshness 300 ms. Firmware has separate RX/APPLIED feedback, 20 ms latest-value apply and a 500 ms receive/apply deadman. Steady-state feedback currently has 10 Hz RX plus 10 Hz APPLIED; transitions/NACKs can be immediate.

The user reports that the supplied PyCharm keyboard controller and ESP AP firmware flew smoothly. That is useful operational evidence but does not identify which scheduling, packet format or loss behavior differs from DroneLab.

The current execution environment is unavailable. These four attachments could not be opened:
- `drone_wifi_telemetry(1).zip`
- `WiFiReceiver(1).zip`
- `DroneWiFiTelemetry(1).zip`
- `dronesoftware.zip`

Do not infer that these copies match earlier uploads, that they have no failsafe, or that their keyboard control is safe under a lost key-up event. No new local build, archive extraction, RF test or physical flight test was performed.

## Changes prepared independently of the blocked archive review

- Reject active network RC snapshots with missing, non-numeric, non-finite or negative firmware packet age. Such observations cannot prove LIVE or INPUT ARM.
- Keep local arrival freshness for legacy USB frames, which do not contain firmware packet age.
- Reset previous USB sequence, displayed arm state and cached PPM channels on a genuine decoded new CLAIM. A new sequence 1 must not be rejected because the previous session ended at 900.
- Update the offline shell cache generation so clients receive the monitor fixes.
- Add behavioral tests for invalid age and the actual serial listener across a new claim.

The pure JavaScript checks and a production-listener probe ran in the available JavaScript isolate. Node/Android/firmware/browser CI remains separate; no local execution environment was available. No ACK watchdog, firmware deadman, authorization, motor output, stable APK or firmware binary was changed by this monitor patch.

## ACK-triggered stop versus command-loss protection

The user's requested change concerns application ACK-based automatic DISARM. It is possible to design a diagnostic mode where missing return telemetry marks FEEDBACK_STALE and does not by itself stop an otherwise fresh native sender. That is distinct from removing the ESP's valid-command receive/apply protection.

The proposal is to:
1. Keep initial authenticated session establishment and explicit low-throttle ARM authorization.
2. Stream current input independently of RX work; never block waiting for a per-frame ACK or retransmit an old frame.
3. Treat return feedback as sampled authenticated telemetry containing latest RX/APPLIED sequences, ages and safety state.
4. Report return-path loss as stale/unconfirmed feedback. Never display a healthy confirmed armed state while feedback is missing.
5. Preserve firmware receive/apply expiry based only on fresh authenticated commands and real apply progress. Preserve independent stale-UI input detection, STOP, DISARM, network loss and background cleanup.
6. Preserve terminal authenticated NACKs and explicit session release. Reconnection must not silently reclaim or re-ARM.
7. Keep physical motor outputs disabled. This diagnostic policy is not a validated flying-controller mode.

Simply deleting UDP_ACK_TIMEOUT, UDP_NO_ACK and UDP_APPLY_TIMEOUT branches would remove evidence without establishing safe replacement behavior. Apply stalls must remain detectable on the ESP. An independent telemetry stream with sequence/age information can replace per-frame confirmations, but silent return traffic still means unknown end-to-end confirmation.

## Proposed data flow

Android current input mailbox -> pinned-Wi-Fi authenticated UDP at 50 Hz -> ESP independent receiver -> newest valid mailbox -> eligible 20 ms apply.

ESP state -> bounded independent authenticated telemetry at a measured 10–20 Hz candidate rate -> Android RX worker -> coalesced status/UI. Include lastRxSeq, lastAppliedSeq, receiveAgeMs, applyAgeMs, input state, release/failsafe reason, feedback counter and non-secret diagnostic session correlation.

Management, large responses, serial output and diagnostics persistence receive a separate bounded budget. Do not broadcast private control telemetry or let arbitrary UDP packets change the telemetry destination. Multiple observers need authenticated, bounded read-only subscriptions; there is still one control owner.

A conventional WebApp cannot directly create Android-style UDP sockets. Retain the verified local UDP bridge or authorized Android relay for UDP access, or use bounded authenticated HTTP for monitoring. A direct ESP WebSocket design would require additional firmware work and deployed HTTPS/WSS/Local Network Access verification; it is not a drop-in replacement. Keep monitor transport separate from the Android input transport.

For the keyboard comparison, inspect key-down/key-up state, repeat/tick rate, neutralization on focus loss, TX/RX threading, socket deadlines, heartbeat role, packet authentication, receiver watchdog and application tick. A held key should generate current state with new packet sequences; lost focus must not preserve an old throttle.

## Can Wi-Fi RSSI replace the watchdog?

No. RSSI measures received radio power for a Wi-Fi association, not successful command processing or current apply progress. Android getRssi describes its current Wi-Fi network. In STA/router mode that is the phone-to-router link, not proof of ESP reception.

In ESP AP mode, supported ESP-IDF versions expose average per-associated-station RSSI. Associate it with the verified controlling peer; do not substitute the strongest client or a laptop's RSSI. Include measurement age and report unknown as null. A strong signal can coexist with an unserviced UDP socket, stalled app/firmware task, congestion, wrong routing or a lost reverse path.

Use RSSI as an additional diagnostic/warning input with smoothing and hysteresis, alongside command age, apply age, sequence progress, receive gaps and association events. Do not choose a flight cutoff from an arbitrary dBm number.

Primary references:
- Android WifiInfo.getRssi: https://developer.android.com/reference/android/net/wifi/WifiInfo#getRssi()
- ESP-IDF C6 Wi-Fi associated-station RSSI: https://docs.espressif.com/projects/esp-idf/en/v5.5/esp32c6/api-reference/network/esp_wifi.html
- UDP reliability/receiver scheduling limits, RFC 8095: https://www.rfc-editor.org/rfc/rfc8095.html

## Remaining work before changing the control policy

Read all four archives when execution returns and trace keyboard -> TX -> ESP receive -> apply -> telemetry -> RX. Record actual rates, timeouts, queue bounds and measured behavior instead of copying names or removing safeguards speculatively.

Test forward-only loss, reverse-only loss, stale/reordered/replayed feedback, frozen UI, stalled apply, AP disconnect, STA route change, management overload, key-up/focus loss, rapid session replacement and simultaneous Android plus read-only Web/USB. Measure send gaps, RX/apply ages and feedback loss independently. Signed APK publication, A1/A2 builds and physical propeller-free acceptance remain required. No landing capability is claimed.
