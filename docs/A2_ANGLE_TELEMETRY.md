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

## Control timing recovery

An A2 1.7.22 Angle capture recorded fresh PPM and IMU data at the first flight
tick, with a 3,999 µs interval. The timer was waking 3,307 µs into the scheduler's
4,000 µs period, leaving 693 µs before the software deadline. The driver reported
`DEADLINE_MISSED` 1,129 µs into that tick and acknowledged PWM OFF.

ESP Timer can move a periodic alarm to a new phase after skipping expired
alarms. FlightCore 1.7.23 rearms a one-shot alarm on the original 250 Hz grid.
After a stall, the worker processes one observation and counts skipped releases.
The scheduler reports an unhealthy tick when its execution crosses the next
deadline. The output driver still stops on a real deadline miss or expired lease.

## PPM flight isolation in 1.7.24

The 1.7.23 Angle trace stopped when the main-loop PPM snapshot was 152 ms old,
past its 150 ms freshness limit. The receiver sequence later continued.
The armed PPM lease now receives calibrated, mapped frames from the RMT task.
It retains the low-throttle yaw DISARM gesture and rejects a hardware capture
gap or expired frame. USB release and network controller claims are scoped to
their own input paths. Radio restart and I²C scanning defer while outputs are in
use. The original cutoff reason stays visible after a later ARM rejection or
DISARM.

The PID scheduler targets 250 Hz and uses a measured 1–8 ms interval. A missed
nominal release increments timing counters. Flight output requires valid
controller timing and a successful driver update within the existing 8 ms
lease, checked both before and after writing PWM. STOP and receiver, IMU and
driver fault protections continue to revoke output. The 50 Hz, 14-bit ESC signal
has a separate 20 ms period.

The WebApp shares one periodic read slot across Flight Data, receiver
monitoring and full status. It starts at most one such read per 100 ms and
waits for the outstanding read before starting another. Verified connection
loads board status, and Setup/PID writes require an explicit action. The
Android AP controller keeps its independent 20 ms signed UDP stream and
500 ms firmware input deadline.

## Downloadable 1.7.24 candidate

The separately verified 1.7.24 images remain available at their versioned
download URLs. Ordinary Auto Load selects the 1.7.19 bench rollback. The
1.7.15 published images and older experimental download URLs remain available.

- Compiled source `0367d2e5eebb0b7c1f8466a9abd00e900c708e85`
- Build workflow [42523987273](https://github.com/chilchiltrips-boop/dronelab/actions/runs/42523987273)
- APP build ID `1.7.24-ZFC-A2-3d050967c7fe`
- APP SHA-256 `3d050967c7fed5dc65d1d4b4e87d398b1172c928acb4336c8384e6295b514c5a`
- Verified APP and Factory sizes are 1,367,872 and 4,194,304 bytes respectively.
- Physical board flashing, timing under load, ESC response and actual flight: **NOT_RUN** for this integration.

## Attitude recovery in 1.7.25

Closely spaced valid IMU samples keep the last valid attitude estimate. The
next update uses the elapsed time since the last accepted sample. The 12 ms
sample-age limit and 500 ms gravity-correction limit still apply. Flight Trace
exports the specific estimator rejection and its timing when the FC revokes
outputs for `ATTITUDE_INVALID`.

Flight Data labels delayed browser observations `MONITOR DELAYED` and can
display the last verified pose for up to two seconds. A reported invalid
estimate clears the pose. Missed reads and automatic reconnection are
read-only. Physical acceptance for 1.7.25 is **NOT_RUN**.

Select **Load 1.7.25 Acro + Angle** in Firmware Flash for the verified
experimental APP or Factory image.

- Compiled source `c00fa717fb42986ec03df92a041cc46c1601e5ee`
- Build workflow [42568128641](https://github.com/chilchiltrips-boop/dronelab/actions/runs/42568128641)
- APP build ID `1.7.25-ZFC-A2-c77eb3e8029d`
- APP SHA-256 `c77eb3e8029dda265ad8d6fb140a498356daca8afe05a9efe7d0db1f4a4df7a8`
- Verified APP and Factory sizes are 1,446,272 and 4,194,304 bytes respectively.

The control worker derives its first expected tick from timer activation. A
missed period enters failsafe without replaying old ticks. Live Inputs and the
Kit header share the accepted RC observation. Motor replies can update raw PPM
health during calibration without refreshing accepted stick values. The monitor
distinguishes delayed observations, waiting for a receiver and FlightCore-reported
receiver loss. Flight Data shows the reported flight fault beside the output state.

Host regression, source/asset validation, Wizard/PID/Android control browsers,
16-width layout checks and actual binary import/download tests are software
evidence only. The acceptance ledger adds Angle level/reboot, correction signs,
compact telemetry latency and Android Angle loss cases; it does not mark them PASS.
