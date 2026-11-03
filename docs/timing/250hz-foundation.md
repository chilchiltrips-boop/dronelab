# Non-actuating 250 Hz foundation (FlightCore 1.7.6)

Read [baseline](250hz-baseline.md) for every inspected transport, sensor, maintenance and actuator path. This change prepares timing infrastructure; it is not physical flight acceptance.

## Architecture and ownership

A2 uses two ESP Timer TASK-dispatch callbacks. Each only notifies its worker; pending notifications coalesce and never replay obsolete reads/ticks. The existing 5 ms motor-watchdog callback shares the timer task, so acquisition, JSON, flash, networking and Serial are excluded from callbacks.

- Shadow control worker: priority 3, 4 ms target, monotonic unsigned microsecond deadlines. Fixed phase, no catch-up burst. It copies timestamped IMU/RC observations and records interval, lateness, skipped periods, execution, overrun, measured event rate and last successful tick. It has no output/authorization function. A held PPM frame retains its sequence across ticks. For applied UDP input the shadow snapshot preserves the selected frame's original receive timestamp, so queue/apply delay cannot renew its age. Consumed samples age independently even while the main loop stalls.
- IMU worker: priority 3, 1 ms wake opportunities; 1 ms calibration polling and fixed-phase 4 ms normal polling are separate policies. Only this worker owns the acquisition state. A fixed-size mailbox transfers copies under a short critical section; only main-owned projections feed legacy telemetry/stationary reads. No shared String, dynamic buffer, Serial output or NVS access in this worker.
- I2C: 400 kHz retained. A2 sets a 2 ms API timeout per operation; actual timeout latency remains a hardware test. An external mutex covers complete IMU transactions. On-demand scanning takes the same mutex without waiting, probes at most one address and releases it. A scanner transaction can defer a sensor opportunity; counters expose missed normal deadlines instead of falsifying freshness.
- PPM RMT task remains priority 4. UDP receiver remains priority 2. Arduino main retains RC apply/ownership, maintenance, telemetry and HTTP/RPC. PPM loss is still 150 ms; UDP RC deadman remains 500 ms and ownership lease 1800 ms. No timeout was widened.
- Flash/cache stalls and Wi-Fi scheduling are not claimed hard real-time. Lateness is measurable; this is a disabled flight foundation, not a guarantee of future in-flight deadlines.

Scheduler health describes the *shadow worker only*. Sensor validity, receiver ownership, STOP and motor authorization remain separate authoritative states. This update does not grant flight arming, PID, Kalman motor control, mixing, navigation or automatic calibration.

## Before / after decisions

| Subsystem | Before | Selected behavior | Evidence / reason |
|---|---|---|---|
| A2 shadow scheduler | None | 250 Hz / 4000 us target, non-actuating | Host test uses real production math; physical measured Hz unknown until connected |
| A2 normal IMU | 50 Hz loop polling, 6-byte gyro | 250 Hz independent fixed-phase polling, 14-byte accel/temp/gyro burst | Simulated fresh DATA_RDY acquisition, identical values counted only when fresh; counter measures actual events |
| Startup calibration | 2000 fresh samples; >=1 ms poll | Retained, independent from normal sampling | Existing noise/motion/config/I2C/timeout/recovery tests retained |
| MPU6050 ODR/filter/gyro range | 1 kHz / DLPF=5 / ±500 dps | Retained | Retaining internal 1 kHz preserves calibration; normal stream intentionally consumes 250 Hz |
| Accelerometer | Not exposed | ±8g explicitly configured/read back; g vector in network IMU status | Same MPU6050 burst as gyro; no attitude estimator |
| A1 LSM6DS3 | 104 Hz sensor ODR, 50 Hz normal reads | Unchanged | Production driver host fixture covers A1 separately |
| PPM | ~50 Hz native capture, 10 Hz diagnostic log | Unchanged, add coalesced-consumer count | No 20 Hz downsampling; capture arrival/sequence and physical-loss distinction retained |
| Android AP/STA | Secure UDP 50 Hz | Unchanged; add measured firmware RX/apply Hz and coalesced count | Host exercises actual encrypted receiver/apply at 50 and candidate 20 Hz; no handset comparison is claimed |
| WebRTC simulator / mirror | 25 Hz / <=20 Hz | Unchanged | Simulator and physical bench remain separate; ACK/backpressure behavior retained |
| WebApp STA HTTP | ~9.09 Hz scheduled, actual RTT limited | Unchanged | No evidence supports increasing HTTP traffic; not advertised as a flight RC transport |
| USB telemetry | Default 20 Hz, 10/20/50 options | Unchanged; actual emitted rate/drop counters | No 250 Hz serial stream |
| Detailed USB diagnostics | 2 Hz IMU, 4 Hz state | Retained; separate 1 Hz ZJTIMING record | Legacy frame field positions unchanged; unknown metrics represented by -1 in extension |
| ESC PWM | 50 Hz, 14-bit, timer 3 | Same deployed profile | 250 Hz math available but deployable() rejects it; BEGIN still accepts only 50 Hz profiles; no frequency switching API |
| LED | 5 kHz, 8-bit, allocator timer 0 | Unchanged | Production timer independence fixture retained |
| Motor tests/calibration | Existing authorized bench state machine | Unchanged | Single/all/slider/next/input, saved layout/minimum/tone confirmation, timed limits, STOP/watchdog remain independent |
| AP↔STA, OTA, admin | Existing ownership/safety policy | Unchanged | Regression suite retains handover/PPM-freshness/OTA/provisioning tests |
| Future sensors | No GPS/baro/magnetometer drivers | Generic timestamp/sequence/validity/age/error/expected-Hz contract | No speculative navigation drivers or fake measurements |

## Filtering assessment

