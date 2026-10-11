# ZEBJUS DroneLab — Complete Work Mode Master Prompt
## Full Repository Audit, STA-First Network Architecture, Android AP Joystick, QR Pairing, Python Lab Integration, UI Redesign, Testing and Main Release

### 0. Your role and execution mandate

Act as the **Lead Embedded Systems Engineer, ESP32 Networking Engineer, Android Developer, Full-Stack Web Developer, UI/UX Designer, QA Engineer and Release Manager** for ZEBJUS DroneLab.

This is an **implementation assignment**, not just a research, recommendation or audit assignment.

Inspect the complete existing project, understand how everything currently works, identify bugs, implement fixes, run tests, inspect the UI visually, retest after fixes, build firmware and Android APK, and push the verified final work to GitHub `main`.

Do not stop after writing an audit or implementation plan. Carry out the actual code changes and release work.

**Primary repository:** https://github.com/chilchiltrips-boop/dronelab

**Live WebApp:** https://chilchiltrips-boop.github.io/dronelab/

**Older reference repository:** https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab

Use the older repository only as a reference for previously working functionality, UI and connection patterns. Do not blindly overwrite the new project.

Read and build upon all existing project source files, documentation, tests, historical decisions and relevant chat context. Preserve working functionality.

### 1. Project scope — extremely important

**DO NOT implement a new drone flight controller.**

The current FlightCore firmware is a communication, telemetry, sensor, Wi-Fi and diagnostic firmware. Keep it that way for this release.

Do not add motor-driving firmware, ESC PWM/DShot, real flight arming, new flight PID loops, navigation, GPS loiter, altitude hold or autonomous flight code.

**Real hardware motor outputs must remain disabled.**

The Android joystick values should reach the ESP32 firmware, be validated, timestamped, and exposed to the WebApp Python Lab over STA. The current simulator's virtual flying functionality should be retained.

The objective is a reliable communication platform supporting:

- ESP32 FlightCore A1: ESP32-C3 Super Mini.
- ESP32 FlightCore A2: Seeed XIAO ESP32-C6.
- Multiple classroom kits with unique immutable hardware Device IDs and six-digit kit selectors.
- Laptop WebApp connected primarily over STA.
- Android app connected directly to the ESP32 AP for joystick communication.
- Existing Android-to-WebApp QR/WebRTC pairing.
- Browser Python controlling existing diagnostic functions through STA.
- USB only as a third-priority fallback, factory flashing and recovery path.

The solution must work with an ESP32 powered from an independent 5V supply and **no USB cable connected to the student's laptop**.

### 2. Required final connection architecture

#### Priority 1 — STA for WebApp and classroom operations

The ESP32 should normally connect to its saved 2.4 GHz classroom router.

The laptop runs the ZEBJUS DroneLab WebApp while connected to the same router.

The WebApp should use verified STA communication for all supported functions that currently depend on USB, except functions that inherently require a physical USB bootloader or protected factory recovery.

This includes device identification, current firmware information, network management, IMU/gyro reads, I2C scanner, sensor telemetry, LED diagnostic commands, Python Lab device APIs, monitoring, plotting, basic safe configuration and authenticated APP OTA.

The browser must verify the full hardware Device ID before binding any device data or control session.

#### Priority 2 — AP for Android direct joystick communication

The ESP32 should provide an AP interface for direct Android control communication.

Required path:

Android joystick → Android native Wi-Fi transport → ESP32 AP → Firmware RC diagnostic receiver.

At the same time, when the kit is reachable on STA:

ESP32 validated RC snapshot → STA telemetry/API → Laptop WebApp → Browser Python Lab.

This is a major requirement.

**The Android joystick must not require the laptop to be USB-connected.**

Direct AP joystick transport should not depend on WebRTC being available for its real-time delivery. Existing WebRTC pairing remains available for Android/WebApp pairing, simulation, control-status mirroring and application synchronization.

ESP32-C3/C6 use shared Wi-Fi radio resources for AP+STA. Investigate and test AP channel synchronization, connection coexistence, router/channel changes, reconnection and traffic contention. Do not promise two independent Wi-Fi radios.

