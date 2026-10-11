# Test matrix — 1.7.0 / firmware 1.4.0

Execution types are deliberately separate: source/unit, actual C++ headers on a host shim, simulated network in real Chromium/Pyodide, CI Android emulator, physical hardware. Hardware was not attached to this environment.

| Scenario | Expected result | Evidence/type | Status |
|---|---|---|---|
| Existing baseline suite | No regressions before changes | npm test, 183 tests | PASS |
| Final syntax and unit/API tests | Modules parse; auth/RC/contracts pass | npm run check; npm test (189 tests at latest recorded run) | PASS; rerun after final changes |
| A1/C3 and A2/C6 compilation | Correct chip, no motor code, flash/RAM fit | Arduino-ESP32 3.3.12; tools/build_scanner.py | PASS; final artifact metadata recorded in build-report.json |
| APP/FACTORY SHA/chip validation | Binary matches catalogs and offsets | npm run verify:firmware | PASS; rerun after final build |
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
| Local Network Access denied / offline cache | Useful recovery, no fake connected state | Browser permission guidance; existing offline suite | CI/real-browser pending |
| Multiple kits / two controllers | Identity-separated sessions; one RC owner | Actual C++ owner/IP tests + existing manager tests | PASS |
| First RC frame / duplicate / out-of-order / bounds | First accepted; bad frame rejected | Actual Classroom.h host executable | PASS |
| Deadman / lease / millis rollover | Neutral at 350 ms; release at 1800 ms | Actual firmware header host tests | PASS |
| Android AP → receive state → STA Python | Exact received axes; observer never claims RC | network-browser.mjs real Pyodide + simulated ESP32/native | PASS simulated; physical pending |
| Snapshot stale / wrong ID | Neutral or error, never frontend values | secure-kit.test.mjs | PASS |
| Firmware reboot during session | Session boot binding invalidates old requests | Actual enrollment header host test | PASS |
| APP OTA during RC / wrong board / student authorization | Block before write | Firmware guards, image tests, browser updater tests | PASS simulated; physical flash pending |
| Post-OTA verification | Same ID, new bootId, expected runtime version | Implementation + regression tests | PHYSICAL PENDING |
| USB factory recovery / I2C / gyro on both boards | Correct bootloader/profile/pins/sensors | Existing tests + C3/C6 compile | PHYSICAL PENDING |
| QR pixels / encrypted WebRTC / code / PIN / grant / STOP | Existing behavior preserved | qr-pairing-browser.mjs | Local sandbox ICE timeout; CI pending |
| Live six-digit signaling service | Real cloud service reachable | Optional code-live-smoke.mjs | ENVIRONMENT-DEPENDENT |
| Camera permission/cancel/offline QR | Clear error/retry, no stale camera tracks | audit-browser + Android/native tests | CI pending |
| Python editor/files/scroll/while-loop/Matplotlib/Stop | Existing IDE works | python-browser-smoke.mjs, real Pyodide | PASS locally |
| Header transport/control / fixed height | Single row, real enabled state | header-ota-browser.mjs (1837/1366/844) | PASS locally |
| 360/390/768/1024/1366/1920 layouts | No horizontal overflow; readable sections | audit-browser.mjs screenshots | Partial local pass; navigation timing timeout, CI pending |
| Android touch/presets/release/landscape | Two independent sticks; no unsafe input retention | Existing browser + native touch emulator suite | CI pending |
| Android debug/release build | Compiles, correctly signed | Build ZEBJUS Stable-Signed Android APK | CI pending |
| APK upgrade from actual old code14 | Same cert/app ID; code16 installs with -r | Pinned certificate verifier + native emulator upgrade gate | CI pending |

## Physical acceptance procedure (must be performed on A1 and A2)

Use a regulated independent 5V supply, laptop with no USB cable, label-provisioned kit and 2.4 GHz router. Run the New Kit flow on a never-paired browser, including denied permission, wrong password and successful Test & Save. Power cycle and verify same hardware ID with saved STA. Connect Android AP and move both sticks in each preset while laptop Pyodide prints firmware input at 10 Hz. Record input age/RTT, accepted/rejected counts and no motor output. Interrupt AP, restart router/change channel, renew DHCP and reboot kit. Verify neutralization/no automatic ownership. Try a second claimant and mismatched ID. Attempt student/AP/active-RC/wrong-board OTA (must fail), then authorized idle teacher STA APP OTA and independent runtime check. Finally verify physical USB factory recovery and both sensor profiles. Record router/channel/OS/browser/app/firmware versions and measured latencies; do not fill this table from expectations.
