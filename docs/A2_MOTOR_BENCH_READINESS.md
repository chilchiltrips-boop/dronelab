# A2 motor bench integration: review in progress

This branch currently contains a **hardware-independent interlock model only**.
It has not been wired into the production firmware, WebApp, Android app, Python
bridge, telemetry or ESC pins. It cannot drive a motor. Do not present the
branch as a completed motor test, ESC calibration or a flight controller.

## Existing production contract

Main at `fa595cde4a464c9babfef7545abaa652897b57d7` (FlightCore 1.5.14)
deliberately reports `motorsDisabled:true`, `motorsArmed:false`, and USB
`MOTORS=OFF`. Input-arm means a diagnostic input, not motor arming. Android
WebRTC currently targets the simulator; Android relay automatic Python access
is read-only. Live actuation requires an explicit protocol/capability update
across the firmware, all serial/network consumers and Android. Leaving old
hard-coded status messages in place while PWM is active would be unsafe.

## Hardware evidence that must be reconciled before physical output

The earlier `A2_PCB_Review.pdf` and `A2_Gerber_Review.pdf` reviewed an October
23, 2026 EasyEDA source/export. They are not proof of the current board revision.
That source review identifies ESC1 -> D0/GPIO0, ESC2 -> D1/GPIO1, ESC3 ->
D2/GPIO2, ESC4 -> D3/GPIO21. This differs from the earlier standalone sketch's
{D1,D2,D3,D0} order. Verify each physical connector against the actual PCB;
the motor position/direction mapping is an additional separate confirmation.

The reviewed Gerber reported that the U4 regulated-5V input was connected to
XIAO BAT+ rather than the 5V/VBUS input, with the return routed via BAT-. The
review also noted a common rail among the ESC center pins, and an unresolved
simultaneous USB/external-supply power path. Verify the current schematic and
assembled board and correct any retained issue before powering it from 5 V or
connecting ESC BEC outputs. The updated Gerber did correct the prior external
I2C SCL/SDA swap; it did not establish hardware or motor acceptance.

Photo label suggests a SimonK 30 A ESC; exact board/firmware variant, 3.3 V
signal acceptance, input frequency and BEC characteristics are not established.
Start only with a manufacturer-supported PWM setting after checking the actual
ESC. Power-on high-throttle calibration is an operator-directed, props-off
operation; firmware cannot verify completion tones by itself. Do not connect
or parallel multiple BECs unless the power design specifically supports it.

## Interlock behavior under host tests

`FlightCoreMotorSafety.h` starts disabled. It models explicit mapped-pin and
props-removed confirmation, a short supervisor lease, bounded timed single/all
motor tests, and explicit calibration high/low phases with deadlines. PPM
arming is only after a fresh neutral observation and continuous low-throttle /
yaw-right gesture from distinct fresh frames; low-throttle / yaw-left disarms.
CH5 switch gating is selectable. Stale inputs, source changes, late lease
renewal, stop and output fault latch off. The first bench cap is 20% of the
configured 1000–2000 us range, not a measured RPM or guaranteed nonrotation.

Host tests exercise that model; they do not validate PWM timing, ESP32 task
scheduling, wiring, ESC power or actual motor stopping. The model has not been
reviewed as an independent physical safety system. A hardware adapter must have
its own watchdog/deadline design; ESP32 hardware PWM can keep its last duty if
the controlling task stalls. A separately verified physical power cutoff is
needed for bench work.

## Required integration and acceptance

* Implement A2-only pin driver, safe default-off state, authenticated and
  boot/device-bound supervisor, explicit configuration and finite deadlines.
* Reconcile selected PPM/Android AP/WebApp input ownership with motor-test
  ownership. Implement any physical Android WebRTC bridge as a separately
  authorized path; do not reuse simulator input implicitly.
* Change status/ACK/serial contracts and every consumer so `MOTORS=OFF`,
  `motorsDisabled`, `motorsArmed` and input-arm cannot falsely report a safe
  state. Old clients must fail closed on new capabilities.
* Add WebApp configuration, calibration wizard, diagnostics, scoped Python
  API and Android status/control with reliable STOP and session expiry.
* On a known-good separate C6 board, props removed, verify actual PPM loss,
  exact connector pin mapping, PWM frequency/pulse widths, bounded outputs,
  SimonK beep sequence, watchdog reset, unexpected power loss, STOP, all
  transports and cross-source rejection. Then test the corrected A2 board.
* Only after implementation and required tests: build signed artifacts, wait
  for exact-source CI and merge. Physical acceptance must never be inferred from
  a host test or a successful CI run.
