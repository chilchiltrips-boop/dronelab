# Motor bench link stability

The November 2, 2026 diagnostic captures report FlightCore 1.7.0. The AP exports overlap and must not be counted as independent runs. The existing CSV schema did not record `/api/motor`, motor mode or motor stop reason, so those captures cannot identify the precise request that preceded each reported motor stop.

The STA capture ending 07:39:58 UTC contains request-error round trips up to 10,993 ms, PPM losses increasing from 3 to 50, and invalid PPM interval counts increasing from 507 to 10,871. The AP capture ending 07:44:27 UTC contains request-error round trips up to 2,560 ms, selected input `ANDROID_AP`, no active controller, and increasing PPM losses/invalid intervals. A detected PPM receiver is not the selected Android controller.

## Corrected WebApp behavior

- Motor commands and STOP take priority over queued telemetry/status reads. An already transmitted signed request is completed without interrupting or replaying it. Queued KEEP, SLIDE and RTC requests older than 250 ms are rejected before transmission.
- Competing automatic network status and RC-observer polling pauses during an owned or starting motor session. USB identity polling continues so a long wired test retains its physical-link heartbeat. Selected-input producers and firmware watchdogs remain independent.
- A signed motor acknowledgment refreshes hardware heartbeat only when Device ID, boot, connection generation and transport match. Motor STATUS can reverify a delayed original Kit; STOP remains available on that verified link. Motor writes do not bypass delayed-link checks.
- Repeated motor STATUS reads coalesce. A terminal acknowledgment immediately clears the client token and command pumps. Replies from an earlier cancelled session cannot reactivate the UI. Queued commands recheck cancellation immediately before delivery.
- The slider pump services a due KEEP before its next SLIDE, avoiding starvation of the separate motor-session lease. There is no automatic test restart after loss.
- Input sample ages advance between packets. A delayed last sample is dimmed and labelled with its age for at most one second. Explicitly invalid/lost input is blank. AUTO identifies its actual source. PPM counters and the time of the last board check are shown separately.
- Confirmation dialogs cancel on tab hiding, page exit, STOP or wizard step changes. A terminal first SLIDE response reports the actual stop condition instead of start success. Input-safety refusals explain throttle/ARM/maintenance prerequisites.
- Diagnostics now retain sanitized motor actions, modes, stop reasons, pulse acknowledgments and round-trip times. Heartbeat delay is classified as a timeout rather than an authentication failure. No session tokens or raw error strings are exported.

## A2 USER LED and ESC timer isolation

FlightCore 1.7.0 assigned ESCs directly to LEDC timer 0 while attaching the USER LED through Arduino channel 5. In the pinned Arduino-ESP32 3.3.12 core, `ledcAttachChannel` dynamically chooses a matching/free timer: the LED, attached first, takes timer 0 regardless of its channel number. Later ESC setup changed that same timer from 5 kHz / 8-bit to 50 Hz / 14-bit. The active-low LED's nominal OFF duty of 256 then became roughly 1.56% high rather than continuously high, leaving it visibly on.

FlightCore 1.7.1 reserves timer 3 for all ESC channels and leaves the LED on its own Arduino-managed timer. LED setup initializes GPIO before driving HIGH and checks attachment success; a failed attachment leaves the active-low LED off and reports it unavailable. The production-configuration host regression checks LED frequency/resolution and OFF/ON/brightness before and after motor setup.

References: [pinned Arduino-ESP32 3.3.12 LEDC allocation](https://github.com/espressif/arduino-esp32/blob/3.3.12/cores/esp32/esp32-hal-ledc.c), [Espressif channel/timer sharing](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html#channels-timers-and-frequency-sharing). The XIAO USER LED is GPIO15; this fix does not control a separate power/charging indicator.

The 750 ms slider-control deadline, 1.5 s session lease, 150 ms PPM freshness, 300 ms network-input freshness, independent motor watchdog, output limits and absolute test durations remain enforced.

## Hardware verification

Remove propellers and secure the frame. Repeat individual and all-motor slider tests, a deliberate link interruption, calibration and minimum-pulse saving. `TEST_FINISHED` at 30 seconds (slider), 800 ms (pulse test), or 10 seconds (selected input) is expected. `CONTROL_LOST` before that is a missed slider-control deadline.

Large real Wi-Fi delays still require correcting the connection or using verified USB for the bench test. Increasing PPM fault/loss counters require inspecting receiver PPM mode, the A2 D10 signal and common ground; these logs alone cannot distinguish wiring/noise from capture timing. Do not smooth or relabel lost receiver frames as live control input.

Automated tests use simulated transports and the production firmware host harness. Physical ESC pulse timing, receiver wiring, actual motor spin and link-loss stopping must be verified on the user's board.
