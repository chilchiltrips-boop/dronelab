# ZEBJUS DroneLab

## Current releases and verification (20 October 2026)

| Component | Published source metadata | Hardware/deployment status |
| --- | --- | --- |
| WebApp | 1.8.0 series (live build in `app-version.json`) | GitHub Pages CI verification; iframe Local Network Access depends on host/browser |
| FlightCore A1 (ESP32-C3) | **1.5.5**, APP / FACTORY, A1 embedded UTC compile stamp | Binary/catalog/partition SHA-256 CI passed; real device acceptance pending |
| FlightCore A2 (XIAO ESP32-C6) | **1.5.5**, APP / FACTORY, A2 embedded UTC compile stamp | Binary/catalog/partition SHA-256 CI passed; real device acceptance pending |
| Android signed companion | Gradle candidate **1.8.7-rx-applied-feedback**, versionCode **45**; published APK identity in `mobile-apk/ANDROID_RELEASE_META.txt` | New signed build requires native CI gate; real-handset radio, touch, and reconnect acceptance pending |
| WebRTC pairing | Local QR/peer simulator pairing uses host/STUN candidates; Kit controls remain local AP/STA/USB | **TURN relay and internet-based physical Kit control intentionally out of scope** |
| Central Admin | `admin-server.cjs` HTTP API source | Must be deployed behind external HTTPS reverse proxy with private storage |

**Firmware dates must not be conflated.** Firmware Center's **LOADED FW BUILT** comes from `ZJ_BUILD_UTC` embedded in the selected, SHA-256-verified firmware binary, with `compiledAt` cross-checked against the catalog. **Running FW built** is reported by the currently connected verified Kit over USB `ZJINFO` or signed UDP management or browser-compatible HTTP `/api/status`. A September date in **Running** while **Loaded** shows October means the Kit may still be running an older image; flashing is never inferred from downloading a file. Browser time displays in the viewer's timezone. The ESP-IDF core descriptor may retain a *precompiled toolchain* date and is not accepted as the official build stamp.

**No flight motors are controlled by FlightCore 1.5.5.** Diagnostic INPUT ARM differs from MOTOR ARM (motors stay disabled). A1 PPM input is GPIO10; on A2 XIAO ESP32-C6 D10 maps to GPIO18. Remove propellers and ESC/motor power during acceptance.

**Release gates:** `npm test`, `npm run check`, `npm run verify:firmware`, `npm run verify:acceptance` (schema/status only; not a device test), and the GitHub Actions browser/native workflows. Real tests and signed operator evidence must be recorded separately in `docs/release-acceptance.evidence.json`; `node tools/release-acceptance.mjs --strict` intentionally fails until all mandatory tests genuinely pass. See [acceptance procedure](docs/RELEASE_ACCEPTANCE_20261017.md) and the [optional Central Admin hosting guide](docs/REMOTE_DEPLOYMENT_RUNBOOK.md). TURN and internet-based physical Kit control are excluded from the project.

The 1.5.5 / 1.8.7 release separates authenticated RX and APPLIED feedback, retains early input until the next 20 ms apply tick, and reports receive/apply ages and reason-based NACKs. The 350 ms watchdogs, exclusive owner, independent UDP receiver and latest-frame-only sender remain enforced. See [protocol, regressions and upgrade notes](docs/UDP_RX_APPLIED_1_5_5.md).

## UDP management and IMU

Android uses UDP 4210 for 50 Hz joystick/ACK and UDP 4211 for pairing, status, IMU, LED, Wi-Fi and encrypted OTA. Ordinary hosted browsers and browser Python use `npm run discover:lan` as a localhost UDP bridge, or the approved Android WebRTC relay; direct-browser HTTP and USB remain compatibility paths. The new Android APK requires FlightCore 1.5.0+. See [protocol, setup and upgrade notes](docs/UDP_MANAGEMENT_1_5_0.md).

## Optional Kit AP Wi-Fi settings and teacher recovery

