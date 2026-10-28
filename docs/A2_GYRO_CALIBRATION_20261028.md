# A2 startup gyro zero-bias calibration

Candidate release: WebApp 1.14, Android 1.8.19 / code 57, FlightCore 1.5.14.

Every A2 power-on/reset or sensor recovery performs a new RAM-only calibration.
The MPU6050 stays at address 0x68, DLPF=5, +/-500 degrees/second, 65.5 LSB/(degree/second), and 400kHz I2C on GPIO22/23. Normal readings remain scheduled at 50Hz. A1 LSM6DS3 behavior is unchanged. No accelerometer, attitude filter, physical PID, actuator or motor-output changes are included.

After WHO_AM_I and configuration read-back, a 250ms settling phase precedes acquisition. SMPLRT_DIV=0 selects the existing DLPF-enabled 1kHz sensor output. INT_ENABLE data-ready and INT_STATUS polling establish fresh frames without needing an MCU interrupt pin. At most one acquisition is performed per cooperative update; there is no blocking 2000-iteration calibration loop. No ready bit means no accepted sample. I2C failure/short reads invalidate readiness and trigger the existing 2.5s probe backoff.

2000 accepted samples establish each zero-rate bias. Raw rates minus this bias are published through the existing rate fields and deg/s units. A completed calibration sample is not published as a live corrected sample: the next fresh normal read establishes READY. Power cycles and sensor recovery never reuse a previous bias.

The board must be held still. A +/-25 deg/s plausibility limit, 1.5 deg/s acquisition spread, and 0.35 deg/s standard-deviation limit detect obvious motion and restart the window with a 200ms cooldown. These are initial bench thresholds, not proof of complete stationarity: gyro-only observations cannot distinguish every constant rotation from zero-rate bias. Each attempt has a 15s deadline. Failed attempts are reported and retried after 2.5s; other firmware services continue running.

## Telemetry and diagnostics

The ZJTEL 12/20-field layout is unchanged. CALIBRATING and CALIBRATION_FAILED are non-ready states. Existing corrected RateRoll/Pitch/Yaw APIs remain unchanged. A new additive `imu` object in signed status/telemetry carries state, attempt, sample count/target, duration, raw/bias/corrected rates, standard deviations, I2C read/write counters, last error code, WHO_AM_I/config read-back, sample age/sequence, acquisition gaps and missed sample estimates. The RAM summary remains readable when a browser connects after calibration has finished. A lifetime failure count and last failure reason/uptime/attempt survive automatic retries until the next board reboot.

Separate low-rate USB records are emitted only if the complete line fits available TX space; otherwise a diagnostic-drop counter increases. They never change ZJTEL positions:

- `ZJIMU,1,A2,attempt,state,samples,target,durationMs,restarts,biasX,biasY,biasZ,error,readFailures,writeFailures,whoAmI,configValid,dataReady`
- `ZJIMUE,1,A2,failures,lastFailure,lastFailureMs,lastFailureAttempt`
- `ZJIMUS,1,A2,attempt,rawX,rawY,rawZ,correctedX,correctedY,correctedZ,sampleSequence,sampleAgeMs,maxGapUs,calibrationMaxGapUs,missedSamples`

WebApp/Android retain the existing 350-event private CSV/JSON recorder. Progress and steady samples are bounded; state/restart/I2C error changes are recorded. Board/device-session binding is checked before observation, and identifiers/credentials remain excluded from exports. The Python bridge waits for READY within the caller's single deadline, preserves identity/freshness checks, and reports calibration-specific timeouts instead of a false wiring failure. Desktop Python accepts both telemetry layouts and progress records. It never subtracts the bias a second time.

## Required automated checks

- Execute the actual A2 and A1 IMU code under the host Wire/time double.
- Known raw biases -> 2000 fresh readings -> approximately zero corrected stationary readings; known added angular rates are preserved once.
- No READY before completion or before the first fresh corrected sample.
- Data-ready absence, I2C NACK/short read, configuration mismatch, motion restarts, deadline, sensor recovery and clock rollover.
- USB/AP/STA/relay Python waits, correct rates, wrong Kit/session rejection, stale data rejection and bounded timeouts.
- Diagnostic progress/result retention on late connection, fractional values, privacy, CSV/JSON export and the 350-event bound.
- Existing RC/PPM, Wi-Fi, LED, OTA, Python and UI regressions; identical index/lab DOM.
- Verified A1/A2 APP/FACTORY image/source manifests, exact-source release checks, pinned signing, native signed Android upgrade/touch in both landscape directions, and API30 networking.

## Real A2 bench acceptance — NOT_RUN

No physical-board or handset acceptance is claimed by host/browser/CI results.

1. On a stationary board, power-cycle at least five times; each boot must acquire a new calibration and produce READY. Record sample counts, duration and XYZ biases.
2. Log ten stationary seconds after READY. An initial proposed bench target is a mean within +/-0.5 deg/s on each corrected axis; establish actual noise/drift from the board rather than treating this as a manufacturer guarantee.
3. Rotate each axis both ways; verify mounting-dependent sign/axis mapping and a return near zero when stopped. This does not measure absolute rate accuracy without a reference.
4. Start with obvious movement, then stop. Check restart counts, bounded failure if movement persists, and subsequent recovery.
5. Introduce a controlled I2C fault and restore the sensor. No fake ready/zero reading may be admitted; a new calibration must occur.
6. Exercise USB/AP/STA, PPM and LED during startup/recovery and inspect read gaps, frame age, error counters and connection health. Export both WebApp and Android logs.
