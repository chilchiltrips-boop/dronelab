# Working flight controller integration — 1.7.27

The supplied, working sketch is retained byte-for-byte in
`FlightCore_Firmware/reference/ZebjusWorkingFlight.ino.txt`.
Its SHA-256 is `f05c503dc2aa050ee864d9b7557a6d0685717c9f41c51dd4012da1b97b46e909`.
The integrated controller uses its PID equations, independent 1D Kalman filters,
Quad X mixing order, stick scales, PWM conversion and PPM mode/gesture timing.
`tools/working-flight-reference.test.mjs` extracts functions from that original
file and compares their numerical results with the integrated firmware.

| Setting | Working configuration |
| --- | --- |
| Board / receiver | XIAO ESP32-C6; PPM D10 / GPIO18; 8 channels |
| Motor order | M1 D0, M2 D1, M3 D2, M4 D3 |
| MPU6050 | SDA D4, SCL D5; 400 kHz; gyro ±500 °/s; accel ±8 g |
| Fresh-board accel offsets added to readings | X −0.10 g, Y +0.03 g, Z +0.12 g |
| Controller / PWM | 250 Hz; 12 bits; 1000 µs = 1024 duty, 2000 µs = 2048 |
| Rate roll / pitch PID | 0.9 / 15 / 0.03 |
| Rate yaw PID | 3 / 15 / 0 |
| Angle roll / pitch PID | 3 / 0 / 0 |
| Stick scales | Angle 0.10 °/µs; Rate / yaw 0.15 °/s/µs |
| Flight mode | Mapped AUX (default CH5) <1400 Angle; >1600 Rate/Acro; centre retains mode |
| PPM ARM | Throttle <1050 and yaw >1900 for 5 s |
| PPM DISARM | Throttle <1050 and yaw <1100 for 1 s |
| Automatic DISARM | Low throttle without significant movement for 15 s |
| Flight output | Throttle capped at 1800; motor pulses 1180–1999; armed low throttle 1000 |

Quad X motor commands, before limits, are `T+R-P+Y`, `T-R-P-Y`,
`T-R+P+Y`, `T+R+P-Y` in D0–D3 order. Saved motor mapping remains authoritative.
The separately selectable Quad + diagnostic profile retains its own mixer.

## Input, connections and persistence

PPM, Android AP and direct Web STA feed the same flight worker. The existing
verified input selector prevents competing owners. PPM capture uses the firmware's
existing independent D10 RMT adapter, rather than running a second receiver ISR.
Android WebRTC remains simulator input. AP/STA transitions retain signed identity,
saved Wi-Fi profiles and explicit input handover; losing a browser observation
does not fabricate physical receiver loss.

The existing WebApp PID tab and Android **Menu → More → Flight PID** read and save
all 15 gains. Saving checks Kit/boot/connection identity, revision and active
generation, persists a transactional dual-slot record, and independently reads
it back. A lost ACK is reconciled using its request ID; mismatched readback is an
error. Android saves require released joystick ownership and outputs off.
Defaults load into the editor and require an explicit save. Saved values reload
on reboot and take precedence over defaults. Existing saved sensor calibration
also takes precedence over the fresh-board offsets above.

The simulator shares the PID equation and gain profiles; its virtual motor plant,
exercise limits and display coordinate system remain a simulation model.

## Integration guards and release status

The complete firmware is not a literal replacement by the standalone sketch:
communication, persistent settings and these existing protection adapters wrap
the working controller. STOP, DISARM, receiver loss, invalid IMU, invalid timing,
PID faults or output lease expiry revoke PWM. Normal DISARM therefore uses PWM
OFF, while the standalone sketch continuously sends 1000 µs. Receiver recovery
requires low throttle and centred yaw before a new ARM gesture. Frame freshness,
finite-value checks and bounded timing remain enforced. Setup/calibration and
saved-PID interlocks remain required. Automatic ESC calibration is a separate,
explicit setup operation and is never run as a normal startup step.

Source version is 1.7.27; Android source is 1.8.43 (versionCode 82). The normal
catalog remains the held bench release. The separate experimental build enables
the integrated flight path without asserting physical qualification. Host and
software checks do not establish real-board flight acceptance. Physical acceptance
for this integrated candidate remains **NOT_RUN** until tested on the connected kit.
