# Android 1.7.13 / FlightCore 1.4.10 direct Kit input

Install the permanently signed Android update over the existing app and flash the matching A1/A2 **APP** image. APP OTA preserves the saved Wi-Fi profiles, Kit identity and pairing data. Factory images remain USB recovery artifacts.

## Use AP

1. Join the Kit's Wi-Fi hotspot on the phone. Allow the one-time Android Wi-Fi identity permission if requested.
2. Wait for `KIT AP CONNECTED`. No WebRTC QR pairing or diagnostic enable checkbox is needed for direct Kit input.
3. Press **ARM**. The app claims the Kit input session and waits for a signed low-throttle ARM acknowledgment.
4. Move the left stick for throttle/yaw and the right stick for roll/pitch. `ESP32 RX #…` confirms received packets.
5. Press **DISARM** or **STOP** to release input. Backgrounding the app, changing networks, or missing input/ACK deadlines disarms the input; reconnection does not re-arm automatically.

`INPUT ARMED` is the Kit's received controller-input state. This repository's firmware is a classroom scanner/LED/IMU/RC diagnostics image: **physical motor outputs remain disabled**. It does not implement a physical flight motor controller.

## Use STA

Save/test the router credentials, then use the AP/STA switch. The Kit turns AP off before associating with the saved router and restores AP if all saved profiles fail. Manual AP stays AP. While a phone is using fallback AP, firmware does not interrupt it with automatic STA retries.

The phone must join the same router as the Kit. Saved diagnostic enrollment authorizes STA input; an unpaired STA observer remains read-only. Within the current verified session, the app keeps its per-Kit diagnostic credential in memory across network handover; no OWNER key is stored or exposed. Android Keystore enrollment remains the path for reconnecting after an app restart.

## Observe from a computer

- On the same AP/router, connect the WebApp to the same Kit and use the received input readouts. Do not take control away from Android. The status snapshot includes source, transport, sequence, throttle, roll, pitch, yaw and `inputArmed`.
- Alternatively connect USB and open **Serial Monitor at 115200**. Do not claim USB control. Example received frame:

  ```text
  ZJRC,AP,ANDROID,42,T=1320,R=1650,P=1440,Y=1550,ARM=1
  ZJRC,RELEASE,NETWORK_RELEASE
  ZJLED,STATE,ON
  ZJLED,STATE,OFF
  ```

  `ZJRC,RELEASE,…` means DISARM/STOP/timeout and neutral input. The WebApp's USB observer also parses AP/STA frames, including `ARM=1/0`. Opening USB must not send a control claim for observation.

## Reliability changes

- Routine status polls no longer disable connection buttons. One transient request failure does not immediately mark the Kit disconnected; three consecutive failures or an expired heartbeat do. Identity/authentication/path failures still stop immediately.
- During input transmission, signed receive ACKs supply the heartbeat and take priority over status queries.
- Fallback probes leave the AP/STA selector unchanged until the fallback Kit and transport are verified.
- Failed automatic AP connections retry; STA discovery retries while handover is pending. Expired STA observer sessions renew with observer scope.
- STOP invalidates pending ARM claims and stale receive ACKs. Firmware rejects high-throttle initial ARM and late packets after an armed-input timeout.
- LED ON is renewed while connected and foregrounded, with received state reported. LED OFF immediately clears the firmware LED mode.

## Verification boundary

Node regression tests execute the network state machine and firmware C++ ownership/deadman implementation. Chromium tests use real multitouch events with a simulated native Kit boundary. The signed APK workflow checks certificate/application identity, upgrade compatibility, Android WebView native touches, HOME/resume, rotations and persisted data. Firmware compilation validates both chips, SHA-256, source hashes, OTA slots and APP/Factory consistency.

Physical A1/A2 flashing, sustained real-phone AP/STA radio tests, router roaming and RF interference require the user's hardware. Automated checks do not establish that a wireless connection can never drop.


## AP ARM ACK queue priority — October 2026 diagnosis and source fix

The signed `/api/rc/claim` and `/api/rc/preview` transactions use a monotonic encrypted session. The Android native bridge deliberately uses a single serial Wi-Fi worker to avoid reordering signed sequence numbers. An overlapping signed `/api/status` plus SSID/BSSID verification can take seconds and starve the 100 ms RC frame stream (native preview queue has a 250 ms stale-drop gate). The 350 ms firmware deadman is unchanged: losing input must disarm, never auto-arm. This change waits for a preexisting status request *before* claiming input, then suspends periodic status requests for the entire claimed RC session (including the first critical ACK and stale ACK periods). Normal status polling resumes only after STOP/release. Full IMU telemetry UI reads cannot be queued while Android owns diagnostic RC; they remain available after disarming.

A lost preview ACK now states `RC ACK failed • diagnostic input disarmed` instead of implying the AP Wi-Fi radio actually disconnected. The firmware controls RC owner, seq, source, IP and deadman; Android retains signed response/identity verification and verified Wi-Fi SSID/BSSID binding. `ZJRC,CLAIM,AP,ANDROID`, `ZJRC,RELEASE,ARMED_INPUT_TIMEOUT`, `ZJRC,RELEASE,NETWORK_RELEASE` and native queue errors should be recorded **without credentials** on physical A1/A2 devices. GitHub node tests are simulations and do not prove stable live radio reception. Source changes require a new signed APK build, not just updating GitHub Pages.
