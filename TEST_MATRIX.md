# Test matrix — 1.7.0 / firmware 1.4.0

Execution types are deliberately separate: source/unit, actual C++ headers on a host shim, simulated network in real Chromium/Pyodide, CI Android emulator, physical hardware. Hardware was not attached to this environment.

| Scenario | Expected result | Evidence/type | Status |
|---|---|---|---|
| Existing baseline suite | No regressions before changes | npm test, 183 tests | PASS |
| Final syntax and unit/API tests | Modules parse; auth/RC/contracts pass | npm run check; npm test (190 tests at latest recorded run) | PASS (final source rerun) |
| A1/C3 and A2/C6 compilation | Correct chip, no motor code, flash/RAM fit | Arduino-ESP32 3.3.12; tools/build_scanner.py | PASS; final artifact metadata recorded in build-report.json |
| APP/FACTORY SHA/chip validation | Binary matches catalogs and offsets | npm run verify:firmware | PASS including CI-generated binaries |
| No label installed | Enrollment fails closed | Actual Enrollment.h host test | PASS |
| Private-label proof / wrong Device ID | Mutual proof, exact kit binding | secure-kit.test.mjs + actual header host | PASS |
| Replay/expired challenge/request/session | Reject; no scope escalation | Host C++ + crypto tests | PASS |
| Wi-Fi password confidentiality | AES-GCM body; no secret in transport log fixture | Independent Node decryption fixture | PASS |
| Blank kit / 5V / new laptop without USB | Label setup on AP then STA | Implementation + simulated browser; physical test below | PHYSICAL PENDING |
| Router scan/Test & Save/handover | Saved only after association; same full ID | Browser network fixture + firmware guards | PASS simulated; physical pending |
| Wrong password / unavailable router | Not saved; previous record preserved | Firmware state/guard tests; physical router unavailable | PHYSICAL PENDING |
| Power cycle credential persistence | Atomic verified NVS record restores STA | Source + board compile | PHYSICAL PENDING |
| Router restart / channel changes / AP+STA contention | Monitoring reconnect; Android releases, no re-arm | Protocol review + recovery tests | PHYSICAL PENDING |
| DHCP IP moves / wrong kit reuses address | Full ID mismatch blocks binding | Crypto/browser manager tests | PASS simulated; physical pending |
| Refresh / new browser session | Derived credential refresh, label on new laptop | Pairing vault + secure auth tests | PASS simulated |
| Local Network Access denied / offline cache | Useful recovery, no fake connected state | Browser permission guidance; existing offline suite | PASS real Service Worker CI; real LNA permission test pending |
| Multiple kits / two controllers | Identity-separated sessions; one RC owner | Actual C++ owner/IP tests + existing manager tests | PASS |
| First RC frame / duplicate / out-of-order / bounds | First accepted; bad frame rejected | Actual Classroom.h host executable | PASS |
| Deadman / lease / millis rollover | Neutral at 350 ms; release at 1800 ms | Actual firmware header host tests | PASS |
| Android AP → receive state → STA Python | Exact received axes; observer never claims RC | network-browser.mjs real Pyodide + simulated ESP32/native | PASS simulated; physical pending |
| Snapshot stale / wrong ID | Neutral or error, never frontend values | secure-kit.test.mjs | PASS |
| Firmware reboot during session | Session boot binding invalidates old requests | Actual enrollment header host test | PASS |
| APP OTA during RC / wrong board / student authorization | Block before write | Firmware guards, image tests, browser updater tests | PASS simulated; physical flash pending |
| Post-OTA verification | Same ID, new bootId, expected runtime version | Implementation + regression tests | PHYSICAL PENDING |
| USB factory recovery / I2C / gyro on both boards | Correct bootloader/profile/pins/sensors | Existing tests + C3/C6 compile | PHYSICAL PENDING |
| QR pixels / encrypted WebRTC / code / PIN / grant / STOP | Existing behavior preserved | qr-pairing-browser.mjs | PASS real encrypted QR/WebRTC in CI; local sandbox ICE timeout documented |
| Live six-digit signaling service | Real cloud service reachable | Optional code-live-smoke.mjs | PASS live PeerJS smoke in CI; service availability remains external |
| Camera permission/cancel/offline QR | Clear error/retry, no stale camera tracks | audit-browser + Android/native tests | PASS CI (links below) |
| Python editor/files/scroll/while-loop/Matplotlib/Stop | Existing IDE works | python-browser-smoke.mjs, real Pyodide | PASS locally |
| Header transport/control / fixed height | Single row, real enabled state | header-ota-browser.mjs (1837/1366/844) | PASS locally |
| 360/390/768/1024/1366/1920 layouts | No horizontal overflow; readable sections | audit-browser.mjs screenshots | PASS CI visual/form audit + six-width captures; local navigation timeout documented |
| Android touch/presets/release/landscape | Two independent sticks; no unsafe input retention | Existing browser + native touch emulator suite | PASS CI (links below) |
| Android debug/release build | Compiles, correctly signed | Build ZEBJUS Stable-Signed Android APK | PASS CI (links below) |
| APK upgrade from actual old code14 | Same cert/app ID; code16 installs with -r | Pinned certificate verifier + native emulator upgrade gate | PASS CI (links below) |

