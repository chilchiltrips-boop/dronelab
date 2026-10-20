# Legacy Python/ESP32 Wi-Fi controller lessons — 20 October 2026

## Source materials reviewed
- User-supplied `DroneWiFiTelemetry.zip`: ESP32 C++ UDP/AP telemetry and control receiver.
- User-supplied `WiFiReceiver.zip`: ESP32 UDP/AP channel receiver with safe neutral defaults.
- User-supplied `drone_wifi_telemetry.zip`: PyCharm Python controller `client.py`, configured for 50 Hz UDP controls, an independent RX worker and a 1-second heartbeat worker.

The three-source comparison supports separating control transmission from receiving feedback. The old firmware paths do **not** provide modern authenticated joystick ACKs. Their lack of `UDP_ACK_TIMEOUT` logs is therefore not evidence of zero packet loss or proof they are more reliable over Wi-Fi.

## Implemented in this review branch
- Keep 50 Hz new-value-only Android control and AES-GCM ZJUDP1, with an independent socket RX worker and 500 ms feedback timeout. Native input staleness remains 300 ms and is independent of ACK health.
- Preserve the firmware's independent 350 ms receive/apply safety deadman, sequence checks, authenticated feedback and single owner. **Do not switch the flight controller's safety deadline to 2 seconds.**
- Coalesce v2 dedicated APPLIED_ACKs to 100 ms, preserving immediate state-change feedback and including the latest applied sequence in each RX_ACK.
- Expose bounded send/failure counters for v2 feedback, maximum TX duration, coarse receive-to-ACK timing, AP station join/leave counts, and main-loop RPC timing.
- Give management RPC processing a per-iteration 2 ms budget *between packets*; a single long handler is measured, not forcibly preempted.
- Separate Live Inputs from Kit Connection and consolidate existing ACK/Network diagnostic controls into Diagnostics. A verified selected Kit supplies read-only USB/AP/STA data.
- Restrict read-only network snapshot polling to 4 Hz while Live Inputs is visible, without altering the native Android input frequency.

## Safety and scope
The current DroneLab firmware declares physical motor outputs **disabled**. The legacy Python/C++ libraries can control a separate flying firmware with PID/ESC code, but that is a different safety-critical integration. This branch **does not enable motors, import unauthenticated UDP commands, copy ESC calibration logic, implement autonomous landing, or make DroneLab flight-ready**.

Do not attribute the Python receiver's 2.5-second `connected` indicator to joystick apply confirmation. Do not use raw ACK-loss estimates as verified over-the-air packet-loss percentages.

## Before release
1. Run `npm test` and `npm run check` on the review branch; inspect Android native/Gradle build and both FlightCore A1/A2 compilation.
2. Test ZJUDP1 v1 and v2 feedback interoperability (including reorder, counter replay, missing ACK, apply stall, Wi-Fi loss and teardown race).
3. Test 15-minute propeller-free AP session, then Android + laptop AP, then STA, then USB read-only Live Inputs while Android owns the Kit.
4. Compare Android send/ACK gaps and Kit RX/APPLIED counters; confirm 350 ms firmware receive/apply failsafe and explicit neutral outputs before shipping.
5. Verify browser Downloads and Wix/direct iframe behavior, especially browser security restrictions.
6. Do not flash production hardware or merge to main until physical acceptance and approval.

## Known limits
- The current Live Inputs implementation follows the *selected and verified* Kit transport. Automatically preferring a simultaneously connected second USB path while STA/AP is already selected requires additional USB identity verification and arbitration work; it is not silently enabled.
- ACK TX success means the network send API accepted the datagram; it does not prove Android received it.
- Firmware receive-to-ACK delay is a coarse estimate because receive time is captured in milliseconds.
- New counters are reset on each v2 control bind.
- This branch has not been validated on real flying hardware.
