# ACK reliability, diagnostics, and Live Inputs review

Baseline main: `26706b38cc5578c754a4406d262bb1aef2133e07`.
Branch: `codex/ack-reliability-live-inputs-20261020`.
Candidates: Android 1.8.8 (versionCode 46), FlightCore 1.5.6.
The user explicitly authorized finishing Parts 1–22 and pushing the changes to main on 2026-10-20. Hardware flashing is not performed. Existing release CI and stable-signing gates remain in place; a debug APK is never published as a production update.

## Findings

The supplied implementation brief and prior Android CSV `ZEBJUS_ACK_Diagnostics_1792438906818.csv`, Web CSV `zebjus-web-ack-diagnostics-2026-10-19-19-53-23.csv`, and Android JSON `ZEBJUS_ACK_Diagnostics_1792435444616.json` were inspected before edits. Android last confirmed RX/APPLIED sequence 2626; subsequent firmware status retained 2651 and `UDP_INPUT_TIMEOUT`. The earlier JSON reports maximum RTT 402 ms and native management response wait 2198 ms. These confirm feedback interruption with continued firmware sequence progress, not a unique radio cause. Zero rejected packets does not mean no radio loss. OWNER_STALE after release is not necessarily the initiating fault.

Source findings: the periodic Android sender also drained feedback; initial ACK expiry used a frame count; firmware sent dedicated APPLIED_ACK for every applied change; management processed up to twelve packets and synchronously burst complete responses. AP RSSI could be displayed as zero when STA RSSI was unknown. A build was also rejected correctly because local-time C++ compile macros were labelled UTC; compiler subprocesses now explicitly use `TZ=UTC`.

## Android and firmware behavior

- RX/no-first-ACK and apply-progress deadlines use named 500 ms monotonic limits. Stale UI input remains independently limited to 300 ms. Native ZJUDP1 retains the existing exemption from a duplicate WebView watchdog.
- HEALTHY becomes LINK_DEGRADED at 250 ms without fresh feedback, then CONTROL_LOST at the appropriate deadline and RELEASED after teardown. Reasons distinguish UDP_ACK_TIMEOUT, UDP_NO_ACK, UDP_APPLY_TIMEOUT, stale input, receive/send failures, and authenticated NACKs. No automatic ownership reclaim or re-ARM.
- Independent sender and blocking ACK receiver executors share one selected-Wi-Fi-bound socket. Crypto/send do not hold the mailbox/UI monitor. Generations, closed sockets, cancelled workers and stale-callback checks preserve lifecycle isolation. There is no cellular fallback or old-frame retransmission. Catch-up bursts are skipped. Sessions end before positive 31-bit sequence exhaustion.
- AES-GCM, token, exact length, feedback counter, sequence, age, kind/flags and session checks remain. Old feedback cannot renew safety. Fresh applied progress embedded in RX_ACK renews apply confirmation without dedicated APPLIED_ACK; legacy feedback remains explicitly legacy with unknown applied state.
- Firmware retains independent 350 ms receive/apply deadmen and the latest-value mailbox with eligible 20 ms apply ticks and immediate diagnostic DISARM. Only valid authenticated fresh frames renew receive freshness. The 2000 ms secondary null-state confirmation never extends earlier safety. Landing is explicitly unsupported. All physical motor outputs remain disabled.
- Dedicated APPLIED_ACK is capped at 10 Hz except state transitions, after prioritizing RX traffic. Failed attempts are bounded too. This rate passes host tests, including suppressing all dedicated APPLIED_ACK while RX embeds apply progress; it still needs real radio latency/safety acceptance.
- Feedback send success requires beginPacket, a full-length write, and endPacket success. Attempted/sent/failed counters exist per kind. Old-generation sends cannot contaminate a replacement's counters. RX totals/valid/rejected, sequences, receive/apply ages, maximum apply scheduling latency, and NACK/failsafe reasons remain authenticated read-only status.
- rxToAckDelayMs measures local datagram read to ACK send start, including validation/encryption. ackSendDurationMs measures UDP API duration, not radio delivery. Queue depth/high watermark describe the real single terminal ciphertext slot. ackQueueDelayMs/maxAckQueueDelayMs measure its actual enqueue-to-dequeue residence using firmware monotonic time; the host fixture verifies a 17 ms residence. RX ACKs have no artificial queue. No per-packet serial logs were added.
- Management uses a cooperative 3 ms / three-request-packet budget and a two-slot response queue with two response fragments per iteration. Control is serviced between work items. Signed response caching preserves retry identity and OTA idempotence. Atomic work can exceed the cooperative CPU quantum, so durations/overruns remain measured rather than claimed as hard preemption. During control, an authenticated admission guard prevents scans, NVS changes, firmware writes, reboot and other slow handlers; signed read-only observation and safety operations remain available. HTTP preflights complete headers/body with nonblocking bounded peeks before entering the compatibility parser, then emits a fixed-capacity response in nonblocking chunks. Partial requests and slow readers expire after 500 ms without waiting in the control loop. The actual HTTP wrapper is exercised with POSIX stream sockets, including partial headers/body, malformed framing, chunk limits and expiry.
- The receiver yields after a bounded burst so continuous traffic cannot indefinitely starve the main apply loop. A main stall is detected independently; main-loop neutralization happens when it is scheduled. Hardware outputs stay disabled even during a stall.
- AP start/stop/join/leave, actual disconnect reason, client count, mode transitions, bounded-history observed reconnects and weakest associated-client RSSI are available. Unknown RSSI/radio-reset data remain null. MACs never leave the bounded eight-client history. Android fixed-enum availability, loss, capability/route, verified/redacted identity events avoid SSID/BSSID/address exports.

