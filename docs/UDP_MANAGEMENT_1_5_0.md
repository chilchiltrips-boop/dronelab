# FlightCore 1.5.x: UDP management and IMU

Android 1.8.0-udp-management (versionCode 38) requires FlightCore 1.5.0 or newer.

Current corrective release: **Android 1.8.5-failsafe-diagnostics (code 43)** and
**FlightCore 1.5.4**. Upgrade the matching A1/A2 firmware and install the signed
APK over the previous app; USB pairing and saved Wi-Fi remain in APP OTA.

The [19 October full audit](FULL_CHECK_20261019.md) adds race-safe packet-age checks, exact ACK framing,
parent-session revocation and expiry, canonical private IPv4 validation and
transient queue/Wi-Fi error classification. None extends the input watchdog.

## ARM startup and controller ownership fixes

The attached October 18 Android export contains five successful UDP management
claims followed by native startup errors before any joystick datagram was sent.
Its recorder reduced the native reason to `OTHER`, so it does not identify the
exact platform exception. Code inspection found socket startup on the WebView UI
callback; startup now runs on the independent native worker, with bounded stage
and exception-class enums. No watchdog is extended to conceal startup failures.

The same export later shows repeated claim rejection while the Kit RC sequence
continues advancing. This is evidence of an active competing session, rather
than proof that its ownership is stale. A denied ARM reads the current source
and asks the user to release it there. It never silently steals that session.
Diagnostics distinguish `OWNER_BUSY` from a lost owner's `OWNER_STALE` and
include RC source, input ARM, management protocol and Kit UDP counters.

Native callbacks are tied to their stream ID and generation. STOP cancels queued
startup and suppresses old UI callbacks; every fresh stream starts with neutral,
disarmed channels and reset counters. A granted WebApp emergency STOP immediately
cancels Android's publisher. Invalid AES-GCM ACKs are ignored and cannot count as
feedback; the existing 350 ms firmware watchdog remains enforced.

Firmware 1.5.1 also binds receiver work to the exact claim generation. A frame
authenticated while a claim is released cannot update, disarm or contaminate a
new claim. Tests execute the production Android class with real sockets/AES-GCM
and the actual C++ receiver with host radio/RTOS doubles, including this race.
These checks do not constitute a physical ESP/POCO radio test.
Install the matching A1/A2 firmware first. The 1.4.12 status endpoint emitted
malformed JSON by appending UDP statistics after the closing brace; discovery
could find a Kit but connecting reported `Invalid FlightCore response`.
If this prevents OTA preflight, update through USB. APP OTA preserves NVS Wi-Fi
profiles and pairing; use the Firmware Center's board-aware USB procedure.

## Transport map

| Path | Protocol |
| --- | --- |
| Android joystick / input ARM / receive ACK | ZJUDP1, UDP 4210, 50 Hz |
| Android identify, pairing, status, LED, Wi-Fi, ownership, STOP/release | ZJM1, UDP 4211 |
| Android / bridge IMU telemetry | ZJM1, UDP 4211 |
| Android / bridge encrypted APP OTA | ZJM1, UDP 4211 |
| WebApp / browser Python to Kit with local helper | Browser HTTP to loopback only; helper to Kit uses ZJM1 UDP |
| WebApp through approved Android relay | WebRTC to Android; Android to Kit uses UDP |
| Ordinary WebApp without helper/relay | Signed HTTP compatibility to Kit, or USB Serial |
| Python USB and Serial Monitor | Existing ZJTEL / ZJRC / command Serial protocols |
| Android to tripod simulator | WebRTC DataChannels; realtime unordered channel, reliable management/STOP channel |

An ordinary hosted webpage cannot open arbitrary raw UDP sockets. The HTTP
compatibility server also serves AP onboarding and older clients; removing it
would break those paths. Website downloads/GitHub Pages and signaling retain
their web protocols. WebRTC may select a TCP route where UDP is blocked; the
UI must not describe that entire path as guaranteed raw UDP.

## Local WebApp / Python setup

