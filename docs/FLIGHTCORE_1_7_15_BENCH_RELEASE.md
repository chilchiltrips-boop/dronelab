# FlightCore 1.7.15 bench-diagnostic publication

The 1.7.15 APP and FACTORY images are eligible for *bench diagnostic* publication after exact-source A1/A2 compile and software tests pass. The hardware flight output qualification flag remains false, the Rate PID control task does not actuate motors, and physical flight acceptance remains NOT_RUN.

## Procedure
1. Validate release branch candidate builds and software tests. Branch runs upload artifacts without altering the 1.7.14 stable binaries.
2. Merge reviewed release changes to main. Main build checks 1.7.15 bench policy, compiles A1/A2 images, verifies SHA/source metadata, runs npm tests/code check, and publishes matching artifacts only if all steps pass. Failed builds leave 1.7.14 untouched.
3. On successful publication, main firmware catalog and latest metadata must say 1.7.15 BENCH_DIAGNOSTIC / flightOutputQualified=false / physicalAcceptance=NOT_RUN; the old publication hold is removed.
4. Physical flight production is independently blocked by school-production strict acceptance. Never falsely mark hardware cases PASS.

For the A2, remove propellers and test saved Rate PID gains via WebApp and Python, independently verify power-off/reconnect persistence, PPM loss, STOP, ESC pulse width/mapping and motor OFF. The user reported ESC calibration and motor operation previously, but that alone is not full release acceptance.
