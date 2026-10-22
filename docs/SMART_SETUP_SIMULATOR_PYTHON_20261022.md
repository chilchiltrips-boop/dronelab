# Smart USB Setup, live simulator modes and Python Auto — 22 October 2026

Baseline: main `42fdd8b7224ea1ff7bc8bdd6a1cc3a7df5124f86`, WebApp `1.8.1+431`, including PR #111. This change is WebApp-only. FlightCore 1.5.10, the signed Android 1.8.14-authoritative-status APK (code 52), physical watchdogs and the physical acceptance ledger are unchanged.

| Reported behavior | Confirmed cause | Result |
| --- | --- | --- |
| Take Control makes the page flash or change workspace | `claim('WEB')` clicked the PID tab, hiding Python/Devices and initializing the embedded simulator; repetitive constant text writes added DOM churn. The iframe also treated focus moving to the host toolbar as leaving the app. | Claim/release update ownership in place. Existing editors, iframe, canvas, workspace and scroll remain mounted. Constant dashboard/monitor text is skipped; the paired-device row changes only when its identity/state changes. Moving focus within the visible app releases held keys and preserves Run; actual app focus loss or hiding the simulator still stops it. |
| Simulator ANGLE/ACRO cannot change while a Kit is connected | `syncActions()` disabled the selector and copied Kit metadata into the virtual mode | Simulator Mode is independent and can switch during Run. Kit ACTIVE/SAVED/PENDING metadata is shown separately. |
| Saving USB Wi-Fi settings is confusing | The old Save depended on a fresh selected USB Kit, released ownership and a live 60-second teacher unlock without a guided explanation; unlock lifetime was not explicitly bound to a USB identity/generation | Smart Kit Setup verifies the physical board, reads enrollment, enrolls or unlocks the Teacher, saves requested fields and reports restart/read-back state. |
| Python target has no Auto selection | The UI and RPC branches only understood manual targets, and hardware examples picked fixed transports | Auto resolves verified paths per operation, then binds the hardware session. Loss/change produces an explicit error instead of switching Kit or transport. |

Smart Kit Setup lives in **Devices & Firmware → Wi-Fi & Network**. Connect Kit via USB, edit Kit Name/AP prefix/password, then Verify Teacher & Save. Creating a Teacher Passphrase requires confirmation only on an unenrolled Kit. Existing enrollment is never overwritten. The UI shows the actual immutable ID, board, firmware, AP SSID and STA state. A custom AP prefix receives `-<Kit Code>` exactly as in firmware; no default prefix is written without an edit. A Kit rename preserves an existing custom prefix. Renaming a default name-based AP requires an acknowledged restart so the displayed new SSID is not confused with the still-running old radio identity.

Each save reads fresh USB identity and admin status, checks port generation and selected ID around awaited commands, applies only changed fields, and obeys firmware authorization/ownership restrictions. AP-only updates do not write router credentials, Kit Code, enrollment or pairing. Sensitive form fields clear after completion/error/disconnection; non-sensitive edits remain available for correction. AP restart acknowledgment is distinguished from post-restart SSID verification. Password persistence is not represented as an independently measured Wi-Fi authentication result. Original identity/key rotation/reset/credential-read/recovery controls remain in Advanced Admin, with their existing confirmations. Security & Admin links to those same controls.

Live simulator mode changes retain throttle, attitude, rates, position, input-source lock, motor commands and motor inertia. The shared rate PID keeps bounded integral/derivative history; the newly engaged ANGLE outer loop starts with clean memory. Applied control torque blends from its previous value for 120 ms. No ARM, STOP, RESET, Kit mode request or RC claim accompanies a virtual mode change. Tests switch 40 times at elevated throttle, check finite state and bound the first motor-command change to less than five percentage points.

PR #111's read-only mirror policy is preserved: temporary Android WebRTC/Kit snapshot gaps hold the last validated **virtual** command, show STALE/delayed evidence and resume from the same fresh producer. Duplicates cannot renew input freshness. Source/session replacement, confirmed selected Kit disconnect/reboot, USB loss and explicit Stop/Reset keep their existing stop behavior. Held input is never labeled firmware-applied. No simulator ACK-age watchdog is added. Android native and FlightCore receive/apply deadlines are unchanged. Kit classroom mode changes still use the existing authenticated API and may remain PENDING until input disarms. `stabilizationSupported=false` remains accurate; physical flight stabilization is not implemented by these virtual changes.

Python **Auto — Verified Connected Kit** prefers fresh verified USB, then AP, STA and an approved/authorized Android Relay. Wi-Fi provisioning requires a compatible authorized direct network path and released control. Auto relay access is read-only. Manual selections remain available; firmware and Android permission checks apply to every request. Synchronous beginner I2C examples prepare a fresh scan through the same authorized RPC after Python AST validation; comments and printed help cannot trigger a scan. Python Simulator remains an explicit isolated target. Auto does not acquire ownership, arm input or send motor commands. The footer shows requested/resolved target; expanding it shows Device ID, capability, reason and input observations. Editor content and terminal output survive a connection-loss error. LED operation health is independent of Worker execution. A failed asynchronous LED write pauses LED updates, reports the failed operation and count, and keeps unrelated Python execution running. Recovery requires a fresh authenticated status for the original bound Kit; confirmed identity/transport/boot/connection changes block LED writes until a new explicit Run.

