# ZEBJUS DroneLab V2 — Existing Code Audit

Date: 2026-10-13 (remote repository snapshot)  
Base commit: `04f2d8d3a00b205f6ddec7e16d435f37f69acb1f` (`main`)  
Scope: Source inspection of the network/authorization/Android paths and CI metadata. **Not** a physical-device acceptance report, complete UI review, or proof that any 15-phase V2 feature is finished.

## Existing system and retained safeguards

| Area | Confirmed source behavior | V2 gap / follow-up |
|---|---|---|
| Device identity | `FlightCoreClassroom.h` derives ZFC-A1/A2 Device ID from efuse MAC; six-digit Kit Code is a selector. | Explicit classroom duplicate-code handling and per-student permissions require end-to-end verification. |
| AP / STA | `FlightCoreNetwork.h` includes AP, STA, AUTO, Wi-Fi scan/test, saved credentials, interface state, status and diagnostic read endpoints. | Real AP/STA coexistence, power-cycle, change-of-router and network-boundary hardware tests pending. |
| Enrollment | `FlightCoreEnrollment.h` uses manufacturer label, HMAC challenge, replay counters, signed responses, AES-GCM for POST payloads, and short setup scope. | One-time possession-confirmed customer owner onboarding without routine private-label entry is **not implemented** in the inspected baseline. BOOT/SETUP hardware feasibility unverified. |
| Credential storage | Browser `kit-pairing-store.js` uses sessionStorage and IndexedDB with nonextractable AES-GCM key. Firmware uses ESP32 Preferences. | Shared-device lifecycle, factory reset, revocation/versioning and local threat models require verification; local nonextractable keys do not protect from same-origin script compromise. |
| Hardware RC safety | `FlightCoreClassroom.h` uses 350 ms diagnostic deadman, 1800 ms owner lease, source/session checks; firmware advertises motors disabled. | Teacher/student scoped authorizations, long-lived operator policy, secure transfer and Android ownership interoperability are not verified. Do not enable motors. |
| WebApp state | `js/classroom-kits.js` polls every 2200 ms and has a reconnect path; `js/network-lab.js` also holds independent `netReady`, `netMode`, `lastSeen` state and telemetry timer. | Consolidate independent status sources; separate true Internet reachability, authenticated hardware freshness, interface state and active transport. |
| Header | `js/classroom-kits.js` renders existing connected/locked states, AP/STA switch and actions. Existing header regression tests require `overflow-x:auto`. | The full compact no-horizontal-scroll V2 redesign remains pending; old overflow test must be replaced with seven-viewport visual assertions. |
| Android | `FlightCoreNativeBridge.java` restricts local IP and routes, binds ordinary requests via `wifi.openConnection`, and preserves landscape WebView/WebRTC. | **Confirmed flaw:** OTA used default `target.openConnection()` when Wi-Fi unavailable. This must fail closed on missing Wi-Fi. Further network selection/identity checks and signed APK upgrade tests pending. |
| Firmware OTA | `FlightCoreNetwork.h` checks admin access key, active STA request transport, idle RC, APP header chip ID and OTA partition. | Bench OTA is not signed production firmware; end-to-end signature verification, secure boot and physical recovery tests required. |
| WebApp features | Assembly, Wiring, Python, Firmware, PID, Settings and WebRTC sources present; `npm test`, `npm run check`, `npm run verify:firmware` scripts exist. | Regression suites, offline cache, layouts, deployment, and physical USB remain unverified in this audit. |

## Release/CI evidence observed

- `main` and `feature/unified-connection-admin-v2` both resolved to `04f2d8d3a00b205f6ddec7e16d435f37f69acb1f` at audit time.
- No V2 PR found by search for `unified-connection-admin`.
- Most recent `main` GitHub Pages run at snapshot: https://github.com/chilchiltrips-boop/dronelab/actions/runs/38180408448 (success). This is a baseline Pages deploy, **not** a V2 software validation.
- Historical Android signed build run: https://github.com/chilchiltrips-boop/dronelab/actions/runs/38179844782 (success on older SHA); does **not** validate a new APK or upgrade.
- `package.json` version 1.7.0; `mobile-android/app/build.gradle` versionCode 16, versionName 1.7.0-network-lab. Physical firmware version/catalog must be verified before reporting any new release.

## Confirmed blocker and immediate isolated patch

The Android native OTA flow in `FlightCoreNativeBridge.onFirmwareFile` previously used `wifi != null ? wifi.openConnection(target) : target.openConnection()`; requests could silently use the system default network if the intended Wi-Fi was absent. The isolated patch will require an actual Wi-Fi `Network` or reject the operation. The firmware STA-only guard stays in force. Add a Node regression test to prevent fallback recurrence.

## Priority remaining work (not claimed complete)

1. Design, implement and hardware-verify secure one-time customer ownership enrollment; preserve existing manufacturer enrollment and migration path until proved.
2. Consolidate browser/Android connection state into independently observed Internet, hardware authentication/freshness, AP/STA interface and ownership fields; implement real refresh with staleness and reconnect tests.
3. Implement per-kit admin/student permission scopes, teacher access, Home Mode expiry/revocation semantics, duplicate-code handling and hardware-enforced single-operator transfer.
4. Replace header composition and all seven responsive viewports; test offline and landscape operation, no horizontal overflow.
5. Complete A1/A2 firmware builds, APP/FACTORY hash/catalog checks, Android signed release/update, Playwright/emulator runs, security tests, migration/rollback and Github Pages release verification.
6. Conduct physical A1/A2/STA/AP/USB/Android Wi-Fi/OTA validation; mark each hardware-only case **PHYSICAL PENDING** until actual testing.

## Preservation / release policy

Work mode may have uncommitted/unpushed V2 changes outside GitHub. This audit/patch uses a **separate branch** instead of overwriting `feature/unified-connection-admin-v2`. Do not force push or merge into `main` without passing scoped tests and completing the broader acceptance gates. Keep physical motor outputs/ARM disabled.

## 2026-10-13 continuation checkpoint

PR #25 now exists and its six commits were integrated without rewriting. Accessible prior V2 worktree was clean at main. `V2_RECOVERY_AND_PROGRESS_REPORT.md` supersedes the earlier no-PR observation. New browser monitoring and header work is partial V2, not a security/School Mode completion claim.
