# ZEBJUS AERION 1.3.6: classroom firmware protocol

BENCH DIAGNOSTICS ONLY. Joystick packets never arm a motor or drive ESCs. Keep propellers and motor power disconnected for these tests.

## Identifiers

- A1 runtime name: ZEBJUS AERION A1 (ESP32-C3 SuperMini).
- A2 runtime name: ZEBJUS AERION A2 (XIAO ESP32-C6).
- Hardware device ID is eFuse-derived (ZFC-A1-XXXXXXXXXXXX / ZFC-A2-XXXXXXXXXXXX).
- Six-digit kit code is generated at first boot and saved in ESP32 NVS. The 6 digits select the kit; they are NOT a control password.
- AP SSID: ZEBJUS-AERION-A1-482716 / ZEBJUS-AERION-A2-482716 as examples; actual suffix is the saved kit code.
- Requested AP password: 12345678. This is deliberately weak/shared and appropriate only for an isolated classroom bench. Each kit retains a separate 128-bit access key (shown on physical USB) for all control APIs.
- Multiple kits can randomly get the same six-digit code. Classroom enrollment MUST detect collisions and reassign the code via physical USB, never silently pick an ambiguous kit.

## USB Serial commands (115200 baud)

    ZJKIT,GET
    ZJKIT,CODE,654321                  # teacher changing code on unlocked physical kit
    ZJI2C,SCAN
    ZJLED,1,SET,50
    ZJLED,1,STOP
    ZJTEL,RATE,20
    ZJRC,CLAIM,WEB,482716             # claim own kit; actual code will differ
    ZJRC,SET,1,1000,1500,1500,1500,WEB
    ZJRC,SET,2,1250,1550,1480,1500,WEB
    ZJRC,RELEASE
    ZJRC,STOP                          # USB emergency bench-input reset

Representative output (not actual hardware data):

    ZJKIT,ID,ZFC-A1-XXXXXXXXXXXX
    ZJKIT,CODE,482716
    ZJKIT,NAME,ZEBJUS AERION A1
    ZJNET,ACCESS,ZEBJUS-AERION-A1-482716,12345678,<private-device-key>
    ZJRC,USB,WEB,2,T=1250,R=1550,P=1480,Y=1500
    ZJRC,FAILSAFE,INPUT_TIMEOUT

## AP/STA authenticated API

- GET /api/identify: public kit ID, six-digit code, label and board (no secret).
- GET /api/status, GET /api/telemetry: authenticated kit, Wi-Fi, I2C, gyro and RC diagnostics.
- POST /api/wifi/test, POST /api/wifi/mode, GET /api/wifi/scan: authenticated provisioning.
- POST /api/rc/claim: form kitCode=dddddd and source=WEB or ANDROID. Requires X-ZJ-Key. Successful response includes random session token.
- POST /api/rc/preview: session, source, armed=false, seq (monotonically increasing) and throttle/roll/pitch/yaw each 1000–2000.
- POST /api/rc/release: session; only owner/session and remote IP can release.
- Only one owner of either USB or Wi-Fi transports at a time. Stale RC input neutralizes after 350ms; ownership expires after 1800ms. Mode switch releases it immediately.
- STA discovery: mDNS _zebjus._tcp at port 80, with TXT kit code, ID and board. It does not authenticate or automatically connect browser clients.
- AP direct Android joystick: only AP, never STA. Android to WebRTC to WebApp to USB/STA and standalone WebApp USB/STA forwarding require matching host application implementation and tests.
- Unsigned HTTP APP OTA is an experimental bench feature and MUST NOT be treated as secure production firmware updates. USB factory image is required for partition migration.

## Acceptance

Compile both A1 and A2; verify matching Factory and APP firmware images, checksums, and USB runtime identity. With motors disconnected, test I2C/LED/gyro, NVS persistence, STA saved Wi-Fi, AP password, three kits concurrently, code collision detection, two clients contending, USB/STA/AP RC logging and watchdog. Physical hardware tests are not performed by GitHub Actions.

## CI release check

The GitHub Actions firmware builder compiles A1 and A2 separately with Arduino-ESP32 3.3.12, verifies 4MB factory/APP images, SHA-256 and dual OTA partitions, and republishes firmware catalogs. The hardwareFlashingTested flag remains false until physical boards are exercised.

## 1.3.6 classroom WebApp / USB-only administration

- Open MY KITS (former Settings) and select USB, STA, AP or authorized Android WebRTC relay. Enter the six-digit public selector and verify the immutable eFuse Device ID before sending RC test frames. The WebApp does not use the code as authorization.
- USB admin provisioning only (physical possession required): `ZJADMIN,GET`, `ZJADMIN,NAME,Classroom-A-07`, `ZJKIT,CODE,482716`, `ZJADMIN,APNAME,ZEBJUS-AERION-A1`, `ZJADMIN,APPASS,12345678`, `ZJADMIN,ROTATE_KEY,CONFIRM`, `ZJADMIN,FACTORY_RESET,CONFIRM`. Critical reset/key changes require explicit confirmation in the WebApp. Changes to AP credentials or code take effect after reboot.
- AP SSID format: `<admin-configured-prefix>-<6-digit-code>`. Hardware ID is immutable; default AP WPA2 password is 12345678; WPA2 password and 128-bit access key are distinct.
- Firmware exposes restricted cross-origin permissions for the official HTTPS Pages origin plus local development origins. Browser support for HTTPS→local HTTP varies. Unsupported browsers require USB or Android's approved WebRTC bridge. CORS is not authentication: X-ZJ-Key and verified RC session are still mandatory. No general-purpose admin or flash API is exposed over Wi-Fi.
- WebApp includes a selected hardware session, kit status in top bar, source-owned joystick forwarding in PID Tuning (motors disabled), USB Serial Plotter RC frames, and Network Telemetry. WebApp cannot enumerate mDNS directly: current Classroom Known Kits are previously verified entries, **not** live LAN discovery; don't label them online without probing.
- Physical hardware acceptance (A1/A2, factory partition migration, 3+ devices/collisions, AP/STA switching, USB controller lease, browser Local Network Access, Android mode, signed OTA) is still pending.