Changed implementation is concentrated in:

| Area | Files |
| --- | --- |
| Guided setup and USB binding | `js/smart-kit-policy.js`, `js/smart-kit-setup.js`, `js/classroom-kits.js`, `js/devices-workspace.js`, `index.html`, `lab.html`, `devices-workspace.css` |
| Simulator mode/input diagnostics | `js/tripod-page.js`, `js/tripod-physics.js`, `js/simulator-input.js`, `tripod.html`, `tripod.css` |
| Stable rendering | `js/firmware-connect.js`, `js/live-inputs.js`, `pairing-web.js` |
| Python Auto/session isolation | `js/python-lab.js`, `js/kit-data-interface.js`, `js/usb-i2c-bridge.js`, `python-lab-worker.js`, `python-lab.css` |
| Delivery | `sw.js`, `.github/workflows/smart-setup-auto.yml`, focused runtime/unit/browser regressions |

The rendering audit uses actual WebApp ownership handlers against explicit device replies, MutationObserver, animation-frame visibility sampling, Layout Shift observations, mounted-node references and screenshots/Playwright traces. On the baseline at 1366×768, Python changed to PID with 98 hidden-workspace samples and CLS 0.04375; Devices also changed to PID. After the fix, the six viewports (1920×1080, 1366×768, 1024×768, 768×900, 390×844, 360×800) have zero forced tab changes/flashes, observed layout shift below the 0.02 limit and no editor/iframe/canvas remount. The regression limit is CLS ≤0.02 per six ownership toggles, scroll delta ≤2 px and no hidden active workspace. The PID case also runs at 1500 µs while ownership toggles.

Reproducible software verification:

```sh
npm test
npm run check
npm run verify:firmware
# Serve repository on localhost:8765, install the workflow's pinned Playwright.
node tools/ui-stability-browser.mjs
node tools/smart-kit-setup-browser.mjs
node tools/python-auto-browser.mjs
node tools/python-browser-smoke.mjs
node tools/authoritative-status-browser.mjs
node tools/tripod-ap-mirror-browser.mjs
node tools/accordion-browser.mjs
```

Browser evidence is uploaded by the Smart Kit Setup/Python Auto workflow and Authoritative Status workflow. Explicit doubles exercise enrollment, existing unlock, incorrect passphrase, lease expiry, selected-board replacement, active ownership restrictions, AP suffix/validation, requested-field writes, STA preservation, restart and fresh SSID verification. Real Pyodide exercises joystick/gyro reads through USB/AP/STA/Relay routing, synchronous scanner/LED commands, isolated Python rejection and bound-session loss. Broader CI retains network, offline, Android, simulator and A1/A2 build regressions.

Physical acceptance remains **0/18 NOT_RUN**. Actual A1/A2 USB reenumeration/radio timing, changed Wi-Fi password authentication, saved-router recovery, real PPM signal loss, interrupted OTA recovery and supported-handset behavior require the boards and handsets. No fixture, screenshot, compilation or browser result changes those records to PASS. No physical board was reset, erased or flashed by this work.

## Independent Python network LED reliability

Confirmed causes: mutation requests called the shared read scheduler’s `clear()`, invalidating authenticated status/telemetry GETs already in flight. Their synthetic generation errors fed the polling failure path. Public `connected` intentionally becomes false for an expired heartbeat, but Python previously interpreted that freshness loss as an identity/transport replacement. LED callbacks also used the globally selected network target, and independent SET/KEEP/STOP callbacks had no Python-session queue. The original Network LED terminal message used a literal backslash-n escape.

Writes now invalidate only completed read cache entries. A heartbeat delay remains visibly STALE; `linkVerified` and a non-secret connection generation distinguish the same known selection from a confirmed disconnect. Bound LED commands check Device ID, transport, boot, relay/connection generation before enqueue, before physical dispatch and on completion. No router address, SSID or Kit Code can substitute for Device ID. Authentication and RC deadlines are unchanged.

The independent LED queue serializes commands, coalesces duplicate KEEP requests, bounds pending SET work, and cancels unsent SET/KEEP work on STOP. Old replies cannot overwrite a new session’s health. A transient failure pauses writes for a bounded retry interval; recovery reads authenticated status for the original Kit and confirms diagnostic permission before restoring the latest desired pattern and KEEP. A confirmed replacement, disconnect, reboot, transport change or permission rejection blocks automatic recovery. Failed STOP is visible; firmware lease expiry remains the fallback when no authenticated STOP can reach the original device.

The footer reports LED health and failure count. The terminal reports one recoverable failure episode and one recovery, with real newline characters. Repeated failures update the visible count without repeating the same error every script tick. Independent LED errors never terminate the Worker or acquire RC ownership. A Python read RPC can still raise its own hardware exception; explicit Python Stop still terminates the Worker.

`tools/python-led-session.test.mjs` exercises production network/data modules with A1/A2 peers on one STA router, status/command failures, ordered SET/KEEP/STOP, duplicate KEEP, safe recovery, permission loss and confirmed session changes. Runtime tests reproduce the pending-status/LED-write invalidation race and reject queued writes after disconnect. Real Pyodide browser tests show Worker progress during LED failure, same-Kit recovery, no commands to a replacement board, one error episode and correct newlines. Physical sustained A1/A2/phone Wi-Fi timing remains NOT_RUN.
