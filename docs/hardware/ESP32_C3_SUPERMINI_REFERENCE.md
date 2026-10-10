# ESP32-C3 SuperMini — ZEBJUS FlightCore A1 Hardware Reference

Source: User-uploaded 16-page **ESP32-C3 SuperMini datasheet.pdf** provided on 2026-10-10 in the DroneLab project. **The original PDF is not stored in this public repository.** Consult the user-supplied PDF for its pinout and photographs. This document preserves a concise reference for future engineering work.

## Datasheet facts

| Property | Datasheet detail | Page |
|---|---|---|
| SoC/module | ESP32-C3FN4, RISC-V up to 160 MHz | 1 |
| Flash / RAM | 4 MB flash / 400 KB SRAM | 1 |
| Wireless | 2.4 GHz Wi-Fi b/g/n and BLE 5.0 | 1 |
| Board dimensions | approx. 22.52 mm x 18 mm | 1 |
| Onboard blue LED | GPIO8 | 1, 5, 14 |
| I²C labeled pins | SDA GPIO8, SCL GPIO9 | 2 |
| UART pins | RX GPIO20, TX GPIO21 | 2, 15 |
| Arduino IDE board | ESP32C3 Dev Module | 5 |
| USB serial | USB Type-C data cable, enable USB CDC On Boot to see serial output | 3, 6 |
| ROM download | Hold BOOT, tap/release RESET, release BOOT | 6 |
| Boot after upload | Press RESET if app does not run | 6 |
| Power caution | Document cautions against simultaneous external supply and USB power | 3 |

## Project-specific hardware behavior (not datasheet claims)

- ZEBJUS FlightCore **A1 SuperMini** uses the ESP32-C3, ID `ZFC-A1`. ESP firmware image chip ID is **5**.
- FlightCore **A2 C6** uses a XIAO ESP32-C6, ID `ZFC-A2`. ESP firmware image chip ID is **13**.
- A1 firmware v1.2.2 probes the Arduino-default I²C pins 8/9 for LSM6DS3 at `0x6B`, then optional 4/5 as alternate.
- GPIO8 is both A1 onboard LED and default SDA. When GPIO8 carries I²C, do **not** drive the LED/PWM. Onboard LED control must be disabled on that bus.
- GPIO9 is a bootstrapping pin; attached I²C wiring can affect entry into download mode.
- A1 USB VID/PID `303A:1001` is a *USB device type*, not unique board authentication. Multiple Espressif chips may share it.
- The user's Arduino IDE `Wire.begin()` sketch repeatedly detected `0x6B`, providing hardware evidence for that wiring.

## Release and flashing safeguards

- Require successful ROM connection and chip ID before flash/erase.
- Verify ROM chip ID **5** (A1) or **13** (A2) against both selected board profile and ESP image header, including merged Factory's embedded application.
- Verify 4 MB available flash, valid image descriptor, and compatible dual-OTA partitions for APP images.
- For bundled firmware require the file's current SHA-256 to match the release catalog, and rehash immediately before writing.
- Re-read flash ID before erase/write; never trust the filename, manual board selector, USB VID/PID, or arbitrary Serial text as chip identity.
- Important limitation: chip checks distinguish C3 from C6 but cannot identify an authentic ZEBJUS A1 among other ESP32-C3 boards. Unique physical board authentication requires manufacturer-provisioned, verified credentials.
- SHA-256 catalog equality is **integrity**, not a digital signature or authenticity guarantee. Production firmware security needs separate signature verification and provisioning.
- Never flash a powered/armed flying drone. Bench-test with propellers removed and motors disconnected.

This reference derives only the first table's facts from the uploaded PDF. Project-specific mappings and safeguards derive from the ZEBJUS source code and user testing.