Run `npm run discover:lan` on the computer running the browser, and keep it
running. Open DroneLab directly, permit browser local-network access if asked,
then select the Kit on the same AP/router. Both discovery and the existing
signed authentication client select the helper automatically. Status shows
`management / IMU UDP 4211`. Browser Python uses this same verified session for
`read_gyro`, joystick snapshots, I2C scan and LED commands.

The helper binds only `127.0.0.1:8766`. It accepts command forwarding only from
the explicitly listed DroneLab/local development origins with a literal
loopback Host and JSON Content-Type. Kit targets must resolve to private IPv4;
routes and authentication-header names are allowlisted. It keeps no pairing
credentials. An untrusted embedded site cannot obtain a new origin grant by
embedding this page, and iframe local-network restrictions still apply.

Once a request selects the UDP helper, failure never retries that write over
HTTP. Stop the helper to intentionally use direct-browser compatibility.
The new native Android management path has no HTTP fallback.

## ZJM1 wire contract

Requests use UDP 4211 and magic `ZJM1`; replies use magic `ZJR1`. Each datagram
contains a 16-byte header: 4-byte magic, random 8-byte transaction ID, big-endian
2-byte total body size, 1-byte fragment index, 1-byte fragment count. Fragment
payloads are at most 1024 bytes (1040-byte UDP payload including the header).

The request body starts with method byte 1=GET or 2=POST. Six UTF-8 fields follow,
each prefixed by a big-endian uint16 byte length: route, form, Device ID, session,
sequence and proof. Limits: route 64 bytes, form 8800, each header 80, total 9216.
Replies contain uint16 status, uint16 proof length, proof, and exact JSON text;
the complete reply is bounded to 16000 bytes.

The existing scoped challenge/session authorization and device/boot/session/
sequence HMAC proofs are unchanged. POST forms retain AES-256-GCM encryption;
reads and response bodies retain their HMAC integrity proofs. UDP itself does
not make every discovery or telemetry field confidential. Local AP diagnostic
sessions cannot become OWNER/OTA sessions. All handlers are shared with the
browser compatibility server, including transport and peer-IP restrictions.

Retries reuse the same ID and encrypted envelope on the same socket. Firmware
matches peer IP, source port, ID and SHA256 of the complete request, and resends
the cached exact signed response for up to 20 seconds. It does not repeat a
flash write after a lost ACK. Two bounded reassembly slots prevent an observer
from overwriting a partially received OTA request. Clients discard unrelated,
oversized and incomplete responses, and cancel sockets on a network change.

The 350 ms diagnostic input failsafe remains. ACK means authenticated receipt,
not physical motor application. Physical motor outputs remain disabled.

## IMU and simulator freshness

Telemetry includes `managementProtocol`, `sampleValid`, `sampleSequence` and
`sampleAgeMs`. The timestamp advances only after a successful physical sensor
read. Browser Python rejects stale/invalid gyro samples; scanner responses stay
usable when no IMU is installed. Read-only status/IMU requests may proceed while
Android's independent UDP joystick sender owns input; provisioning/OTA still
requires releasing control.

The tripod's `zebjus-input-v1` DataChannel uses `ordered:false,maxRetransmits:0`
for controls, ACKs and simulator telemetry. Pairing, ownership, STOP and
management use the reliable channel. Existing simulator sequence, ownership,
timeout and disarm checks remain enforced. Older peers retain the single-channel
compatibility path.

## Verification limits

Automated tests run the actual C++ UDP dispatcher, enrollment, status builder
and OTA handlers using POSIX radio/flash doubles. They cover signed IMU reads,
JSON validity, replay rejection, a deliberately lost ACK, fragmentation and
2048-byte encrypted OTA chunks with SHA256 verification. JDK 17 runs the actual
Android codec against that firmware host. Chromium tests the real loopback/UDP
bridge, WebApp enrollment and browser Python gyro decoder, with zero Kit HTTP
requests. These checks do not replace A1/A2 radio, physical PPM/IMU, USB flashing
or old-phone Wi-Fi acceptance on the actual hardware.
