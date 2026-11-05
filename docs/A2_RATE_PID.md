# A2 Rate PID settings and timing

The existing PID Tuning page uses the same Rate Roll, Pitch and Yaw gain units as A2 FlightCore and Python Lab. P scales angular-rate error in deg/s, I integrates that error in seconds and D filters the derivative of measured rate. Outputs are microsecond corrections with a ±400 µs limit. The simulator applies these corrections to its educational tripod model. Its motor lag and rotational damping are virtual model parameters.

| Axis | P | I | D |
|---|---:|---:|---:|
| Roll | 1.4 | 18 | 0.035 |
| Pitch | 1.4 | 18 | 0.035 |
| Yaw | 3 | 20 | 0 |

These defaults are experimental. The A2 250 Hz scheduler computes diagnostic Rate PID and Quad X mix in Acro with fresh, calibrated gyro data and diagnostic RC ARM. Invalid timing, sensor loss, disarm and source changes clear controller history. The computed mix has no motor-output connection. Angle attitude control and physical flight activation require separate hardware validation. The existing 50 Hz ESC driver, bench sessions, one-use ESC calibration and watchdog retain their own authorization.

## Settings exchange

On direct AP/STA, use signed GET /api/pid/settings or GET /api/pid/status, and encrypted POST /api/pid/settings or POST /api/pid/reset. STA observer sessions can read. Writes require authorized control and an idle, disarmed Kit. Release another network controller's claim before saving. USB uses ZJPID,GET,kitId,requestId and ZJPID,SET,kitId,requestId,bootId,expectedRevision,gains or ZJPID,RESET,kitId,requestId,bootId,expectedRevision. USB writes require an unlocked teacher admin session.

Gains are nine pipe-separated integer thousandths in Roll P/I/D, Pitch P/I/D, Yaw P/I/D order. The 0–100 bounds and three decimals apply to all nine. Replies identify the schema, Kit, boot, revision, request and saved values. Revision zero exposes defaults. A committed versioned record has an integrity checksum and is verified before the active NVS slot is published. Factory reset clears it. APP OTA retains compatible records.

In Python Lab, select **A2 Rate PID settings** to open the runnable example. The browser and Python use the same persistence and readback checks. After a reconnect or Python save, the editor reads the authoritative revision and preserves any simulator draft until you choose to reload or save.

## Hardware acceptance

Record operator, device ID, firmware version, the exact APP SHA-256, the build report's source commit, the repo-relative evidence file, and its SHA-256. The user reported ESC calibration and motor response in a bench test on 5 November. Formal release cases require measurements tied to the tested release artifact. Verify the PWM waveform and physical OFF, M1–M4 mapping, input loss and STOP, interrupted ESC calibration, settings after reboot and timing under measured load. Use a propeller-free fixture for bench verification.
