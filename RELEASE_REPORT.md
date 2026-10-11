# Release report — published 1.7.0 / firmware 1.4.0

[PR #24](https://github.com/chilchiltrips-boop/dronelab/pull/24) is merged. All required automated main release gates passed. The stable signed Android APK, both boards' APP/FACTORY artifacts and GitHub Pages are published. Physical hardware acceptance remains pending; this is a verified software release, not a claim of completed physical classroom testing.

## Release identity

| Item | Verified value |
|---|---|
| Validated main source / merge | `436744baf7c6966edc9e6a630b4174d8d095fc3b` |
| Firmware publication commit | `a47b151b975ec6708e4d1e0ef7b419ef28afad40` |
| Signed APK publication / artifact main HEAD | `07a83058a236c7e881cf80cfc62c636eb701a146` |
| WebApp | 1.7.0; initially verified live as **v1.7.0+193 • RELEASE** |
| Current generated WebApp build | [app-version.json](https://chilchiltrips-boop.github.io/dronelab/app-version.json); documentation-only publication can increment the generated build number |
| A1 / A2 diagnostic firmware | **1.4.0**, Arduino-ESP32 **3.3.12** |
| Android | **1.7.0-network-lab**, **versionCode 16**, non-debug release |
| Android application ID | `in.zebjus.dronelab.companion` — unchanged |
| Previous actual APK | code14 / 1.6.3; old Gradle requested code15 / 1.6.4 |
| Rollback source | `edad707b4ffdd559513e816e9cb084e88f83435f` |

The source SHA above is exactly the source checked by the mandatory APK publication gate. Subsequent commits contain generated firmware, APK, version metadata and this release evidence. The final delivered main SHA is also reported in the completion message; a document cannot embed its own resulting commit SHA.

Live [WebApp / MY KITS](https://chilchiltrips-boop.github.io/dronelab/#settings), [stable APK download](https://chilchiltrips-boop.github.io/dronelab/mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk), [APK metadata](https://chilchiltrips-boop.github.io/dronelab/mobile-apk/ANDROID_RELEASE_META.txt), [APK checksum](https://chilchiltrips-boop.github.io/dronelab/mobile-apk/SHA256SUMS.txt), [firmware catalog](https://chilchiltrips-boop.github.io/dronelab/firmware-catalog.json).

APK SHA-256: `e06bbd5462ccf315b1c902d8340e79ec182b978b571ecfa8dc0797d0c546d3b6` (1,029,355 bytes). Pinned release certificate SHA-256: `f1b86575b3590734654f638e4e0d68056d37b2e8884ac7d6c24636fe9b516894`. CI inspected the actual APK, compared the published predecessor's certificate/application ID, then performed `adb install -r` code14→16 with retained preferences in an Android emulator. No uninstall was required. Signing material remains in existing encrypted GitHub secrets.

## Published firmware binaries

| Image | Bytes | SHA-256 | Download |
|---|---:|---|---|
| ZFC-A1 APP | 1,152,000 | `e237056045e40289712552ef60ea57574a80f5bbd5c2f0fa8a457888860c3986` | [ZEBJUS_FLIGHTCORE_A1_APP.bin](https://chilchiltrips-boop.github.io/dronelab/FlightCore_Firmware/ZEBJUS_FLIGHTCORE_A1_APP.bin) |
| ZFC-A1 FACTORY | 4,194,304 | `17ab7fb45be84d05c4801ab3f1e74e13d3a8005425d37911f1d545b57f3efde2` | [ZEBJUS_FLIGHTCORE_A1_FACTORY.bin](https://chilchiltrips-boop.github.io/dronelab/FlightCore_Firmware/ZEBJUS_FLIGHTCORE_A1_FACTORY.bin) |
| ZFC-A2 APP | 1,159,504 | `87c355a78af1337bafb24813e50428253d7eac36eb57be718ae6fb00429cf5fe` | [ZEBJUS_FLIGHTCORE_A2_APP.bin](https://chilchiltrips-boop.github.io/dronelab/FlightCore_Firmware/ZEBJUS_FLIGHTCORE_A2_APP.bin) |
| ZFC-A2 FACTORY | 4,194,304 | `8c1a4b856de8dca357e1f60c1d5160d267b5c71d52e459d4d46db60f3a735534` | [ZEBJUS_FLIGHTCORE_A2_FACTORY.bin](https://chilchiltrips-boop.github.io/dronelab/FlightCore_Firmware/ZEBJUS_FLIGHTCORE_A2_FACTORY.bin) |

A1 is ESP32-C3 (chip ID5), A2 is XIAO ESP32-C6 (chip ID13). APP fits each 1,966,080-byte OTA slot. FACTORY is a merged 4MB USB recovery image at offset `0x0`; never send FACTORY over OTA. [Build report](FlightCore_Firmware/build-report.json) and [catalog](FlightCore_Firmware/catalog.json) contain exact profiles, offsets and hashes. Build timestamps explain differing local/earlier CI hashes; each artifact set was verified together.

## Architecture and fixes

A private manufacturer label authorizes time-limited AP setup, independently of the six-digit selector/common Wi-Fi password. Trusted cached HTTPS or signed Android code performs mutual identity proof, scoped sessions, request counters and encrypted credential submission. Test & Save persists NVS only after new association, correct SSID and DHCP verification. The existing MY KITS manager reconnects the same full Device ID over STA without reclaiming ownership.

Android's Wi-Fi-bound native transport sends direct AP diagnostic frames; firmware validates and timestamps them. A separate STA observer session supplies the actual receive snapshot to local Pyodide via `await Drone().read_joystick()`. Samples older than 350ms (including conservative round-trip delay) become neutral/failsafe. RC ownership is exclusive and expires safely; no motor outputs, physical arming or flight controller were added. QR/WebRTC and virtual flight remain available independently.

Fixed AUTO dropping STA after setup, save-before-verification, stale association success, timeout sampling, disconnect reason36 confusion, USB-only new-laptop enrollment, first-frame/owner/replay/freshness handling, Python observer ownership conflicts, unintended hardware STOP from virtual simulator resets, OTA success before verified reboot, obsolete header assertions and switch/placeholder clipping. OTA remains exact-board APP only, teacher-authorized, actual STA and idle; USB factory recovery remains.

Implemented compact six-step enrollment, resume/recovery, actual-interface topology, firmware-received input/age/counters and a runnable Python example. The desktop header stays 82px. MY KITS height at 1366px fell 2885→2628px (about 9%). See [before/after and six-width/native screenshots](UI_LAYOUT_REVIEW.md).

## Main automated evidence

| Check | Result / evidence |
|---|---|
| Full QR/network/browser/offline gate | [PASS](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844701): `npm run check`, **190 tests / 0 failures**, firmware validation, actual encrypted QR/WebRTC, PIN/ownership/STOP, camera cancellation, **82 UI actions**, header checks, real offline Service Worker and live six-digit PeerJS smoke |
| Android direct AP → STA Python | PASS in the same gate: actual Android JS touch and actual Pyodide against an independently implemented simulated ESP32/native transport; fresh samples plus stale-neutral assertions |
| Signed Android build / native / publication | [PASS](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844782): debug/release builds, pinned cert, same app ID, code14→16 upgrade, **50 native touch assertions** in two orientations, exact-source checks before stable publication |
| Android landscape / applied WebRTC | [PASS, attempt2](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844761): 10 touchscreen sizes, dual sticks, throttle hold, ownership, reordered feedback, replay, STOP and 450ms simulator watchdog |
| Python editor / Pyodide | [PASS](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844666): files/editor/scroll/loops/Matplotlib/Stop |
| A1/A2 actual compilation | [PASS](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844678): both APP/FACTORY artifacts and metadata |
| Firmware center validation | [PASS](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844660): SHA/chip/catalog/offset checks |
| Full input fit | [PASS, 45 checks](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844650) |
| Mobile Ctrl layout | [PASS, 33 checks](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844694) |
| PID shell / persistent pairing | [PASS](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844669) |
| Tripod simulator | [PASS](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844648) |
| Pinned Python runtime hashes | [PASS](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844645) |
| Pages with published APK/artifacts | [PASS](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38180183736) |

The first main Android WebRTC attempt observed a correct safety stop from a control timeout during the keyboard ownership assertion. The unchanged source/test passed on retry; no timeout, watchdog or functional assertion was relaxed. Early branch failures exposed and corrected layout assumptions, one clipped placeholder, a stale native versionCode assertion, observer-reset isolation and startup sampling in the new network fixture. Local sandbox ICE/navigation limitations were resolved by passing real CI gates. The cloud browser confirmed live version/new setup controls; its unavailable WebGL is an environment limit, while CI tests exercise the renderer.

Public download bytes, sizes, SHA values and APK metadata are recorded in [deployment verification](docs/network-release/deployment-verification.json). All tested binaries came from the committed catalog; no secrets or private enrollment labels are included.

## Remaining acceptance and recovery

No physical ESP32, Android Wi-Fi radio, router or sensors were attached. Actual independent-5V first enrollment, wrong-password/router tests, power-cycle persistence, AP+STA shared-channel changes/contention, DHCP changes, phone radio/lifecycle, real browser LNA prompts, sensors and physical OTA/USB recovery remain **PHYSICAL PENDING**. Follow the A1/A2 procedure in [TEST_MATRIX.md](TEST_MATRIX.md) before classroom deployment.

Existing kits need firmware1.4.0 plus a factory/teacher-installed private label; students then enroll without USB. The local HTTP page is recovery help only and never collects secrets. Keep the official HTTPS app open/cached before joining the AP, grant supported Chromium Local Network Access, switch SSIDs manually and use the verified STA IP if mDNS/router isolation blocks discovery. Do not assume separate AP/STA radios or universal cross-subnet WebRTC. Teacher legacy admin/OTA access remains a private bearer key on trusted LAN HTTP, not protection from a hostile LAN attacker.

For a lost link, reconnect monitoring and explicitly grant control again; never auto-arm. For failed OTA, use protected USB recovery with the matching board image. FACTORY recovery clears settings. Label installation/revocation requires teacher physical USB access. Preserve provisioning records privately.

Rollback reference: `edad707b4ffdd559513e816e9cb084e88f83435f`. Revert the release source, rebuild matching A1/A2 binaries/catalogs, and publish any Android rollback as a **new higher versionCode signed with the same certificate**. Do not downgrade versionCode or require uninstall. Keep current/previous artifacts for recovery.

Related scope and design: [master prompt](WORK_MASTER_PROMPT.md), [code audit](EXISTING_CODE_AUDIT.md), [connection architecture](CONNECTION_ARCHITECTURE.md), [firmware API contract](FIRMWARE_API_CONTRACT.md), [test matrix](TEST_MATRIX.md), [UI review](UI_LAYOUT_REVIEW.md).
