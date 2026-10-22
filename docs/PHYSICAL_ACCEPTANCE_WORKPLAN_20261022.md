# ZEBJUS A1/A2 + Android physical acceptance execution — 22 October 2026

**Release status: BLOCKED.** This is a real-hardware acceptance procedure, **not evidence that testing has occurred**. At creation, all 18 records in `docs/release-acceptance.evidence.json` are `NOT_RUN`. A simulated GitHub Actions job, browser fixture, firmware compile or automated test may **never** be represented as physical acceptance.

## Preflight, scope and safety

1. Use isolated expendable A1 (ESP32-C3) and A2 (XIAO ESP32-C6) boards and a physical Android handset. **Remove propellers, ESC power, LiPo and rotating loads**; use USB/isolated power. Confirm `motorsArmed=false` and `motorsDisabled=true` from running hardware.
2. Record the exact tested `main` source commit SHA, tester, UTC timestamp, board, full Device ID in privately held acceptance records, running firmware (read via `ZJINFO`, not a download catalog), Android app version/signing identity, wired receiver/phone/router configuration and serial evidence. Redact manufacturer secret, passphrases, signed headers, auth tokens, Wi-Fi credentials and signing keys before uploading evidence. Keep private source artifacts outside GitHub Pages.
3. Use only board-matched, SHA-256-verified FlightCore APP/FACTORY images; A1 is ESP32-C3, A2 is XIAO ESP32-C6. An APP is for matching-board OTA, while a 4 MiB FACTORY image is **USB recovery only at 0x0**, never OTA. Verify actual running build stamp after reboot.
4. PPM-SUM must be a **3.3 V signal** with common GND, never a 5 V logic input. A1 PPM is **GPIO10**, A2 XIAO **D10 = GPIO18**. Use a scope/logic analyzer if available to record real loss timings.
5. Current 1.5.10 FlightCore is **diagnostic firmware with physical motors disabled**. `INPUT ARM`, saved Angle/Acro metadata and virtual PID **Run** are not permission to power or fly a motor.

## Mandatory independently witnessed cases

All observations must reference the **same exact tested source release**, and A1 and A2 must be run separately, not inferred from the other board.

| Case ID | Physical action and required observation |
| --- | --- |
| `A1_AP_STA`, `A2_AP_STA` | Boot with valid saved STA router; explicitly switch to AP; test offline/wrong STA router recovery; observe exclusive AP/STA association, Kit ID re-verification, no implicit input ARM |
| `A1_LIVE_INPUTS`, `A2_LIVE_INPUTS` | Over physical USB, AP and STA observe `ZJINFO`, `ZJRC`/`ZJTEL` or signed RC status; record CH5/CH6, source, seq and received age progression; cut input and confirm STALE/neutral/disarmed and MOTOR OFF; repeat connection change with no stale data resurrection |
| `A1_PPM_LOSS`, `A2_PPM_LOSS` | Inject **eight real PPM channels**: begin throttle low and CH5 low for safe acquisition; toggle CH5 high only at low throttle; verify diagnostic INPUT ARM but MOTOR OFF; unplug signal, measure **<=150 ms** owner loss and neutral; reconnect must require safe reacquisition; ensure PPM does not steal an active network owner |
| `A1_USB_RECOVERY`, `A2_USB_RECOVERY` | Disconnect/reconnect physical USB; distinguish ROM bootloader from running firmware, read board identity and post-reboot serial status, verify saved data; on expendable board practice board-matched Factory rescue |
| `A1_OTA_INTERRUPT`, `A2_OTA_INTERRUPT` | On expendable board, verify proper APP target and SHA-256, reject wrong-board/corrupt payload, interrupt upload/power, prove honest failure status and safe USB/reconnect recovery; verify APP OTA retains settings after successful reboot |
| `A1_BUILD_STAMPS`, `A2_BUILD_STAMPS` | Record loaded catalog timestamp separately from **running** `ZJ_BUILD_UTC` reported by real Kit; require matching board and flashed image before calling upgrade successful |
| `ANDROID_WIFI_WITHOUT_APP_LINK` | Phone Wi-Fi association alone must not show verified Kit app control when API is unreachable |
| `ANDROID_DIAGNOSTIC_ARM` | Verify authenticated low-throttle diagnostic ARM, confirmed accepted input and MOTOR OFF; never infer motor arming |
| `ANDROID_ACK_FRESHNESS` | Observe real native UDP feedback and advancing applied/received sequence; interrupt radio/input and measure the current **500 ms** firmware deadman (`ZJ_RC_DEADMAN_MS`), no stale-live or auto-rearm. Record handset feedback timing separately from the firmware timeout. |
| `ANDROID_BACKGROUND_RECOVERY` | Background phone, lose network and return; confirm input releases safely and deliberate reconnect/authorization required |
| `ANDROID_UPGRADE_TOUCH` | On handset confirm same package identity and signing certificate, upgrade without uninstall/data loss, portrait/landscape policy and actual joystick/touch responsiveness |
| `ADMIN_HTTPS_DEPLOYED` | Only if operator provisions optional backend: verify TLS, persistent private store, login/logout/revocation across two real sessions and no public account database; unrelated to hardware controller authorization |

For every physical case use the canonical evidence file fields `id`, `status`, `observedAt`, `operator`, `deviceId`, `firmwareVersion`, `evidenceRef`, `notes`. Do not set `PASS` without real observations and safe trace references. Record `FAIL` with sanitized failure logs where a real test fails, and leave `NOT_RUN` where it was not performed. Do not invent screenshots or device readings. Write the exact 40-character tested source SHA into `sourceCommit` only after a real acceptance session.

## Software checks and strict release barrier

Run the static checks before physical testing:

```sh
npm test
npm run check
npm run verify:firmware
npm run verify:acceptance
```

The last command is **schema validation only**, not physical proof. Only after independently documented real device testing run:

```sh
npm run verify:acceptance:strict
```

**Strict must fail** if a required case remains `NOT_RUN` or `FAIL`, source SHA is missing, or a claimed PASS lacks mandatory evidence fields. The `school-production-*` tag workflow applies this strict barrier; normal WebApp / bench development is not misrepresented as hardware acceptance. Also demand all simulator/Android/firmware browser CI green before any production promotion.

This checklist is a handoff to a technician with physical devices. **No real hardware observations have been performed by this change.**
