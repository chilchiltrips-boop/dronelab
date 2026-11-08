# A2 Acro / Angle and compact telemetry — 1.7.21 source

This integration is software-tested separately from hardware acceptance. A new
firmware build is not evidence of stable flight. The standard bench image keeps
flight output disabled; the separately compiled experimental image permits the
existing setup-gated output lease. Its physical acceptance remains `NOT_RUN`.

## Controller and calibration

The existing measured 250 Hz scheduler consumes one fresh calibrated MPU6050
sample and the selected receiver snapshot. No busy wait, serial output, network
request or NVS write runs in the control worker. The independent 8 ms motor lease
and watchdog remain authoritative. Motor mapping is D0/D1/D2/D3 (FL/FR/BR/BL),
using the saved Quad X / Quad + geometry, 50 Hz / 14-bit ESC driver and pulse µs.

Acro uses the existing 0.15 deg/s per µs stick mapping (±15 µs deadband, ±75 deg/s).
Angle uses ±50° roll/pitch setpoints (0.10° per µs with the same deadband), an
outer Angle PID limited to ±220 deg/s, and the same three inner Rate PIDs. Yaw
remains rate-only. The outer integral accumulator is bounded to ±45 degree-seconds;
its derivative-on-measurement filter is 100 ms. Inner gain units, filtered D,
conditional integration and mixer saturation feedback retain the shared Rate
contract. Existing saved gains are never replaced on upgrade.

The new first-boot/Restore Defaults Aerof450 profiles use the operator-supplied
sketch values: roll/pitch Rate **0.9 / 15 / 0.03**, yaw **3 / 15 / 0**, roll/pitch
Angle **3 / 0 / 0**. They are candidates, not transferable proof of stability.
Simulator dynamics and stick ranges remain educational; equal PID numbers do
not promise equal aircraft response.

The roll/pitch estimator uses the existing bias-corrected gyro and calibrated
accelerometer with saved Quick Level trim. It seeds from observed gravity,
integrates body rates with Euler coupling, then applies the sketch's 1D Kalman
correction (gyro uncertainty 4 deg/s, acceleration noise 3°) with measured sample
dt. Repeated samples are never integrated twice. Implausible gravity outside
0.9–1.1 g is rejected; gyro prediction expires after 500 ms without gravity.
Invalid timing, sensor data or pitch outside ±80° invalidates the estimator.
Calibration changes re-seed it. There is no absolute yaw/compass heading.

Angle ARM requires a saved Quick Level calibration and valid attitude in addition
to saved setup/PID, correct layout, ESC readiness, fresh input/gyro, healthy timing,
low throttle and driver OFF acknowledgment. Low throttle ≤1050 µs resets both
loops and mixer feedback and requests 1000 µs while armed. DISARM, STOP, source
loss, stale IMU, deadline fault or failed driver update turn PWM OFF. A failed ARM
attempt is consumed: holding ARM cannot re-enable outputs after recovery.

Android HTTP confirms a neutral disarmed frame before its armed frame. Native
UDP starts each new claim with three neutral disarmed sequences (40 ms span),
then sends the latest explicitly requested ARM. If all neutral frames are lost,
the FC cannot see a fresh edge and remains disarmed; repeat an explicit ARM
attempt. Missing feedback never counts as confirmed physical ARM.

## Setup Wizard and inputs

The existing Inputs step now has source and saved flight-mode selectors. Saving
an input stores a complete NVS radio/input profile, verifies readback, then revokes
the previous lease. Boot restores the selection, never ownership or ARM. A PPM
source can be selected with its transmitter OFF; it remains waiting for frames.
Open **ACC / Gyro Calibration** at step 4 or from **Inputs** or **Report**.
With the input disarmed and PWM OFF, confirm the frame is stationary and wait
for gyro readiness. The gyro measures its bias at each boot. Use **Calibrate
Gyro** to repeat the measurement if the frame moved at power-on.

**Start six-position calibration** guides the user through +Z, +Y, −Y, −X, +X,
and −Z pointing up. Hold the frame still before each **Capture pose**. The
Wizard advances only after the FC verifies the requested capture. Select
**Save six-position fit** after all six poses. The Wizard verifies the saved
model by readback.

In **Level Horizon**, place the assembled frame in its level flying position
with +Z up. Confirm it is level and still, capture **Quick Level (+Z)**, and
select **Save ACC calibration**. A new fit or a change to the manual offsets
calls for a fresh Quick Level before Angle.

