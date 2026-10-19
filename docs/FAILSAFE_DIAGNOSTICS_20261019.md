# PPM, LED and diagnostic corrections — 19 October 2026

Corrective release: **FlightCore 1.5.4**, **Android 1.8.5-failsafe-diagnostics / code 43**.
Baseline: Firmware 1.5.3 and Android 1.8.4 on main `62b4214`.

## Reproduced problems and changes

- PPM stamped a frame when the main loop processed it, rather than when the ISR
  received it. A frame held for 500 ms could appear age zero and keep input ARM.
  The ISR now publishes the latest complete frame and its arrival time. The main
  loop refreshes time after its mailbox snapshot, expires previous input before
  handling resumed frames, and discards pending packets older than 150 ms.
  Recovery requires three low-switch/low-throttle frames, then a deliberate
  switch-high ARM at low throttle. Other controllers retain exclusive ownership.
- USB LED SET/KEEP could update its lease one millisecond after loop captured time;
  unsigned subtraction then falsely expired the four-second lease. The LED effect
  handler refreshes its clock after commands. Normal expiration/effects remain.
- The diagnostic allowlist dropped `PPM_SIGNAL_LOST`, and WebApp status failed to
  forward firmware release reason/time. Android and WebApp JSON/CSV now preserve
  the known enum and release timestamp; arbitrary text/credentials remain blocked.

`tools/ppm-host.cpp` executes the production ISR and RC/PPM headers with a fake
clock/GPIO and NVS double. `tools/led-failsafe.test.mjs` compiles the unchanged
production LED functions with a fake Arduino clock/PWM/Serial. Both regression
checks failed against the baseline before the production fixes. Controller VM
and export tests cover the actual WebApp status-to-recorder and sanitizer paths.
These are host checks, not physical receiver/radio/LED acceptance tests.

## Cleanup and retained behavior

Removed the unused duplicate gyro emitter/counters and unused OTA state flags;
updated old gyro/scanner documentation. The disabled legacy OTA endpoint still
rejects writes. Current ZJTEL COMBINED/RAW parsing, I2C, gyro, LED effects, PPM and
browser HTTP compatibility remain supported.

The 350 ms network/USB input watchdog, 1800 ms ownership lease, low-throttle ARM,
STOP, authentication/encryption/replay checks and independent UDP receiver/main
loop guards remain enforced. Motors remain disabled. These PPM/USB corrections
are not evidence of a physical Android + WebApp AP disconnect root cause.

Required release checks: Node tests, JS/assets/models, A1/A2 board compilation,
APP/FACTORY/source/checksum verification, browser workflows, permanent APK signing,
exact-source native touch/upgrade/API30 gates and Pages deployment. Physical
ESP/PPM/POCO acceptance must be recorded separately; hardwareFlashingTested stays
false until actual device verification.
