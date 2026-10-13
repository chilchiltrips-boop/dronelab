# FlightCore 1.4.1 — simple AP connection

The WebApp removes the New Kit private-label form. Connect Kit detects the full immutable Device ID and public Kit Code automatically, and opens an AP-only diagnostic session without entering a label, secret or pairing code.

## Use

1. Update the exact A1/A2 board to the verified 1.4.1 APP image using Firmware & USB. Preserve existing settings with APP; factory recovery replaces flash settings. The running firmware must report 1.4.1.
2. Open the official HTTPS DroneLab WebApp before leaving Internet Wi-Fi. Join the kit AP using OS Wi-Fi settings.
3. In My Drone Kits press Connect Kit and allow browser Local Network Access. No Kit Code entry is needed. Refresh checks the real identity/heartbeat.
4. Take Control explicitly for motor-disabled diagnostics. Only one firmware operator may hold the existing lease. Reconnection never restores control or hardware ARM.
5. For router Scan/Test & Save, use physical USB or previously authorized protected settings access. USB can supply the existing maintenance credential to the current browser without typing it; Remember access stores it only on a personal browser. Ordinary AP diagnostics does not need remembered credentials. STA access still requires that per-device authorization.

## Permission boundary

AP-local sessions permit status, telemetry, sensor/LED commands and RC diagnostics only. They are bound to the observed AP interface and client IP, expire after 30 minutes and use signed counters plus encrypted POSTs. At most four of eight slots are available for local sessions, leaving capacity for protected access.

Anyone already on the kit AP can open these bench diagnostic sessions. This is local-network trust, not owner/teacher authentication or cryptographic manufacturer identity. Use a private AP password in a shared classroom. A public Kit Code does not grant protected settings or OTA. AP-local sessions cannot be reused over STA, mutate router/admin configuration or authorize OTA. Motors and hardware ARM remain disabled.

Existing manufacturer/diagnostic authentication APIs and stored credentials remain compatible for maintenance and Android. They are removed from the WebApp's ordinary connection UI rather than deleted from firmware storage. Full student/teacher roles and Home Mode remain unfinished V2 work.

## Verification

Actual firmware-header host tests cover local AP access with no installed label, wrong interface/IP, expired session, replay, denied settings/OTA and reserved privileged capacity. Browser protocol tests cover signed/encrypted local requests, identity mismatch and tampered responses. The real Chromium fixture checks no label form exists, one-click identity detection, protected settings refusal, authorized router setup, STA handover, Android receive/STOP and actual Pyodide.

Fresh A1/A2 build/catalog/hash evidence and final CI are recorded in the PR. Every physical check is PHYSICAL PENDING. No flight-readiness claim.
