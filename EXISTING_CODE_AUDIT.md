# Existing code audit and implemented fixes

Baseline: `edad707b4ffdd559513e816e9cb084e88f83435f`, WebApp 1.6.4+192, firmware 1.3.9. Existing source, tests, workflows and release metadata were inspected in an isolated clone; unrelated workspaces were left untouched. The old reference repository was used for context, not copied over this project.

| Files / existing subsystem | Finding and implemented action |
|---|---|
| FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino | Kept sensor, USB, A1/A2 pin profiles and disabled motors; bumped diagnostic firmware to 1.4.0. |
| FlightCoreNetwork.h | AUTO disconnected STA after successful onboarding; now keeps AP+STA. Association success requires a fresh GOT_IP epoch, correct SSID and DHCP. NVS stores a verified atomic record. Disable SDK credential auto-persistence. |
| FlightCoreNetwork.h timers/events | Preserve reason 36=STA_LEAVING and coalesced events; sample loop clock after HTTP handling, retain rollover-safe retry/test arithmetic. Explicit networkState/physical socket transport removes AP/STA confusion. |
| FlightCoreEnrollment.h (new) | Existing new-laptop workflow needed a USB-derived key. Added manufacturer label challenge/proof, separate diagnostic credential, scoped expiring sessions, one-use challenges, signed counters/responses and encrypted POST bodies. |
| FlightCoreSetupPortal.h / tools/setup-portal.html | Local offline recovery help only. Do not collect secrets on an unauthenticated HTTP-delivered page. HTTPS cached app or signed native app delivers trusted enrollment code. |
| FlightCoreClassroom.h | Preserved first-frame/lease guards; added public owner ID, response preset, rate bound, watchdog-processed snapshot and explicit input-valid/motors-disabled data. |
| tools/provision_kit_label.py | Added manufacturing-only USB provisioning and private label generation; no spare BOOT pin or student USB dependency. |
| js/kit-auth.js | Shared browser/native protocol implementation with independent Node crypto interoperability tests. Serial request queue prevents counter reordering. |
| js/classroom-kits.js | Extended the existing connection manager. Label enrollment, six-step setup, verified IP/mDNS handover, STA default, same-ID read-only recovery even while Android owns RC. Header selection changes preference only. |
| js/kit-pairing-store.js | Existing session and opt-in encrypted browser vault retained. Store derived diagnostic credential, not manufacturer label. Existing USB admin compatibility remains explicit. |
| js/network-lab.js | Removed competing unverified raw path; all diagnostic reads use verified MY KITS. Added firmware RC reader, 10 Hz bound, RTT/stale neutralization. Scan/test now poll to completion. |
| js/python-lab.js / python-lab-worker.js | Added actual `await Drone().read_joystick()` RPC/example. Removed inappropriate WEB ownership requirement for STA monitoring, allowing Android AP input simultaneously. Existing files/Monaco/plots/Stop remain. Hardware examples prefer already connected STA/AP. |
| companion-network.js | Native secure transport and label enrollment; separate AP connectivity, diagnostic ownership and WebRTC. Explicit claim/release; no automatic re-claim. RX ACK validates ID/sequence; lifecycle/timeout drops input. |
| companion-flight.js / flight-input.js | Retained existing touch-follow multitouch, presets and virtual flight. Added separate diagnostic throttle/axes so AP input works without WebRTC ARM. STOP releases diagnostic control. No physical motor code. |
| FlightCoreNativeBridge.java | Wi-Fi-bound private-host allowlisted requests support auth headers and response proof. Bounded worker queue and stale input rejection. No silent cellular routing for kit requests. |
| pairing-web.js / js/tripod-page.js | Simulator reset previously called global kit STOP even for a read-only observer. Gate automatic virtual resets on this WebApp owning hardware control; independent Android AP ownership remains live. Explicit MY KITS emergency STOP still stops any authorized input. |
| MainActivity.java / pairing modules | Retained package identity, camera permission flow, splash/landscape, two-way QR, six-digit signaling, PIN and ownership. Existing pause callback stops/releases input. |
| firmware-updater.js / firmware image modules | Retained SHA/chip/board validation and USB factory offsets. STA teacher-only APP OTA; student labels and AP control cannot update. Verify same ID, reboot bootId and expected version before success. |
| index.html / classroom-kits.css | STA-first setup, compact discovery, setup progress and topology, compact browser persistence controls, balanced card columns, offline empty state. Header height and single row preserved. |
| Assembly / Wiring / PID / Python styles | Existing compact layouts and functionality preserved; viewport screenshot audit and their existing browser suites provide regression evidence. No replacement application. |
| sw.js | Versioned cache changed; added shared auth asset and retained dynamic firmware catalog caching. Offline/local-network limitations documented. |
| Android Gradle / verifier / signed build workflow | Baseline config requested code15/name1.6.4 while actual published APK was code14/name1.6.3. New code16/name1.7.0-network-lab, same application ID and pinned signing certificate. Native in-place upgrade gate remains mandatory. |
| tools/build_scanner.py | Include new firmware headers; bounded compiler jobs. Build actual C3/C6 APP and FACTORY artifacts with SHA metadata. |
| Browser/header regression | Obsolete “Connect AP” assertion corrected to actual “AP Connect”, retaining enabled/disabled and transport behavior checks. |
| tools/secure-kit.test.mjs / firmware-host.test.mjs | Actual embedded RC/enrollment headers compiled on host, plus independently implemented crypto fixtures, wrong-ID/tamper/replay/stale/scoping tests. |
| tools/network-browser.mjs | Real UI + Android JS + Pyodide over simulated native/ESP32 transport. Explicitly not a physical radio test. |

## Existing diagnostic features by transport

| Feature | STA/AP support | USB requirement |
|---|---|---|
| Immutable ID, firmware, sensor/gyro reads, telemetry/plots | Authenticated read-only | None |
| I2C scan, guarded LED patterns, telemetry rate | Authenticated allowlist; existing board pin guards | None |
| Python files, editor, Run/Stop, Matplotlib | Execute in browser; hardware reads use selected verified connection | None for STA diagnostics |
| Wi-Fi scan, test/save, mode | Temporary setup/teacher authorization; RC idle | No student USB |
| RC snapshot | Authenticated observer while Android owns input | None |
| APP OTA | Teacher + actual STA + exact board/ID + idle | Alternative recovery path |
| Factory/merged flashing, ROM bootloader, teacher/label provisioning/revocation | Not exposed as network commands | Physical USB |
| Arbitrary GPIO or serial execution, motor outputs | Not exposed; no new unrestricted command surface | Unsupported as a new feature |

Known verification boundaries are recorded in TEST_MATRIX.md. No physical ESP32/router/Android radio claims are made from mocks or compilation.
