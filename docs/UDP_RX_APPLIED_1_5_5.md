# FlightCore 1.5.5 / Android 1.8.7: RX and applied feedback

## Behavior

Early authenticated joystick frames stay in a single latest-input mailbox. The main loop applies at most once per 20 ms after the previous successful application; immediate DISARM can bypass that interval. A newer valid frame replaces pending input, without an INVALID_FRAME rejection. Only valid, authenticated, fresh-sequence frames update the receive timestamp. Invalid tags, sizes, source IPs, tokens, channels, flags and stale sequences cannot renew it.

RX_ACK means authenticated input was stored. APPLIED_ACK follows the actual successful RC state update. All v2 feedback carries both sequence numbers and ages and the actual applied input ARM flag. RX_ACK may therefore report a previously completed application; receiving RX alone with applied sequence zero cannot confirm ARM. Physical motor outputs remain disabled.

The independent receiver task owns the UDP socket and writes RX, APPLIED and NACK replies. The main loop queues encrypted terminal notices without transferring session keys to a queue. Management work is serviced between calls to the apply scheduler. UDP reception does not depend on WebApp telemetry reads; main-loop application is still bounded by that loop's responsiveness, with a separate apply-stall watchdog. This is diagnostic firmware, not a hard-real-time motor controller.

Receive and armed apply progress retain 350 ms watchdogs. The 300 ms Android fresh UI-input deadline and 1800 ms pre-first-frame grant lease remain. The apply deadline starts at first valid input, rather than time spent negotiating a claim. Existing PPM and non-UDP ownership/watchdog behavior is retained. Exactly one RC owner exists; telemetry observers cannot seize it. No old joystick frames are retransmitted.

## Negotiation and compatibility

Input framing and key derivation stay ZJUDP1: 58 bytes, AES-256-GCM, 6 channels plus input ARM, UDP port 4210. Claim adds optional `udpFeedbackVersion=2`; firmware replies with `udpFeedbackVersion` and `udpAckFields` (12 for v2, 5 for legacy). No request for v2 means the original 58-byte ZJA1 reply. New Android chooses v2 only when both its native bridge and firmware advertise it. Older firmware retains legacy feedback with applied state explicitly unknown; Android does not silently retry input over HTTP.

Install the matching A1/A2 1.5.5 firmware, then signed APK 1.8.7-rx-applied-feedback (versionCode 45) over the existing app. APP OTA preserves NVS Wi-Fi and pairing. Firmware Center's embedded build time describes the downloaded binary; verify running firmware after flashing.

## Feedback v2 wire format

All integers are big endian. Packet size is exactly 72 bytes. AAD is magic `ZJA2` (4), grant-token prefix (8), echoed input sequence (4). Nonce is per-grant random salt (4), independent monotonically increasing feedback counter (4), domain `FBK2` (4). Ciphertext is 28 bytes and GCM tag is 16 bytes. RX and APPLIED can acknowledge the same input sequence without nonce reuse. Android authenticates the complete packet and rejects non-increasing feedback counters, wrong token/domain/size, inconsistent flags and out-of-range sequences. Oversized valid-prefix datagrams are rejected.

| Plain offset | Bytes | Field |
| --- | --- | --- |
| 0 | 4 | lastRxSeq |
| 4 | 4 | lastAppliedSeq |
| 8 | 2 | receive age, ms |
| 10 | 2 | apply age, ms |
| 12 | 4 | received frame count |
| 16 | 4 | applied frame count |
| 20 | 4 | rejected frame count |
| 24 | 1 | flags: RX known, applied ARM, motors disabled, applied known, terminal (bits 0..4) |
| 25 | 1 | kind: RX_ACK=1, APPLIED_ACK=2, NACK=3 |
| 26 | 1 | reason: NONE=0, INVALID_FRAME=1, STALE=2, OWNER_CONFLICT=3, APPLY_STALLED=4, AUTH_EXPIRED=5 |
| 27 | 1 | reserved, zero |

Unknown age is 65535; known age saturates at 65534. Sequences zero mean unknown. RX_ACK echoes lastRxSeq; APPLIED_ACK echoes lastAppliedSeq, which can be older than lastRxSeq. NACK echoes the rejected input or last received sequence on terminal timeout. Invalid authentication gets no NACK. Authenticated duplicate/reordered input gets a rate-limited nonterminal STALE NACK, never a heartbeat. Terminal reasons fail closed. Main-origin terminal ciphertext is generation-bound and discarded if a new grant supersedes it.

## Regression coverage

`tools/udp-rc-host.cpp` executes the production C++ receiver with real OpenSSL-backed GCM and radio/RTOS doubles. Cases include RX-before-apply, 19 ms hold, newest frame winning at 20 ms, no rejection for early input, separate ages/counters, authenticated stale/invalid input, invalid tag, receive timeout, live-RX apply stall, foreign owner preservation, auth expiry, generation races and obsolete terminal notice suppression. Legacy 58-byte behavior remains covered.

`tools/UdpFeedbackInterop.java` executes the actual Android sender with real UDP sockets and AES-GCM feedback: RX cannot arm before apply, apply can confirm ARM, nonterminal STALE preserves input, live RX cannot hide a stopped apply, replay and oversized feedback cannot refresh liveness, terminal reasons stop, and input sequences advance without retransmission. The existing legacy Java fixture still runs. JS controller tests cover explicit negotiation, old firmware fallback, applied ARM confirmation, nonfatal reorder and terminal release. Shared diagnostic tests verify separate fields, ARM-transition retention and strict privacy allowlists.

Full unit/host checks, both compiled ESP binaries, browser integration and permanent-signed native APK gates are required for publication. Physical AP/STA jitter, simultaneous WebApp telemetry, RF loss/recovery and real handset behavior must be tested on a propeller-free bench; no result here claims that hardware acceptance.
