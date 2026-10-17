# ZEBJUS Release Acceptance — 17 October 2026

**Status: NOT YET HARDWARE ACCEPTED.** Repository CI can establish static source checks, simulated browser interactions, firmware hashes and emulator behavior. It cannot observe real ESP32/PPM radio signals, physically interrupted flashes, real handset Wi-Fi chipsets, or a remotely deployed Admin server.

## Reference build and source distinction
- Main reference before this change: `aa8052d957da266a847c999d683f82a246ea0272`; final acceptance MUST record the exact newly tested commit in the separate evidence report. Do not copy this older SHA into real-run evidence.
- A1 / A2 FlightCore **1.4.12**; A1 compiled `2026-10-17T17:25:55Z`, A2 `2026-10-17T17:26:40Z` (reported in published catalog, not independently observed in device).
- Android previously published release **1.7.15-live-link-recovery**, versionCode **31**, is the baseline. The **1.7.16-release-gate**, versionCode **32** candidate must pass pinned-signature APK verifier and native touch gates before CI publishes it; the actual published APK version/sha256 is always authoritative in `mobile-apk/`.
- Firmware **LOADED FW BUILT**: parsed from selected verified binary; **Running FW built**: current Kit's USB `ZJINFO` or signed Kit status. Confirm A1/A2 separately. Displayed timestamp difference is not proof of a display bug, and uploaded firmware is not proof of successful boot.

## Before touching hardware
1. Disconnect **propellers, ESC motor power, LiPo power and any rotating loads**. Use USB/isolated bench supply and common receiver GND. A1 PPM GPIO10; A2 XIAO D10 **is GPIO18**. Receive only **3.3V** logic or use an appropriate shifter; never apply 5V to ESP32 GPIO.
2. Note tester, UTC observation, target board, physical Kit Device ID, firmware version, SHA-256, environment, expected vs observed data, and a safe artifact link. **Never include Wi-Fi passwords, owner pairing codes, session headers, auth cookies, or signing keys.**
3. Load the matching A1/A2 official APP and verify `compiledAt` against `firmware-catalog.json`. Record the loaded-time screenshot. Read current firmware using USB `ZJINFO,GET` and authenticated Wi-Fi status separately.
4. For any flash, first verify board-chip and partition layout; do not send A1 to A2, or Factory image to APP OTA. Record when a write **actually begins**, progresses, ends, reboots and reconnects. Use controlled, non-production test hardware for interruption tests.

## Required physical A1 and A2 procedure — perform independently
- **AP/STA:** boot with saved router available → STA only. Switch manually to AP → AP only. Switch STA and test wrong/offline router → AP recovery. No simultaneous *associated* AP+STA state; reconnect never auto-arms. Verify Kit ID reauthentication and 2.2-second heartbeat stale detection.
- **Live Inputs:** over USB, AP and STA read gyro, Android/Web controls and serial `ZJRC/ZJTEL`; verify source ownership, sequence changes, channel values, 350ms deadman, 1.8s lease, and safety `motorsDisabled=true`. A fresh HTTP poll containing old packet sequence must display STALE.
- **PPM loss:** on **A1 GPIO10 / A2 D10=GPIO18**, apply a suitable PPM-SUM receiver/logic generator with CH1–CH8. Three valid throttle-low, switch-low frames establish PPM owner; CH5 raising at low throttle enables **diagnostic INPUT ARM ONLY**. Remove signal and measure LOST within **150ms**. Assert neutral, input disarmed and **MOTOR OFF**. Observe reacquisition only after safe low switch sequence. Test network source cannot be stolen.
- **USB recovery:** remove/reconnect cable and power; verify fresh live `ZJINFO`, ROM bootloader identification not mistaken for a running firmware, appropriate Factory rescue at 0x0 only if safe, and retained pairing/Wi-Fi for APP update.
- **OTA interruption:** controlled network/power interruption on expendable test board, recorded offsets/ACK, no premature success, reconnect or USB recovery, SHA-256 and Device ID/board rejection, saved config retained after successful APP OTA. Test corrupt digest and wrong board with **no** installation.
- **Build timestamps:** compare loaded `ZJ_BUILD_UTC` and catalog `compiledAt`, then record **running** timestamp after verified boot, avoiding the historical ESP-IDF descriptor's Sep 17 time.

## Real Android handset procedure
- Test on at least one current physical phone, plus an Android device with a different OS/manufacturer if available. Record OS version, model, APK published versionCode/signing certificate/sha256, Wi-Fi type and signal.
- Connect Android Wi-Fi to Kit AP/router but deliberately block Kit API: screen MUST show **not connected**, fresh ownership disallowed, ARM disabled, no false applied ACK. Then restore link.
- Assert diagnostic INPUT ARM requires authenticated Kit control at low throttle and reports accepted source/sequence. Physical MOTOR ARM remains false; STOP releases ownership.
- Hold joysticks with two fingers; compare outbound sequence to Kit-accepted ACK and age. Force >350ms missing RC frame/ACK; check stale state, failsafe, neutral and no recovery auto-ARM.
- Background, lock, force radio AP↔STA switch, re-open; old lease/session must not silently regain control. Verify reconnect permission, owner conflict, layout and real native touch. Verify in-place signed APK upgrade without uninstall.
- Record screenshots / minimal redacted serial traces; CI's emulated touch acceptance is **not equivalent** to real phone validation.

## Optional Central Admin deployment acceptance
See [Central Admin runbook](REMOTE_DEPLOYMENT_RUNBOOK.md). Public HTTPS Node admin login and private persistent storage are optional and independent of local Kit control. **TURN relay and internet-based physical Kit control are out of scope** and are not release gates. Verify HTTPS login and staff account revocation separately if cloud administration is deployed.

## Evidence commands
```sh
npm test
npm run check
npm run verify:firmware
npm run verify:acceptance            # validates schema and reports NOT_RUN
node tools/release-acceptance.mjs --strict   # fails until all real observations are PASS
npm run verify:admin-deployment      # optional: needs actual hosted HTTPS Admin API
```
Edit only `docs/release-acceptance.evidence.json` (or pass `--evidence /private/path.json`) with personally observed results. Attach redacted test logs in a private QA system. A PASS entry must have tester/operator, UTC timestamp, physical identifier, version, evidence reference, and notes. Filling in fields does not replace independent review and a passing CI suite does not override failing/missing physical evidence.