Design the application for simultaneous STA management and AP joystick sessions where supported, with explicit handling of the limitations.

#### Priority 3 — USB

Use USB for first manufacturing flash, bootloader/factory firmware, advanced recovery and communication diagnostics if Wi-Fi fails.

Do not make physical USB pairing mandatory for a new student's laptop.

### 3. First-time installation workflow — no USB on the student's laptop

A controller may be flashed in the manufacturing lab on one computer, then shipped to a student.

The student should be able to:

1. Power the ESP32 using a normal regulated 5V supply.
2. Open the DroneLab WebApp on their own laptop.
3. Choose **New Kit / First-Time Setup**.
4. Connect to the controller's AP Wi-Fi.
5. Verify the kit identity.
6. Scan nearby 2.4 GHz routers.
7. Choose the classroom/home router.
8. Enter its Wi-Fi password.
9. Press **Test & Save**.
10. See actual verification progress and clear success/failure feedback.
11. Switch their laptop to the selected classroom router.
12. Automatically rediscover the same physical ESP32 over STA.
13. Confirm matching immutable Device ID, new STA IP and running firmware.
14. Finish setup and register the kit.
15. Subsequently use STA without any USB cable.

**Security requirement:** The six-digit Kit Code is a device selector, not a secure secret. The common AP Wi-Fi password must not grant unrestricted control, firmware update or administrator access.

Replace the current USB-only 32-character-key onboarding dependency with a secure USB-free enrollment design. Use a practical physical-setup confirmation or a per-device manufacturer-provided enrollment QR/secret, with a temporary time-limited setup session.

Choose a mechanism feasible on both real A1 and A2 boards. Do not assume a spare BOOT button/GPIO is available without checking hardware behavior. Avoid new external hardware requirements if a secure software/label-based option is workable.

Keep provisioning permissions narrowly scoped. Do not enable motor commands, unrestricted admin rights or OTA through anonymous AP onboarding.

Require strong device identity, short-lived authorization, replay protection, rate limits, session expiry and a recovery/reset method. Support revocation and safe re-enrollment.

If first-time setup needs an initial Wi-Fi connection that temporarily removes Internet access, provide a dependable flow using an offline-cached WebApp and/or a small device-hosted setup portal. Verify the limitations of HTTPS GitHub Pages accessing HTTP local ESP32 endpoints in supported browsers.

Do not assume a browser can automatically change the computer's Wi-Fi SSID. Provide guided OS-level switching where required.

### 4. Firmware networking state machine

Refactor the firmware network manager into a clear, observable state machine.

At minimum support:

- Boot / device identification.
- STA connecting.
- STA connected.
- AP onboarding.
- AP joystick ready.
- AP+STA coexistence.
- STA association test running.
- Credentials verified and saved.
- AP-to-STA handover.
- Network disconnected and recovery.
- Factory/USB recovery.

After boot, saved STA configuration should be the first choice for normal WebApp communication. If it fails, enter a recoverable AP onboarding mode. Do not trap the controller in an unreachable STA-only mode.

AP can remain active for Android direct control where appropriate, but distinguish **AP setup**, **AP flight-input transport**, and **STA WebApp management** clearly.

Save credentials to ESP32 NVS only after a verified successful router association. Never show “Saved” merely because a request received an HTTP 202 response.

Provide structured status containing configured mode, active physical interfaces, STA association state, router SSID, STA IP, AP IP, AP SSID, connection RSSI, test state, disconnect reason, recovery state and firmware version.

Handle the following previously observed problems:

- ESP disconnect reason 36 being repeatedly reported as a password problem even when it means STA leaving.
- Incorrect timeout arithmetic causing an almost immediate STA test failure.
- Wi-Fi scan results intermittently not showing.
- `SAVE_STA_FIRST` / `save_sta_credentials_first` errors.
- AP/STA state mismatch between firmware and WebApp.
- Credential test started but never confirmed saved.
- Repeated identical `AP ON` and reason 36 logs.
- AP staying visible or disappearing unexpectedly after mode changes.
- IP changes, router restarts, AP loss and device reboot.
- Firmware mode changes interrupting active network sessions without proper handover.
- Temporary network failures causing needless control/button reactivation.

