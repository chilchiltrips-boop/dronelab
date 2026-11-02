# FlightCore 1.7.2 — PPM capture and bounded manual bench operations

## Evidence

Two operator diagnostics were reviewed, both running FlightCore 1.7.1:

| Log | Observations | Meaning |
| --- | --- | --- |
| STA, 09:19–09:22 UTC | PPM loss counter 30 → 81; invalid intervals 6619 → 17112. Several motor/calibration ACKs took 2024–2606 ms. | Software GPIO edge timing needed isolation from CPU/network work. These ACK gaps exceed the old 750 ms slider / 1500 ms session deadlines. Logs cannot establish the physical receiver waveform or ESC response. |
| AP, 09:34–09:38 UTC | Active slider ACKs mostly 46–178 ms. First recorded run ended `TEST_FINISHED`; a queued SLIDE was then labelled `AUTH`. Second run ended `USER_STOP`. All recorded PPM sequence/loss/fault counters were 0; no calibration attempts were recorded. | The AP run includes expected finite-test completion and misleading error classification. It does not demonstrate PPM reception or ESC calibration in AP mode. |

## Changes

- A2 D10/GPIO18 uses the bundled ESP-IDF RMT RX driver, 1 MHz timing, 48 symbols, a 1 µs glitch filter and 2.5 ms idle delimiter. A separate FreeRTOS task rearms reception. No third-party Arduino dependency is needed. A1 retains its GPIO ISR decoder.
- Exactly eight channel intervals between nine separator pulses are required. A2 supports either polarity. Invalid/truncated packets never become fresh input. Arrival age is conservatively measured from receive-start time, so delayed callbacks/tasks cannot renew old data.
- Capture continuity and physical receiver gaps are tracked separately from main-loop processing. Real gaps still release input ownership and require low throttle/switch before reacquisition.
- `ppm` diagnostics report `captureBackend`, `captureReady`, `captureErrors`, measured `captureHz`, `expectedHz: 50`, calibrated/raw channels and age. The receiver determines the actual frame rate: configure it for 20 ms / 50 Hz. Browser observation polling remains up to 4 Hz.
- Setup Wizard can monitor PPM channels without taking control, lowering throttle or arming. Missing physical signals still appear as missing; control eligibility remains a separate field.
- Explicitly confirmed version-3 WebApp/Python sessions use `PWM_50HZ_1000_2000_TIMED`. Manual phases tolerate browser ACK delays. READY has an absolute 10 s window; slider output holds its last accepted pulse until STOP or a maximum 30 s; calibration HIGH until LOW or 15 s; LOW ends after 3 s.
- The independent ESP timer stops bounded manual output at its absolute deadline even if the main loop blocks. Late requests cannot extend/restart it. Input-driven tests retain the 100 ms main-loop watchdog, 150/300 ms input freshness and live session lease. Legacy clients retain their original deadlines.
- Late motor updates after completion return the terminal state. The diagnostic classifier distinguishes a motor-session problem from network authentication. BEGIN logs now include its actual request latency. HTTP replies enable TCP_NODELAY; UDP auth/proofs and ownership checks are unchanged.
- Wizard countdowns advance between ACKs, and the manual test confirmation explains that the last command can remain active until the board timer expires. STOP and page/worker cancellation still attempt immediate shutdown.

## Validation and hardware check

Host tests execute the production packet decoder, mailbox/ownership handling, motor protocol/state machine and independent timer callback/output adapter. They cover receiver polarity/endpoints/truncation/noise, delayed consumers, real gaps, delayed BEGIN/calibration, manual deadlines without KEEP, timer wraparound, legacy deadlines and input-loss stopping. Browser CI exercises the wizard and Python using a clearly simulated board; A1/A2 CI compiles the pinned Arduino-ESP32 3.3.12 firmware.

Physical GPIO timing, ESC tones, receiver waveform and motor rotation cannot be verified in this environment. After flashing, remove propellers, verify common ground and 3.3 V signal levels, confirm `RMT_RX`, move CH1–CH8 and check a roughly 50 Hz capture rate. Verify ESC-specific HIGH/LOW tones, individual/all-motor output, STOP and the finite timer with a physical power cutoff available. A 30 s `TEST_FINISHED` is expected; starting another test requires explicit confirmation.

Primary references: [Espressif C6 RMT RX](https://docs.espressif.com/projects/esp-idf/en/v5.5.2/esp32c6/api-reference/peripherals/rmt.html), [Arduino-ESP32 3.3.12 WebServer](https://github.com/espressif/arduino-esp32/blob/3.3.12/libraries/WebServer/src/WebServer.cpp).