## Physical acceptance procedure (must be performed on A1 and A2)

Use a regulated independent 5V supply, laptop with no USB cable, label-provisioned kit and 2.4 GHz router. Run the New Kit flow on a never-paired browser, including denied permission, wrong password and successful Test & Save. Power cycle and verify same hardware ID with saved STA. Connect Android AP and move both sticks in each preset while laptop Pyodide prints firmware input at 10 Hz. Record input age/RTT, accepted/rejected counts and no motor output. Interrupt AP, restart router/change channel, renew DHCP and reboot kit. Verify neutralization/no automatic ownership. Try a second claimant and mismatched ID. Attempt student/AP/active-RC/wrong-board OTA (must fail), then authorized idle teacher STA APP OTA and independent runtime check. Finally verify physical USB factory recovery and both sensor profiles. Record router/channel/OS/browser/app/firmware versions and measured latencies; do not fill this table from expectations.

## CI evidence links

* [Production-signed Android debug/release build, code14→16 preference-preserving upgrade and 50 native touch assertions](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38178487861).
* [Full input fit, 45 viewport/page checks](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38178487869).
* [Mobile control switch, 33 viewport/state checks](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38178487907).
* [Python Lab browser/real Pyodide regression](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38178487881).
* [A1/A2 rebuild and artifact validation](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38178487916).

An initial integrated CI run passed QR/WebRTC and screenshot/camera checks but failed the newly added STA/Python test. Review exposed an unconditional virtual-reset hardware STOP; isolation now has a unit regression and an explicit simulator-reset step. The new Pyodide test also encountered correctly invalidated samples during runtime startup/CPU stalls. It now requires three fresh received samples within a bounded loop and checks that every stale sample is neutral/failsafe; the 350 ms freshness bound is unchanged. Original source lines are preserved for scripts needing no sleep rewrite, improving traceback accuracy. The final branch and main runs passed that test and all remaining release gates; see the final main evidence below.

The complete [QR/network/UI/offline pipeline on the observer-isolation source](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38178769539) passed: real encrypted QR/WebRTC, camera cancellation and responsive captures, real Pyodide network integration, three header sizes, 82 UI action checks, real Service Worker offline firmware/Monaco/Matplotlib/simulator/companion, and a live public six-digit PeerJS handshake. A final QR workflow trigger now explicitly includes the network browser fixture and Python worker so future changes cannot skip this integration gate.

## Final main release

PR24 merged as `436744baf7c6966edc9e6a630b4174d8d095fc3b`. All mandatory source checks passed. Main [QR/network/offline gate](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844701) ran 190 tests with zero failures, 82 UI actions, real Pyodide integration and offline cache checks. Main [signed Android pipeline](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844782) passed code14→16 in-place upgrade, 50 native touch assertions and stable publication only after exact-source checks succeeded. Main [Android WebRTC run](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844761) passed on its second attempt; the first correctly safety-stopped on a transient control timeout. The retry changed no code, assertions or safety limits.

[RELEASE_REPORT.md](RELEASE_REPORT.md) lists every main CI link and published artifact/certificate/hash. [Deployment evidence](docs/network-release/deployment-verification.json) checks the public download bytes. The live HTTPS MY KITS page showed version1.7.0+193, STA preference, six setup steps and enabled New Kit control; later documentation stamping may increment the generated build number. Hardware rows above remain pending and are not promoted to PASS by automated publication.
