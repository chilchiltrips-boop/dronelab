# ZJUDP1 encrypted diagnostic RC, AP + STA

This is a **bench diagnostic input transport**, not an aircraft motor-control protocol.
All motor outputs remain disabled. TCP/HTTP handles session enrollment, claim,
configuration, monitoring, Wi-Fi and OTA; native UDP handles time-critical input.

## Source indices (Android -> FlightCore)

| Zero-based index | Type | Meaning | Valid range |
|---|---|---|---|
| 0 | uint16 BE | Throttle | 1000..2000 |
| 1 | uint16 BE | Roll | 1000..2000 |
| 2 | uint16 BE | Pitch | 1000..2000 |
| 3 | uint16 BE | Yaw | 1000..2000 |
| 4 | uint16 BE | AUX1 (reserved; not sent to motor PWM) | 1000..2000 |
| 5 | uint16 BE | AUX2 (reserved; not sent to motor PWM) | 1000..2000 |
| 6 | uint8 | bit 0: **diagnostic Input ARM**; other bits rejected | 0/1 |
| 7 | uint8 | reserved, must be zero | 0 |

A diagnostic input ARM flag is **not** physical motor arming.

## Binary datagram framing (58 bytes)

Bytes 0..3: ASCII `ZJU1` (ACK: `ZJA1`).
Bytes 4..11: first 8 bytes of the random 16-byte HTTP RC-claim token.
Bytes 12..15: big-endian monotonic sequence, nonzero.
Bytes 16..27: 12-byte AES-GCM nonce, unique for each packet and each direction.
Bytes 28..41: 14 encrypted bytes (indices 0..7).
Bytes 42..57: 16-byte GCM authentication tag.

First 16 bytes authenticate as GCM associated data.
AES-256-GCM key = HMAC-SHA256(key of the existing authenticated HTTP session,
`ZJUDP1|<deviceId>|<full RC claim token>`).
The key is never included in the UDP frame. The claim token is new per ownership
session. Native Android starts UDP only after an authenticated signed HTTP claim
and exact Wi-Fi/Device-ID pin verification.

## ACK plaintext indices (FlightCore -> Android)

| Index | Type | Meaning |
|---|---|---|
| 0 | uint32 BE | Last authenticated received sequence |
| 1 | uint32 BE | Total received frames for current RC claim |
| 2 | uint32 BE | Total rejected frames for current RC claim |
| 3 | uint8 | bit 0 received; bit 1 requested Input ARM; bit 2 motors disabled |
| 4 | uint8 | Packet age, capped at 255ms (reserved currently 0) |

ACK verifies **authenticated packet received by network task**, not successful
physical actuation or motor arming. HTTP diagnostics also exposes firmware
`rc` state and a separate `udp` object for received/rejected counts.

## Timing and safety

- Android offers latest joystick values every ~40ms; native sender publishes
  encrypted datagrams every 20ms (50Hz) without blocking for each ACK.
- A native 300ms stale-input limit stops transmission if the WebView stops
  providing values. The existing firmware 350ms armed-input deadman remains.
- No late or replayed frame can restart a timed-out armed session.
- STOP, app backgrounding, Wi-Fi mode change and session release stop UDP.
- A UDP encryption error or ACK timeout **disarms**, rather than retrying
  a potentially stale ARM packet.
- Old firmware without `udpProtocol=ZJUDP1` and `udpPort=4210` remains
  on signed HTTP. New firmware supports old signed HTTP APK clients unless
  they explicitly opt in to UDP when claiming control.
- On upgrade, use signed APP OTA or verified USB. A1/A2 firmware and the
  new signed Android APK must both be installed to use UDP.
- Do **not** test with propellers or ESC power connected.

## Diagnostics

Android ACK recorder stores sanitized `udp_start`, sampled `udp_ack`,
`udp_error` events including sent, acknowledged, estimated missing ACK
sequence gaps, accepted/rejected, jitter, packet age and disarm class.
The WebApp remains HTTP for its own control path; the Android relay never
exports session credentials or encryption keys.

These checks are not a substitute for RF/channel-load measurements on an
actual POCO X2 and both A1/A2 hardware boards.