## Firmware 1.3.6 AP recovery and USB-first Wi-Fi provisioning

**Why an older flashed kit can have no AP:** firmware 1.3.5 switched AP off after a successful STA join in AUTO mode. In 1.3.6 AUTO keeps the unique AP visible while the kit joins STA; only deliberate STA-only mode disables the AP after joining. If the kit was previously set to STA-only, that NVS setting survives a normal APP update. To restore AP choose AUTO or AP over verified USB:

1. Connect **Read Running Firmware / Open Serial Port** on the Firmware tab, select the physical A1/A2 serial port, baud 115200, newline.
2. The WebApp requests `ZJKIT,GET` and `ZJNET,GET` automatically. Read the *running* `ZJINFO,FW,...,1.3.6,...` response, do not rely on a downloaded image's version.
3. Open **MY KITS → Classroom Network** (or press **Configure Kit Wi-Fi** on Firmware). The USB hardware identity should be auto-selected from the running firmware.
4. **Scan Wi-Fi**: sends `ZJNET,SCAN` and waits asynchronously for `ZJNET,SCAN,COUNT,...`, `ZJNET,SCAN,ITEM,SSID,RSSI,SECURE` and `ZJNET,SCAN,END`. Select the 2.4 GHz SSID.
5. **Test & Save STA**: sends `ZJNET,TEST,SSID,PASSWORD` over local USB; firmware replies `ZJNET,TEST,STARTED`, then either `ZJNET,TEST,SAVED` after real association or `ZJNET,TEST,FAILED_NOT_SAVED`. Failed credentials are never persisted and passwords are not echoed in firmware logs. Wi-Fi SSIDs/passwords with commas are not supported by the diagnostic serial protocol.
6. **Apply Mode → AUTO**: sends `ZJNET,MODE,auto` (or `ap` for AP-only). `sta` hides the AP intentionally after STA successfully joins. `ZJNET,GET` shows the actual mode, AP state, STA IP and connection phase. AP SSID: `ZEBJUS-AERION-A1-<kitcode>` or `ZEBJUS-AERION-A2-<kitcode>`; initial password `12345678` unless a teacher has changed it.
7. If AUTO/AP is selected but Wi-Fi networks cannot see the board: check hardware power and USB supply, leave BOOT/ROM mode, restart the running app, and examine `ZJNET,AP,ERROR,...` vs `ZJNET,AP,ON,...`. Do not assume flashing means the APP is executing.

Firmware's 350 ms input watchdog and 1.8 s RC owner lease still apply. The browser sends one safe neutral frame as soon as a controller is claimed. Android virtual ARM flags are **never** forwarded as a hardware ARM: hardware preview sends `armed=false` at all times. The JavaScript Android direct-AP sender recognizes verified `requestTransport: AP` instead of guessing from STA connectivity; the latter can be true while AP is simultaneously enabled.

## Teacher USB authorization (new in 1.3.6)

Normal kit naming, AP naming/password, 6-digit selector changes, access-key rotation and reset are locked until teacher enrollment/unlock. On the physically attached kit, **MY KITS → Device Admin** allows **Enroll Teacher Passphrase**, **Unlock Admin (60s)** and **Lock Admin**. Initial enrollment requires a unique 12–64 character passphrase kept by the teacher (no hardcoded default). Firmware stores a per-device salted SHA-256 digest in NVS, rejects repeated failed attempts with a cooldown, and does not echo the passphrase. The teacher can also send `ZJADMIN,ENROLL,<passphrase>`, `ZJADMIN,UNLOCK,<passphrase>`, `ZJADMIN,LOCK` over a trusted USB terminal. A reset clears NVS teacher credentials. The six-digit kit selector and default AP password are **not** teacher/admin passwords.

**Threat model:** This is software authorization for normal USB commands, not tamper protection against a student who can physically erase or reflash ESP32. Production classroom ownership requires hardware Secure Boot, flash encryption, protected debug interfaces and approved signed OTA. Never claim these are enabled by the 1.3.6 diagnostic release.

## Release verification

Run `npm test`, `npm run check`, `python3 tools/build_scanner.py`, `python3 tools/verify_release.py` and browser/Android regression workflows. Full acceptance still requires physical A1 and A2 checks with motors and propellers disconnected, including AP visibility after reboot, USB STA test/save, bad passwords, code collisions, kit ID changes, Android WebRTC RC packets, RC timeout, Android direct AP and STA-only AP shutdown.
