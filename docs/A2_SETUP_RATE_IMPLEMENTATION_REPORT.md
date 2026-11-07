# Setup-to-Rate implementation report — 2026-11-07

Starting main: `8dd0a269842a805dcbfdc10e6f7cf3d7eae28d95`. Later main CI optimization `3bf5757b9ec9f36bb9204548c611e1aa3f90de77` was integrated without removing its reduced trigger scope. Branch: `fix/a2-setup-arm-flow-20261107`. Review: [PR #170](https://github.com/chilchiltrips-boop/dronelab/pull/170).

## Findings and changes

- Main's physical-output gate remained locked in ordinary builds. The old opt-in acceptance macro conflated enabling outputs with evidence of hardware qualification. Explicit experimental PPM/Acro output is now a separate build capability; physical qualification remains false.
- Automatic ESC setup could complete while Flight ARM still required the obsolete manual tones-confirmed flag. Existing verified automatic sequence records now satisfy this software readiness check. No duplicate qualification checklist or USB ARM is needed.
- Setup completion previously depended on PWM being OFF, which could revoke its own readiness during flight. Persisted setup completeness is independent of transient driver state. Entry into flight still requires actual OFF acknowledgment, fresh input, low throttle and verified saved PID.
- Every fresh disarmed-to-armed PPM edge is consumed once. Correcting a blocker while the receiver remains armed cannot silently enable outputs. Receiver loss, STOP and faults require a new disarmed/ARM sequence.
- Failed LEDC OFF calls could leave misleading disabled state. STOP, maintenance, PID writes, handover and OTA now respect the driver OFF acknowledgment. Independent watchdog and exclusive output ownership remain intact.
- The WebApp/Android UI could report all outputs OFF or call any output BENCH. It now reports fresh signed firmware flight/driver state, and displays unknown when monitoring is stale. Input ARM is still distinguished from physical motor authorization. Input ACKs cannot renew an old motor-status observation; a separate timestamp prevents false fresh output labels. Shared motor output flags are atomic across the control worker, watchdog and main task.
- Ubuntu latest moved to 26.04 and the pinned Playwright failed before browser tests began. Browser jobs now use supported Ubuntu 24.04. No test was disabled.

## Controller and operator behavior

See [A2_SETUP_RATE_FLOW.md](A2_SETUP_RATE_FLOW.md) for the exact flow. Existing 250 Hz measured-dt PID, calibrated gyro, saved Quad X/+ mixer, 50 Hz/14-bit PWM and 8 ms watchdog lease remain in use. Input mapping is 0.15 degrees/second per microsecond, 15 microsecond deadband and 75 degrees/second limit. Low throttle at or below 1050 microseconds resets all axis integrators/mixer feedback and commands 1000 microseconds while armed. DISARM/STOP/fault disables PWM. No 1180 microsecond unmeasured idle was introduced.

The existing PID editor and Python APIs are preserved. Saved FC settings are authoritative. Temporary preview does not authorize flight. Real Angle mode and physical Android/Web/WebRTC flight remain unsupported; this candidate enables only PPM + Acro/Rate. Completing Wizard setup does not establish stable flight or calibrate PID gains for a real airframe.

## Verification

- Local regression after integrating current main: **710 PASS, 2 SKIPPED, 0 FAIL** (712 total).
- Source/asset validation: **PASS**, 60 ES modules, 35 references, 15 GLBs.
- Tests execute the production control worker, ARM function and driver with host hardware doubles: normal output, low throttle/reset, STOP, disarm, receiver/source loss, stale IMU, invalid PID, deadline fault, watchdog and driver errors.
- Local Chromium: Wizard/ESC/output setup, Aerof450 dual-loop PID, trace export, authoritative status/viewports, bench import/rollback, Android direct AP touch/STOP, and real compiled experimental APP/FACTORY import: **PASS**. File routing was used locally; it does not prove radio or service-worker behavior. GitHub runs real HTTP browser checks separately.
- Initial exact-source A1/A2 bench and experimental A2 build: **PASS**. Build source `21cd85dfd80cad3cd93200c1a7f8a8f02703cf1c`, [run 42342360598](https://github.com/chilchiltrips-boop/dronelab/actions/runs/42342360598). Later reviewed candidate provenance is stored with its artifacts.
- Strict production acceptance: **BLOCKED**, 31 physical/deployment cases NOT_RUN and no matching operator-tested source record. Existing evidence was not relabeled or fabricated. Ordinary production catalog and publication hold are retained.
- Physical board, propeller-free motor/mixer direction, PWM waveform, PPM failsafe/AP fallback, loaded timing, real Android handset upgrade and flight: **NOT_RUN**. No hardware was attached to this session.
- Queue latency and reconnect radio measurements: not measured on hardware in this update; existing software regression remains enabled.

## Before controlled physical flight evaluation

Use the explicitly imported experimental artifact and complete saved setup/PID. With propellers removed, verify wiring/direction and correcting mixer signs, measured 50 Hz pulse widths, real STOP/loss/IMU failsafe, and steady-state timing under Wi-Fi load. Export the FC RAM trace after disarm. Record operator evidence against the exact APP hash/source. Validate an airframe-specific PID profile and idle behavior before a controlled first flight. No stored profile currently constitutes a flight-stability guarantee.

## Files changed from the starting main

- `.github/workflows/a2-motor-setup.yml`
- `.github/workflows/a2-rate-experimental.yml`
- `.github/workflows/accordion-browser.yml`
- `.github/workflows/aerion-header.yml`
- `.github/workflows/android-flight-controller.yml`
- `.github/workflows/ap-streaming.yml`
- `.github/workflows/authoritative-status.yml`
- `.github/workflows/browser-python-lab.yml`
- `.github/workflows/build-i2c-scanner.yml`
- `.github/workflows/full-page-input-fit.yml`
- `.github/workflows/grant-toggle-layout.yml`
- `.github/workflows/legacy-connectivity-browser.yml`
- `.github/workflows/pid-shell.yml`
- `.github/workflows/publish-flightcore-bench.yml`
- `.github/workflows/qr-browser-test.yml`
- `.github/workflows/simulator-input-mirror.yml`
- `.github/workflows/smart-setup-auto.yml`
- `.github/workflows/sta-discovery-recovery.yml`
- `.github/workflows/timing-foundation.yml`
- `.github/workflows/tripod-simulator.yml`
- `.github/workflows/udp-management.yml`
- `.github/workflows/v2-safe-fixes.yml`
- `.github/workflows/version-stamp.yml`
- `CHECKS.md`
- `FlightCore_Firmware/FlightCoreClassroom.h`
- `FlightCore_Firmware/FlightCoreControlRuntime.h`
- `FlightCore_Firmware/FlightCoreFlightOutput.h`
- `FlightCore_Firmware/FlightCoreHandover.h`
- `FlightCore_Firmware/FlightCoreMotor.h`
- `FlightCore_Firmware/FlightCoreMotorStatus.h`
- `FlightCore_Firmware/FlightCoreNetwork.h`
- `FlightCore_Firmware/FlightCoreOta.h`
- `FlightCore_Firmware/FlightCorePidApi.h`
- `FlightCore_Firmware/FlightCoreRateTraceApi.h`
- `FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino`
- `FlightCore_Firmware/bench-release-policy.json`
- `FlightCore_Firmware/publication-hold.json`
- `README.md`
- `VERSION.txt`
- `companion-flight.js`
- `companion-network.js`
- `docs/A2_ACRO_PHYSICAL_READINESS.md`
- `docs/A2_FLIGHT_QUALIFICATION.md`
- `docs/A2_SETUP_RATE_FLOW.md`
- `docs/AI_UPDATE_GUIDE.md`
- `firmware-updater.js`
- `index.html`
- `js/a2-setup-wizard.js`
- `js/classroom-kits.js`
- `js/firmware-image.js`
- `js/kit-access-policy.js`
- `js/kit-ack-diagnostics.js`
- `lab.html`
- `mobile-android/app/build.gradle`
- `package.json`
- `tools/a2-motor-host-fixture.mjs`
- `tools/ack-diagnostics.test.mjs`
- `tools/acro-flight-readiness.test.mjs`
- `tools/android-camera-permission.test.mjs`
- `tools/bench_release_gate.py`
- `tools/build_scanner.py`
- `tools/ci-impact.mjs`
- `tools/ci-impact.test.mjs`
- `tools/connection-freshness-recovery.test.mjs`
- `tools/experimental-rate-browser.mjs`
- `tools/firmware-target-mode.test.mjs`
- `tools/motor-bounded-bench.test.mjs`
- `tools/poco-x2-network-compat.test.mjs`
- `tools/release-signing.test.mjs`
- `tools/setup-rate-flight.test.mjs`
- `tools/timing-foundation-host.cpp`
- `tools/timing-foundation.test.mjs`
- `tools/udp-firmware-host.cpp`
- `tools/verify_experimental_rate.py`
