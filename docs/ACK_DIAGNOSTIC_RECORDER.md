# ACK / Wi-Fi Diagnostic Recorder (Android + WebApp)

The diagnostic input ARM does not arm motors. Firmware's 350 ms input deadman remains unchanged. The recorder helps identify why an ACK was lost; it does not suppress disarming.

## Reproduce safely
1. Disconnect propellers and ESC/motors. Install Android 1.7.19 (code 35) when the signed release is published.
2. Android: Menu → More → Diagnostics → ACK / Wi-Fi Diagnostic Recorder. WebApp: Devices & Firmware → Selected AERION → ACK / Wi-Fi Diagnostic Recorder.
3. Connect the phone to the Kit AP, Connect Kit, ARM and send diagnostic joystick values. When RC ACK failed occurs, leave the app open and press Save / Download JSON. Android displays the system Files destination picker. Save JSON or CSV; the WebApp downloads a file directly.
4. Record board version, Android OS version, approximate control duration, and whether the phone still shows Kit AP Wi-Fi. Share only the sanitized JSON/CSV file. Files are never uploaded automatically.
5. If WebApp and phone are on separate networks, logs remain separate. Android direct AP input does not get echoed to WebApp. Export both logs if the WebApp has an independent STA/USB link.

## Captured fields (strict allowlist)
- Timestamp, client (Android/Web), event category, known endpoint, ACK sequence, round trip ms, inter-ACK gap ms, firmware accepted/rejected counters, packet age, AP/STA, RSSI, STA disconnect reason and firmware version/board.
- HTTP failures are classified into QUEUE_STALE, ACK_INVALID, TIMEOUT, IDENTITY, AUTH, NETWORK, CANCELLED or OTHER. No raw response bodies.
- NOT captured: Wi-Fi passwords, SSIDs, private addresses, Device IDs, Kit Codes, OWNER credentials, cryptographic keys, sessions, tokens, raw requests or camera data.

Last 350 events are saved locally on each device in localStorage and persist across restarts. Normal ACK successes are sampled every fifth frame; slow ACKs (180 ms+), errors, disarms and link changes are retained. The recorder does not issue extra polls, open sessions or alter physical safety rules.

## Interpretation
- rc_ack_error / QUEUE_STALE and large native RTT suggests app-side queue congestion.
- rc_ack_error / TIMEOUT after rising RTT suggests Wi-Fi latency.
- rc_ack_error / ACK_INVALID suggests response/sequence/identity mismatch.
- wifi_event near an error suggests Android Wi-Fi changed.
- kit_status/web_status shows authenticated firmware counters but NOT the exact ESP32 release reason. Retrieve USB serial ZJRC,RELEASE,... if needed.

Security: Android export is explicit user-approved ACTION_CREATE_DOCUMENT, limited to JSON/CSV; no uploads, unrestricted filesystem writing or authentication bypass. WebApp uses a local Blob. Actual POCO X2 + FlightCore AP timing tests remain necessary.
