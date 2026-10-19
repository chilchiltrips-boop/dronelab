# Communication audit — 19 October 2026

Baseline: main `0a5fa89`, Android 1.8.2/code 40, FlightCore 1.5.1. Baseline
474 automated tests, APP/FACTORY source manifests, APK SHA-256 and the latest
GitHub Pages deployment passed. The previous signed release's seven exact-source
gates and API30/native upgrade/touch workflows were successful.

Corrective release: **Android 1.8.4-udp-freshness-guard/code 42**, **FlightCore 1.5.3**.

## Confirmed fixes

| Finding | Result |
| --- | --- |
| A worker could publish a fresh packet after NetworkLoop captured its timestamp; unsigned subtraction then treated it as very old and released input. | Refresh the clock after the mailbox snapshot, before age/expiry checks. A production C++ test reproduces the one-millisecond interleaving; the genuine 350 ms stale-packet watchdog remains enforced. |
| Android received ACKs into a 58-byte buffer; an oversized datagram with a valid 58-byte prefix was silently truncated and accepted. | Receive one extra byte and reject every non-58-byte ACK; reject reserved flag bits. Production Java socket/AES-GCM test reproduced the old acceptance and verifies the unchanged watchdog now stops on oversized-only replies. |
| UDP RC grants lived for 30 minutes after claim even when their parent authentication session had less time remaining. Closing or replacing that session did not revoke the UDP grant. | Bind the grant to the exact parent slot/session ID and remaining lifetime. Main-loop checks revoke closed/replaced sessions; the receiver independently rejects packets after the inherited deadline. Production C++ receiver tests cover close, replacement, expiry, ownership races and the 350 ms watchdog. |
| Native queue expiry was returned as a Wi-Fi identity failure. Temporarily unavailable/redacted Wi-Fi details also triggered immediate UI disconnect. | Preserve queue errors and introduce a typed pending-details exception. Pending requests remain blocked; ordinary bounded connection recovery applies. Verified identity mismatch, missing permission and changed networks remain fail-closed. API30 tests execute the real error classifier; controller tests check recovery and fatal mismatch separately. |
| Leading-zero IPv4 aliases could pass decimal private-range checks while an OS resolver interpreted them differently (`010.0.0.1` can mean `8.0.0.1`). | Node's canonical IPv4 parser and a matching Android numeric validator reject aliases before any socket/resolver operation. Both Android bridge paths share one validator. |

## Verification coverage

- All Node tests and JavaScript/asset/model checks.
- Actual firmware enrollment, HMAC/AES-GCM, replay checks, encrypted chunk OTA,
  SHA-256 validation, RC/PPM ownership and AP/STA policy host tests.
- Production Java UDP stream and RPC codecs with real loopback sockets/crypto.
- Chromium discovery, UDP status/IMU, Python `read_gyro`/`read_joystick`, simulator,
  QR pairing, stop/failsafe, offline cache, layouts and OTA recovery workflows.
- Board-specific A1/A2 APP/FACTORY compilation and verified source manifests.
- Permanent-signed APK, packaged asset/source verification, in-place upgrade,
  native touch in both landscape directions and API30 compatibility.

The published build/check results are in GitHub Actions and release metadata.
These checks do not constitute a physical ESP, PPM receiver, IMU or POCO radio
acceptance test. `hardwareFlashingTested` remains false; operator acceptance
evidence is not marked complete by this audit.

## Transport and operational limits

Android-to-Kit joystick/ACK uses UDP 4210; management/IMU/OTA uses UDP 4211.
Ordinary browsers and browser Python need `npm run discover:lan` or the approved
Android relay for the Kit UDP path. The browser-to-loopback helper hop uses HTTP;
direct-browser HTTP compatibility and USB Serial remain available. A browser or
Wix/WordPress iframe's local-network/serial permission policy still applies.

An active controller owns input exclusively. Release it there before another
client arms; no silent ownership takeover or automatic re-arm is introduced.
Motors remain disabled and the 350 ms input watchdog is unchanged.