Do not repeat Wi-Fi passwords or device keys in Serial logs, browser logs, URL parameters or exported reports.

### 5. WebApp network transport and connection manager

Refactor the existing MY KITS connection layer rather than creating a second competing connection system.

Inspect and reuse `js/classroom-kits.js`, `js/network-lab.js`, `js/kit-pairing-store.js`, the firmware APIs and any related code.

The WebApp must clearly distinguish:

- Selected connection preference.
- Actual verified transport.
- Firmware Wi-Fi mode.
- Physical AP active.
- STA connected.
- Kit identity verified.
- Session authenticated.
- RC controller ownership.
- Reconnecting / offline / error states.

Selecting STA/AP in the header must not silently change the ESP32 firmware's physical network mode.

Prefer STA when the selected kit is connected through the classroom router. AP is primarily for commissioning and Android direct control.

Support multi-kit classrooms without mixing telemetry or credentials between devices.

Use verified Device ID rather than relying only on IP or six-digit Kit Code. Do not bind to a different controller when DHCP changes.

When the same kit reconnects, restore monitoring and read-only services safely. Do not automatically restore RC ownership or real/virtual ARM permissions.

Add clear local-network permission, browser compatibility and recovery instructions.

**Important:** Do not solve the new-laptop setup problem merely by saving the existing USB-derived key in browser storage. It must work on a different laptop that has never been USB-paired.

### 6. Android app — keep QR pairing and add reliable direct ESP32 AP communication

Inspect the complete Android native project and packaged WebView assets:

- `mobile-android/`
- `FlightCoreNativeBridge.java`
- `MainActivity.java`
- `companion-network.js`
- `companion-flight.js`
- `flight-input.js`
- `pairing-core.js`
- `pairing-code.js`
- `pairing-qr-ui.js`
- `pairing-web.js`

**Preserve the existing QR pairing workflow. Do not replace or delete it.**

Required capabilities:

1. Android opens in landscape mode with its existing welcome animation.
2. Two independently movable touch-follow joysticks, left and right.
3. Left stick: throttle and yaw. Right stick: pitch and roll.
4. Slow, Medium and Fast response presets.
5. Existing camera-based QR scan with rapid center-focused detection.
6. Six-digit code fallback for computers without a camera.
7. Pairing status, verification PIN and explicit ownership.
8. Grant/Release Mobile Control with readable UI and no overlapping labels.
9. Direct Android ↔ ESP32 AP connection.
10. Safe joystick preview and firmware-reported receive/acknowledgment status.
11. Automatic link recovery without automatically arming.
12. Responsive landscape layout and readable connection dialogs.
13. Android network permission/camera permission reliability.
14. No need to uninstall the old app before installing correctly signed future versions.

Separate three concepts: QR/WebRTC peer pairing, Android-to-ESP32 AP connectivity, and ownership of the physical firmware RC diagnostic session.

Do not allow one connection type to falsely imply that the others are connected.

When the Android phone is on the ESP32 AP while the laptop is on a classroom router, do not assume cloud signaling or cross-subnet WebRTC always works. Retain existing QR/WebRTC pairing, but use firmware-reported joystick telemetry over STA as the authoritative way to show the Android input on the laptop.

Avoid relaying safety-critical direct AP joystick frames through GitHub Pages or public signaling servers.

Retain offline joystick preview when pairing is absent, but label it clearly as preview rather than firmware input.

### 7. Android joystick data must be readable from WebApp Python

This is a core acceptance criterion.

Required data flow:

**Android joystick → ESP32 AP → firmware validates/stores data → STA → WebApp Python.**

Firmware should accept and maintain a safe diagnostic RC snapshot containing at least:

- Device ID.
- Source: Android.
- RC session/owner identity.
- Sequence number.
- Input timestamp and age.
- Throttle: 1000–2000.
- Roll: 1000–2000.
- Pitch: 1000–2000.
- Yaw: 1000–2000.
- Optional normalized axes.
- Current response mode.
- Link connected/disconnected.
- Last accepted frame and rejected-frame counters.
- Failsafe/input-valid state.
- Motors disabled confirmation.

