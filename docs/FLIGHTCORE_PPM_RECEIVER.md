# FlightCore PPM-SUM receiver — firmware 1.7.26 (hardware verification required)

## Wiring — do not confuse D10 with GPIO10
| Board | Board marking | Real MCU input | FlightCore profile |
|---|---|---|---|
| ESP32-C3 Super Mini | GPIO10 | GPIO10 | ZFC-A1 |
| Seeed Studio XIAO ESP32C6 | D10 (MOSI) | **GPIO18** | ZFC-A2 |

Receiver PPM-SUM **signal** → listed input; receiver **GND** → FlightCore GND.
Use a stable shared 3.3V reference. GPIO pins are NOT 5V tolerant; use a
proper 5V→3.3V level shifter if needed. Disconnect propellers and all ESC
motor power during initial testing. D10 is also SPI MOSI on the XIAO;
do not attach an SPI peripheral to the same pin while using PPM.
Install a suitable receiver power supply separately if its current exceeds
the board 3V3 regulator budget. Never apply receiver supply voltage to D10.

## Receiver signal
One PPM-SUM wire carries eight pulse widths, 850–2150 µs. A2 uses the built-in ESP-IDF RMT RX driver at 1 MHz, with 1 µs glitch filtering and a 2.5 ms idle delimiter. Nine separator pulses (80–650 µs) delimit eight channels, for either polarity. A dedicated receiver task rearms capture independently of HTTP/main-loop polling. A1 retains rising-edge GPIO capture with a 3200–30000 µs sync gap. The decoder
accepts **exactly eight channels** per frame (standard 20–30ms frame).
Different receiver protocols such as SBUS, CRSF, individual PWM, CPPM
with >8 channels, or nonstandard PPM timings require another decoder. A1 requires positive PPM. PPM monitoring itself never starts motors; the standard bench build keeps flight output disabled. The separately selected A2 Experimental build can start physical flight through the saved setup, PID, input ARM and runtime gates.

### Channel mapping (defaults)
| Channel | Meaning | Center / default |
|---|---|---|
| CH1 | Roll | 1500 µs |
| CH2 | Pitch | 1500 µs |
| CH3 | Throttle | 1000 µs |
| CH4 | Yaw | 1500 µs |
| CH5 | Flight mode: LOW = Angle, HIGH = Acro; never ARM | LOW ≤1300 / HIGH ≥1700 µs |
| CH6–CH8 | Auxiliary read-only | 1500 µs |

Calibration: each channel defaults to min=1000 / mid=1500 / max=2000 µs.
Measured widths are scaled piecewise (1000..1500..2000); endpoint values
are clamped into 1000–2000. Changes persist across reboots. Calibration
and mapping commands require a *physically connected USB administrator*,
and fail if a controller holds the Kit. Do not change remotely through an
untrusted Web/Android diagnostic session.

```text
ZJPPM,GET
ZJPPM,CAL,3,980,1500,2020
ZJPPM,MAP,1,2,3,4,5
```

`MAP` takes **roll,pitch,throttle,yaw,flight-mode auxiliary** receiver channel indexes,
1..8 with no duplicates. Output: `ZJPPM,ACK,CAL,<ch>` or
`ZJPPM,ACK,MAP`. After changing config, re-test throttle direction
and switch thresholds with the receiver on a bench.

## CH5 flight mode

The fifth mapped channel (AUX1, physical CH5 by default) selects **Angle at
1000–1300 µs** and **Acro at 1700–2000 µs**. A new endpoint must persist across
fresh frames for at least 60 ms. The centre range holds the last selected mode,
so a three-position switch does not chatter around its middle position. Before
an endpoint is accepted, the saved mode is the default. Transmitter reversing
can swap the physical switch positions; check the displayed pulse and active mode.

Mode switching works while armed, through the independent PPM receiver and
250 Hz flight worker. It resets the PID integrators but does not issue ARM or
change the output lease. Acro → Angle waits for saved Level Horizon calibration
and a fresh valid attitude estimate; status reports the requested Angle mode as
pending while Acro remains active. Genuine sensor/input/output faults retain
their existing motor-stop behavior. Saving a mode in the app changes the default;
CH5 controls the active mode while PPM owns the kit.

