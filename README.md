# ZEBJUS Drone Lab

Three connected pages: **Assembly Lab**, **2D Wiring**, and **Firmware · Settings**. The first two pages preserve the supplied UI kit's Three.js workbench, SVG wiring workspace, shared local state, guided build, and virtual motor test. The third page adds board-matched FlightCore firmware management. No motor output is sent by the firmware page.

## Run

Open `index.html` through an HTTP server: `npm run dev`, then visit `http://localhost:4173/#firmware`. Node 22+ is sufficient; no install step or backend is required for kit OTA. GitHub Pages serves the same relative paths at `/dronelab/`. Desktop Chrome/Edge on HTTPS or localhost is needed for Web Serial. Android WebView is not a supported USB target.

Before leaving internet access, open the page once and load/download the correct image. The service worker caches the static shell, component assets, USB flasher, catalog and all published A1/A2 APP/Factory binaries for use on the kit AP. A manual `.bin` import also works offline. A browser may block HTTPS-to-local HTTP requests; when that happens, use `npm run dev` on the same computer while joined to the kit AP, or open the offline copy over localhost.

## Firmware workflow

- **Source:** Board profile defaults to the principal XIAO ESP32-C6 **ZFC-A2** (FQBN `esp32:esp32:XIAO_ESP32C6`, image chip 13). **ZFC-A1** is ESP32-C3 (`esp32:esp32:esp32c3`, chip 5). Connecting a kit or USB changes the displayed target to its actual board; an image from another board is cleared and blocked. Auto Load Latest reads `firmware-catalog.json` and fetches the corresponding compiled release file from `FlightCore_Firmware/`, then checks exact byte size, SHA-256, ESP image headers/chip ID, app descriptor and factory partition table. Missing or mismatched assets are blocked. Manual import and drag/drop validate the same structural checks, compute SHA-256, and cache the selected file in IndexedDB. Download Loaded saves exactly those bytes.
- **USB:** Connect the board at 115200; 460800/921600 may be selected with a 115200 retry. The bootloader chip and physical flash ID/capacity must be recognized before erase/write. Complete Factory/Merged writes at `0x0`; APP writes at `0x10000` only after confirming an existing matching bootloader and dual OTA partitions. Erase + Factory requires its own warning. esptool-js keeps image flash header settings and performs MD5 transfer integrity checking. After write/reset, the monitor waits for same-Device-ID AP readback; successful transfer alone remains **FLASHED · BOOT / RECONNECT PENDING**.
- **Kit AP OTA:** Join the kit Wi-Fi, whose SSID is the kit name (e.g. `zebjus_drone_1`), default password `12345678`, API `http://192.168.4.1`. Connect kit AP performs ZFC3 SRP-3072 authenticated AP Wi-Fi pairing and AES-256-GCM secure requests using the reference protocol. No raw unauthenticated firmware upload or pairing-code form is used. Take Control must grant owner status; the kit must be disarmed, idle, the exact Device ID and board must match, the `ZFC_DUAL_1E0000` layout must be present, and free sketch space must fit the APP. OTA sends SHA-256 in `begin`, sequential encrypted 1024-byte-or-smaller hex chunks with acknowledged offsets, then `end`. Cancel before `end` leaves a partial inactive upload that can be retried from the beginning. The monitor watches AP firmware readback for roughly two minutes and continues in the background up to five minutes. If boot is unconfirmed, reconnect or use USB recovery.

A1 and A2 dual OTA slots are `0x10000` and `0x1f0000`, each `0x1e0000` bytes. A first flash or partition migration, especially on A2, needs USB Factory. Factory/erase can clear saved settings and calibration. Remove propellers and use stable USB/power. A firmware version readback does not establish flight readiness.

## Release assets and build

`firmware-catalog.json` and `firmware-latest.json` record the verified current release and build IDs. `FlightCore_Firmware/` includes the matching original source, `partitions.csv`, catalog, build report and four compiled APP/Factory images imported from a pinned reference commit by `.github/workflows/import-flightcore-release.yml`. `tools/verify_release.py` checks each SHA-256, size, image magic and chip, embedded release version, dual OTA partition table, 4 MB factory bootloader and exact APP bytes embedded in Factory. `tools/build_firmware.py` rebuilds from source using Arduino ESP32 core **3.3.12**; A2 uses the XIAO-specific FQBN. A build must update catalog and binaries together. No firmware version or digest is hard-coded in the UI.

The source repository's legacy sample build files can still be present in older checkouts but are not referenced by this page. Do not flash the older sample in place of the FlightCore release.

## Files

| Path | Role |
| --- | --- |
| `index.html`, `lab.html`; `styles.css`, `lab-workflow.css`, `project.css`, `firmware.css` | Three-page shell, original assembly/wiring design and firmware cards |
| `js/app.js`, `js/ui-controls.js`, `js/project-state.js`, `js/assembly-scene.js`, `js/wiring-renderer.js` | Shared page/state interactions, interactive 3D bench and 2D wiring |
| `js/firmware-page.js`, `js/firmware-image.js`, `js/firmware-hashes.js` | Firmware source, USB, OTA monitor, validation and hashes |
| `js/kit-ap.js`, `js/kit-security.js`, `vendor/crypto/` | Kit AP client and source-compatible authenticated ZFC3 transport, with licenses |
| `vendor/esptool/bundle.mjs`, `vendor/esptool/LICENSE` | Local Web Serial bootloader/flash bundle |
| `firmware-catalog.json`, `firmware-latest.json`, `FlightCore_Firmware/` | Release metadata, source and four compiled board-matched images |
| `sw.js` | Repository-relative offline cache |
| `tools/verify_release.py`, `tools/build_firmware.py`, `tools/firmware.test.mjs` | Image verification, pinned build and mock protocol/guard checks |

## Checks

Run `npm test` for mocked logic and assembly/wiring regressions; `npm run verify:firmware` for the actual release binaries; `npm run check` for project assets. Tests with mocked USB/AP do **not** constitute a physical ESP32-C6 flash or flight validation. A real XIAO ESP32-C6 still needs USB handshake/flash, AP OTA, boot readback and recovery testing with propellers removed.