Add documented, authenticated and identity-bound read-only interfaces to retrieve this information.

A browser Python program should be able to do something conceptually like:

```python
from zebjus_simple import Drone
import asyncio

drone = Drone()

while True:
    rc = await drone.read_joystick()

    print("Source:", rc["source"])
    print("Throttle:", rc["throttle"])
    print("Roll:", rc["roll"])
    print("Pitch:", rc["pitch"])
    print("Yaw:", rc["yaw"])
    print("Frame:", rc["seq"], "Age:", rc["age_ms"])

    await asyncio.sleep(0.1)
```

Adapt the exact API to the existing Python architecture; ensure the example actually runs in Pyodide.

The data must come from the **actual ESP32 receive state**, not from fake frontend joystick values.

Implement bounded sample rate, reasonable latency measurement, stale-data identification, monotonic sequence validation, single-controller ownership and watchdog behavior.

If Android disconnects or joystick data becomes stale, report invalid/neutral data clearly. Do not keep old values falsely displayed as live.

Do not create any motor output from these values.

### 8. Python Lab — use STA for existing hardware operations

The current browser Python Lab must remain intact, including its editor, Python files, autosave, Run/Stop/Rerun, terminal, Serial Monitor, Serial Plotter and examples.

Audit every current USB-dependent feature and classify it:

- Transferable over authenticated STA.
- Read-only over STA.
- Restricted administrative operation.
- Requires physical USB.

For safe existing features, support equivalent STA functionality: I2C scanning, gyro/sensor readout, telemetry, LED diagnostics, supported GPIO functions, device metadata, firmware version, monitoring and plots.

Preserve existing A1/A2 board profiles and pin safety rules. Do not expose unrestricted firmware command execution over HTTP.

Use shared verified kit connection state so the Python Lab does not establish an independent conflicting connection.

Python files continue executing locally in the browser through Pyodide. Do not pretend Python scripts execute directly on ESP32 unless a real remote execution engine exists.

Make network-specific errors understandable: no kit selected, AP/STA disconnected, not authorized, wrong board, unsupported command, device busy, control owner locked, stale input or local-network browser restriction.

### 9. OTA and firmware management

Keep the current Firmware & USB page.

Required priority:

**STA authenticated APP OTA → USB APP/Factory Recovery.**

Allow APP OTA only after verifying the exact A1/A2 board, image compatibility, authenticated session, device identity, inactive RC ownership and safe firmware state.

Do not allow OTA while AP direct joystick control is active.

Do not enable factory/merged flashing via network. Preserve USB bootloader factory flashing at the correct flash offset.

Keep automatic firmware catalog loading, import `.bin`, verified firmware metadata, SHA-256, board detection, progress, logs, failure/retry state and post-flash runtime verification.

Build A1 and A2 APP/FACTORY images, run release verification and ensure catalog metadata matches the actual binaries.

Do not show “Firmware updated successfully” until the running controller version has been independently verified after reboot.

Use the current actual firmware version from the repository; do not hardcode an old release.

### 10. WebApp UI/UX — full restructuring and zero unnecessary blank space

Audit every major page:

- Assembly Lab.
- 2D Wiring.
- Python Lab.
- PID Tuning / Flight Training.
- MY KITS.
- Firmware & USB.
- Android pairing / QR connection sections.

Inspect actual rendered pages in a browser, not only HTML/CSS.

Provide a clear before/after layout review and implement improvements.

**Requirements:**

- No large unnecessary blank regions.
- No wasted columns or excessive vertical spacing.
- Balanced utilization of screen width.
- Consistent spacing scale, alignment, border radius, typography and icon styling.
- Compact headings and controls.
- Helpful hover tooltips; touch-accessible explanations.
- No overflowing text or clipping.
- No switch-label collisions.
- No accidental duplicate scrollbars.
- No buttons that appear enabled but do nothing.
- No large empty panels when the connection is offline.
- No unnecessary new decorative cards that increase page height.
- No loss of important existing features.
- Desktop, tablet and phone responsive behavior.
- Accessible focus, keyboard interactions and readable status indicators.

**Header requirements:**

