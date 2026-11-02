# FlightCore PPM-SUM receiver — firmware 1.7.3 (hardware verification required)

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
with >8 channels, or nonstandard PPM timings require another decoder. A1 requires positive PPM. PPM monitoring itself never starts motors; A2 output requires a separate explicitly confirmed bench test.

### Channel mapping (defaults)
| Channel | Meaning | Center / default |
|---|---|---|
| CH1 | Roll | 1500 µs |
| CH2 | Pitch | 1500 µs |
| CH3 | Throttle | 1000 µs |
| CH4 | Yaw | 1500 µs |
| CH5 | Auxiliary read-only input (not used for PPM ARM) | 1000–2000 µs |
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

`MAP` takes **roll,pitch,throttle,yaw,CH5 auxiliary** receiver channel indexes,
1..8 with no duplicates. Output: `ZJPPM,ACK,CAL,<ch>` or
`ZJPPM,ACK,MAP`. After changing config, re-test throttle direction
and switch thresholds with the receiver on a bench.

## Ownership and failsafe
- Input source stays **NONE** until three successive valid PPM-SUM frames
  at low throttle (<=1050 µs). CH5 has no ownership or ARM role.
- A physical PPM owner never silently preempts active WEB/ANDROID/USB
  control. Conversely, WEB/ANDROID may not claim while PPM owns the Kit.
- After acquisition, centre yaw (1400–1600 µs), keep throttle <=1050 µs,
  and hold yaw **RIGHT** (>=1900 µs) for **2 seconds** to assert diagnostic
  INPUT ARM. Hold yaw **LEFT** (<=1100 µs) at throttle <=1050 µs for
  **2 seconds** to DISARM. The gesture changes only diagnostic status; it
  never activates motor pins. **CH5 is not used for ARM or DISARM.**
- Complete frames retain their ISR arrival timestamp; the mailbox keeps the latest
  complete frame. Stale pending frames are discarded. Hardware capture continuity distinguishes a delayed consumer from a real receiver gap. A real gap releases control before accepting any resumed frame, so a high ARM switch cannot hide signal loss.
- On 150ms PPM signal loss, the PPM owner releases, channels return neutral,
  diagnostic input is disarmed. The existing 350ms/1800ms network/USB
  RC deadman/lease protections remain unchanged.
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
   steal ownership. After release require low throttle and CH5 OFF to acquire.
8. Test mapping/calibration edits over admin USB, reboot and verify persistence.
   Reject duplicate channels, invalid min/mid/max, and edits while RC owned.
9. AP↔STA switch and Android background/foreground must not implicitly
   reinstate joystick authorization. Test Wix/WordPress with real browser
   delegation; fallback to direct top-level DroneLab if LNA/Serial blocked.

The authenticated `/api/ppm/status` and USB `ZJPPM,GET` report `armMethod`,
`armStatus` (ARMED/DISARMED), `armHoldMs`, `throttleLowUs`, `yawRightUs`,
`yawLeftUs` and `inputArmed`. `/api/rc/snapshot` keeps `inputArmed` for the
accepted PPM diagnostic status. `motorsArmed` / `motorsDisabled` remain
separate authoritative motor-output flags, not changed by the yaw gesture.

**No physical Kit/receiver verification has been performed by the CI pipeline.**
Successful build/tests establish firmware compatibility, not analog signal
quality, wiring, receiver polarity or classroom safety.
