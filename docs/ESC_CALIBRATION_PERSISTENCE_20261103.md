# Saved ESC calibration and app sound cues

FlightCore 1.7.5 stores an operator-confirmed ESC calibration record in board NVS (`motorCal1`) for the fixed 50 Hz / 1000–2000 µs PWM profile. `CAL_CONFIRM` requires an authorized caller, outputs off, a completed LOW phase in this boot, and `TONES_CONFIRMED`. It does not create a motor session or enable PWM. Storage writes are read back; a failed write leaves confirmation pending so it can be retried.

The record survives controller power cycles, normal STOP, motor tests, layout/minimum saves and browser reloads. Starting a new calibration invalidates the old record before HIGH is applied. A timeout, interrupted LOW or board reset before confirmation cannot create a saved record. Factory reset clears it. A saved record does not arm motors or replay calibration on boot.

Each ESC owns its actual endpoint settings; endpoint retention follows that ESC's implementation. The board record reports the operator's success-tone confirmation, not an acoustic measurement or proof that the same ESCs remain connected. Use Recalibrate after replacing ESCs or changing their endpoint profile.

Status adds `calibrationSaveSupported`, `escCalibrationSaved` and `escCalibrationPending`. WebApp restores the saved state in Calibration, Motor Test and Report after reconnect/reload. Firmware without this capability can still calibrate and record session-only confirmation, but the UI explicitly requires 1.7.5 for board persistence. Python `calibrate_esc()` uses the existing interactive tone confirmation and returns `calibrationPersisted`.

Optional app cues distinguish HIGH sent, LOW sent, LOW finished, save success, motor start/stop and command errors. Sound is unlocked by a user gesture, can be muted, and cannot block hardware commands if audio is unavailable. App tones never substitute for the ESC's own tones.

Host checks exercise authorization, incomplete/failed calibration, NVS write/readback failure, simulated reboot, factory reset and saved-record reuse without output activation. Browser checks exercise save failure/retry, reconnect with a new boot ID, browser reload, direct motor testing without repeating calibration, sound toggle and responsive layout. Physical ESC endpoint retention and audible tones still require a bench test with the user's actual ESCs.
