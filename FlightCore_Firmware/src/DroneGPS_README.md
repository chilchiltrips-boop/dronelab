# DroneGPS

Arduino library for a u-blox 7 / NEO-7 GPS used with a Seeed XIAO ESP32-C6 drone flight controller.

This copy is bundled into ZEBJUS FlightCore's `src/` and the included `tools/build_firmware.py` copies it into the temporary Arduino sketch. No separate global Arduino library install is needed for that build path. Its 100 ms configuration request is a target; verify actual complete-epoch `measuredHz` through `gps_read` on connected hardware.

## Main behaviour

- Detects the receiver at 38400 or 9600 baud.
- Changes UART1 to 38400 baud and verifies communication at the new baud.
- Uses UBX-only output on UART1, which prevents NMEA traffic from consuming bandwidth.
- Sends `UBX-CFG-NAV5` with dynamic model `7` (`Airborne <2g`).
- Requires `ACK-ACK`, retries on `ACK-NAK` or timeout, and polls CFG-NAV5 to verify the readback value.
- Sets navigation measurement rate to 100 ms (10 Hz).
- Enables NAV-POSLLH, NAV-VELNED and NAV-SOL on UART1.
- Builds a complete GPS epoch only when all three messages have the same iTOW.
- Provides EKF quality gating using fix validity, satellite count, horizontal accuracy, speed accuracy, PDOP and freshness.

## Installation

Copy the complete `DroneGPS` folder into the Arduino libraries folder, then reopen Arduino IDE.

Open the example:

`File -> Examples -> DroneGPS -> DroneGPS_FlightController`

## Wiring

- GPS TX -> XIAO D9
- GPS RX -> XIAO D8
- GPS GND -> XIAO GND
- GPS VCC -> supply supported by the GPS breakout board

## Important

The baud-change command is a special case. A u-blox receiver can apply the new baud immediately, so its ACK may be transmitted at the new baud while the MCU is still listening at the old baud. Therefore the library verifies the baud change by reopening UART at 38400 and successfully polling `CFG-RATE`. All later required CFG commands use normal ACK-ACK / ACK-NAK checking.