`flightModeState` now reports `source` (`PPM_CH5` or `SAVED`), `requested`,
`active`, `saved`, `pending`, and `ch5Supported`. USB `ZJSTATE,1` appends source
and requested mode after its motor flags; the WebApp accepts both the old and
extended records. After remapping AUX1, the displayed auxiliary pulse follows
the mapped channel.

## Ownership and failsafe
- Input source stays **NONE** until three successive valid PPM-SUM frames
  at low throttle (<=1050 µs). CH5 has no ownership or ARM role.
- A physical PPM owner never silently preempts active WEB/ANDROID/USB
  control. Conversely, WEB/ANDROID may not claim while PPM owns the Kit.
- After acquisition, centre yaw (1400–1600 µs), keep throttle <=1050 µs,
  and hold yaw **RIGHT** (>=1900 µs) for **2 seconds** to assert
  INPUT ARM. Hold yaw **LEFT** (<=1100 µs) at throttle <=1050 µs for
  **2 seconds** to DISARM. On the bench build the gesture changes input status only. On the
  Experimental A2 build, a fresh ARM edge can authorize physical flight only
  when the saved setup and runtime gates pass. **CH5 is not used for ARM or DISARM.**
- Complete frames retain their ISR arrival timestamp; the mailbox keeps the latest
  complete frame. Stale pending frames are discarded. Hardware capture continuity distinguishes a delayed consumer from a real receiver gap. A real gap releases control before accepting any resumed frame, so a stale yaw gesture cannot hide signal loss.
- On 150ms PPM signal loss, the PPM owner releases, channels return neutral,
  input is disarmed and the flight output lease is revoked. **PPM selection
  and STA/AP mode remain unchanged**; receiver loss never requests an automatic
  switch to Android AP. Read-only STA monitoring can report loss and recovery.
  The existing 500ms/1800ms network/USB RC deadman/lease protections remain unchanged.
- A fresh receiver signal alone does not re-arm. It must reacquire at
  low throttle, yaw centred, and the new RIGHT hold. Other sources require their own authorization.
- `ZJRC,STOP` always cancels existing controller ownership.
- Read-only `/api/rc/snapshot` includes `channels` for active accepted PPM
  and `/api/ppm/status` exposes the receiver raw/calibrated CH1–CH8,
  pin, status, age and mapping via authenticated Kit session.
- USB monitor emits `ZJPPM,1,ACTIVE|LOCKED,<seq>,ARM=0|1,CH1=...,...,CH8=...`
  at most ~10Hz if present, plus a one-time LOST event.
  Existing combined 20-field `ZJTEL` remains backward compatible.
  Setup Wizard displays raw/calibrated CH1–CH8, capture backend, measured Hz and faults independently of control ownership. Its reading monitor has no ARM/throttle gate. The separate Live Inputs control panel shows CH1–CH8 for *accepted PPM ownership*;
  a merely connected receiver does not overwrite active Android/Web values.

## PID Tuning with a PPM receiver

The WebApp becomes hardware **view-only** while the physical receiver owns the
Kit. This prevents competing Web/Android RC commands; it does not block the
read-only PID simulator. Keep Take Control off.

1. Select the correct verified Kit over STA, AP or USB. For STA, use the same
   router as the Kit. Release active Web/Android control, set throttle low and
   yaw centred, and check that Live Inputs reports accepted PPM channels.
2. Open PID Tuning. **Auto** detects the selected Kit's PPM, or explicitly
   choose **PPM RX**. The source label shows `PPM STA`, `PPM AP` or
   `PPM USB`. Receiver sticks preview without starting the virtual plant.
3. Lower throttle to 1000 µs (virtual Run accepts at most 1025 µs) and click
   **Run** in the WebApp. Move the transmitter sticks to drive the virtual
   throttle/roll/pitch/yaw. The PPM yaw diagnostic ARM does not start the simulator. Adjust simulator
   mode and PID locally; no PID, ARM or RC writes are sent to the physical Kit.
