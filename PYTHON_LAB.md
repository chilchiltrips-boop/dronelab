# ZEBJUS DroneLab — Python Lab + USB I²C Scanner + Onboard LED

The Python Lab provides a beginner-friendly Python editor (Monaco + Pyodide), a real USB serial bridge and an isolated worker. The existing I²C scanner is **retained** on both flight-controller boards; LED control is an additional USB command feature.

## Supported boards and firmware

- FlightCore A1: ESP32-C3 Super Mini, onboard active-low USER LED on GPIO8.
- FlightCore A2: Seeed XIAO ESP32-C6, onboard active-low USER LED on GPIO15.
- Firmware 1.1.0: original I²C address scan messages at 115200 baud every 5 s, plus nonblocking LED control.
- Use **Firmware & Connect** to flash a matching A1/A2 APP or Factory image. APP images require the existing matching bootloader/partitions. Select the detected board rather than forcing the wrong chip.
- Use **Python Lab → Connect USB Serial** and select the board. The firmware flasher and Serial Monitor/Python Lab share one port, and cannot own it concurrently.

## Beginner examples: no await

```python
from zebjus_simple import Drone
import time

drone = Drone()
while True:
    drone.led(1)
    time.sleep(1)
    drone.led(0)
    time.sleep(1)
```

I²C scanner readings can also be accessed without `await`. The result is the **most recent completed scan** (or `None` before a scan arrives), not an instantaneous new physical scan:

```python
from zebjus_simple import Drone
import time

drone = Drone()
while True:
    result = drone.i2c_scan()
    if result:
        print(result["addresses"], "count =", result["total"])
    time.sleep(5)
```

The worker internally rewrites top-level `time.sleep(seconds)` calls (including those in top-level loops) to cooperative sleeps. Python functions and methods you define are not rewritten, so blocking `time.sleep` inside a user-defined synchronous function still blocks its worker. `Stop` terminates the worker in either case. The original `from zebjus import i2c_scan` async API remains available for existing projects.

## LED API

| Method | Meaning |
| --- | --- |
| `drone.led(1)`, `drone.led(0)` | LED on/off |
| `drone.led_brightness(50)` | PWM brightness percentage |
| `drone.led_blink(300, 700, 100)` | On duration ms, off duration ms, brightness |
| `drone.led_fade(1200)` | Continuous breathing fade |
| `drone.led_warning()` | Repeating double warning blink |
| `drone.led_safe()` | Slow safe status signal |
| `drone.led_sos()` | Morse-style warning pattern |
| `drone.led_pattern([(100, 150), (0, 900)])` | User-defined repeated brightness/duration pattern, up to 16 steps |
| `drone.led_stop()` | Stop LED effect |
| `drone.i2c_scan()` | Last complete I²C scan dictionary or None |

`Drone` calls do not require `await`; LED operations queue short USB serial commands on the browser main thread. Commands are asynchronous at the transport level, so Python does not synchronously wait for the firmware's acknowledgement. The Serial Monitor shows firmware `ZJLED,ACK,<id>,OK` or errors.

The web app sends an LED keepalive every second while the LED session is active. The firmware stops effects after four seconds without a valid command or keepalive. Clicking **Stop** also sends an immediate STOP command. A completed finite script can leave an LED effect running until Stop or navigation/disconnection; this is deliberately different from an infinite example loop.

For a single-colour onboard LED, RGB effects are not available. Use an external RGB component if actual colour effects are required.

## Python editor suggestions

Monaco suggests Python variables, function names, classes and imports from code. It also offers member completions after a user-created `Drone()` variable (e.g. `drone.led_blink`), and suggestions for `time.sleep` and common `cv2` methods. The examples selector contains scanner, blink, fade, warning, safe, SOS and custom patterns. Undo/Redo, project files, terminal and Plot Window remain.

## OpenCV and time

`time` is a Python standard-library module: no installation is needed. Pyodide uses the pinned `opencv-python` 4.10.0.84 WebAssembly package, along with NumPy, when a Python script imports `cv2`. The matching wheel is vendored and verified against the pinned Pyodide lockfile for offline use.

`cv2.waitKey`, `cv2.imshow` and native desktop `cv2.VideoCapture(0)` should not be relied on for browser GUI/camera behavior. Use `time.sleep` for delays and a browser camera-frame bridge for OpenCV processing.

## Safety and validation

No LED Python command can arm motors, change PID values or invoke flight control. Scanner lines remain unchanged so existing I²C parsers continue to work. Test LED on/off, blink, fade, arbitrary patterns, Stop, USB disconnect, auto-off timeout and simultaneous scanner traffic on both physical boards before announcing a hardware-qualified release. GitHub Actions compile/verification and browser Python smoke tests are software checks; they do not prove physical GPIO LED behavior.

## PID tuning orientation

The tripod starts in **Front view**. The front red arms and red arrow (+Z) face the viewer. Forward stick remains positive pitch, and the nose moves down toward the viewer; roll/yaw and the underlying PID controller mapping are unchanged.