References: [ArduPilot accelerometer and level calibration](https://ardupilot.org/copter/docs/common-accelerometer-calibration.html)
and [PX4 Level Horizon](https://docs.px4.io/main/en/config/level_horizon_calibration.html).

| Path | Available radio | Current physical behavior |
| --- | --- | --- |
| PPM | AP or STA | Fresh low-throttle yaw ARM gesture requests the flight lease |
| Android AP | AP | Existing authorized native input ARM requests the flight lease |
| WebApp STA | STA | Firmware supports authorized input ARM; existing simulator/diagnostic forwarding continues to strip virtual ARM |
| Android WebRTC | STA | Simulator only; selecting or observing packets cannot authorize physical flight |

The last two paths must not be described as an end-to-end flight controller UI.
Adding a physical WebRTC route needs an explicit local transport, ownership,
latency, drop/reconnect and ARM acceptance contract. Internet control is out of scope.

## Read-only compact telemetry

`GET /api/flight/telemetry` uses the existing authenticated/signed serialized
transport. USB uses `ZJFD,GET,<kitId>,<token>` and returns
`ZJFD,ACK,<kitId>,<token>,<JSON>`; malformed requests receive `ZJFD,NACK,...`.
`/api/status` advertises `flightTelemetryVersion:1`. No observation renews input
freshness or output authorization.

Version 1 includes immutable Kit ID, boot ID, control/sample sequences, FC
timestamp and IMU age, gyro rates, level-corrected gravity, fused roll/pitch and
validity, saved/active/pending flight mode, output owner, applied pulses, OFF ACK,
flight state/reason, tick dt, measured Hz, missed ticks and deadline fault.

Visible WebApp Flight Data requests at most 10 Hz; Android reads at most about
6.7 Hz without interrupting its independent UDP sender. Requests remain serialized
under the existing session counters. Pending work, hidden pages and maintenance
suppress extra reads; failures back off 1.5 s. Identity, boot, transport and
connection generation bind every response. Duplicate or older sequences cannot
refresh timestamps. The display expires fused tilt at 500 ms and rejects RTT
over 350 ms, exposes RTT and sample age, and interpolates received orientations
over 100 ms with animation frames. It does not invent sensor samples. Slow links
can therefore still show a delayed/unavailable display.

USB now carries acceleration, attitude, mode and OFF ACK, unlike the older
gyro-only stream. Legacy firmware retains its labeled disarmed accelerometer
preview. The PFD negative pitch labels are corrected and the gyro history holds
a real 60-second window, bounded to 1200 samples. GPS, speed, altitude, battery and
absolute heading remain unavailable, rather than simulated physical telemetry.

## Verification before physical flight

Automated checks cover both actual Acro/Angle control-worker paths, low-throttle
reset, disarm, STOP, source/IMU loss, timing spike, watchdog/driver faults, fusion
math, stale/replayed telemetry, source persistence and browser rendering. They
use host doubles, not a spinning motor or a physical board.

For the exact new artifact, record USB/AP timing under load, gravity/gyro axis
signs, level calibration/reboot, propeller-free M1–M4 correction signs in both
modes, PWM frequency/pulse widths, output OFF response, receiver/native Android
loss, and fresh-arm recovery. Verify loaded build ID/hash and saved mode before
powered testing. Preserve the published/bench rollback images. Physical evidence
must identify the tested artifact; setup completion alone cannot certify flight.

## Downloadable 1.7.21 candidate

Firmware Center's **Load 1.7.21 Acro + Angle** action selects the separately
verified candidate. Ordinary Auto Load retains the 1.7.19 bench rollback.
The 1.7.15 published images and 1.7.20 experimental download URLs remain intact.

- Compiled source: `6c668b7f22530b5d0374373bdec18e6909931688`
- Build workflow: [42410735204](https://github.com/chilchiltrips-boop/dronelab/actions/runs/42410735204)
- APP build ID: `1.7.21-ZFC-A2-32d3a756696d`
- APP SHA-256: `32d3a756696d4c89b53c78bda265323753c83e21f0be1a710d68eae52f4cda0b`
- APP: 1,366,464 bytes; Factory: 4,194,304 bytes; both exact hashes verified.
- Experimental compile: 69% of APP slot; globals 133,000 bytes (40%), before dynamic task/heap allocation.
- Physical board flashing, timing under load, ESC response and actual flight: **NOT_RUN** for this integration.

Host regression, source/asset validation, Wizard/PID/Android control browsers,
16-width layout checks and actual binary import/download tests are software
evidence only. The acceptance ledger adds Angle level/reboot, correction signs,
compact telemetry latency and Android Angle loss cases; it does not mark them PASS.
