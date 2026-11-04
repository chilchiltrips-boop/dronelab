# A2 automatic power-on ESC calibration

FlightCore 1.7.10 adds an APM/Pixhawk-style, one-use power-on request to the
existing authenticated USB/AP/STA Wizard API. The Wizard order is Board,
Wiring, Inputs, IMU Calibration, Output Signal, Output Calibration, Report,
ESC Calibration. Each editable page retains its own verified Save operation.

## Operator workflow

1. Remove every propeller. Save and verify the motor wiring. Lower throttle,
   disarm input, and stop other calibration/maintenance operations.
2. On the final ESC page, confirm the procedure and select **Prepare automatic
   calibration**. Verify **Request saved — awaiting full power cycle**. PWM
   remains off. This invalidates the previous ESC confirmation and clears the
   starting pulses, since changing ESC endpoints changes their interpretation.
3. Disconnect **both LiPo and USB**, allowing the controller and all ESCs to
   power fully off. A software reboot, RESET button or PWM-off command does
   not establish that ESC power was disconnected.
4. Reconnect LiPo only. An eligible controller power-on consumes the request
   durably before HIGH. The independent motor timer sends 2000 us for 5 s,
   1000 us for 5 s, then disables all four PWM outputs. No app connection,
   input ownership, transmitter gesture or network keepalive drives this run.
5. Allow at least 15 seconds after reconnecting LiPo and listen for the ESCs'
   own success tones before disconnecting LiPo. If anything is unexpected,
   disconnect power immediately. Header **STOP outputs** is available whenever
   a verified connection is present; physical power removal aborts an offline
   attempt.
6. Reconnect the A2 by USB to read its result, or normally power on and reconnect
   AP/STA. **Read calibration result** reads the board's persisted attempt.
   Confirm success tones from all four ESCs and LiPo disconnection, then **Save**.
   Only configuration readback produces **✓ Saved on board**.
7. For a first setup, Output Calibration can be skipped to reach the final ESC
   page. After saving ESC confirmation, use **Return to Output Calibration** to
   find and save each motor's stable starting pulse. Return to Report or the
   final page to review the saved setup. Navigation never starts outputs.

## What can be read

`WIZARD_STATUS.autoEsc` reports API version, attempt ID, persisted state,
reason, current HIGH/LOW/OFF phase, remaining time, compatible saved wiring,
result persistence, and driver-acknowledged PWM stop (`offVerification:
LEDC_STOP_ACK`). `SEQUENCE_COMPLETE` proves that the controller completed its
timed sequence. It does **not** prove ESC endpoint acceptance or motor rotation.

This PWM connection has no ESC reply channel, microphone, battery-power sensor
or per-motor RPM sensor. `toneDetectionSupported` is false. ESC acceptance is
recorded as an **operator confirmation**, separately from the controller's
sequence result. Changing the app's stored record does not read or erase the
endpoints stored inside the ESCs themselves.

## Persistence and interruption rules

- `escAuto1` is a canonical, read-back-verified NVS record bound to immutable kit
  identity and saved wiring. It is separate from editable Wizard configuration.
- The state changes from `AWAITING_POWER_CYCLE` to `RUNNING` and is read back
  before enabling HIGH. A `RUNNING` record never starts outputs again on reboot.
- Only controller `ESP_RST_POWERON` is eligible. Software, watchdog and brownout
  reset causes leave a prepared attempt incomplete. Reset cause alone cannot
  establish ESC power loss; the operator must follow the full power-off step.
- A timer delay beyond the phase's deadline tolerance cuts PWM and fails the
  attempt instead of replaying missed phases. Output-driver errors, STOP,
  incompatible setup, invalid records and failed consume writes fail closed.
- A completed result is written only after the motor driver acknowledges OFF.
  Failed result storage never sets ESC confirmation. An explicit OFF-only retry
  is available while that completed sequence remains in RAM. A reboot before
  result persistence leaves the attempt incomplete.
- Save verifies authorization, kit boot, revision, attempt, compatible wiring,
  operator confirmation and outputs off. Lost responses are resolved by board
  readback before another write. Normal saved boots have no automatic output.
- Reset ESC also clears starting pulses and cancels the old attempt proof.
  Reset all retains pairing, Wi-Fi credentials and unrelated board settings.
- Legacy non-Wizard motor API callers keep their existing authorized HIGH/LOW
  session, ownership, timeout and watchdog behavior.

## Reference and validation

Reviewed [ArduPilot ESC calibration documentation](https://ardupilot.org/copter/docs/esc-calibration.html)
and [ArduCopter's implementation](https://github.com/ArduPilot/ardupilot/blob/master/ArduCopter/esc_calibration.cpp).
Its automatic routine clears the startup request, emits HIGH for 5 s and holds
LOW until restart. A2 uses an original implementation with bounded 5 s LOW and
PWM off, preserving the existing bench-only authorization boundary.

Host tests execute the actual A2 command header and timer logic using simulated
NVS, clock and output-driver doubles. Browser checks simulate power-cycle
reconnection, final-page navigation, result confirmation, lost acknowledgements,
page saves, output calibration, reset and mobile layout. Real A1/A2 compiler
builds and release hashes are checked separately by CI.

**Physical A2 bench verification: NOT_RUN.** Before hardware acceptance, verify
the selected ESC model's 5 s HIGH/LOW compatibility, power-on capture timing,
actual pulse waveform and OFF state, ESC tones, interruptions during both
phases, USB/AP/STA recovery, saved-result power cycles, and starting pulses.
The automated checks do not certify those physical observations.