Keep ZEBJUS logo and `ZEBJUS DroneLab` on one compact branded section.

Display the real deployed version **directly underneath** `ZEBJUS DroneLab` in small text, for example `v1.6.4+185 • RELEASE`, but use the actual automatically generated version. Never freeze an old build number.

Keep the existing header height unchanged and avoid a second wrapped header control row.

Show compact connection state, actual STA/AP status, AP/STA transport choice, CONTROL ON/OFF switch, Kit settings and Mobile Ctrl.

The header STOP button should not return; maintain an accessible Emergency STOP within the relevant hardware/control section.

**MY KITS redesign:**

Create a clean, compact setup and operating interface with a visible step-progress indicator:

`1. Find Kit → 2. AP Setup → 3. Scan Router → 4. Test & Save → 5. Connect STA → 6. Ready`

Show active step, completed steps, pending steps and meaningful errors.

Use progressive disclosure rather than showing every technical field at once.

Provide clear New Kit, Existing Kit, Reconnect, Network Recovery and Advanced USB Recovery workflows.

**Python Lab:**

Use space efficiently for editor, Run/Terminal, Serial Monitor/Plotter and the existing secondary panels. Keep current editor functionality, Python file management and layout improvements.

**PID Tuning:**

Retain the full-width responsive layout, virtual simulation, existing Rate/Angle cascade PID settings, sound, joystick feedback and existing simulator behavior. Do not accidentally turn this into real motor-control firmware.

**Firmware page:**

Show running vs published firmware, exact board, connection type, firmware source, image type, flashing option, progress and detailed results compactly.

Keep the entire application visually consistent with ZEBJUS branding.

### 11. Android UI optimization

Inspect real Android landscape screenshots and test touchscreen interactions.

Fix excessive whitespace, buttons too large, inconsistent icon colors, tiny text, overlaps, nonresponsive controls, slow QR scanning and confusing AP/STA/QR connection labels.

Ensure joystick touch-follow behavior, multitouch separation, release/cancel handling and settings dialogs work on common Android display sizes.

Retain the existing company identity and polished splash animation.

Do not redesign away the current successful joystick layout unnecessarily. Improve it incrementally based on the existing reference and test evidence.

### 12. Bug inventory and mandatory regressions

Investigate all previously reported bugs, including:

1. Reason 36 disconnect warning spam.
2. STA test instant failure / never saved.
3. AP-to-STA handover failure.
4. `SAVE_STA_FIRST` when credentials were expected to be saved.
5. AP connection blocked by a 32-character USB access key on a new laptop.
6. Browser session loses device credentials after refresh.
7. USB Serial unavailable / bootloader confusion.
8. `requestPort` no port selected.
9. Take Control succeeds but first RC frame is rejected.
10. Incorrect RC lease expiry and neutral heartbeat behavior.
11. Reconnect displays stale connected/locked state.
12. Firmware and UI showing different actual AP/STA status.
13. Android joysticks not moving on the WebApp.
14. Android disconnects or disarms unexpectedly.
15. QR detection latency and camera permission errors.
16. Six-digit code pairing timeout.
17. Grant Mobile Control overlapping its switch.
18. Header wrapping, oversized gaps and inconsistent height.
19. Python files/examples not running correctly.
20. Service Worker serving stale JavaScript/CSS.
21. OTA status not matching running firmware.
22. Android old-version installation requiring uninstall.
23. Duplicate release APKs and confusing download links.
24. Wrong board detection or mismatched A1/A2 firmware.
25. Repeated network events falsely marking a valid link as failed.

A previously observed GitHub Actions failure in the QR browser suite was a header-button text assertion: `tools/header-ota-browser.mjs` expected `Connect AP` or `Connect STA`. Inspect that test and the actual behavior. Update obsolete UI assertions if behavior is correct; never weaken functional tests merely to produce green CI.

Check additional bugs discovered during the audit.

### 13. Testing — test, fix and test again

Create a comprehensive test matrix covering unit, API, firmware, integration, browser, Android and end-to-end workflows.

**Mandatory network scenarios:**

