# ZEBJUS Android 1.7.8 — Hardware acceptance matrix (NOT automatically verified)

This checklist is **manual acceptance**, not a claim of device testing. Remove propellers, disconnect ESC/motor power, DISARM, and use a supervised bench Kit before any OTA.

Release gate: Android build (SDK 35), Android emulator 16:9 touch acceptance, signed APK verification, Node permission/NSD/OTA tests, browser pairing/firmware tests. A green CI does **not** replace these physical conditions.

| Android / network | Physical action | Required safe result |
| --- | --- | --- |
| Android 12 (API31), fresh install | Open Connect, deny precise Location first, then grant on second attempt | No identify/auth network request before permission result; denied remains offline; after grant exact SSID/BSSID pin succeeds |
| Android 13,14,15,16 | Connect phone to Kit AP without internet while cellular data remains ON | Explicit AP-only Network HTTP requests, never cellular; preserve Wi-Fi identity while Android offers a switch |
| Android 12-17, STA | Join same router, enter saved Device ID, tap Discover without private label | NSD resolves TXT Device ID, then fresh identify/enroll/signed status before ONLINE |
| Android 12-17, STA | Reboot router to change DHCP IP | mDNS first, then cache for exact Device ID, never blindly use stale IP from previous Kit |
| Android 12-17, dual/concurrent Wi-Fi | Provide two active Wi-Fi transports or two networks with same SSID | Reject ambiguous bootstrap or duplicate SSID; never write to arbitrary network |
| Android 12-17, wrong Kit | Enter ID for Kit A with Kit B responding on stored IP | Reject signed Device ID mismatch; control remains released |
| Android 12-17 | Grant read-only paired WebApp permission only | Status/telemetry allowed; Wi-Fi changes, diagnostic control, OTA disallowed until separate grant |
| Android 12-17 | Select Remember diagnostic key; leave consent dialog open for >30 seconds; accept/cancel | No 5-second timeout or false success; Android Keystore dialog decision controls persistence |
| Android 12-17 | Start encrypted APP OTA, background app mid chunk and return | Keep screen on in foreground, recover only using same Kit signed offset/hash/session; never blind replay |
| Android 12-17 | Cancel OTA mid-chunk then check status | Abort only an active, same-session OTA; display ABORT CONFIRMED vs UNCONFIRMED clearly |
| Android 12-17 | Simulate lost END acknowledgment/reboot | Verify new boot ID, firmware version and build; never resend END blindly |
| Android 12-17 | Remove power during OTA, recover using USB if needed | No claim of success unless firmware boots and verifies; stored Wi-Fi/pairing preserved for APP-only OTA |
| Android 12-17 | Open Settings / dismiss and rotate in landscape | Accordion sections accessible, progress visible, no cut-off buttons, touch hitboxes and focus unchanged |
| Android 12-17 | Install signed 1.7.8 over signed 1.7.7 | Same package/certificate, versionCode 24 > 23, installed version shows live PackageManager value |

## Android 17 / target SDK 37 migration boundary

The current **targetSdk is 35**, even when installed on an Android 17 phone. Per Android's official Local Network Permission documentation, `android.permission.ACCESS_LOCAL_NETWORK` is required when **targeting API 37 or higher**. **Do not prematurely add/request it for targetSdk <=36**. Before raising targetSdk to 37:

1. Adopt SDK 37 and declare `ACCESS_LOCAL_NETWORK`, then request at runtime before custom LAN HTTP or NSD/IP fallback. Alternatively evaluate system-mediated NSD pickers.
2. Extend fail-closed permission requests to cover Location **and** Local Network; never retry a privileged POST blindly after a denied runtime permission.
3. Verify Wi-Fi/STA/private LAN access on real Android 17 with permission allow/deny/revoke and cellular data; add tests for targetSdk 37 before release.
4. Rebuild/sign using official keystore, increment versionCode, run native emulator touch/OTA/release gates; roll out to a pilot school before general distribution.

Known limitation: hardware/AP/STA/NSD/OTA interruption tests are **not runnable solely from GitHub Actions** and require physical Android phones and FlightCore A1/A2 Kits.