## WebApp

Sidebar order is Overview, Kit Connection, Wi-Fi & Network, Firmware Flash, Mobile Controller, Live Inputs, Diagnostics, Security & Admin. Existing nodes are moved with their IDs/listeners. Diagnostics now has explicit A–G subsections for overview, ACK recording, network, USB serial, hardware health, history and exports. The remaining legacy hardware-test controls/readouts have moved out of Kit Connection. It contains the ACK recorder, network telemetry, UDP metrics, USB Serial Monitor/Plotter and history, plus firmware/link/scheduling overview, explicit last error and IMU/watchdog state. Successful events remain visible by default; search/filter and error emphasis are available. Chronological rows are grouped by non-secret diagnosticId or recordingId, and the history works even when the ACK disclosure is closed. Recording IDs distinguish local monotonic origins after reloads.

Live Inputs shows physical Kit data only. AUTO chooses fresh verified same-Kit USB, then fresh direct AP/STA, then an already-permitted verified relay; stale USB is a fallback only without a fresh direct path. Manual unavailable paths show UNVERIFIED. USB connection generations require new identity verification after port changes. No second serial port is opened; the existing shared combined ZJTEL, legacy ZJRC and genuine PPM decoder is reused. Monitor link and input link/source are separate: USB / ANDROID / AP is supported. Unknown LED/PPM/safety values are not fabricated. Genuine PPM PRESENT/LOST/WAITING state is reported by firmware snapshots; USB PPM-loss events immediately clear PPM channels and display RECEIVER SIGNAL LOST. A new USB claim resets sequence/rate tracking before its first frame. Input ARM is not motor ARM.

Late/out-of-order replies and source changes invalidate old snapshots. Disconnect cannot display LIVE. Snapshot polling runs around 3 Hz when visible, slower when input is claimed, with one in-flight read and exponential backoff. Hidden monitors do not poll. The bounded read scheduler deduplicates status resources by identity/link/generation, retaining observation age; mutation invalidation does not break a healthy pending read. Native control UDP never enters the management queue. Opt-in Python streaming pauses in hidden documents, slows to 700 ms under control, and backs off to at most 4.8 seconds on errors; cancelling it cannot leave an old callback scheduling another timer. Connected Kits suppress automatic discovery; overview telemetry is single-flight.

The recorder retains about 60 seconds before an error and a fixed 30 seconds after, up to eight incidents/seven days with a 2 MiB persistence cap. IndexedDB writes are asynchronous, with a bounded asynchronous localStorage fallback. JSON retains incident windows and local relative monotonic timing; CSV includes the retained incident timeline. Clear removes saved history. Record and restore paths sanitize strictly. Passwords, credentials, keys, Device IDs, raw session identifiers and private network addresses are excluded.

A separately generated random non-secret 16-hex diagnosticId on claim correlates Android and authenticated Web status. Compare diagnosticId and RX/APPLIED sequences; clocks need not be synchronized. Arrival gaps and sequence gaps are not measurements of one-way radio delay/loss.

