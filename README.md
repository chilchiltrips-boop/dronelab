# ZEBJUS DroneLab

The existing web app has six tabs: **Assembly**, **2D Wiring**, **Python Lab**, **Virtual LED**, **Settings / Smart Mobile Pairing**, and **Firmware / USB Serial Tools**. `index.html` and `lab.html` are synchronized entry points; `companion.html` is also packaged in the Android companion.

Run `npm run dev`, then open `http://localhost:4173/`. GitHub Pages hosts the app under `/dronelab/`. Desktop Chrome/Edge on HTTPS or localhost supports Web Serial. Android WebView USB flashing is unsupported.

## Smart Mobile Pairing

1. Create Web QR; Android scans it and generates its response. The laptop camera stays off.
2. Click Next. Enter the temporary CONNECT code (Internet/PeerJS required) or choose Two-Way QR and explicitly start the Step 2 camera. Advanced manual response entry remains available.
3. Compare the Safety PIN, confirm pairing, then explicitly grant mobile control. CONNECT code and Safety PIN serve different purposes. Cancellation, refresh, expiry or a lost session requires a fresh QR and fresh control grant.

The control DataChannel uses local ICE candidates without a TURN relay. Direct QR exchange can work on a reachable local network; campus client isolation/firewalls can prevent transport. Online code signaling cannot work without Internet. The current LED is virtual and does not operate motors or a drone transmitter.

## Scanner firmware 1.0.1

`FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino` is a standalone USB I²C address scanner. It contains no flight control, motor output, arming, Wi-Fi/AP or OTA service. Arduino ESP32 core **3.3.12** builds both board profiles:

| Board | ID | FQBN | Default I²C pins |
| --- | --- | --- | --- |
| ESP32-C3 Super Mini | ZFC-A1 | `esp32:esp32:esp32c3` | SDA GPIO8, SCL GPIO9 |
| Seeed XIAO ESP32-C6 | ZFC-A2 | `esp32:esp32:XIAO_ESP32C6` | SDA D4/GPIO22, SCL D5/GPIO23 |

Select the actual board and verified image. Factory/Merged writes the complete 4 MB image at **0x0**. APP writes at **0x10000** and requires the existing matching bootloader and dual 0x1e0000 OTA slots. APP cannot erase flash. The UI verifies chip/size/hash/layout and transfer MD5 before reset. Scanner boot confirmation requires its banner and scan activity; this source does **not** print board/version identity, so serial output cannot certify that version. No hardware is flashed automatically.

Disconnect external wiring for bootloader recovery and use stable USB power. GPIO8/GPIO9 on A1 are strapping pins, and GPIO9 is BOOT. An I²C response demonstrates an address acknowledgement, not sensor or flight readiness.

## Runtime and validation

| Files | Role |
| --- | --- |
| `js/app.js` and imported assembly/wiring modules | 3D bench, wiring, local project state |
| `js/python-lab.js`, `python-lab-worker.js`, `vendor/pyodide`, `vendor/monaco` | Editor, worker-isolated Python, Matplotlib |
| `firmware-updater.js`, `js/firmware-image.js`, `vendor/esptool` | Active flasher, image validation and serial tools |
| `js/firmware-page.js` | Retained legacy UI adapter; not imported by current pages |
| `pairing-*.js`, `companion.js` | QR/code exchange, WebRTC, virtual LED acknowledgements |
| `mobile-android/` | Native permission, lifecycle and asset-loaded WebView wrapper |
| `tools/build_scanner.py`, `tools/verify_release.py` | Pinned firmware build and image verification |
| `sw.js` | Same-origin offline shell, models, firmware and Python plot dependencies |

Run `npm run check`, `npm test`, and `npm run verify:firmware`. Browser CI separately tests real WebRTC, Python execution, responsive rendering and offline cache. Test-only Playwright is installed by CI; there are no production npm dependencies. Physical cameras, Android installation, USB flashes and campus Wi-Fi require device verification.

Android updates preserve `in.zebjus.dronelab.companion` and the permanent pinned certificate. Signing secrets exist only in GitHub Actions. Candidate v1.4.5 uses versionCode **10** over the published v1.4.4 code **9**. The testing branch produces a verified signed review artifact; only an approved merge to main can publish the stable APK URL. See `ANDROID_SIGNING_SETUP.md`.

## Python Lab toolbar (WebApp 1.4.6)

The top project bar now shows the **active .py filename**, + New, a chooser for saved Python files, project examples, the Python 3/Simulator vs USB I²C target, and Stop / Run / Rerun. Save/Undo/Redo/Delete/Export/Import remain directly below these controls. The editor header only shows usage help. Files remain browser-local and preserve existing autosave/import/export behavior; this WebApp-only release does not change the Android APK or scanner firmware.

## Tripod PID Simulator (WebApp 1.5.0)