Devices & Firmware → Security & Admin uses the existing teacher passphrase with physical USB access. The teacher can optionally change AP Name Prefix and WPA2 password (first-time setup never forces a change), explicitly read current AP credentials using `ZJADMIN,AP_SHOW` after USB admin unlock, or click **Reset AP to Default**. The display is masked until Show Password, then clears after 30 seconds. The generic USB monitor and copied logs redact credentials.

Reset removes only the `apName` and `apPass` entries from the `zj-classroom` preferences and safely reboots. Default SSID is the Kit Name and password is `12345678`; Device ID, Kit Name, STA profiles, pairing, teacher passphrase and firmware stay unchanged. APP OTA preserves these values, while a full FACTORY erase may not. AP password does not grant diagnostic control or administrator authorization.



DroneLab retains **Assembly**, **2D Wiring**, **Python Lab**, **Settings**, and **Firmware / USB Serial Tools**, with one canonical **Flight Training** page at `tripod.html`. `index.html` and `lab.html` are synchronized entry points; `companion.html` is also packaged in the Android companion.

Run `npm run dev`, then open `http://localhost:4173/`. GitHub Pages hosts the app under `/dronelab/`. Desktop Chrome/Edge on HTTPS or localhost supports Web Serial. Android WebView USB flashing is unsupported.

## PyCharm-style Python IDE

The Python Lab toolbar stays in one compact sticky row with **File** and **Edit** dropdowns. The left Project Explorer holds Python scripts, nested folders and imported images/data files. The central Monaco editor uses viewport-based height and independent X/Y scrolling. The bottom **Run / Terminal** output console expands automatically on Run and can be minimized; the right-side Camera, Plotter, USB and Assets tool windows open on demand and can be collapsed, resized or floated. Camera access still requires a user click and browser permission.

- **File → New** creates a `.py` script in the selected virtual folder. **New Folder**, **Import Files / Images**, **Import Folder**, **Rename Selected**, **Copy Project Path**, **Save**, **Open Project (.json)** and **Export Project (.json)** are available in the File menu, with key actions in the Project Explorer.
- Images, CSV files, SVGs and other imported binary resources are stored in the browser's IndexedDB. Python sources are autosaved in localStorage. **Ctrl+S / ⌘S** saves the project without invoking the browser's Save Page dialog. User content is local to this browser profile, not saved onto the computer's ordinary disk folders unless the user exports it.
- Click a file or folder in Project Explorer to work with it; folders can be collapsed. Right-click an entry to rename it, or select and use **Copy Path** for paths such as `/home/project/images/photo.jpg`. **Import Folder** retains the selected directory hierarchy. Imported names containing spaces or starting with digits are made Python-path-safe.
- Imported asset bytes are mounted in the Pyodide Worker under `/home/project` every time a script runs, so `open("images/photo.jpg", "rb")` and supported Python image-loading code can access them. Python files in subfolders can import sibling modules. Projects can be exported as a JSON bundle (up to 24 MB total asset payload in the current exporter) and reopened later.
- The **Plotter** tool window renders valid incoming FlightCore `ZJTEL` gyro data if USB Serial is connected, and shows Matplotlib figures produced by Python. The **Run / Terminal** panel is a Python output console, not a general operating-system command shell.

Browser storage can be lost after clearing site data, using private browsing or changing browser profiles. Export the project JSON regularly for backup. The Camera/Plotter tools do not directly control physical motors.

## Smart Mobile Pairing

1. Create Web QR; Android scans it and generates its response. The laptop camera stays off.
2. Click Next. Enter the temporary CONNECT code (Internet/PeerJS required) or choose Two-Way QR and explicitly start the Step 2 camera. Advanced manual response entry remains available.
3. Compare the Safety PIN, confirm pairing, then explicitly grant mobile control. CONNECT code and Safety PIN serve different purposes. Cancellation, refresh, expiry or a lost session requires a fresh QR and fresh control grant.