- Blank/new ESP32 with no STA credentials.
- Controller powered by 5V; no laptop USB.
- First-time AP discovery from a different laptop.
- Authorized AP onboarding.
- 2.4 GHz router scan and SSID selection.
- Correct STA password.
- Incorrect STA password.
- Router unavailable.
- Saved credentials survive power cycle.
- AP-to-STA handover.
- Laptop changes Wi-Fi network.
- STA IP changes after DHCP renewal.
- Browser tab refresh or new session.
- New laptop enrollment.
- AP and STA simultaneously active.
- Android on AP, laptop on STA.
- ESP32 AP link interrupted.
- STA router disconnect/recovery.
- Browser Local Network Access permission denied.
- Multiple kits with different IDs.
- Two users attempting Take Control.
- Repeated/stale/out-of-order joystick packets.
- Android input → ESP32 → WebApp Python.
- Failed authentication / expired enrollment.
- OTA attempted while RC ownership is active.
- Wrong board APP image.
- Post-OTA firmware version verification.
- USB factory recovery.
- Sensor/I2C diagnostic regression.
- Firmware reboot during an active session.

**Mandatory Android scenarios:**

QR scan, manual six-digit code pairing, camera permission, QR scan without Internet, WebRTC reconnection, direct AP communication, multitouch joysticks, Slow/Medium/Fast mode, throttling, release, landscape resizing and signed in-place app updates.

**Mandatory visual scenarios:**

Check browser screenshots at approximately 360, 390, 768, 1024, 1366 and 1920 px widths, plus representative Android landscape viewports.

Inspect spacing, panel alignment, empty areas, controls, text wrapping, tooltips, scrollbars and overlays.

Run at minimum:

- `npm run check`
- `npm test`
- `npm run verify:firmware`
- Existing Playwright/browser smoke tests.
- QR/WebRTC integration tests.
- Python Lab integration tests.
- Firmware A1 and A2 compilation.
- Firmware image and SHA validation.
- Android debug build.
- Properly signed Android release build where signing secrets are available.
- APK certificate/versionCode/update verification.
- Full GitHub Actions validation.

**Run relevant suites before fixes and again afterward. Re-run the full regression suite after the last code change.**

Use mocks or emulators where required, but distinguish simulated tests from physical-device verification. Do not claim real ESP32 or Android hardware testing unless those devices were actually available and tested.

### 14. Release requirements

Work on a controlled feature branch, commit coherent changes and merge/push the verified final changes into the actual `main` branch.

Only push after required tests have passed, except for clearly documented, nonblocking environment-dependent test limitations. Do not hide critical failures.

After pushing, verify the final main HEAD rather than an earlier intermediate commit.

Confirm GitHub Pages deployment and check the deployed app's current version.

Build and publish the latest A1/A2 firmware catalog and artifacts after verified compilation.

For Android, preserve the existing package/application ID and release signing identity. Increment Android `versionCode` for a new signed release. Ensure installation updates the existing app without requiring uninstall.

Verify the difference between current Android Gradle version configuration and the previously published APK release metadata; reconcile it using actual artifacts, not assumptions.

Retain a single clear stable Android APK download path where appropriate. Do not delete existing releases without checking references and rollback needs.

Never commit signing keys, Wi-Fi passwords, access keys, enrollment secrets or other credentials.

### 15. Required project documentation

Create or update useful documentation within the repository, including:

- `WORK_MASTER_PROMPT.md` — final project scope and accepted requirements.
- `EXISTING_CODE_AUDIT.md` — file-by-file findings, causes and planned/implemented fixes.
- `CONNECTION_ARCHITECTURE.md` — STA, AP, QR/WebRTC, Android direct link and USB fallback.
- `FIRMWARE_API_CONTRACT.md` — authorization, provisioning, telemetry and safe RC diagnostic APIs.
- `TEST_MATRIX.md` — each scenario, expected result, execution type, evidence and status.
- `UI_LAYOUT_REVIEW.md` — screenshots, spacing problems, improvements and recommendations.
- `RELEASE_REPORT.md` — tests, versions, commit hashes, URLs, artifacts, remaining blockers and rollback procedure.

Use existing documentation where possible instead of creating confusing duplicates.

