# RC input, diagnostics and maintenance

The header reports connection, accepted RC source and diagnostic permission
separately. PPM ownership no longer labels the whole Kit VIEW ONLY / KIT IN USE.
Use WebApp RC belongs to Devices & Firmware → Overview → RC Input & Maintenance.
It claims joystick diagnostics only. It grants no LED, sensor, admin or OTA scope.

Verified IMU/RC reads continue while PPM owns RC. Authorized direct USB/AP/STA
LED and Python commands stay independent and retain the existing LED queue,
STOP and keepalive behavior. A STA observer remains read-only; an ownership
button cannot turn an observer into an authorized diagnostic client.

## Firmware 1.5.11 procedure

1. Connect and verify the intended Kit. Existing 1.5.10 can use the new header
   and independent diagnostics, but maintenance/handover remains disabled until
   its firmware actually advertises versioned `rcAccess` support.
2. Lower accepted throttle to <=1050 µs and disarm. A connected PPM receiver
   must also report low mapped throttle and its mapped ARM switch <=1300.
3. To change the RC producer, choose PPM, WebApp or Android and click Select RC
   source. The firmware releases and neutralizes only an eligible producer;
   it never steals another Web/Android/USB controller. Release that controller
   first. Choosing WebApp then permits Use WebApp RC; choosing Android leaves
   the actual Android controller to obtain its own authenticated session.
4. To pause for maintenance, keep the board still: fresh gyro samples must
   stay below 3°/s per axis for 500 ms. Click Pause RC for maintenance. Accepted
   RC becomes neutral/disarmed, while raw PPM capture, sensors and authorized
   LED/Python diagnostics continue. This does not implement an IMU calibration
   algorithm or physical PID controller; those capabilities remain unsupported.
5. Choose a source, then End maintenance & enable selected RC. Firmware checks
   low throttle/disarm again, releases the maintenance lock and admits only
   that selected source. PPM needs a fresh signal and three new low-switch,
   low-throttle frames; it never auto-arms. Web/Android require a new RC claim.

The maintenance session belongs to its authenticated network session or the
unlocked physical USB teacher. The UI renews a 30-second lease only while
visible and connected. Expiry clears the holder, **not the pause**. Reconnect,
re-verify and explicitly resume safely; no background retry changes RC source.
A new authorized session can resume after the previous holder expires.

USB teacher unlock/enrollment is a credential operation and does not reserve
RC. Settings writes still require idle RC and teacher authorization. USB access
changes use device-bound, correlated `ZJACCESS` commands and retain the 60-second
teacher unlock window. Network transitions use encrypted, signed and replay-
protected `/api/rc/access` POSTs; STA observer writes and relay handover are denied.
The localhost ZJM1 helper allowlists the same route without granting permission.

Selection and maintenance are volatile boot state. A reboot starts the existing
AUTO arbitration with mandatory low PPM throttle/switch acquisition. No source
restores an armed state, and physical motor outputs remain disabled. The 150 ms
PPM loss limit, RC watchdogs, device authentication, OTA/admin scopes and explicit
STOP behavior are unchanged. Never infer physical acceptance from compilation.

## Verification and remaining bench work

- Native tests execute production PPM/RC/access code: low/high throttle,
  switch/disarm, stationary gating, old producer protection, maintenance lease
  expiry, explicit reacquisition and physical USB teacher/device-ID checks.
- Signed ZJM1 integration executes the production access endpoint, rejects
  unsigned and foreign-session transitions, and permits telemetry/LED requests
  without acquiring RC. Existing replay, tamper, watchdog and OTA tests remain.
- Browser integration uses real WebApp connection/render/action handlers with
  explicit device doubles: PPM + IMU/LED, pause/resume, expired holder, source
  selection, observer denial and 1366/768/390/320px header layouts.
- Actual Pyodide LED blink also runs with A2 STA PPM ownership. Existing A1/A2
  AP/STA Python, PPM simulator and layout regressions still apply.

Record real A1 and A2 Kit IDs, receiver model/voltage, installed version, raw
channels, stationary detection, concurrent diagnostics, disconnect/lease expiry,
explicit resume and measured PPM signal-loss timing. Existing physical evidence
records remain NOT_RUN until these observations are recorded. No real Kit is
flashed automatically by these source changes.
