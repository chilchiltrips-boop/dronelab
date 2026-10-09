# ZEBJUS DroneLab • Python Lab • USB I²C

This Python Lab is the third page in DroneLab. It adapts the Aerion Python Lab's Monaco editor, Pyodide runtime, multi-file editing, Undo/Redo and project storage. The required Monaco/Pyodide runtime and licenses were copied from the pinned Aerion project source.

## Setup

1. Open https://chilchiltrips-boop.github.io/dronelab/#python in desktop Chrome or Edge.
2. Connect the ESP32-C3 or ESP32-C6 running `FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino` via USB.
3. Click **Connect USB Serial** in the Python Lab. Authorize the correct USB port.
4. The serial connection must be at 115200 baud. Press the physical RESET if a native USB board stays silent.
5. Click **Run** to execute `main.py`. Click **Stop** to terminate even a `while True` loop.

The original Arduino sketch is unchanged. The firmware outputs textual I²C messages at 115200 every five seconds. The website's Web Serial reader assembles each complete scan into a Python dictionary. The Python Lab terminal displays Python `print()` output, **not** a duplicate of the raw Serial Monitor.

## Default Python example

```python
import asyncio
from zebjus import i2c_scan

while True:
    i2c_scan_result = await i2c_scan()
    print("My I2C addresses =", i2c_scan_result["addresses"])
    print("Device count =", i2c_scan_result["total"])
    await asyncio.sleep(0.1)
```

For a scan with an MPU6050 at 0x68 and a barometer at 0x77, the result is similar to:

```text
My I2C addresses = ['0x68', '0x77']
Device count = 2
```

The returned object has `addresses` (a list of uppercase hex strings), `total` (integer), `reported_count`, `timestamp`, and `source`. `await latest_i2c_scan()` returns the most recently received scan without waiting.

## Editing and shortcuts

The editor supports Ctrl/⌘+Space suggestions, Ctrl/⌘+Enter Run, and the editor's Undo/Redo shortcuts. The Python Project pane supports New/Save/Delete, Undo/Redo, Export and Import. Files are stored locally in the user's browser.

## USB and Python execution limits

The normal `pyserial`/desktop COM-port API is **not** available inside browser Python. USB serial I/O is owned by JavaScript Web Serial and exposed through the injected browser `zebjus` module. The Python worker can run generic Python, including normal `print()`, `asyncio` and `while True` code. A blocking busy loop without an `await` can still be stopped by terminating its worker. Untrusted user code runs in the Pyodide browser Worker, not on the user's host OS.

Only one client can open an ESP32 USB port simultaneously. Disconnect Arduino IDE Serial Monitor and use either Firmware flashing or Python/Serial Monitor at a time. After writing firmware, reopen the Serial Port. Disconnecting the ESP32 interrupts any pending `i2c_scan()` with a timeout and the Python terminal shows that error. No Wi-Fi/AP firmware or I²C sensor-reading firmware changes are needed for this feature.

This page deliberately does **not** import Aerion flight-control/ESC/PID commands; it covers the requested scanner-only workflow.