### 16. Additional improvement suggestions

After inspecting the full product, propose and implement safe, practical improvements that provide noticeable value without adding clutter.

Consider:

- A compact live connection topology indicator.
- Connection Quality display using RTT, packet loss and input age.
- Device ID verification indicator.
- Kit-specific setup QR.
- Setup progress with recovery/resume.
- Wi-Fi credential test result and connection-history summaries.
- Real AP and STA interface status shown separately.
- Read-only multi-student classroom monitoring.
- One-controller owner lock with clear release.
- A guided reconnect button when the last verified kit returns.
- Firmware-reported joystick data viewer in the WebApp.
- A one-click Python example to watch actual Android joystick input.
- Responsive empty states that explain the next action instead of leaving blank space.

Prioritize reliability, screen efficiency and user clarity over adding many features.

### 17. Non-negotiable acceptance criteria

The work is complete only when the implementation and test evidence demonstrate that:

1. A separately flashed ESP32 kit can be powered from 5V and provisioned from another laptop without USB pairing.
2. STA becomes the primary WebApp connection.
3. Normal supported Python/sensor/diagnostic operations function through verified STA.
4. Android connects directly to ESP32 AP and sends valid joystick diagnostic frames.
5. The firmware accepts, validates, timestamps and stores those joystick frames.
6. The WebApp can read the real received joystick values over STA using a working Python example.
7. Existing QR/WebRTC Android-to-WebApp pairing is preserved.
8. AP+STA coexistence, reconnection and owner arbitration are correctly handled.
9. No new real-flight motor/arming code has been introduced.
10. Network APP OTA is authenticated and safe; USB factory recovery remains available.
11. WebApp and Android layouts are cleaner, responsive and do not waste large blank areas.
12. Identified bugs are fixed and regression tests pass after the final changes.
13. Firmware for both A1 and A2 is built and verified.
14. Android release is correctly versioned, signed and update-compatible.
15. Final code is merged/pushed to `main`, and live deployment is verified.

### 18. Execution process and progress reporting

Follow these stages:

**Phase 1 — Full audit:** Inspect all source files, current deployment, firmware catalogs, Android build structure, workflow failures and previous release evidence. Identify root causes, risk areas and current capabilities.

**Phase 2 — Architecture:** Establish the complete network state machine, authentication model, exact protocol/data flow and migration/compatibility approach.

**Phase 3 — Firmware:** Implement protected first-time AP setup, reliable STA boot/recovery, AP+STA operation and safe RC diagnostic telemetry.

**Phase 4 — WebApp:** Implement setup wizard, verified STA-first connection, Python hardware access, RC data viewer, OTA integration and connection recovery.

**Phase 5 — Android:** Preserve QR/WebRTC, implement direct AP joystick communication and update connection/ownership UI.

**Phase 6 — UI/UX:** Perform complete responsive layout audit, reduce blank space, restructure spacing and icons, improve the header and all six primary pages.

**Phase 7 — Tests:** Run unit/integration/visual/build suites, resolve failures, run a second complete regression cycle and review artifacts.

**Phase 8 — Release:** Build firmware/APK, verify checksums/signing, merge to `main`, confirm GitHub Actions/Pages and produce documentation.

Give progress reports during substantial work. Report completed changes, current test results and blockers. Do not describe untested hardware features as verified.

Do not stop at “analysis complete,” “files prepared” or “PR created.” Finish all accessible implementation, validation and release steps.

### 19. Final report format

At completion, provide:

- Main branch final commit SHA.
- GitHub PR link, if applicable.
- GitHub Pages live URL and deployed version.
- Firmware A1/A2 versions and binary/build references.
- Android APK version, versionCode, download link and certificate verification.
- WebApp + Android + ESP32 connection architecture summary.
- Bugs found and fixed.
- UI/UX changes with screenshots.
- Test totals, failures, passing workflow links and any hardware tests still pending.
- Implemented new suggestions.
- Known limitations, remaining issues, recovery instructions and rollback reference.

**Start by inspecting the actual GitHub repository and its existing code. Then execute the work end to end. Do not create a separate replacement application or discard features that already work.**
