# Detailed implementation and acceptance assignment

This is an implementation in the existing DroneLab repository, not a new application. Read WORK_MASTER_PROMPT first, then the updated audit, architecture, math and exhaustive test matrix. Preserve the existing style, GLB identity, pairing security, Android update identity and every retained lab.

## WebApp

Use `/tripod.html` as the only Flight Training destination. Preserve legacy hash redirects. The page contains the same F450 on the same constrained stand, seven camera views, the controls/mirror, four motor command and requested/actual-RPM readouts, quantitative constrained travel, rate/angle traces, outer/inner PID terms, all tuning controls and environment/noise/lag sliders. Remove the old Android Flight iframe and virtual WebRTC LED feature everywhere; keep real wiring and Python LED examples.

The top-right gear opens Connection Settings with Pair Mobile, camera two-way QR, optional six-digit codes, PIN verification, approval, explicit owner grant/release, Web take-control, disconnect, STOP, expiry/heartbeat and actual channel statistics. No camera starts during Step 1 or before a gesture. Close/reopen preserves a valid channel and closes any camera. STOP remains reachable even while a dialog is open. Refresh/navigation requires a fresh session and explicit ARM.

## Android

Cold-open into the landscape cockpit with always-visible connection/owner/mode/ARM/STOP/gear controls. Provide independent floating thumb zones and precise first-touch zero anchoring; support simultaneous native MotionEvent pointers, cross-zone capture, one-finger release, cancel and third-finger STOP. A disconnected/unarmed app provides clear visual input preview without throttle integration or transmitted commands. The intro is nonblocking, bounded and skipped by touch/reduced-motion.

Preserve Slow/Medium/Fast presets (200/400/600 µs/s full stroke with their deadband/expo), radial clamping and reversed yaw. Flight control needs approved pairing, explicit mobile grant, ready receiver, acknowledged DISARM and low-throttle ARM. Display receiver-applied controls and measured telemetry with sequence and measured RTT. Distinguish preview/requested/applied/owner states. Old feedback cannot roll back mode or ARM. On STOP, loss, timeout, pause, orientation or page teardown, clear captures/axes and disarm. Reconnection cannot silently resume flight.

Connection options live in the Android gear sheet. Preserve secure HTTPS asset origin, camera permission cancellation/denial handling, autofocus/torch capability checks, native lifecycle/network behavior and one application of safe insets. Keep package `in.zebjus.dronelab.companion`, the pinned production certificate and code 12 over baseline code 11; never use the reference APK's identity/key.

## Mathematics and sensory feedback

Use the documented SI plant and fixed 4-ms timestep. Convert motor command into voltage-aware requested RPM, apply exact exponential motor lag and calculate actual thrust proportional to squared angular speed. Torque and motor labels/spin signs must match the assembly. Integrate roll/pitch/yaw body dynamics and a bounded spring/damped mast travel with support forces and hard stops; never detach the drone or invent free-flight altitude hold.

Keep pure ACRO zero-rate release and separate Angle→Rate cascade. Preserve separate banks and scaling, filtered D on measurement, mixer saturation and antiwindup. Live gains apply at the next physics boundary without resetting pose/throttle/RPM; integrator reset is explicit. Compare identical initial state, load, voltage, lag, seeded gyro noise and disturbance for Stable/Low P/High P/Low I/High I/Low D/High D; export real target/actual/P/I/D/motor/RPM/thrust/travel and quantitative metrics. Use N/A for undefined metrics.

Drive each rotor, blur, tube/rings, ground wash/dust and voice from the same actual per-motor state. The telescopic mast follows measured travel; numerical cm are accurate and the 2× visual magnification is disclosed. Use restrained lighting, attached red nose arrow, optional airflow intensity and low/adaptive graphics with a working 2D fallback. Quiet 25% audio uses smooth sine layers, low-pass wash and a limiter; gesture-only start, persistent mute/profile/volume and no residual voices after STOP/teardown. Perceived acoustic quality requires a physical listening check.

## Verification and publication

Run the full supplied TEST_MATRIX. Required available automated/native acceptance includes all unit checks, syntax/assets/GLBs, firmware hashes, Python execution/plotting, responsive labs, actual encrypted QR/code WebRTC, live PID, ownership/STOP/replay/jitter/backpressure, real Service Worker offline tests, native touchscreen events and signed in-place APK upgrade. Browser pointer events alone do not establish Android touch. Capture sanitized actual UI screenshots and deterministic CSV/metrics.

Keep PR #9 reviewable with implementation phases and traceable source SHAs. Reconcile current main before merging. Main/APK publication requires all mandatory checks for the exact source plus available device acceptance. A metadata-only Web version stamp must not rebuild/re-publish the Android APK. Do not expose signing secrets, pairing SDP, active QR/PIN/codes or install the reference APK. Report all unavailable physical-phone/camera/radio/cutout/120-Hz/acoustic tests as UNVERIFIED with the human script; no broad "fully phone tested" claim is permitted.
