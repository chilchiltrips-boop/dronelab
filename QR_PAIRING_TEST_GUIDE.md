# ZEBJUS DroneLab V1.3.0 — Smart Two-Way QR Pairing

**No cloud, no laptop ZIP extraction, no Python server, no extra local bridge.**

## Install and pair

1. On your **laptop**, open [DroneLab Web App](https://chilchiltrips-boop.github.io/dronelab/) in current Chrome/Edge and go to **Settings**.
2. On your **Android phone**, install [ZEBJUS DroneLab Smart QR V1.3.0 APK](https://github.com/chilchiltrips-boop/dronelab/raw/refs/heads/main/mobile-apk/ZEBJUS_DroneLab_SMART_QR_V1_3_0_TEST.apk).
3. Connect both devices to the **same Wi-Fi network** (not isolated guest/client network).
4. On Web App, click **Pair Mobile**. A 3-minute QR + 6-digit code appear. Laptop camera scanner starts automatically after camera permission approval.
5. On Android, tap **Scan Web QR** and point the phone at the Web QR. Android automatically produces a **Phone Response QR**; no extra Accept/Generate action.
6. Show that Phone Response QR to the laptop webcam. Web App reads it and connects through WebRTC. If laptop webcam is unavailable, Android **Copy Response Text** → Web App Settings **Advanced** → paste.
7. Compare the six-digit code on both devices and click **Confirm Pairing** on the Web App.
8. On phone, tap **Take Control**. On the laptop header flip **Grant Mobile Control** ON. Android LED ON/OFF buttons become enabled after Web App grants control; command acknowledgements update the LED state on both devices.
9. Flip Grant Mobile Control OFF to revoke mobile LED control. The Web App LED testing panel can then use **Take Control (Web)**.

## Safety and recovery

- **Refresh, app restart, Wi-Fi changes, expired QR, connection failure**: mobile control is revoked; select **Pair Mobile** again, scan a fresh Web QR then phone QR, reconfirm and re-grant control.
- The header shows **Mobile: Disconnected** in red and **Connected** in green. The control switch is disabled until pairing is approved.
- The QR scanner auto-steps zoom on Android cameras that support digital zoom and attempts continuous focus where supported; unsupported camera hardware continues scanning normally. If QR is difficult to scan, use **Expand Response QR** on the Android phone.
- Data flows directly via encrypted WebRTC DataChannel on local Wi-Fi; QR images carry the signaling information **in both directions**. No Firebase, signaling server, STUN/TURN or ESP32 kit required.
- The public website may need Internet to load unless previously cached. The subsequent paired peer-to-peer transport is LAN direct; P2P still requires the Wi-Fi access point not to block local devices and firewall to permit the connection.
- The Android APK is **debug-signed for testing**. A previous Android debug APK with a different certificate may require uninstall/reinstall, resetting its saved settings.
- Physical Android camera/WebView, webcam permissions, QR recognition under lighting conditions, and different router/firewall configurations require actual phone and laptop testing; Chromium CI simulates the camera callback and validates actual QR pixels.

## Recovery / backups

- `backup/stable-v1.2.0-before-two-way` — safe V1.2.0 before QR improvements.
- `backup/stable-v1.1.1-before-one-scan` — prior two-way implementation.
- `backup/stable-2026-10-09-before-qr` — earliest safe baseline.

The QR paired LED is a **virtual simulator**; it does not control flight motors or hardware.
