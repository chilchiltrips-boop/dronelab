# A2 Setup Wizard to PPM Rate ARM

The 1.7.20 source reconciles the main-branch Setup/Acro changes with the STOP fixes from PR #158. A2 has two explicit build profiles. **Bench** keeps flight outputs disabled. **Experimental PPM Rate** connects the existing saved setup, PPM ARM gesture, calibrated gyro, Rate PID and motor driver. A build flag does not mean hardware qualification. Physical acceptance remains `NOT_RUN` in both profiles.

## Operator flow

1. In **Devices & Firmware → Firmware Flash**, choose **Application image** for a compatible installed A2, then **Load Experimental Rate**. Firmware Center checks the file size, SHA-256, ESP32-C6 image and embedded build identity against the published 1.7.20 catalog. To use a local file, import the [pinned APP](../FlightCore_Firmware/experimental/1.7.20/ZEBJUS_FLIGHTCORE_A2_APP_RATE_EXPERIMENTAL.bin). Review the **EXPERIMENTAL RATE LOADED** badge and use the existing authorized USB or Wi-Fi flash action. APP OTA preserves compatible setup and PID storage. Factory is for USB recovery or first installation. **Auto Load Latest** still selects the bench package.
2. Complete the existing Setup Wizard with propellers removed. Save wiring, run the existing one-use ESC power-cycle sequence, and capture/save all four observed output minimums. A controller sequence result and an observed minimum are software/operator records; neither proves correct propeller installation or flight stability.
3. Load/save the matching Aerof450 Quad X or Quad + PID profile. Temporary PID preview values do not authorize flight. Select **PPM** and **Acro/Rate** using the existing input/mode controls. Angle and WebRTC remain unsupported for physical flight. Android/Web input ARM remains diagnostic; these clients display the physical PPM output status from the FC.
4. After every reboot, loss, STOP or failed ARM attempt, supply fresh disarmed PPM frames. At throttle ≤1050 µs, perform the existing low-throttle/yaw-right ARM gesture. The FC checks saved setup, saved PID/profile, wiring, ESC readiness, calibrated/fresh gyro, scheduler health, exclusive output ownership and driver OFF acknowledgment. No second USB ARM command or qualification checkbox is required.
5. If accepted, the experimental firmware can send motor PWM when throttle rises. Low throttle resets PID/mixer feedback and sends 1000 µs while armed. DISARM/STOP/failsafe disables PWM. There is no assumed 1180 µs spin idle. An unsuccessful attempt is consumed; correcting a condition while holding ARM does not silently enable outputs.

This flow is implemented in software. **Do not treat Wizard completion or a preset as evidence of stable flight.** Propeller-free measurements of motor order/direction, restoring correction signs, PWM, loss/STOP behavior and timing are still required before a controlled first flight.

## Retained controller contract

- 250 Hz measured-dt Rate calculation; 0.15 °/s per µs stick offset, ±15 µs deadband, ±75 °/s maximum.
- Calibrated gyro values are used once. Separate axis states, trapezoidal I, filtered derivative on measurement, saturation and mixer feedback.
- Saved Quad X/+ geometry and M1–M4 mapping. 1800 µs throttle cap; mixed pulses constrained to 1000–2000 µs.
- Existing **50 Hz / 14-bit ESC PWM** and independent 8 ms flight-output lease/watchdog. Neither the task nor this update changes ESCs to 250 Hz.
- PPM loss, disarm, source change, stale IMU, invalid PID, STOP and missed deadlines stop output. No catch-up tick replay, flash write or serial logging in the control worker.
- Existing 50 Hz / 10-second RAM trace and exact terminal tick remain available after disarm. Reboot clears the RAM recorder.

## Status and protocol

`GET /api/status` now contains a signed `flight` object with `enabled`, `qualified`, `inputScope`, `setupComplete`, `pidSaved`, `authorized`, `canArm`, `state`, `blockReason` and `lastArmReason`. `enabled` describes the build capability; `authorized` describes a current driver lease. `qualified` remains false. `canArm` evaluates preconditions before the gesture; it does not arm anything.

`GET /api/flight/readiness` and `ZJFLIGHT,STATUS` retain detailed read-only diagnostics. Old `ZJFLIGHT,ARM` requests return `USE_PPM_ARM_GESTURE`, preventing a USB command from rearming an input still held ARMED after a failsafe. STOP failures return `output_off_unverified`; an OFF label requires driver confirmation.

Wizard ESC readiness accepts the existing persisted automatic sequence or legacy operator record. It no longer demands the obsolete tone-confirmation flag after successful automatic setup. Setup completion is independent of whether PWM is currently OFF, so arming does not invalidate saved setup.

## Build and qualification boundary

```sh
python3 tools/build_scanner.py                         # ordinary A2 bench
python3 tools/build_scanner.py --skip-core-install --board ZFC-A2 \
  --experimental-rate-flight --output-dir /tmp/a2-rate-experimental
python3 tools/verify_experimental_rate.py /tmp/a2-rate-experimental
```

The reviewed [1.7.20 package](../FlightCore_Firmware/experimental/1.7.20/) includes its exact source and Actions provenance. Run `python3 tools/verify_experimental_rate.py FlightCore_Firmware/experimental/1.7.20 --pinned` to verify it after later publication commits. The experimental artifact has distinct filenames, an embedded output-profile marker, exact compiler flags, full source hashes and APP/FACTORY hashes. Its build cannot write the normal firmware catalog. The strict physical release validator and production publication hold remain in force.

Automated tests execute the actual 250 Hz worker, ARM function, PID/mixer and LEDC driver against host doubles. They exercise setup persistence, automatic ESC readiness, low throttle reset, STOP, disarm, PPM/source loss, stale IMU, invalid PID, deadline faults, watchdog and driver errors. These are software tests, not measurements of a board, ESC or motor.
