# ZEBJUS DroneLab

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

The control DataChannel uses local ICE candidates without a TURN relay. Direct QR exchange can work on a reachable local network; campus client isolation/firewalls can prevent transport. Online code signaling cannot work without Internet. The channel carries authenticated controls for the virtual Flight Training plant and receiver-applied telemetry. The legacy WebRTC Virtual LED demo has been removed; physical LED wiring and Python examples remain.

## FlightCore A1/A2 USB diagnostics firmware 1.3.2

`FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino` is USB-only sensor/LED diagnostic firmware, **not** flight-control software. It contains no motor output, arming, AP/STA or Wi-Fi OTA service. Build automation compiles separate A1 (ESP32-C3 Super Mini, SDA4/SCL5) and A2 (XIAO ESP32-C6, SDA22/SCL23) images.

USB Serial at 115200 uses compact messages. `ZJTEL,1,A1,seq,ms,0x6B,READY,roll,pitch,yaw,1,drops` is the only periodic gyro frame; the penultimate field `1` means the LED output pin is available (`0` indicates a conflict). Verbose `Scanning I2C bus...`, device-count banners, dashed separators and duplicate `ZJGYRO,DATA` frames are no longer emitted by version 1.3.2.

The board scans I2C once at startup or when it receives `ZJI2C,SCAN\n`, rather than polling every five seconds. Its single structured response is `ZJSCAN,A1,millis,count,0x6B[,0x77...]`. Python Lab explicitly sends the scan command and parses the address list. The browser monitor hides legacy scanner text and duplicate gyro frames from already-flashed v1.3.1 firmware, while still forwarding the raw input to diagnostics and Python.

**Firmware release safety:** Changing the Arduino sketch does not update a controller by itself. The release workflow builds/verifies separate APP and Factory binaries, updates SHA-256/board metadata and commits a new catalog. Check that the firmware selection shows **1.3.2** before flashing; **1.3.1** binaries still contain the old scanner text. Use a verified board profile and USB port. Factory/Merged flashes at `0x0`; APP flashes at `0x10000` only with a compatible existing partition layout. Disconnect motors and remove propellers before hardware work.

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

Android updates preserve `in.zebjus.dronelab.companion` and the permanent pinned certificate. Version **1.6.2-flight-training**, versionCode **13**, updates published versionCode **12** in place. The [reference cockpit](docs/flight-training/ANDROID_REFERENCE_COCKPIT.md) adds circular silver/coral sticks, compact ARM/CONNECT, real applied attitude/RPM and immersive Android layout. Signing secrets stay in GitHub Actions. A review candidate is built on the feature branch; main publication requires native acceptance and the six mandatory browser/regression workflows, including the shared PID shell for the exact source commit. See `ANDROID_SIGNING_SETUP.md` and the [1.6.1 release evidence](docs/flight-training/RELEASE_EVIDENCE.md). Metadata-only version stamps do not rebuild the Android APK.

## Python Lab toolbar (WebApp 1.4.6)

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