Local QR/WebRTC simulator pairing may use host and STUN ICE candidates. **No TURN relay will be deployed** and connectivity across restrictive networks is neither promised nor a release goal. Optional CONNECT-code signaling itself requires internet; use direct QR on a reachable local network when offline. Kit physical diagnostics, input ARM and firmware operations are limited to verified local AP/STA/USB routes; **no internet-based physical Kit control** is planned. Existing explicitly granted telemetry remains read-only, not a control tunnel.

## FlightCore A1/A2 1.5.5 — verified diagnostic firmware

`FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino` contains AP/STA, USB I2C/IMU/LED diagnostics, authenticated APP OTA and 8-channel PPM diagnostic reception with exclusive input-source ownership, RC deadman and neutral failsafe. This is **not physical motor-flight firmware**. A1: ESP32-C3 Super Mini, SDA4/SCL5, PPM GPIO10. A2: XIAO ESP32-C6, SDA22/SCL23, PPM D10/GPIO18. Both build profiles use a 4 MiB Factory image and an APP image fitting the 0x1e0000 OTA slot.

`FlightCore_Firmware/catalog.json`, `firmware-catalog.json` and `build-report.json` publish the A1 and A2 version, SHA-256, `builtAt` (build start) and `compiledAt` (individually embedded sketch compilation timestamp). `tools/verify_release.py` rejects stale precompiled dates, nonmatching source hash, wrong chip/partition, and APP/FACTORY mismatch. USB `ZJINFO,GET` and signed Wi-Fi `/api/status` report the **running** firmware timestamp; the Firmware Center separately shows the **loaded** image date.

For first installation use the matching board-specific Factory image at `0x0`; APP updates at `0x10000` require the existing verified dual-OTA layout. APP OTA must preserve Wi-Fi/pairing; Factory erase may not. OTA transfer validation is not publisher signing or Secure Boot. Always bench-test both boards, disconnected motors and propellers, before school rollout. See `docs/SCHOOL_PRODUCTION_FIRMWARE_SECURITY.md` and `docs/FLIGHTCORE_PPM_RECEIVER.md`.

## Runtime and validation

| Files | Role |
| --- | --- |
| `js/app.js` and imported assembly/wiring modules | 3D bench, wiring, local project state |
| `js/python-lab.js`, `python-lab-worker.js`, `vendor/pyodide`, `vendor/monaco` | Editor, worker-isolated Python, Matplotlib |
| `firmware-updater.js`, `js/firmware-image.js`, `vendor/esptool` | Active flasher, image validation and serial tools |
| `js/firmware-page.js` | Retained legacy UI adapter; not imported by current pages |
| `pairing-*.js`, `companion.js` | QR/code exchange, ownership, WebRTC controls, applied ACK and telemetry |
| `mobile-android/` | Native permission, lifecycle and asset-loaded WebView wrapper |
| `tools/build_scanner.py`, `tools/verify_release.py` | Pinned firmware build and image verification |
| `sw.js` | Same-origin offline shell, models, firmware and Python plot dependencies |

Run `npm run check`, `npm test`, and `npm run verify:firmware`. Browser CI separately tests real WebRTC, Python execution, responsive rendering and offline cache. Test-only Playwright is installed by CI; there are no production npm dependencies. Physical cameras, handset installation, USB flashes and campus Wi-Fi require device verification.

Android updates preserve `in.zebjus.dronelab.companion` and the pinned signing certificate. The Android source candidate is **1.7.16-release-gate**, versionCode **32**, while the published APK's actual version must be read from `mobile-apk/ANDROID_RELEASE_META.txt` and `SHA256SUMS.txt` before testing or installing. Promotion must pass signed APK identity, versionCode monotonicity, native emulator gates and separate real-phone acceptance. The [reference cockpit](docs/flight-training/ANDROID_REFERENCE_COCKPIT.md) adds circular silver/coral sticks, compact ARM/CONNECT, real applied attitude/RPM and immersive Android layout. Signing secrets stay in GitHub Actions. A review candidate is built on the feature branch; main publication requires native acceptance and the six mandatory browser/regression workflows, including the shared PID shell for the exact source commit. See `ANDROID_SIGNING_SETUP.md` and the [1.6.1 release evidence](docs/flight-training/RELEASE_EVIDENCE.md). Metadata-only version stamps do not rebuild the Android APK.

