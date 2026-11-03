# Timing baseline — source ad3aa50f65e6e652f578b18bab5bcf39281830c8

Audit performed 2026-11-03 before behavior changes. All rates below are configured or derived from source, **not hardware measurements**. Hardware acceptance is NOT_RUN.

| Subsystem / source | Existing configured rate | Clock / freshness / blocking and queue policy | Decision |
|---|---|---|---|
| Arduino loop (`I2C_ADDRESS_SCANNER.ino`) | As fast as services allow | millis; cooperative Serial/HTTP/mDNS/flash can delay loop; no control tick | Add independent non-actuating 4 ms worker |
| A2 normal MPU6050 | 50 Hz polling, internal 1 kHz ODR | DATA_RDY at 0x3A; 6-byte gyro only; age/sequence; I2C timeout currently default | Prepare independent 250 Hz acquisition, bound bus operations |
| A2 startup calibration | Poll at >=1 ms; 2000 fresh samples | 250 ms settle, 15 s deadline, motion/restart and config faults | Retain independent 1 kHz acquisition policy |
| A1 LSM6DS3 | 50 Hz polling, 104 Hz sensor ODR | WHO_AM_I, gyro; main loop | Retain A1 sampling/configuration |
| MPU6050 filter/range | DLPF=5 (10 Hz gyro), ±500 dps / 65.5 LSB/dps | Configured and read back once per initialization | Retain filter; report delay; evaluate candidates on hardware |
| PPM A2 RMT / A1 ISR (`FlightCorePpm.h`) | Receiver native, expected ~50 Hz | Priority 4 RMT task; single latest-frame mailbox, capture sequence + conservative arrival; 150 ms signal-loss deadline | Retain capture, 10 Hz serial diagnostic reporting |
| PPM yaw ARM/DISARM | Per consumed valid frame | Throttle <=1050, yaw >=1900 / <=1100, hold; physical motor session remains separate | Retain validation/gesture/failsafe |
| Android AP/STA secure UDP (`FlightCoreUdpStream.java`) | 50 Hz (20 ms) | Scheduled sender; encrypted sequence/auth, feedback watchdog | Retain; no evidence to prefer 20 Hz |
| Firmware UDP RX / apply (`FlightCoreUdp.h`) | RX task priority 2, empty poll 2 ms / apply <=50 Hz | Single pending authenticated frame; receive and apply timestamps; 500 ms RC deadman (1800 ms ownership lease); immediate disarm apply exception; bounded feedback | Instrument actual receive/apply and coalescing; retain defaults |
| Encrypted feedback v2 | RX_ACK 10 Hz + APPLIED_ACK 10 Hz, transitions immediate | Separate receiver socket owner; terminal NACK ordered/generation checked | Retain; lost ACK != lost PPM |
| Android WebRTC simulator (`companion-flight.js`) | 25 Hz (40 ms) | Ack state, 650 ms watchdog, queue-pressure checks; simulator authorization distinct from physical bench | Retain |
| WebRTC mirror | <=20 Hz (50 ms minimum) | Most recent diagnostic stick data; own session/sequence | Retain |
| WebRTC-to-kit bench (`FlightCoreMotor.h`, `js/motor-setup.js`) | Existing bounded forwarding/polling | Explicit authenticated bench session; sequence and <=200 ms age; STA only | Retain |
| WebApp STA RC (`js/classroom-kits.js`) | ~9.09 Hz scheduled (RC_INTERVAL=110 ms), in-flight guard | Serialized authenticated requests; actual rate bounded by RTT, stale sends skipped | Retain schedule; do not claim actual 9.09 Hz |
| USB RC diagnostic | Producer paced | Ordered serial commands, 96 byte parse budget/loop; RC ownership/deadman | Retain |
| USB telemetry | Default 20 Hz; selectable 10/20/50 | millis; output-buffer skip/drop accounting; COMBINED/RAW compatible | Retain; instrument actual emitted rate |
| IMU detailed USB diagnostics | 2 Hz aggregate, alternating sample/progress/error | Bounded buffer check, own drops | Retain |
| Authoritative USB state / access | 4 Hz / ~1.33 Hz | Separate versioned records | Retain; new timing record separate |
| WebApp dashboards (`classroom-kits.js`) | 100 ms controller observation; status polling 2.2 s | In-flight guards, identity/generation checks; hardware input freshness separate from observation age | Retain; expose timing in existing diagnostics |
| ESC LEDC (`FlightCoreMotor.h`) | 50 Hz, 14-bit, 1000–2000 us | Timer 3 / channels 0–3; outputs zero until separate authorized bench session | Preserve default; pure validated inactive 250 Hz profile |
| LED PWM | 5 kHz, 8-bit | Arduino first allocator timer 0, channel 5 | Preserve independent ESC timer |
| Motor watchdog | Timer task every 5 ms | 100 ms servicing bound for live session; hard operation deadlines for timed bench | Keep timer callback short; no acquisition on shared timer task |
| Single/all/slider/input tests; minimum speed | Explicit finite operations | Safety state machine, owner token, source identity, input age; saved config readback | Retain all modes and mapping |
| ESC calibration | Operator initiated high/low phases only | Watchdog and authorization; saved operator tone confirmation survives reboot | Retain; no boot calibration |
| AP↔STA handover (`FlightCoreHandover.h`) | Event driven | Capture continuity distinguishes busy consumer from physical loss; throttle/owner/maintenance blockers | Retain PR #132/#133 invariants |
| OTA/provisioning/flash | Background event driven | Busy/ownership checks; flash may stall CPU/cache; never restore motor arming | Retain protections; record missed deadlines, never hide stalls |
| GPS/baro/magnetometer | Not implemented | No measurements available | Timestamped extensible sample contract only |

Actual rate, jitter, CPU usage, vibration, end-to-end latency and ESC compatibility require a real A1/A2, receiver, ESC and handset. No fixed frequency is used as a substitute for a measured rate. Browser and host simulations cannot certify hardware behavior.
