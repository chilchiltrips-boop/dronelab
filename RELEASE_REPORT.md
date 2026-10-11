# Release report — in verification

Baseline main: `edad707b4ffdd559513e816e9cb084e88f83435f` (rollback reference). Feature branch: `work/sta-ap-diagnostics-20261012`. Main publication, CI artifact IDs and deployed version will be recorded here after verification. This document does not claim the preview has been released.

| Component | Baseline | Target |
|---|---|---|
| WebApp | 1.6.4+192 | 1.7.0 + automatically generated release build |
| A1 / A2 firmware | 1.3.9 | 1.4.0, actual APP/FACTORY binaries and SHA catalogs |
| Android published APK | versionCode14 / 1.6.3 | versionCode16 / 1.7.0-network-lab |
| Android Gradle configuration | versionCode15 / 1.6.4 | reconciled with new code16 |
| Android application ID | in.zebjus.dronelab.companion | unchanged |

Pinned release certificate SHA-256: `f1b86575b3590734654f638e4e0d68056d37b2e8884ac7d6c24636fe9b516894`. A target version in Gradle is not evidence that an APK was signed/published; the signed artifact and native `adb install -r` gate must pass.

Local evidence: baseline 183 tests; expanded suite 189 tests passing; actual RC/enrollment headers compiled/executed against OpenSSL host shims; A1/A2 builds with Arduino-ESP32 3.3.12; Python IDE real Pyodide regression; compact header browser pass. Final rerun and CI results will replace pending items in TEST_MATRIX.md. QR/local screenshot scheduled-navigation failures are environment-dependent candidates, not silently reported as success.

Stable URLs: [WebApp](https://chilchiltrips-boop.github.io/dronelab/), [APK](https://chilchiltrips-boop.github.io/dronelab/mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk), [firmware catalog](https://chilchiltrips-boop.github.io/dronelab/firmware-catalog.json). Existing stable APK stays intact until the signed successor passes all mandatory gates.

Physical acceptance remains pending: no ESP32 boards, real Android Wi-Fi radio, router/channel switching, power cycle, real sensors or actual OTA were attached. Use TEST_MATRIX.md's procedure before classroom deployment. Existing kits need 1.4.0 plus factory/teacher-installed private labels; software alone cannot manufacture a label on an untrusted student AP. HTTP device portal is help-only; enroll via trusted HTTPS/native code. Supported-browser LNA permission and router mDNS/isolation may require manual STA IP.

Rollback: use GitHub revert for source changes, rebuild A1/A2 with the reverted catalog, and deploy a signed Android rollback build with a NEW higher versionCode using the same certificate. Do not downgrade versionCode or ask users to uninstall. For failed firmware OTA use protected USB matching-board APP/FACTORY recovery; FACTORY image goes at offset 0 and clears settings. Preserve existing APK/artifacts and teacher provisioning records privately.