The deployed MPU6050 gyro filter remains DLPF=5. Manufacturer values below describe the filter, not measured end-to-end kit latency. Sampling rate, full-scale range and bandwidth are distinct settings.

| DLPF | Gyro bandwidth | Nominal gyro delay | Assessment |
|---|---:|---:|---|
| 5 (retained) | 10 Hz | 13.4 ms | Existing low-noise bench default; material lag for future flight tuning |
| 4 | 20 Hz | 8.3 ms | Candidate compromise; requires vibration/response measurements |
| 3 | 42 Hz | 4.8 ms | Candidate future control bandwidth; not enabled by assumption |
| 2 | 98 Hz | 2.8 ms | Faster response, more noise/aliasing risk; requires hardware evidence |

No software gyro, throttle, stick or output smoothing was added without measured justification. Safety states are neither smoothed nor debounced for presentation. MPU6050 configuration is written/read back at initialization, not every sample. DATA_RDY proves at least one new conversion; without wired INT/FIFO the exact conversion time and exact number of missed 1 kHz sensor conversions are unknown. Reported sample timestamps are acquisition-complete host times. `imuMissedNormalSamples` counts missed 4 ms acquisition opportunities; calibration has its separate existing counter.

## Diagnostics and compatibility

Network `imu` status preserves schema version 1 and all old fields, adding scheduler/rate/validity/range/filter/accelerometer fields. Unsupported measurements are omitted or null. `controlActualHz`, `imuActualHz`, `telemetryActualHz`, `androidUdpReceivedHz` and `androidUdpAppliedHz` count real software events in >=1 second windows; they are not assigned the target frequency. They are unknown before a completed measurement window and zero after one second without events. They do not certify hardware timing or Android send rate.

`ZJTIMING,1,A2` is a separately versioned 1 Hz USB extension. Its order after prefix/version/board is: actual shadow Hz, interval/min/max us, current/max lateness us, current/max execution us, missed ticks, overruns, health, actual IMU Hz, IMU age us, IMU errors, configured telemetry Hz, actual telemetry Hz, telemetry drops. Unknown rate/age is -1. Main only emits it when the full record fits the output buffer. Existing ZJTEL, ZJIMU, ZJIMUS, ZJIMUE, ZJSTATE, ZJPPM and APIs remain compatible.

The shared WebApp/Android diagnostic recorder validates the additional fields, displays shadow/IMU timing and keeps sanitized CSV/JSON exports bounded. Health changes produce immediate events; sampled timing events are rate limited. Device identities, Wi-Fi names and credentials are not exported. Existing stale-observation ordering and selected-input logic remain unchanged. The Service Worker cache advances so clients receive the new parser.

Do not derive Android sender Hz, end-to-end one-way latency, CPU load, RF loss, true ESC compatibility or flight stability from receiver-only counters. WebRTC input rates and WebApp send timing retain existing client diagnostics; absent firmware measurements remain unknown.

## Validation and acceptance

Baseline: 665 passed, 2 skipped. Local suite after this change: 668 passed, 2 skipped; application syntax/assets checks passed. CI performs independent builds and simulated browser integration. Dedicated tests cover nominal 250 Hz, bounded coalescing/overload, lateness/execution accounting, rollover, held sample sequences, rate expiry, PWM endpoint quantization, inactive 250 Hz profile, independent LED/ESC timers, fresh 250 Hz production acquisition with injected wake jitter, coherent acceleration, unchanged calibration and fault recovery. Existing encrypted RC tests additionally exercise simulated 50/20 Hz and pending-frame coalescing. Browser evidence is simulated; firmware build and release verification run through the normal pipeline.

All physical tests remain **NOT_RUN**: A1/A2 timing under Serial/HTTP/Wi-Fi/flash load; stationary and vibration data; physical PPM disconnect; handset latency/congestion and ACK loss; real ESC waveform/50/250 Hz compatibility; motor direction/spin/minimum/calibration tones; power reconnect; radio handover with the receiver; OTA interruption/recovery. Release acceptance files are not marked PASS by software tests.

Future flight PID integration must still add independently reviewed authorization/failsafe/motor mixing, hardware deadline acceptance, actual ESC compatibility and appropriate filtering. A healthy shadow scheduler alone does not make this kit flight-ready.

## Primary references

- [MPU-6000/6050 register map, InvenSense/TDK](https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Register-Map1.pdf), CONFIG/DLPF, ranges, output registers, DATA_RDY.
- [ESP32-C6 ESP Timer, ESP-IDF 5.5.2](https://docs.espressif.com/projects/esp-idf/en/v5.5.2/esp32c6/api-reference/system/esp_timer.html), task dispatch, short callbacks, notification and skipped-event policy.

## Recorded software evidence (2026-11-03)

- [A1/A2 exact-source rebuild and integrity checks](https://github.com/chilchiltrips-boop/dronelab/actions/runs/41591558300): PASS, source commit `741394f6ecc1bee6109513596a0a59419d0ad2d0`; generated image commit `ec49bffa847b7326a265f00ff9527acb6bdc49e8`.
- [Timing/IMU, A2 setup/motor, authoritative status and simulator-startup browser integration](https://github.com/chilchiltrips-boop/dronelab/actions/runs/41591563968/job/125769240809): PASS, simulated Kit data only.
- Local final suite: 670 tests total, 668 PASS and 2 existing skips. `npm run check`: PASS, 56 modules and 15/15 model assets.
- Early PR source checks correctly rejected stale pre-rebuild images. A browser export assertion initially assumed compact JSON spacing; it now inspects the parsed event structure. No firmware-integrity gate or browser assertion was bypassed.
- Physical rates, latency, jitter, noise, real motor/ESC behavior and flight stability: NOT_RUN. The new counters become measured device evidence only after running this firmware on real hardware.
