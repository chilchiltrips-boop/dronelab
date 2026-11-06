# A2 Acro Readiness — read-only propeller-free qualification

## What this change implements

- Separate PPM input ARM (receiver gesture) from Physical Flight ARM (explicit teacher-authorized USB command). **No auto-ARM** from PPM/WebApp/Android.
- Explicit operator-saved ESC endpoint confirmation required by physical flight policy, **distinct** from a persisted automatic ESC timing sequence. It is an *operator record*, not verified electrical acceptance.
- Fail-closed flight gate with explicit `ESC_UNCONFIRMED`, wiring, 250 Hz scheduling, IMU freshness, PPM-only input, LOW throttle, PWM-OFF acknowledgement, STOP and watchdog requirements.
- Armed low throttle is the ESC's **1000 µs minimum**, not a spin-idle promise; failsafe/STOP/disarm use PWM OFF. `ZJ_FLIGHT_ARMED_IDLE_US` centralizes the value. Motor start thresholds are not assumed valid until measured.
- Authenticated `GET /api/flight/readiness` and physical USB `ZJFLIGHT,STATUS` return per-condition diagnostic evidence. P-only motor geometry predictions are at an artificial 1500 µs reference and **never** submitted to the ESC driver.
- Firmware Center `Read A2 Acro status` works over verified AP/STA sessions or physical USB serial; no popups and no ARM button.

## Acro direction checklist (Quad X, body gyro positive with centered sticks)

- Positive gyro Roll: PID correction negative → M1/M4 relative output *up*, M2/M3 *down*.
- Positive gyro Pitch: M1/M2 *up*, M3/M4 *down*.
- Positive gyro Yaw: M1/M3 *up*, M2/M4 *down*.

The above is a **mathematical contract**, not proof of the actual mounted IMU axis, ESC rotation, propeller direction or actual motor pulses. With propellers removed, physically move the A2 in each direction and compare observed gyro signs with the predicted columns. If an axis/motor sign is reversed, stop; never rely on tuning to compensate.

## Controlled validation still outstanding

Collect signed board- and source-hash-bound physical evidence for ESC 1000–2000 µs pulse widths at 50 Hz; motor mapping/rotation, MPU mounting/orientation, ESC minimum start thresholds, PPM receiver loss, emergency STOP/ISR watchdog under stalled main loop, IMU loss, PID invalid, deadline misses and all output-off latencies. Only subsequently consider a separate physically qualified Acro release.

`ZJ_FLIGHT_HARDWARE_QUALIFIED=false` remains immutable in all current builds. A software check or `inputArmed=true` **cannot** authorize real-flight actuation.