Open the **TRIPOD PID SIM** navigation link or open tripod.html directly. This standalone page contains an orbitable procedural F450 quadcopter on a three-legged stand, 4 virtual motor indicators, animated propellers and downwash, dual joysticks, keyboard control, optional user-gesture Web Audio, a live PID graph and PID terms, simulator-only presets and environmental sliders. It imports local Three.js and has no pairing or hardware control. If WebGL is unavailable, it draws a 2D tripod instead.

ANGLE uses outer Roll/Pitch Angle PID then inner Rate PID and centered sticks return toward calibrated level. Pure ACRO/RATE uses only Rate PID; centered sticks target zero angular rate without leveling. Yaw always uses Rate PID. Start with throttle 1000 microseconds, then W/S adjust by 25 steps; A/D control yaw, arrows Roll/Pitch, R starts/stops. Stop, blur and page hide disarm and silence audio. Motor values stay in browser memory. This is an educational model, not measured flight dynamics.

The F450 scene is procedural because this standalone training geometry needs consistent pivot/axis behavior. No remote assets are fetched. Unit tests: node --test tools/tripod-physics.test.mjs; browser tests: node tools/tripod-browser.mjs with localhost and Chromium via the Tripod GitHub Actions workflow.

## Tripod realism and PID-audio response (WebApp v1.5.1)
The standalone tripod.html page now includes local optional GLB F450 parts with procedural fallback, detailed visible motors/battery/FC, nose and 3D FRONT(+Z), BACK(-Z), LEFT(+X), RIGHT(-X) markings, six camera angles, brighter animated prop blur/downwash/groundwash and rotor LEDs. The sound engine is enabled by default (subject to browser user-gesture policy): click Run at 1000 us throttle, raise throttle, and hear ESC startup/4 independent motors/air wash. Sound button, volume and audio-state status remain available. Stop and page hide silence and dispose every audio node.

PID presets and Apply now trigger a virtual Roll/Pitch/Yaw response pulse when running with throttle >=1250 us; otherwise click Test PID Response after increasing virtual throttle. The motor-lag effect is part of the *dynamics* (reconstructed from each actual motor), not just an animation. The chart, live RMS error, peak rate, motor imbalance, sound pitch and air wash report the measured trajectory. Pure ACRO zero-stick behavior and hardware isolation are unchanged.


## V1.5.2 tripod — physically driven learning simulator

The standalone Tripod page reconstructs the same completed F450 assembly using the Assembly Lab's GLBs, positions and rotations. Procedural 1045 propellers and guards are intentionally retained, matching Assembly Lab's deliberately procedural equivalents. The body has a single red forward arrow, no direction-text sprites, screenshot-matched blue background/soft lighting, a 20% closer camera, and seven smoothly transitioning camera modes including Follow Drone.

The local simulation uses fixed 4ms steps, actual motor RPM-squared thrust, 3-axis torque, inertias and gyroscope feedback. Angle PID drives requested body rate; Rate PID drives the 4-motor mixer. ACRO never self-levels. Live Apply does not reset motors, throttle or pose. Test PID Response is separate. Compare A/B uses identical simulation seeds/conditions; I experiments deliberately include a small constant CG torque to expose steady-state correction. Live graphs show angle, angular rate, PID components and all four motor outputs. Normal audio is quieter and smoother, with Quiet/Normal/Detailed profiles; audio begins only after a user gesture.

**Limitations:** inertias, thrust coefficients, sensor noise and aerodynamic drag are plausible educational estimates, not flight-test-identified constants. No simulated PID values, tuning results or actuator commands are written to actual ESCs, ESP32 firmware or WebRTC peers. Browser AudioContext tests establish operation, not subjective comfort. Real aircraft tuning requires safe separately supervised hardware verification.

## Tripod yaw polarity (V1.5.3)
The standalone Tripod simulator reverses **both left-stick horizontal yaw and keyboard A/D yaw input**. Moving the left stick right / pressing D now requests negative yaw angular rate; left / A requests positive yaw rate. Roll/Pitch, internal yaw PID and IMU/body-rate sign convention, motor mixing, graphs and simulation-only safety are unchanged. Keyboard + pointer polarity are verified by the Chromium Tripod browser test.

## Android v1.6.0 — landscape WebRTC virtual flight controller

The Android app has an optional full-screen landscape cockpit with simultaneous floating joystick zones and 3 Slow/Medium/Fast response presets. Existing QR/code WebRTC pairing and explicit owner grant are mandatory. Reuses authenticated WebRTC DataChannel SIM_CONTROL/SIM_ACK; no UDP, AP, STA, hotspot or physical motors. Open ANDROID FLIGHT Web App tab for the embedded virtual Tripod simulator. STOP, control loss and stale timeouts disarm. Only receiver-applied state is ACKed. Android application ID and release cert remain unchanged; versionCode increased 10→11 for in-place updates.