4. **Stop** stays stopped despite further receiver frames. Reported receiver
   loss, a changed producer/Kit/transport/reboot, or expired PPM mirror data
   stops and neutralizes the virtual plant. Reacquire low throttle + centred yaw,
   then press Run again. Duplicate polls cannot refresh the input age.

The browser mirror permits at most 1000 ms of telemetry age for polling jitter;
this is separate from the firmware's unchanged 150 ms physical PPM loss limit.
This feature requires a WebApp update, not a firmware or Android APK rebuild.

## On-device hardware acceptance checklist
1. Disconnect ESCs/motors/propellers; identify 3.3V versus 5V PPM levels
   with a scope or logic analyzer, common GND verified.
2. Start firmware in COMBINED telemetry; read `ZJPPM,PIN` and
   `ZJPPM,GET` over USB. Confirm A1 GPIO10 / A2 GPIO18.
3. With receiver powered off, Kit must remain NONE / disarmed; no false ARM.
4. Power RX, keep CH3 throttle low and CH4 yaw centred; ensure accepted source
   changes to PPM after stable frames. Move sticks; check CH1–CH8 and
   roll/pitch/throttle/yaw in Live Inputs via AP, STA and USB.
5. Centre yaw and keep throttle <=1050 µs. Hold yaw RIGHT >=1900 µs for
   2 seconds: verify INPUT ARM=1 and MOTOR=OFF. Vary CH5: ARM remains unchanged.
   Hold yaw LEFT <=1100 µs for 2 seconds: verify ARM=0. With throttle
   >1050 µs, a RIGHT hold must NOT ARM.
6. Cut RX power or disconnect signal: within 150ms status loses input,
   old RC values do not remain LIVE; motor output remains disabled.
7. During active Android/Web ownership connect receiver: PPM must not
   steal ownership. After release require low throttle, yaw centre and a new RIGHT hold to ARM.
8. Test mapping/calibration edits over admin USB, reboot and verify persistence.
   Reject duplicate channels, invalid min/mid/max, and edits while RC owned.
9. AP↔STA switch and Android background/foreground must not implicitly
   reinstate joystick authorization. Test Wix/WordPress with real browser
   delegation; fallback to direct top-level DroneLab if LNA/Serial blocked.

For flight-build bench verification, remove propellers and secure the kit. Confirm
CH5 LOW/HIGH changes the active mode without changing ARM, and centre holds it.
With STA connected, interrupt PPM: verify all four outputs go OFF, STA and PPM
selection stay unchanged, and signal recovery requires the full fresh ARM gesture.
Repeat at higher motor command only on a suitable secured test stand. Hardware
acceptance for this revision must be recorded separately.

`/api/status` includes `uptimeMs`, `resetReasonCode`, `resetReason`, and sticky
`staDisconnectCount`, `staLastDisconnectReason`, `staLastDisconnectAtMs` for the
current boot. WebApp/Android diagnostics export these fields and a page-local
`bootEpoch`; a changed boot produces `boot_changed` without exporting raw IDs.
A network timeout/disconnect is labeled NETWORK/TIMEOUT, not IDENTITY merely
because the reconnect message mentions identity checking. An actual identity
mismatch still reports IDENTITY. A detected reboot does not by itself prove a
brownout; use the firmware reset reason and hardware power measurements.

The authenticated `/api/ppm/status` and USB `ZJPPM,GET` report `armMethod`,
`armStatus` (ARMED/DISARMED), `armHoldMs`, `throttleLowUs`, `yawRightUs`,
`yawLeftUs` and `inputArmed`. `/api/rc/snapshot` keeps `inputArmed` for the
accepted PPM input status. `motorsArmed` / `motorsDisabled` remain
separate authoritative motor-output flags; input ARM alone is not proof of motor output.

**No physical Kit/receiver verification has been performed by the CI pipeline.**
Successful build/tests establish firmware compatibility, not analog signal
quality, wiring, receiver polarity or classroom safety.
