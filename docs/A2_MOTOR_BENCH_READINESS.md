# A2 motor setup — FlightCore 1.6.0

A2 D0–D3 outputs are integrated with the production firmware, Setup Wizard and
Python Lab. This is a bounded, propeller-free bench feature, with no flight
mixer or attitude stabilization. A1 reports motor setup unsupported.

## Operation and protocol

The fixed A2_QUAD_X preset uses 50 Hz PWM with 1000–2000 us endpoints. The user
must verify that the ESC supports this profile. Motors have dedicated LEDC
channels 0–3 on timer 0; the onboard LED uses channel 5. Startup emits no pulses.
The ESP timer supervisor stops channels if the main output service misses a
100 ms deadline; that trip requires a new explicit setup session.

USB ZJMOTOR and encrypted POST /api/motor share the same command handler.
BEGIN requires props/pin/profile confirmations, low disarmed input, and either
USB Teacher Unlock or an authorized network control session. STA observer
and automatic Android Relay access cannot operate motors. The random session
is bound to its caller and boot; it is never broadcast. KEEP expires after
1500 ms. SINGLE/ALL are limited to 2 s and 1200 us. CAL_HIGH has a 15 s deadline;
CAL_LOW ends after 3 s. INPUT is limited to 30 s, ends on producer/path/radio
change, and uses firmware input freshness (PPM 150 ms; network 300 ms).

PPM uses the low-throttle yaw gesture; Android AP and WebApp use their input
ARM at low throttle. WebRTC remains a simulator source outside an explicit
bench session. Inside an explicitly started bench, the authorized browser
forwards only new fresh frames from the locked paired phone to the selected
STA A2. CH5 low is required at start; CH5 high enables the bounded output.
Stale/repeated frames, a changed peer, STOP or loss cannot restart a test.

Input ARM and motor-output state are distinct. Network and serial reports use
live output state. The extended USB status adds output-enabled/output-armed
flags; legacy decoders reject unknown active records instead of confirming OFF.
The native Android RC ACK does not contain motor state and now reports it as
unknown; signed /api/status is authoritative. Old Android clients must update
before using physical bench outputs.

## WebApp and Python

Setup Wizard: Board → Wiring → Input → ESC calibration → Motor test → Report.
The report distinguishes user observations from commanded pulse outputs.
Python examples are in the existing examples menu. Use:

```python
from zebjus_simple import Drone

drone = Drone()
async with await drone.motor_setup() as setup:
    print(await setup.set_layout("A2_QUAD_X"))
    print(await setup.test_motor(motor=1, pulse_us=1050, duration_ms=800))
```

Use a fresh setup session for each timed output operation. `calibrate_esc()`
provides interactive battery/tone confirmations; `test_input(source="selected",
duration_ms=10000)` runs the selected source. Python Stop, completion, error,
worker liveness loss and page hiding close the motor session. Firmware deadlines
also apply when the browser cannot send STOP. Acknowledged output is not measured
rotation/RPM. Browser dialogs do not prove physical preconditions.

## Verification status

Production-handler host tests cover authorization, ownership, NVS, finite tests,
calibration, stale inputs, source changes, replay rejection and STOP. Shared
client tests cover boot/device/transport binding and cancelled starts. Browser
CI exercises the rendered wizard using a clearly simulated board.
Physical PWM timing, watchdog behavior on a real C6, wiring, ESC tones and actual
motor stopping remain **NOT RUN** in this environment. A physical power cutoff
and propeller-free bench acceptance are required before hardware qualification.

## Hardware evidence that must be reconciled before physical output

The earlier `A2_PCB_Review.pdf` and `A2_Gerber_Review.pdf` reviewed an October
23, 2026 EasyEDA source/export. They are not proof of the current board revision.
The requested motor layout, with the aircraft facing forward and direction
viewed from above, is:

| Motor | Position | XIAO pin | Rotation |
| --- | --- | --- | --- |
| M1 | Front left | D0 | Clockwise |
| M2 | Front right | D1 | Counterclockwise |
| M3 | Back right | D2 | Clockwise |
| M4 | Back left | D3 | Counterclockwise |

The requested pin order matches the dated source review's ESC1 -> D0/GPIO0,
ESC2 -> D1/GPIO1, ESC3 -> D2/GPIO2, ESC4 -> D3/GPIO21, but differs from the
earlier standalone sketch's {D1,D2,D3,D0}. The logical layout in
`FlightCoreA2MotorLayout.h` does not configure or drive pins. Verify each
physical connector and direction on the actual PCB; the requested mapping is
not evidence of a completed bench test. PWM does not set motor direction;
the ESC/motor wiring or supported ESC configuration determines it.

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

## Physical acceptance still required

On the current corrected A2 board, verify the actual D0–D3 connector map, 50 Hz
frequency and pulse widths, low/no-signal stop behavior, PPM and network loss,
Python/browser termination, watchdog trip, calibration tones, reboot and power
loss. Record each observation against the board revision and running firmware.
CI success does not establish hardware or flight acceptance.
