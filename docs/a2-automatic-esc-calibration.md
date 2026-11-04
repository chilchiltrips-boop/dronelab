# A2 automatic power-on ESC calibration

FlightCore 1.7.12 stores an APM/Pixhawk-style, one-use power-on request and its
controller sequence result through the authenticated USB/AP/STA Wizard API.
The Wizard order is Board, Wiring, Inputs, IMU Calibration, Output Signal,
ESC Calibration, Output Calibration, Report. Wiring, accelerometer settings
and starting pulses retain their page Save actions. The automatic ESC result
is stored by firmware; it needs no tone checkbox or separate ESC Save.

## Operator workflow

1. Remove every propeller. Save and verify the motor wiring. Lower throttle,
   disarm input, and stop other calibration/maintenance operations.
2. With A2 powered and connected, select **Prepare automatic calibration**.
   One approval confirms propeller removal, wiring, low throttle and disarmed
   input. Verify **Request stored on A2** before disconnecting. PWM remains
   off. Preparing invalidates the previous ESC record and clears starting
   pulses, since changing ESC endpoints changes their interpretation.
3. The control connection may now be disconnected. Remove USB power if it is
   connected, and disconnect LiPo until the controller and all ESCs are fully
   off. No firmware runs while power is absent; the request survives in NVS.
   A software reboot, RESET button or Wi-Fi disconnection is not a power cycle.
4. Reconnect LiPo only. An eligible controller power-on consumes the request
   durably before HIGH. The independent motor timer sends 2000 us for 5 s,
   1000 us for 5 s, then disables all four PWM outputs. No app connection,
   input ownership, transmitter gesture or network keepalive drives this run.
5. Keep power connected until A2 stores the result after PWM OFF. Network
   startup and the timed sequence run independently: AP/STA may be available
   before or after sequence completion. If anything is unexpected, disconnect
   power immediately. Header **STOP outputs** aborts a pending or running
   attempt whenever a verified connection is present. Removing power aborts
   an offline run. Leaving or backgrounding the page preserves an acknowledged
   automatic request/run; owned manual motor sessions still stop on page exit.
6. Reconnect through AP, STA or USB. The Wizard reads the board's persisted
   attempt automatically; **Read stored result** also refreshes it. A verified
   completed sequence, matching saved wiring and acknowledged PWM OFF produce
   **✓ Controller HIGH/LOW/OFF result stored on board**. No tone confirmation
   or app-side ESC Save is required. Do not remove power during the sequence
   or before result storage has completed.
7. Select **Next · Output Calibration**. Explicitly start each bounded motor
   test to find its stable starting pulse, Stop to capture it, then Save.
   Report is the last page. Navigation and reconnect never start motor output.

The battery alone may supply the entire procedure when it powers A2 through
the correct regulator as well as the ESCs. No second supply or continuous app
connection is required. The UI requires the 1.7.12 `sequenceReady` capability
before preparing this flow; an older board displays upgrade guidance. Existing
compatible operator-confirmed records remain usable without recalibration.

## What can be read

`WIZARD_STATUS.autoEsc` reports API version, attempt ID, persisted state,
reason, current HIGH/LOW/OFF phase, remaining time, compatible saved wiring,
result persistence, `sequenceReady`, and driver-acknowledged PWM stop
(`offVerification: LEDC_STOP_ACK`). `sequenceReady` requires a verified complete
NVS record, matching kit/wiring, verified Wizard configuration and PWM OFF.
It proves controller sequence readiness for Output Calibration, not ESC
endpoint acceptance, measured electrical waveforms or motor rotation.

This PWM connection has no ESC reply channel, microphone, battery-power sensor
or per-motor RPM sensor. `toneDetectionSupported` and `escAcceptanceVerified`
are false. The result source is `CONTROLLER_SEQUENCE_ONLY`; the separate legacy
operator confirmation remains false unless an authorized legacy caller records
it. The Wizard does not fabricate that confirmation or send `WIZARD_ESC_CONFIRM`.
Check motor behavior with propellers removed during Output Calibration.
Changing the controller's record does not read or erase endpoints inside ESCs.

## Persistence and interruption rules

- `escAuto1` is a canonical, read-back-verified NVS record bound to immutable kit
  identity and saved wiring. It is separate from editable Wizard configuration.
- The state changes from `AWAITING_POWER_CYCLE` to `RUNNING` and is read back
  before enabling HIGH. A `RUNNING` record never starts outputs again on reboot.
- Only controller `ESP_RST_POWERON` is eligible. Software, watchdog and brownout
  reset causes leave a prepared attempt incomplete. Reset cause alone cannot
  establish ESC power loss; the operator must follow the full power-off step.
- A timer delay beyond the phase's deadline tolerance cuts PWM and fails the
  attempt instead of replaying missed phases. Output-driver errors, active STOP,
  incompatible setup, invalid records and failed consume writes fail closed.
- A completed result is written only after the motor driver acknowledges OFF.
  Failed result storage never sets ESC confirmation. An explicit OFF-only retry
  is available while that completed sequence remains in RAM. A reboot before
  result persistence leaves the attempt incomplete.
- Cancel retires the RAM retry proof immediately. If cancellation storage
  fails, the UI blocks another Start and says not to power cycle until Cancel
  is retried and read back. A result retry cannot restore a cancelled attempt.
- A normal STOP after verified completion keeps the stored controller result.
  Explicit cancellation, recalibration and reset invalidate it. During a
  prepared/running automatic attempt, STOP still aborts immediately.
- Minimum-pulse Save verifies authorization, kit boot, revision, captured pulse,
  compatible wiring, a stored automatic result or compatible legacy ESC
  confirmation, and outputs off. Lost responses are resolved by board readback
  before another write. Normal saved boots have no automatic output.
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
reconnection, old firmware guidance, page exit, automatic result readback, lost
acknowledgements, page saves, output calibration, reset and mobile layout.
Client regressions cover USB/AP/STA page exit while preserving manual-session
stops and explicit emergency STOP. Real A1/A2 compiler
builds and release hashes are checked separately by CI.

**Physical A2 bench verification: NOT_RUN.** Before hardware acceptance, verify
the selected ESC model's 5 s HIGH/LOW compatibility, power-on capture timing,
actual pulse waveform and OFF state, ESC tones, interruptions during both
phases, USB/AP/STA recovery, saved-result power cycles, and starting pulses.
The automated checks do not certify those physical observations.
