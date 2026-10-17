# ZEBJUS FlightCore 1.3.4 — AP / STA / USB network-lab preview

This is a **lab diagnostics release**, not production flight-control firmware. No motor output is connected to Android joystick packets. Test without propellers and without ESC/motor power.

## Current connection architecture

- **USB:** Chrome/Edge Web Serial connects directly. First factory flash, ROM recovery and bootloader/partition replacement remain USB-only.
- **AP:** FlightCore exposes its own WPA2 Wi-Fi, `ZEBJUS-AERION-A1-<code>` or `ZEBJUS-AERION-A2-<code>`, at `192.168.4.1`. Phone must join that AP in Android Settings.
- **STA:** FlightCore joins the configured router; phone must join a reachable Wi-Fi network. Internet is **not needed** for local AP/STA operations. This is not cloud control.
- **AUTO:** Firmware tries the saved SSID, falls back to its AP when missing or failing, and periodically retries. Manually switching mode drops old sessions; pair again.

**AP with WebApp and Android simultaneously:** both the laptop and phone must join the same FlightCore AP. Load and cache the GitHub Pages WebApp before switching networks, because that AP does not provide Internet; then use **offline two-way QR** rather than an Internet-only pairing code. If the laptop remains on another router, local-only WebRTC without a relay cannot connect to the phone on the isolated AP. In STA mode both devices should join the same router (and the router must permit client-to-client communication).

**Important GitHub Pages restriction:** the published HTTPS WebApp cannot safely call the kit's ordinary `http://192.168.4.1` API. The preview uses the bundled Android app's *restricted native Wi-Fi transport*, with WebApp requests forwarded over the existing encrypted, approved WebRTC DataChannel. Thus the WebApp Wi-Fi tools require a paired Android companion. A future standalone desktop native bridge or authenticated HTTPS/WSS transport is needed for **direct laptop↔kit Wi-Fi without Android**.

## First setup

1. Flash the **matching** FlightCore A1 or A2 **Factory** image over USB. Verify actual running `ZJINFO,FW,...,1.3.4` on Serial (115200). Binary catalog version alone is not proof that the board updated.
2. Read `ZJKIT,ID,...`, `ZJKIT,CODE,...`, `ZJKIT,NAME,...` and `ZJNET,ACCESS,<AP SSID>,<AP WPA2 password>,<32-character key>` on USB Serial. AP WPA2 password is intentionally `12345678` for classroom convenience and is NOT a control credential. Keep the per-device 32-character key secret. They are not committed to GitHub. The key and AP password are persisted in ESP32 preferences; if reset/erased, read the new ones over USB. Never publicly share the line.
3. Open the Android companion 1.6.4 or newer and its **FlightCore Connection** panel. Tap **Open Wi-Fi Settings**, join the FlightCore AP with its password, enter kit IP `192.168.4.1` and access key, **Connect / Refresh**. Alternatively enter the kit STA LAN IP when already connected to router.
4. **Scan Nearby Wi-Fi**, pick an SSID, enter the password and choose **Test Wi-Fi & Save on Success**. The ESP32 saves credentials **only after joining** the router successfully (does not test Internet). Once STA is active, rejoin the same router on the phone, update the address, reconnect.
5. Choose **AUTO / AP / STA** and **Apply Mode**. Switching modes can change device IP and invalidate the current WebRTC pairing. Stop joystick and re-pair before resuming.

## WebApp

Open `index.html#settings`, pair Android using existing two-way QR/offline or six-digit Internet-assisted signaling, verify PIN and approve the session. On Android enable **Allow paired WebApp to access this FlightCore**. The new WebApp FlightCore panel can then query status, scan SSIDs, test/save credentials, switch modes, and read I²C/gyro. It never transmits your STA password to GitHub or the public signaling service; it travels in the encrypted DataChannel and then the local Wi-Fi. The ESP32 HTTP link itself has no TLS: rely on an isolated trusted WPA2 LAN/AP, use a unique key, and do **not** route/forward TCP port 80 to the Internet.

Python Lab `Python execution target` now offers **Python 3 / Simulator**, **USB Hardware**, **FlightCore AP • Android Relay**, and **FlightCore STA • Android Relay** on the main index.html WebApp. Select the AP/STA target after pairing and connecting Android. Scans use `ZJI2C,SCAN`; gyro readings and LED commands use the same logical worker API as USB. Actual Wi-Fi performance, stream reliability and hardware pin behaviour still need physical A1/A2 verification.

