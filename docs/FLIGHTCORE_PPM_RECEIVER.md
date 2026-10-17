# FlightCore PPM-SUM receiver — firmware 1.4.12 (hardware verification required)

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
One PPM-SUM wire carries eight pulse widths; rising-edge to rising-edge
deltas 850–2150 µs, synchronization gap 3200–30000 µs. The decoder
accepts **exactly eight channels** per frame (standard 20–30ms frame).
Different receiver protocols such as SBUS, CRSF, individual PWM, CPPM
with >8 channels, or inverted/nonstandard PPM timings require another
decoder. This is **diagnostic input only**: firmware never drives motors.

### Channel mapping (defaults)
| Channel | Meaning | Center / default |
|---|---|---|
| CH1 | Roll | 1500 µs |
| CH2 | Pitch | 1500 µs |
| CH3 | Throttle | 1000 µs |
| CH4 | Yaw | 1500 µs |
| CH5 | Diagnostic input ARM switch | <=1300 OFF, >=1700 ON |
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

`MAP` takes **roll,pitch,throttle,yaw,ARM** receiver channel indexes,
1..8 with no duplicates. Output: `ZJPPM,ACK,CAL,<ch>` or
`ZJPPM,ACK,MAP`. After changing config, re-test throttle direction
and switch thresholds with the receiver on a bench.

## Ownership and failsafe
- Input source stays **NONE** until three successive valid PPM-SUM frames
  at low throttle (<=1050) and low CH5 diagnostic switch (<=1300).
- A physical PPM owner never silently preempts active WEB/ANDROID/USB
  control. Conversely, WEB/ANDROID may not claim while PPM owns the Kit.
- After acquisition, CH5 must have been low and then move high at throttle
  <=1050 to assert *diagnostic INPUT ARM*. That is **NOT motor ARM**.
- On 150ms PPM signal loss, the PPM owner releases, channels return neutral,
  diagnostic input is disarmed. The existing 350ms/1800ms network/USB
  RC deadman/lease protections remain unchanged.
- A fresh receiver signal alone does not re-arm. It must reacquire at
  low throttle + CH5 low. Other sources require their own authorization.
- `ZJRC,STOP` always cancels existing controller ownership.
- Read-only `/api/rc/snapshot` includes `channels` for active accepted PPM
  and `/api/ppm/status` exposes the receiver raw/calibrated CH1–CH8,
  pin, status, age and mapping via authenticated Kit session.
- USB monitor emits `ZJPPM,1,ACTIVE|LOCKED,<seq>,ARM=0|1,CH1=...,...,CH8=...`
  at most ~10Hz if present, plus a one-time LOST event.
  Existing combined 20-field `ZJTEL` remains backward compatible.
  The Live Inputs panel shows CH1–CH8 only for *accepted PPM ownership*;
  a merely connected receiver does not overwrite active Android/Web values.

## On-device hardware acceptance checklist
1. Disconnect ESCs/motors/propellers; identify 3.3V versus 5V PPM levels
   with a scope or logic analyzer, common GND verified.
2. Start firmware in COMBINED telemetry; read `ZJPPM,PIN` and
   `ZJPPM,GET` over USB. Confirm A1 GPIO10 / A2 GPIO18.
3. With receiver powered off, Kit must remain NONE / disarmed; no false ARM.
4. Power RX, keep CH3 throttle low and CH5 OFF; ensure accepted source
   changes to PPM after stable frames. Move sticks; check CH1–CH8 and
   roll/pitch/throttle/yaw in Live Inputs via AP, STA and USB.
5. Flip CH5 ON at low throttle; diagnostic INPUT ARM only, MOTOR=OFF.
   Switch CH5 OFF then ON at high throttle: ARM MUST stay OFF.
6. Cut RX power or disconnect signal: within 150ms status loses input,
   old RC values do not remain LIVE; motor output remains disabled.
7. During active Android/Web ownership connect receiver: PPM must not
   steal ownership. After release require low throttle and CH5 OFF to acquire.
8. Test mapping/calibration edits over admin USB, reboot and verify persistence.
   Reject duplicate channels, invalid min/mid/max, and edits while RC owned.
9. AP↔STA switch and Android background/foreground must not implicitly
   reinstate joystick authorization. Test Wix/WordPress with real browser
   delegation; fallback to direct top-level DroneLab if LNA/Serial blocked.

**No physical Kit/receiver verification has been performed by the CI pipeline.**
Successful build/tests establish firmware compatibility, not analog signal
quality, wiring, receiver polarity or classroom safety.
