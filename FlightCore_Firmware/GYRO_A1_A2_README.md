# ZEBJUS FlightCore v1.3.0 — Hardware / USB / Python Lab

## Current supported hardware (IMPORTANT)

| Board | Profile | Gyro | I2C wiring | Onboard LED |
|---|---|---|---|---|
| ZEBJUS FlightCore A1 SuperMini | `ZFC-A1`, ESP32-C3 | LSM6DS3, address `0x6B` | **SDA GPIO4 / SCL GPIO5** | GPIO8, active-low, usable for Python LED effects |
| ZEBJUS FlightCore A2 C6 | `ZFC-A2`, XIAO ESP32-C6 | MPU6050, address `0x68` | **SDA GPIO22 / SCL GPIO23** (XIAO D4/D5) | GPIO15, current board wiring |

Connect sensor VCC to **3V3** and GND to GND. **A1 firmware v1.3.0 does NOT use Arduino's default GPIO8/GPIO9 I2C pins.** Physically disconnect any sensor SDA/SCL leads from GPIO8/GPIO9 before installation; connect to GPIO4/GPIO5. GPIO8 remains LED only; GPIO9 is the ESP32-C3 BOOT strap. The user previously found LSM6DS3 at `0x6B` with `Wire.begin()`; that is evidence that the older wiring worked, *not* evidence that the new GPIO4/5 wiring has yet been checked in hardware.

## USB installation

Open **Firmware** in desktop Chrome/Edge and select **Connect USB**. ROM chip ID `5` selects A1; chip ID `13` selects A2. A1/C3 and A2/C6 USB VID/PID may be the same — never identify a board by VID/PID alone. Check the selected board profile. Use **Factory image** (`0x0`) on first install or when migrating from Arduino's default partitions; **APP** at `0x10000` requires a matching existing dual-OTA partition layout. Verify current firmware version `1.3.0`, `LOADED`, and USB bootloader + flash verified before pressing **Flash over USB**. Leave BOOT and press RESET after flashing if the controller stays in ROM DOWNLOAD. Open USB Serial Monitor at 115200 baud; it identifies the actual running firmware using `ZJINFO,FW,...`.

The built-in USB flashing page validates the selected profile, detected ROM chip, firmware ESP image header, SHA-256 catalog integrity and flash capacity. This is chip-family protection, *not* unique manufacturer board authentication.

## Nonblocking USB telemetry

Both boards sample gyro at **50 Hz** (20 ms). The USB telemetry stream defaults to **20 Hz** (50 ms), configurable to **10 / 20 / 50 Hz** in the Serial Monitor toolbar. These settings change *transport frequency*, not IMU sampling rate or a motor-control loop.

Versioned canonical frame (12 CSV fields):

```text
ZJTEL,1,A1,42,8120,0x6B,READY,-0.12,0.55,1.46,LED_READY,0
ZJTEL,1,A2,43,8140,0x68,READY,-0.21,0.09,0.73,LED_READY,0
```

Fields in order: prefix, version, board A1/A2, monotonic sequence, board milliseconds, I2C address, sensor health, roll dps, pitch dps, yaw dps, LED capability/status, cumulative dropped telemetry frames. `NOT_FOUND` or `READ_ERROR` means gyro values are **not trustworthy**. Serial Plotter ignores such frames. Sequence gaps and device-reported drops are displayed in the UI.

Select 10/20/50 Hz or send `ZJTEL,RATE,10\n`, `ZJTEL,RATE,20\n`, `ZJTEL,RATE,50\n`; firmware replies `ZJTEL,ACK,RATE,20` etc. No `delay(20)` / `delay(50)` in the main loop. USB writer skips and counts frames when insufficient TX buffer space is available.

**Compatibility:** The prior `ZJGYRO,DATA` frame is retained at low rate (5 Hz), and the original human-readable I2C scan output remains for `zebjus_simple.Drone().i2c_scan()`. Full address scanning is split over multiple loop passes, at most **3 addresses per pass**, every **5 seconds** or via `ZJI2C,SCAN\n`. Do not scan all 126 addresses on every 20 ms telemetry tick.

## Python Lab, LED, and error handling

`from zebjus_simple import Drone`, `drone=Drone()`, `drone.led_blink(250,250)` uses USB Serial commands `ZJLED,id,...`. A1 dedicated GPIO4/5 wiring permits onboard GPIO8 LED control. Unsupported commands or hardware `PIN_CONFLICT` acknowledgements terminate the **running** Python worker, safely send LED STOP, and show an error. USB disconnect interrupts hardware-target Python execution.

**Check Syntax** runs Python `ast.parse()` inside the isolated Pyodide worker without executing the project. Runtime Python exceptions show original traceback plus explanations and Monaco editor line markers. Autocomplete lists known `Drone` methods and Python snippets. Monaco is not a complete static type checker; exceptions inside user `try/except` blocks may be intentionally handled by the student's code rather than treated as failures. Automatically applying code edits is intentionally disabled.

## Test and release checklist

Automated: build A1 and A2 via Arduino-ESP32 toolchain; validate APP and FACTORY image headers/catalog SHA-256; run Node regression tests for telemetry parsing, legacy I2C scanner, Python hardware errors; use Playwright on Python Lab desktop/mobile layouts. A synthetic 90,000-frame trace exercises parser throughput for 30 minutes at 50 Hz, but **does not measure real hardware throughput or jitter**.

Hardware bench tests still needed (propellers removed, motors disconnected):

1. Flash A1 Factory image on C3 and A2 Factory image on C6, verify ROM chip ID and board-specific APP/Factory selection.
2. Repeat USB connect, flash/restart, unplug/replug, and native serial reconnect several times on each board.
3. Confirm A1 `ZJI2C,PINS,ZFC-A1,4,5,0x6B`, I2C device `0x6B`, gyro `READY` and actual motion response. Verify onboard GPIO8 LED `ZJLED,ACK,1,OK` and brightness changes.
4. Confirm A2 `ZJI2C,PINS,ZFC-A2,22,23,0x68`, device `0x68`, gyro `READY`, and onboard LED behavior.
5. Test telemetry 10/20/50 Hz with live timestamps, dropped-frame counts, USB unplug under load, and 30-minute continuous Serial Monitor operation.
6. Test Python syntax mistakes, uncaught TypeError, hardware PIN_CONFLICT, and disconnected USB. Confirm Run/Stop states and line highlighting.
7. Negative hardware safety check: never deliberately erase a board using a mismatched image; verify mismatches are blocked *before* the write stage using test harness/fake loader.

**No physical hardware flashing or frequency/jitter certification was performed in GitHub Actions.** Do not use these diagnostics-only firmware images to drive armed flight hardware.
