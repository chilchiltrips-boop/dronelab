# AP streaming without an ACK watchdog — 20 October 2026

Android source candidate: versionCode 49, `1.8.11-ap-stream`.

## Result

With the phone connected to the selected Kit AP, authenticated control sends the
latest six channels and input-arm flag at 50 Hz. Neither a missing first ACK nor
later missing RX/APPLIED ACKs stops this AP sender. ARM begins at throttle 1000.
There are no joystick retransmissions or waits for per-frame feedback.

The scoped native bridge advertises AP streaming capability and accepts an
explicit AP/STA selection. Older bridge callers, STA sessions and HTTP fallback
retain their existing feedback policy. Management claim/release and OTA still
use their authenticated request/response protocol.

## Confirmed repository protocol

- Control: UDP 4210, ZJU1, 58 bytes; 16-byte authenticated header, 12-byte nonce,
  14 encrypted bytes (six big-endian 1000–2000 channels, input-arm bit, reserved
  zero), 16-byte AES-256-GCM tag.
- Feedback: negotiated ZJA1 (58 bytes) or ZJA2 (72 bytes). RX/APPLIED counters and
  ages remain diagnostic evidence. Firmware terminal NACKs still end the session.
- The firmware already publishes a latest-value mailbox and applies at 20 ms
  intervals. It does not wait for an Android ACK. No firmware change or new
  firmware image is required for this sender-policy correction.

The supplied Python/DroneWiFiTelemetry attachments could not be read in this
execution environment: the local runtime was unavailable. This change addresses
the confirmed repository ACK stops; it is not a verified byte-for-byte port of
the uploaded reference protocol.

## UI and diagnostics

Local TX does not advance the Kit RX sequence, ACK timestamp or applied-arm
confirmation. Until fresh applied feedback arrives, the cockpit displays
ARM STREAMING / KIT UNCONFIRMED. Sanitized TX diagnostics include sent sequence,
requested input-arm and ackRequired=false; feedbackStopMs is zero for AP.

A verified active AP streaming session is not expired merely because its last
status/ACK is older than 12 seconds. Network/lifecycle events, explicit STOP,
the native 300 ms local-input guard and the firmware 500 ms receive/apply
watchdogs continue to stop stale input. Authentication, ownership, replay checks
and firmware motor-output restrictions remain enforced.

## Validation scope

Regression coverage executes the production Android sender with real loopback
UDP, AES-GCM and scheduling, with silent, oversized, replayed and RX-only return
paths. It also verifies local-input expiry and terminal NACK release. Web client
tests cover ARM without ACK, continued control beyond status expiry, truthful
TX/RX separation, STA compatibility and STOP. Existing receiver host tests cover
firmware freshness guards.

CI and APK publication results must be checked against the actual commit.
Host/browser checks do not establish physical AP flight performance. ESP/phone
radio acceptance and comparison with the supplied reference remain outstanding.
