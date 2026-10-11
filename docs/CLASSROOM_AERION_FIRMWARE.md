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
