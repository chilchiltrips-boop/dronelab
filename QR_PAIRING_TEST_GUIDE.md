# ZEBJUS DroneLab QR Pairing V1 — No Cloud Test Guide

**Testing branch only:** `testing/two-way-qr-pairing`. The `main` branch and live GitHub Pages website intentionally remain at the safe checkpoint until final approval.

## Install Android test APK

[Download test APK](https://raw.githubusercontent.com/chilchiltrips-boop/dronelab/testing/two-way-qr-pairing/mobile-apk/ZEBJUS_DroneLab_QR_V1_1_0_TEST.apk).

This is a **debug-signed test build**, not a release signing certificate or a production app. Android 8.0+ is targeted. Install only after checking the repository and APK source, and allow camera permission to scan QR.

## Open the testing Web App locally on a laptop

Download the testing branch as ZIP from GitHub or clone it:

```bash
git clone --branch testing/two-way-qr-pairing https://github.com/chilchiltrips-boop/dronelab.git
cd dronelab
python3 -m http.server 8765 --bind 127.0.0.1
```

On the **same laptop** open desktop Chrome or Edge:
`http://localhost:8765/#settings`.

This localhost URL is a trusted browser context for WebRTC and webcam use. Both the laptop and Android phone must be on the same normal Wi-Fi network (guest Wi-Fi/client isolation may block direct P2P). No hosted server, Firebase, internet signaling, or ESP32 board is needed for the pairing test; assets are stored locally on the laptop and bundled inside the APK.

**The public** `https://chilchiltrips-boop.github.io/dronelab/` **still serves main, not this QR testing branch.** Use the above localhost test for now.

## Pairing and LED control

1. In Web App Settings click **Pair Mobile**. A QR offer and six-digit code appear; QR expires in three minutes.
2. In the Android app tap **Scan Web QR** and point the phone camera at the laptop. Verify the matching six-digit code.
3. On Android tap **Accept Pairing & Generate Answer QR**. The app displays its answer QR.
4. On Web App tap **Scan Response QR** and point the laptop webcam at the phone's answer. A manual copy/paste alternative is provided if needed.
5. Wait until **Connected**; compare the six-digit codes; click **Confirm Pairing** on the laptop.
6. On Android tap **Take Control**; on Web App Settings click **Grant Mobile Control**.
7. Tap Android **LED ON** / **LED OFF**. The Web App LED changes and sends a matching command acknowledgement. The Android indicator updates **only after** that acknowledgement.
8. Release Control to give it back to the Web App. The Web LED Test tab can then Take Control locally and operate the LED.
9. Refresh the webpage or reload the Android app: the connection/session is invalidated, the lock clears, and a new Pair Mobile QR exchange is needed.

## Reliability, trust and technical limits

- WebRTC DataChannel uses encrypted DTLS transport, empty STUN/TURN server configuration, and WebRTC ICE host candidates. This can communicate over a single LAN without a backend if the router permits device-to-device traffic.
- Pairing uses two-way QR signaling, session expiry and human approval. A six-digit code **alone** cannot establish a connection.
- The Web App is the authoritative LED state owner; commands carry unique IDs, are permission-checked and receive ACK/state revision notifications.
- Heartbeats monitor liveness. Brief Wi-Fi losses can recover in the existing session. A fully failed connection or refresh requires a fresh QR.
- Only one mobile peer is in this V1 session; the Web App manages the single-controller lease.
- Physical Android camera/WebView pairing across two actual devices still requires user acceptance testing. Automated Chromium testing exercises the same shared `companion.js`, QR and WebRTC protocol, but not Android's camera drivers.
- This feature does **not** expose real drone motors, flight controls, or Python execution to mobile remote control.

## Rollback and promotion

Safe baseline: `backup/stable-2026-10-09-before-qr`, commit `f205cfcf405d6e2f9536ad5f4944d9496f2fb6bb`.

No QR testing commits are merged into `main` without approval. Testing branch APK downloads are not a promise that production signing, all Android versions or every router have been validated.