## Historical Python Lab toolbar work (WebApp 1.4.6)

The top project bar now shows the **active .py filename**, + New, a chooser for saved Python files, project examples, the Python 3/Simulator vs USB I²C target, and Stop / Run / Rerun. Save/Undo/Redo/Delete/Export/Import remain directly below these controls. The editor header only shows usage help. Files remain browser-local and preserve existing autosave/import/export behavior; this WebApp-only release does not change the Android APK or scanner firmware.

## Flight Training 1.6.1

Open **FLIGHT TRAINING** or `/tripod.html`. One existing F450 assembly, renderer and physics state serve both Web and Android controls. The top-right **⚙ Connection** opens the existing two-way QR / optional six-digit-code flow, PIN confirmation, grant/release/disconnect, STOP and real link statistics. Closing settings preserves a valid connection; camera capture closes. Old `#simcontrol`, `#flight` and `#led` bookmarks redirect here.

Android always opens a landscape cockpit. Both floating sticks visibly move in **INPUT PREVIEW / NO FLIGHT COMMAND** while disconnected or disarmed. Independent captured pointers begin at zero displacement. Flight transmission requires authenticated ownership, receiver readiness and explicit low-throttle ARM. Slow/Medium/Fast response presets persist. STOP, lifecycle changes, feedback loss and a 450 ms receiver watchdog disarm; reconnect never auto-arms.

Applied ACKs drive control readouts, Web mirrored sticks and throttle. The single simulator sends 10 Hz measured angles/rates, requested/actual RPM, force and mount deflection back to Android. Web keys/sticks are disabled during mobile ownership; Web PID/environment tuning and STOP remain available. Reordered feedback cannot restore stale ARM/mode state.

The 250 Hz educational plant uses first-order motor lag, RPM-squared thrust, the existing Rate and Angle→Rate cascade PID, mixer torque and a 0–12 cm spring/damped telescopic mount. Numerical centimeters remain accurate; scene travel is magnified 2×. ACRO targets zero angular rate on release without leveling; ANGLE returns toward trim. Yaw retains the reversed stick/keyboard contract and uses Rate PID. Live Apply preserves throttle, pose and RPM; Reset Integrators is separate.

The assembly GLBs, seven camera views, four actual-RPM propeller effects, airflow intensity, low/adaptive graphics and 2D WebGL fallback remain available. Quiet sound defaults to 25%, requires a gesture, uses smooth motor voices and stops on disarm/teardown. Mute/profile/volume persist. These coefficients are educational estimates, not measured aircraft calibration. No AP/STA, real motor output or new firmware control is added.

Detailed assignment, audit, diagrams, exhaustive test matrix and reproducible numerical traces: [docs/flight-training](docs/flight-training/README.md). Run `node tools/export-flight-bench.mjs` for CSV/metrics; `python3 tools/plot-flight-bench.py` optionally renders plots using Matplotlib. Browser tests require an HTTP server on port 8765 and test-only Playwright. Native acceptance uses the production-signed release and instrumentation APK on Android API 35. Physical camera autofocus, real handset radio/latency/cutouts and perceptual audio require the documented human test; automated results do not establish those.

## V1.6.3 shared PID tuning and persistent WebRTC settings

The main DroneLab shell now includes one `PID TUNING` tab. Its existing Tripod simulator is retained in a same-origin, mounted iframe; navigating Assembly/Wiring/Python/PID/Settings no longer unloads the parent WebRTC host. Settings embeds compact QR/6-digit-code/WebRTC confirmation controls directly; `Grant Mobile Control` is a single switch in the persistent header. Direct `tripod.html` bookmarks redirect to canonical shared `index.html#pid`; isolated legacy renderer tests opt into `tripod.html?standalone=1`. Closing Settings or changing tabs does not disconnect P2P; explicit Disconnect, STOP, refresh, permission revocation, and loss of heartbeat still enforce safety.
