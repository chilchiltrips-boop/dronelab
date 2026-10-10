# FlightCore v1.2.2 — Board-specific I²C gyroscopes

This firmware **adds** gyro reads to existing I²C Scanner (every 5 seconds) and onboard LED control. Only sensor readouts are implemented; no motor commands, PID updates, arm/disarm actions, fusion or gyro-based flight stabilization.

## Hardware

| Profile | Microcontroller | Gyro | I²C address | SDA/SCL | Gyro sensitivity | Display interval |
| --- | --- | --- | --- | --- | --- | --- |
| A2 | ZEBJUS FlightCore A2 C6 (XIAO ESP32-C6) | MPU6050 | `0x68` | D4/GPIO22, D5/GPIO23 | ±500 dps, 65.5 LSB/(dps) | 50 ms |
| A1 | ZEBJUS FlightCore A1 SuperMini (ESP32-C3) | GY-LSM6DS3 | **`0x6B`** | **Default GPIO8/9; fallback GPIO4/5** | ±2000 dps, 70 mdps/LSB | 20 ms |

**A1 wiring compatibility:** The verified Arduino IDE `Wire.begin()` scanner uses SDA GPIO8 and SCL GPIO9. FlightCore v1.2.2 detects the sensor on those pins first; optional GPIO4/5 wiring is also supported. If GPIO8 is SDA, PWM control of the onboard LED is deliberately disabled to protect I²C communication. Move the sensor to SDA GPIO4 / SCL GPIO5 only if simultaneous sensor scanning and onboard LED effects are needed. Keep I²C logic at 3.3V; GPIO9 is a BOOT strapping pin and must not be held low during normal reset.

Both boards use 400kHz I²C. A2 XIAO C6 remains on GPIO22/23, while A1 selects Arduino-default GPIO8/9 or optional GPIO4/5.

## Register configuration (once at sensor initialization)

**A2 MPU6050**
- `0x75` WHO_AM_I, expected `0x68`.
- `0x6B <- 0x00`: leave sleep mode.
- `0x1A <- 0x05`: DLPF_CFG=5.
- `0x1B <- 0x08`: ±500 dps gyro, divide raw values by 65.5.
- Burst read 6 bytes from `0x43`: X/Y/Z, MSB-first.

**A1 LSM6DS3**
- I²C **slave** address `0x6B` was detected by the user's scanner. It is not the `0x6A` fallback used in some examples.
- `0x0F` WHO_AM_I, expected `0x69` (also supports compatible `0x6C` LSM6DS-family ID).
- `0x12 <- 0x44`: block data update, enable auto-increment.
- `0x11 <- 0x4C`: 104Hz ODR, ±2000 dps, multiply raw values by 0.070.
- Burst read 6 bytes from `0x22`: X/Y/Z, LSB-first.

Initialization retries every 2.5 seconds if the device is absent or stops responding. The scanner runs independently and continues to list other attached I²C devices.

## Serial output (115200 baud)

The firmware emits independent CSV-format gyro data suitable for parsing:

```text
ZJGYRO,STATUS,A2,MPU6050,0x68,READY
ZJGYRO,DATA,A2,MPU6050,0x68,-0.31,0.12,1.43

ZJGYRO,STATUS,A1,LSM6DS3,0x6B,READY
ZJGYRO,DATA,A1,LSM6DS3,0x6B,-0.28,0.14,1.39
```

The signed X/Y/Z values are sensor-native angular rates in degrees/second; **not** absolute pitch/roll/yaw angles, and **not** guaranteed body-frame mapping without mounting orientation alignment. No gyro bias calibration is applied, so stationary values may be small nonzero values. Sensor ODR (104Hz for LSM6DS3) is distinct from serial reporting (50Hz).

No `delay(20)` or `delay(50)` blocks the loop. Existing I²C Scanner messages, LED control commands and watchdog remain unchanged. New `ZJGYRO` lines can be inspected in **Firmware & Connect → Serial Monitor**, while **Python Lab** continues to support the existing I²C and LED functions. A typed Python gyroscope API is not part of this firmware-only change.

## Validation and safety

`tools/build_scanner.py` compiles **both** the A1 and A2 images from the same board-conditional source. APP and FACTORY binaries are verified for the corresponding chip and SHA256. Physical module detection, voltage, sample values, axis directions and wiring must still be checked on the user's hardware. Always bench-test with motors disconnected before integrating gyro feedback into a flight controller.

## Native USB Serial

FlightCore A1 builds with `esp32:esp32:esp32c3:CDCOnBoot=cdc` so `Serial` uses native USB Serial/JTAG (VID 303A, PID 1001). After Factory flashing, press RESET if the port does not reopen. FlightCore A2 retains its Seeed XIAO ESP32-C6 build profile.

## Firmware v1.2.1 diagnostics

After USB Factory flash, exit ROM DOWNLOAD mode: release BOOT and press RESET. Web Serial status distinguishes `ROM DOWNLOAD • APP NOT RUNNING` from `USB FIRMWARE RUNNING` only after receiving the live `ZJINFO,FW` banner. The USB Serial Monitor can send `ZJINFO,GET` to request firmware identity, and `ZJI2C,SCAN` to trigger an immediate sensor scan.

ESP32-C3 SuperMini accepts the user's Arduino-default LSM6DS3 SDA GPIO8 and SCL GPIO9, or the alternate GPIO4/5 bus, with VCC 3.3V and GND. GPIO8 shares the onboard LED and therefore LED effects are disabled on the default bus. If `ZJGYRO,STATUS,A1,LSM6DS3,0x6B,NOT_FOUND` occurs after firmware boot, physical sensor/wire/power/CS/SA0 wiring needs verification; no software retry can recover disconnected wires.

Test LED with the Firmware page's **Test onboard LED** control, or send `ZJLED,900,BLINK,250,250,100` followed by a newline at 115200 baud. With alternate A1 GPIO4/5 wiring or on A2, the controller should respond `ZJLED,ACK,900,OK`. On A1 default GPIO8/9 bus, the response is `ZJLED,ACK,900,PIN_CONFLICT` instead. The LED pattern automatically stops after a four-second safety lease without renewed commands.

The built-in Python Lab executes `from zebjus_simple import Drone` in the browser's Pyodide worker and needs the **USB Serial connection** to the *running* controller. Normal desktop PyCharm Python instead requires the separate PC `pyserial` example; the browser's `zebjus_simple` module is not an installed system package.

## FlightCore v1.2.2 — Arduino-default I²C compatibility

**A1 SuperMini:** Check `Wire.begin()` on ESP32-C3 Dev Module default SDA GPIO8 / SCL GPIO9 first (user-confirmed scanner finds LSM6DS3 `0x6B`). If absent, probe optional GPIO4 / GPIO5. If neither responds, revert to default and keep retrying. Report the selected bus using `ZJI2C,PINS` and `ZJI2C,MODE` serial messages. **A2 C6** MPU6050 `0x68` on GPIO22/23 remains unchanged.

**LED versus SDA conflict:** GPIO8 is also A1's active-low onboard LED. When GPIO8 is SDA, disable PWM LED control to preserve I²C integrity. Report `ZJLED,INFO,ZFC-A1,GPIO8,UNAVAILABLE,SDA_CONFLICT`; a LED command receives `ZJLED,ACK,<id>,PIN_CONFLICT`. To use the onboard LED and I²C at the same time, move the sensor's SDA/SCL wiring to GPIO4/5 and reboot. GPIO9 is a boot strap, so pull-up/wiring influences boot behavior and BOOT must be released on reset.
