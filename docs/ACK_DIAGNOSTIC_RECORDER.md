# ACK / Wi-Fi Diagnostic Recorder (Android + WebApp)

The diagnostic input ARM does not arm motors. Firmware's 350 ms input deadman remains unchanged. The recorder helps identify why an ACK was lost; it does not suppress disarming.

## Reproduce safely
1. Disconnect propellers and ESC/motors. Install Android 1.7.20 (code 36) when the signed release is published.
2. Android: Menu → More → Diagnostics → ACK / Wi-Fi Diagnostic Recorder. WebApp: Devices & Firmware → Selected AERION → ACK / Wi-Fi Diagnostic Recorder.
3. Connect the phone to the Kit AP, Connect Kit, ARM and send diagnostic joystick values. When RC ACK failed occurs, leave the app open and press Save / Download JSON. Android displays the system Files destination picker. Save JSON or CSV; the WebApp downloads a file directly.
4. Record board version, Android OS version, approximate control duration, and whether the phone still shows Kit AP Wi-Fi. Share only the sanitized JSON/CSV file. Files are never uploaded automatically.
5. If WebApp and phone are on separate networks, logs remain separate. Android direct AP input does not get echoed to WebApp. Export both logs if the WebApp has an independent STA/USB link.

## Captured fields (strict allowlist)
- Timestamp, client (Android/Web), event category, known endpoint, ACK sequence, round trip ms, inter-ACK gap ms, firmware accepted/rejected counters, packet age, AP/STA, RSSI, STA disconnect reason and firmware version/board.
- HTTP failures are classified into QUEUE_STALE, ACK_INVALID, TIMEOUT, IDENTITY, AUTH, NETWORK, CANCELLED or OTHER. No raw response bodies.
- NOT captured: Wi-Fi passwords, SSIDs, private addresses, Device IDs, Kit Codes, OWNER credentials, cryptographic keys, sessions, tokens, raw requests or camera data.

Last 350 events are saved locally on each device in localStorage and persist across restarts. Normal ACK successes are sampled every fifth frame; input ARM transitions, slow ACKs (180 ms+), errors, disarms and link changes are retained. The recorder does not issue extra polls, open sessions or alter physical safety rules.

## Interpretation
- rc_ack_error / QUEUE_STALE and large native RTT suggests app-side queue congestion.
- rc_ack_error / TIMEOUT after rising RTT suggests Wi-Fi latency.
- rc_ack_error / ACK_INVALID suggests response/sequence/identity mismatch.
- wifi_event near an error suggests Android Wi-Fi changed.
- kit_status/web_status shows authenticated firmware counters but NOT the exact ESP32 release reason. Retrieve USB serial ZJRC,RELEASE,... if needed.

Security: Android export is explicit user-approved ACTION_CREATE_DOCUMENT, limited to JSON/CSV; no uploads, unrestricted filesystem writing or authentication bypass. WebApp uses a local Blob. Actual POCO X2 + FlightCore AP timing tests remain necessary.

## 18 October 2026 AP ACK-stall fixes

The Android native bridge now reports bounded `queueMs`, `bindMs`,
`sendMs`, `responseWaitMs`, `readMs` and a sanitized `phase` field
on each native HTTP result. A failure with a non-`complete` phase has
**not** measured later stages; their zero values are not evidence of speed.

On a confirmed diagnostic disarm, the app cancels an in-flight RC
preview instead of waiting behind that stale request before signed
release. Late packets cannot re-arm: a fresh low-throttle ARM and a
new owner claim are still required. HTTP 423 `not_controller_owner`
is recorded as `OWNER_STALE`; rejected preview frames are
`FRAME_REJECTED`.

FlightCore's authenticated RC status also exposes
`lastReleaseReason` and `lastReleaseAtMs` (ESP32 uptime), without
session or identity secrets. The existing 350 ms firmware deadman
remains unchanged, as does motor-output disablement. Confirm
improvement with a propeller-free real phone/FlightCore test; logs
from old firmware will not contain the new firmware fields.


## 19 October 2026 native UDP ACK watchdog ownership

Android FlightCore ZJUDP1 transmits encrypted diagnostic frames at 50 Hz on a
native scheduled worker. Its monotonic watchdog stops input after 300 ms without
fresh WebView joystick updates, or 350 ms without a verified Kit ACK while
diagnostic input is armed. **These safety deadlines have not been extended.**

The flight screen previously applied another 350 ms ACK watchdog to the
`window.zebjusNativeUdpEvent` callback timestamp. A busy Android WebView
could delay the callback even though the native socket was still receiving
authenticated ACKs. For ZJUDP1 only, the duplicate *UI-thread* watchdog is
removed. Native timeout/error callbacks still immediately release diagnostic
input. Legacy signed HTTP input retains its own ACK watchdog.

The ACK recorder now captures, while still valid and before native stream
state resets:

- `lastPacketAgeMs`: monotonic elapsed time since the last authenticated ACK.
- `inputAgeMs`: time since the WebView last submitted fresh stick values.
- `maxSendGapMs`: greatest spacing between native sends in this session.
- `maxAckGapMs`: greatest spacing between accepted ACKs in this session.

Interpret: `UDP_INPUT_STALE` with high input age suggests a WebView/UI pause;
`UDP_ACK_TIMEOUT` with normal send spacing suggests a missing/delayed Kit ACK,
Wi-Fi loss or firmware responsiveness. Large send spacing points to native
scheduling or Android OS interruptions. Legacy encrypted ACKs mean received; negotiated v2 feedback distinguishes received and applied state as described below.

Reproduce on a propeller-free A1/A2 Kit; export a **fresh** Android JSON after
the failure. Older logs from firmware 1.5.0 predate the current UDP stream and
cannot confirm the cause of a present-day ZJUDP1 timeout. Do not disable the
native 300/350 ms failsafe or accept unauthenticated UDP ACKs.


## 20 October 2026 RX / APPLIED feedback

Firmware 1.5.5 + Android 1.8.7 negotiate feedback v2 on the existing ZJUDP1 input stream. RX_ACK acknowledges validation and mailbox storage. APPLIED_ACK follows a successful main-loop RC update. Every authenticated feedback body includes `lastRxSeq`, `lastAppliedSeq`, `receiveAgeMs`, `applyAgeMs` and applied input ARM, so a later RX_ACK can also report a previously completed apply if its dedicated APPLIED_ACK was lost. Applied input ARM never denotes motor ARM.

The Android live ACK line and WebApp Kit UDP section show these sequences and ages separately. JSON/CSV exports retain the fields, feedback version, ACK kind, applied-known flag and fixed NACK reason enums. Unknown ages are `-1` in Android/export, `null` in firmware status, and a dash in the display. Legacy firmware has unknown applied state.

Authenticated nonterminal STALE notices report reordered/duplicate packets without stopping input or renewing the receive watchdog. Terminal `INVALID_FRAME`, `STALE`, `OWNER_CONFLICT`, `APPLY_STALLED`, and `AUTH_EXPIRED` notices stop the matching stream. Missing feedback still triggers the native watchdog; live RX with stalled apply separately reports `UDP_APPLY_TIMEOUT`. No joystick packet is retransmitted.

See [wire format and regression coverage](UDP_RX_APPLIED_1_5_5.md). Real AP/STA testing with both ESP boards and a handset remains necessary; host sockets and native emulator checks do not establish RF reliability.
