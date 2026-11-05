# A2 flight candidate qualification

Current versions come from [WebApp metadata](../app-version.json), the [published firmware catalog](../firmware-catalog.json), the [candidate firmware version](../VERSION.txt) and [Android APK metadata](../mobile-apk/ANDROID_RELEASE_META.txt). The firmware publication hold pins the existing A1/A2 package while CI compiles and uploads candidate APP and Factory images. The candidate is intended for controlled bench qualification. Production promotion requires the candidate’s strict acceptance evidence and review.

For bench testing, open **Devices & Firmware → Firmware Flash**, select **A2** and choose **Load 1.7.16 Bench**. On an enrolled kit with the dual-OTA layout, use the APP image and authorized Wi-Fi OTA to retain settings. Use the FACTORY image over USB for first installation or recovery. After flashing, check that **Running FW** reports 1.7.16 and the loaded build time. The bench catalog identifies the exact compiled artifact and marks physical flight output locked.

## Receiver and recovery

| Input | Route | Physical ownership eligibility |
| --- | --- | --- |
| Android AP joystick | Direct AP | Selected, authorized and fresh diagnostic RC |
| Android WebRTC joystick | STA WebRTC | Simulator or existing bounded bench feature |
| PPM RX/TX | Wired receiver | Selected or AUTO, calibrated and fresh diagnostic RC |
| WebApp joystick | Direct STA | Selected, authorized and fresh diagnostic RC |

FlightCore sends an authenticated `rc.receiver` snapshot with source ID, generation, accepted count, packet sequence, board receive time and availability mask. Channel order is roll, pitch, throttle, yaw, AUX5–AUX8. PPM maps its first five logical channels from the stored mapping and reports the remaining three unassigned channels in physical order. A source can omit auxiliary channels and those positions read as null. Radio observation age is separate from ownership and from the firmware deadman.

PPM calibration and mapping commit together in a schema-2 record with checksum, revision, two slots and an active marker. The previous record remains readable after a failed stage or marker write. Valid legacy calibration and mapping load before the first successful schema-2 write. The serial setter returns `ZJPPM,NACK,STORAGE_FAILED` when persistence verification fails.

Actual receiver loss revokes ownership and resets the low-throttle yaw gesture. A selected PPM source on STA can trigger AP fallback after 350 ms of confirmed loss. The firmware requires driver OFF acknowledgement on A2, waits at most 5 seconds for clear interlocks, and preserves the stored STA profile. Returning to STA and rearming require explicit actions. Short gaps cancel fallback during debounce. A failed handover retains disarm and exposes an error.

The request scheduler retires stale queued writes after a connection-generation change and coalesces diagnostics. STOP aborts an obsolete active read and cancels queued motion while keeping signed operations serialized. An in-flight write may have completed. Reconcile an uncertain PID write with verified readback. Queue age, network wait and recovery reason are available in ACK diagnostics.

## Rate control and safety

The [shared Rate PID settings contract](A2_RATE_PID.md) applies to the existing WebApp and Python editor. On the A2, the MPU6050 X/Y/Z rates map to roll/pitch/yaw after gyro bias calibration. The command mapping clamps stick pulses to 1000–2000 µs, uses a ±15 µs center deadband and scales the remaining offset by 0.15 °/s per µs. The candidate span is ±75 °/s. FlightCore tests the following software signs. Confirm the mounted sensor and actual thrust/reaction signs on the fixture.

| Logical output | Location | A2 default pin | Expected rotation | Roll, pitch, yaw correction signs |
| --- | --- | --- | --- | --- |
| M1 | Front left | D0 | CW | − − − |
| M2 | Front right | D1 | CCW | + − + |
| M3 | Back right | D2 | CW | + + − |
| M4 | Back left | D3 | CCW | − + + |

The mixer uses microseconds, clamps pulses to 1000–2000 µs, and feeds saturation back to the next PID step. The shadow calculation is scheduled at 250 Hz. A2 output remains 50 Hz, 14-bit. The separate flight-output gate models explicit arm, low throttle, output OFF acknowledgement, source changes, IMU freshness, deadline faults and competing output owners. Firmware exposes `flightQualified=false` and `flightOutputAuthorized=false`. The candidate mixer has no actuator handoff. Angle bench preview uses the calibrated upright gravity vector. Flight-grade attitude estimation and dynamic validation are still required for physical Angle mode. Existing bench, automatic ESC calibration and watchdog paths remain independent.

Timing telemetry separates startup, IMU calibration, disarmed and RC diagnostic maxima. It includes actual interval, wake jitter, skipped ticks, IMU sample age and acquisition time, PID compute time and driver update time. Host tests exercise a 120.6 ms interval and verify deadline fault handling. Board traces are required to identify the cause of the observed startup spike and measure timing under load.

## Propeller-free evidence sequence

1. Use a current-limited bench supply and remove all propellers. Record the candidate CI run, build-report source commit and APP SHA-256. Confirm the exact running version and build timestamp over USB and signed Wi-Fi.
2. Exercise authorized PID and PPM writes, restart, and read back saved revisions and channel mapping. Verify unauthorized, stale-revision and armed-state writes are rejected.
3. Log 50 Hz PWM and OFF on all four outputs with a scope. Check configured pins, orientation and rotation one motor at a time. Run the one-use ESC and output calibration steps and read back their controller-side results after power-cycle.
4. Capture STOP, PPM signal interruption, AP fallback, STA recovery, IMU failure and control deadlines under active diagnostic load. Collect board timestamps and scope traces. Check that reconnection leaves motor authorization revoked. Verify Android upgrade and OTA interruption on test hardware.
5. Record observed outcomes in [the ledger](release-acceptance.evidence.json). After wiring and safety review, validate an explicitly qualified actuator handoff on the restrained fixture before approving any flight test. Angle/self-level validation is a separate requirement.

Each strict PASS attaches a repository-relative JSON manifest and its SHA-256. The manifest includes `schema` (1), `caseId`, `result`, `operator`, `observedAt`, `deviceId`, `firmwareVersion`, `sourceCommit`, `artifactSha256` (exact APP for a board case), `logRef`, `logSha256`, `notes` and `signature`. Attach a separate redacted observation log. For A1 and A2 cases, the Device ID must be the actual board's `ZFC-A1-` or `ZFC-A2-` identity.

The operator signs the bytes returned by `evidenceSigningPayload(manifest)` in [release-acceptance.mjs](../tools/release-acceptance.mjs) using Ed25519. Record the detached signature as unpadded base64url in `signature`. Configure the protected release job's `ZJ_ACCEPTANCE_OPERATOR_KEYS` with a JSON map of trusted operator names to SPKI PEM public keys. Keep private keys with the authorized operators. The strict gate requires signatures from those configured keys and checks digests and artifacts. A qualified operator must perform and review the physical observations.
