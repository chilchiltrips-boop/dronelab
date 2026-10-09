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