Both HTML entrypoints and changed offline URLs are aligned. Existing embed restrictions/direct-open recovery remain; no permanent Wix banner or automatic monitoring ownership claim was added. A discovery result offers the official direct-open link only when the iframe policy explicitly denies local network access. Pairing, identity verification, single ownership, AES-GCM, signed RPC, encrypted authorized APP OTA, 1024/legacy chunk support, SHA256, saved Wi-Fi, exclusive AP/STA fallback, PPM and WebRTC pairing retain their existing paths/tests.

## Verification and limits

Commands: `npm test`, `npm run check`, `python3 tools/verify_release.py`, `node tools/ack-reliability-browser.mjs`, `python3 tools/build_scanner.py`, and `gradle -p mobile-android :app:assembleDebug --no-daemon` after packaging the exact assets from build-qr-android.yml.

The browser test uses real Chromium DOM and IndexedDB with synthetic verified Kit data. DRONELAB_TEST_FILE_ROUTES=1 supports sandbox file routing; it does not certify a deployed GitHub Pages/Wix radio or permission path. The read-only PR workflow cannot merge, publish, or flash.

No Kit or POCO X2 is attached. All requested physical acceptance scenarios remain unexecuted: 15-minute Android AP, AP with Web monitoring, router STA, USB with Android AP/STA, deliberate Wi-Fi/ACK loss, management overload, rapid reconnect and multi-Kit isolation. Use removed propellers/disconnected motors and record diagnosticId, sequences, gaps, ages and release reason. Native touchscreen/background behavior, actual RF latency/loss, the 10 Hz candidate's suitability, deployed Wix permissions and stable-signer upgrade acceptance remain unverified. Debug APK signing is not stable production signing.

## Verified results for this candidate

| Check | Actual result |
|---|---|
| Full automated suite (JDK 17) | 497 passed, 0 failed, 0 skipped |
| Static/assets checks | 43 ES modules, both page DOMs, 35 references, 15/15 GLB models passed |
| Production Android Java/firmware host interop | Passed encrypted legacy/v2 feedback, replay/size checks, missing ACK/apply progress, NACKs, grant races, ownership, 350 ms firmware safety, 2000 ms null confirmation |
| Firmware send fault injection | beginPacket/endPacket/partial-write failures counted; partial write: attempted 1, sent 0, failed 1 |
| Host coalescing fixture | RX attempted/sent/failed = 5/5/0; dedicated APPLIED = 2/2/0; these are host API counters, not radio measurements |
| Real Chromium with synthetic verified Kit streams | Passed A–G sections, final panel relocation, JSON/CSV downloads/privacy, PPM loss, USB claim reset, source separation, stale/replay, IndexedDB, no control writes; V2 layout 320–1920, accordion and exclusive AP/STA suites passed |
| A1 ESP32-C3 compile | APP 1,216,592 bytes; FACTORY 4,194,304 bytes; UTC 2026-10-20T04:15:06Z |
| A2 XIAO ESP32-C6 compile | APP 1,224,320 bytes; FACTORY 4,194,304 bytes; UTC 2026-10-20T04:16:14Z |
| Firmware release verification | Passed chip identity, APP/FACTORY structure, SHA256, catalog and embedded UTC compile times |
| Firmware build provenance | Header/sketch hashes match committed source 727f7a81ae16646cb2705867f1359ee6f1a44b02 |
| Android APK | assembleDebug passed; exact final catalog repack passed; applicationId unchanged; versionCode 46 / 1.8.8-ack-reliability; minSdk 26, target/compileSdk 35 |
| APK signature/assets | APK Signature Scheme v2 verified (one DEBUG signer); 20 bundled assets exactly match current source |
| Real Chromium + localhost + production C++ UDP + Python | Passed discovery, enrollment, signed status/IMU, Python gyro/joystick, and no direct Kit HTTP. A file-routed browser attempt was blocked by unknown-address-space policy; the real localhost-server run passed. This remains a host fixture, not RF/physical Kit acceptance. |
| Stable production signer, native touch/API30 emulator | Not executed; debug signing does not replace these release gates |
| Physical Kit, 15-minute radio tests, actual Wix/GitHub Pages hardware access | Not executed; no device attached/deployment performed |
| Main/release/flash | Hardware flash not performed; main delivery and release-CI status are reported separately with the exact remote commit |

The final binaries were compiled locally from cc9e64b; the identical source tree was transferred through the connected GitHub integration as 727f7a81ae16646cb2705867f1359ee6f1a44b02. Header/sketch hashes were checked against both source snapshots; localBuildSourceCommit retains the compiler checkout identity. The shell had no GitHub write credential, so the authorized GitHub integration transferred the exact Git tree and binary blobs, each checked against its local Git SHA.

