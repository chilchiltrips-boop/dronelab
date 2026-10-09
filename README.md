# ZEBJUS Drone Lab

Three pages: **Assembly Lab**, **2D Wiring**, and **Firmware / Settings**. The firmware release here is a standalone USB I²C address scanner. It does **not** contain flight-control, motor-output, Wi-Fi, kit AP, or OTA code.

## Run the webapp

`npm run dev`, then open `http://localhost:4173/#firmware`. The site also works from GitHub Pages under `/dronelab/`. Desktop Chrome/Edge on HTTPS or localhost supports Web Serial; Android WebView USB flashing is unsupported. The page and board-matched binaries can be cached for offline use.

## Scanner firmware 1.0.0

| Board name in Serial Monitor | Board ID | Arduino ESP32 3.3.12 FQBN | I²C defaults |
| --- | --- | --- | --- |
| Aerion FC A1 · ESP32-C3 Super Mini | ZFC-A1 | `esp32:esp32:esp32c3` | SDA GPIO8, SCL GPIO9 |
| Aerion FC A2 · Seeed XIAO ESP32-C6 | ZFC-A2 | `esp32:esp32:XIAO_ESP32C6` | SDA D4/GPIO22, SCL D5/GPIO23 |

The shared source is `FlightCore_Firmware/AERION_I2C_SCANNER.ino`. It calls `Serial.begin(115200)` and `Wire.begin()`, scans addresses 1–126, prints the responding hexadecimal addresses, errors and total, then waits five seconds and scans again. Board identity and version are printed above the scan. It uses the board package's default SDA/SCL pins.

**Flash:** Remove propellers and connect stable USB power. In Firmware / Settings, select the board or click **Connect USB** to detect the actual chip, then **Auto Load Latest**. Use **Factory / Merged** at 0x0 for first flash or recovery. Application at 0x10000 requires the already verified matching bootloader and partition table. Confirm the selected board and image. The page checks the binary's size, SHA-256, ESP chip ID, flash capacity and write integrity before reset. Flash remains pending until the matching 1.0.0 banner and scanner activity are observed on the selected 115200 baud Serial port. You may instead use Arduino IDE Serial Monitor at 115200; press RESET to replay the banner. Close any open Serial Monitor before flashing. A USB write or reset by itself is not a boot verification.

**Wiring:** Connect sensors to 3.3 V logic, common ground and the pins above. On A1, GPIO8 and GPIO9 are boot strapping pins; GPIO9 is also BOOT. An I²C device holding those pins low during reset may prevent normal boot. The scanner detects addresses, not sensor health.

This scanner intentionally has **no AP or OTA service**. To use FlightCore control again, flash a verified FlightCore release separately by USB. Never interpret an I²C address response as flight readiness.

## Release and verification

`firmware-catalog.json`, `firmware-latest.json` and `FlightCore_Firmware/` contain matching release metadata, source, build report, APP and complete 4 MB Factory images for both profiles. The APP binaries are compiled from this scanner source with pinned Arduino ESP32 core **3.3.12**. The merged Factory images contain the correct bootloader, partition table and identical APP bytes. `python3 tools/verify_release.py` checks magic, chip ID, version, dual application partitions, size and SHA-256. `npm test` runs assembly/wiring and scanner software checks. No physical A1 or A2 was connected during this build.

| File | Role |
| --- | --- |
| `index.html`, `lab.html`, `styles.css`, `firmware.css` | Existing three-page UI |
| `js/firmware-page.js`, `js/firmware-image.js` | USB flasher, Serial monitor and image validation |
| `vendor/esptool/bundle.mjs`, `vendor/crypto/` | Local Web Serial and hash dependencies with licenses |
| `FlightCore_Firmware/AERION_I2C_SCANNER.ino`, `partitions.csv` | Standalone scanner and merged image layout |
| `tools/build_firmware.py`, `tools/verify_release.py` | Pinned build and release validation |
| `sw.js` | Relative-path offline cache |