## Android joystick

**Firmware 1.3.4 requires a controller claim before preview.** Authenticated clients POST `/api/rc/claim` (`source=WEB|ANDROID`, `kitCode=<6 digits>`), retain the returned `session`, then POST `/api/rc/preview` with `armed=false`, `source`, `session`, monotonically increasing `seq`, and `throttle`, `roll`, `pitch`, `yaw` (1000–2000). Call `/api/rc/release` with the session. A 350 ms input timeout resets throttle/axes; control lease expires after 1.8 s. Earlier Android 1.6.4 preview senders need updates to this protocol. This validates packet reception **only**. No flight arming, ESC mixing, PWM/DShot motor outputs, flight stabilization, live PID writing, or actual drone flight is implemented through this path. Flight deployment must include a reviewed, independently tested failsafe and operator authorization before enabling motors.

## Firmware update policy

| Operation | USB | AP / STA |
| --- | --- | --- |
| Factory/bootloader/partition image | Supported, with safeguards | **Never** over Wi-Fi |
| APP-only OTA | Not needed (USB flashing supported) | Android **Upload APP .bin** |
| Post-update verification | Live Serial `ZJINFO` | Live device version/IP after reconnect |

The native Android APP picker rejects filenames containing Factory/Merged and files exceeding the OTA slot. ESP32 verifies image header magic/board chip ID and uploads to the OTA APP partition. **This preview does not yet implement cryptographic firmware signing or rollback policy. Do not use this unsigned-OTA pathway in a production drone.** Physical power loss testing, device authenticity, version and SHA-256 comparison against the release catalog, thermal checks, security review and image-signature verification are release blockers.

## Known limits / future work

- Android WebView bridge is included in the updated APK, **not** a regular Chrome Android webpage. Windows/macOS GitHub Pages needs the paired Android bridge for AP/STA.
- No BLE provisioning, captive portal, local mDNS discovery, or reliable Internet-connectivity proof is implemented. IP must be entered after STA join.
- AP fallback & STA reconnection may temporarily interrupt WebRTC. Do not change modes while flying.
- Direct phone joystick preview is not low-latency, flight-rated control; HTTP request/response every 100 ms is for laboratory testing, not a 250 Hz flight control loop.
- NVS holds saved Wi-Fi credentials; erase/secure boot policies have not been production-qualified.
- This release cannot be declared flight-ready until real A1 ESP32-C3 and A2 ESP32-C6 bench tests, signed OTA/secure boot, motor disarm hard interlocks, robust independent link watchdog and fail-safe qualification.

## Bench acceptance matrix

- Fresh factory flash on A1 / A2; USB ZJINFO; AP SSID and unique password; access key rejected if missing/wrong.
- AUTO no saved STA → AP; new STA scan; invalid password → AP fallback without overwriting saved credentials; valid STA → saved/online; reboot → auto reconnect; AP manual selection and back.
- Android offline AP kit status, I²C scan, gyro plot, LED STOP; paired WebApp relay; Python worker Run/Stop; disconnect and reconnection.
- Joystick RC preview accepted only with correct key, disarmed flag and owner; out-of-order frames and concurrent controllers rejected; 350 ms timeout returns 1000/1500.
- APP-only OTA on both boards, reject wrong chip, factory image, truncated file, oversize file, unauthorized request, power loss; USB factory recovery still available.


## Minimized tab / another tab open — STA/IMU resilience
The physical ESP32 STA association and IMU run independently of browser tabs. Background Chrome timers may be paused, so a missed UI heartbeat is not proof the Kit disconnected. The original page now preserves selected Kit identity and authenticated monitoring while hidden, attempts read-only status no more than once per 14s if browser scheduling permits, and does not count hidden or just-resumed request failures as physical disconnects. On visibility/focus return and back-forward cache restoration, it immediately verifies fresh signed status for the same Kit. Controller ownership is still released when hidden; motors remain disabled. **Browser sleep/discard and PC sleep cannot guarantee uninterrupted background streaming.** Use device `staDisconnectReason`, `staConnected`, RSSI and USB logs to diagnose actual STA loss. Never display historical telemetry as LIVE.