The earlier workspace reset was recovered from the recorded implementation and revalidated. Local commits preserve each stage. The initial shell push was blocked by automatic approval review for insufficient destination/authorization evidence; subsequent read-only GitHub metadata verified this exact public repository and the connected account's admin/push permission. No raw diagnostic attachments, credentials, private account data, or signing material are in the change set.

## Delivery authorization

Earlier public-branch pushes were rejected by automatic approval review. The user then explicitly instructed completing all remaining code work and pushing to this repository's main branch. Delivery uses normal git/PR operations, without alternate upload bypasses. The final response records the actual pushed/merged commit and CI status; hardware acceptance remains unexecuted.

## Final requirement audit

| Part | Source/automated result | Physical or external validation |
|---|---|---|
| 1 | Uploaded diagnostic evidence reviewed; distinct sender, feedback, apply, RPC and Wi-Fi metrics | No unique RF root cause claimed |
| 2 | Named monotonic Android 500 ms RX/no-first-ACK/apply deadlines; no duplicate native watchdog | Actual older-phone radio acceptance pending |
| 3 | Independent 350 ms firmware deadmen and 2000 ms final null confirmation; no landing or motor outputs | Hardware safety observation pending |
| 4 | Separate sender/receiver, generations, selected Wi-Fi binding, bounded/coalesced UI notices | Native touchscreen/lifecycle tests pending |
| 5 | All counters, API send checks and real terminal-queue residence measurement | UDP API success is not RF delivery proof |
| 6 | RX embeds applied state; dedicated APPLIED candidate 10 Hz with transitions; apply-stall tests pass | Final RF/safety rate tuning pending |
| 7 | Latest mailbox, early frame storage, DISARM priority, generation/clock/sequence-wrap fixtures | Main-loop behavior on boards under RF load pending |
| 8 | RPC time/count quantum and bounded replies, active-control admission, bounded nonblocking HTTP path | Board overload acceptance pending; no hard RTOS preemption claim |
| 9 | AP/Android link events, observed reconnects, nullable signal/reset values | Physical association/routing scenarios pending |
| 10 | Exact sidebar order, standalone Live Inputs, diagnostics consolidated | Deployed-site hardware access pending |
| 11 | A–G sections, health/last error, chronological grouped history and sanitized exports | Physical health readouts pending |
| 12 | 60/30-second incident windows, bounded IndexedDB retention and delete/restore tests | Offline physical reconnect investigation pending |
| 13 | Non-secret control correlation, local recording labels/relative time and sequence/counter integration | Simultaneous Android/Web/Kit capture pending |
| 14 | Physical-data-only display, source/link distinction, real PPM channels/loss | Physical PPM/AP/STA observation pending |
| 15 | Verified same-Kit AUTO/manual routing, shared USB decoder, late-reply rejection | Simultaneous USB + Android AP/STA acceptance pending |
| 16 | Freshness/identity normalization, no stale LIVE, claim/source sequence reset | Physical disconnect scenarios pending |
| 17 | Shared reads/cache, contextual polling, Python hidden/adaptive/backoff scheduling | RF congestion measurements pending |
| 18 | Responsive Chromium, embed-denial recovery, matching entrypoints/cache | Actual Wix/GitHub Pages permission/download verification pending |
| 19 | Auth, replay, ownership, OTA/legacy chunk, pairing and Wi-Fi regression gates retained | Stable signed upgrade and hardware acceptance pending |
| 20 | Automated suite, browser/API fixtures, A1/A2 builds and debug APK checks executed | Ten real acceptance scenarios and physical POCO X2 not executed |
| 21 | Source, tests, build provenance and file-by-file review available | None invented for unavailable devices |
| 22 | Baseline/branch/local commits, reports, builds and main delivery authorized | Actual remote delivery/CI outcome recorded in final response |

The hardware matrix must be run with propellers removed and motors disconnected. For each of the ten acceptance scenarios listed above, collect diagnosticId, RX/APPLIED sequence, feedback/send gaps, input/receive/apply ages, queue/API timings, RPC/HTTP durations, AP counters and release reason. A genuine receive/apply expiry must neutralize/release, stale/replayed input must never refresh watchdogs, and recovery must require fresh authorized control. Do not use a 2000 ms deadline to extend the earlier failsafe or infer physical motor arming from an ACK.
