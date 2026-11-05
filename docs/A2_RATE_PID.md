# A2 PID settings and Aerof450 profiles

Setup Wizard → Frame & wiring offers **Aerof450 · Quad X** and **Aerof450 · Quad +**. Choose the layout for the board wiring. After the wiring has been saved and verified, **Load & Save PID Profile** stores all five PID banks in FlightCore and activates them in RAM. PID Tuning reads the verified profile and revision from the same Kit.

Both profiles start with these provisional gains. Replace each profile's values in [pid-profiles.js](../js/pid-profiles.js) after physical qualification, then regenerate the firmware header with `node tools/sync-pid-profiles.mjs`.

| Loop | Axis | P | I | D |
| --- | --- | ---: | ---: | ---: |
| Rate | Roll | 1.4 | 18 | 0.035 |
| Rate | Pitch | 1.4 | 18 | 0.035 |
| Rate | Yaw | 3 | 20 | 0 |
| Angle | Roll | 3 | 0 | 0 |
| Angle | Pitch | 3 | 0 | 0 |

The simulator and A2 use matching gain units. Rate PID uses angular-rate error in degrees per second and returns a correction bounded to ±400 µs. The outer Angle PID uses angle error in degrees and returns a rate setpoint bounded to ±220 °/s. The FC diagnostic mixer uses the selected frame geometry. The simulator models its educational F450 tripod and virtual dynamics.

## Using PID Tuning

- With a verified A2 connection, **Read PID from FC** loads the current active values into both editor sections. **Apply Live to FC** verifies a volatile RAM preview while disarmed. **Save to FC** persists both loops and reads back the saved revision. **Restore Defaults** uses the profile for the verified wiring.
- FlightCore 1.7.16 or newer supports both loops and RAM preview. FlightCore 1.7.14 and 1.7.15 retain Rate read, save and reset in the editor.
- With the Kit disconnected, **Apply to Simulator** and **Restore Defaults** operate on the simulator. Connecting to the FC reads its authoritative values. Disconnecting brings back the separate simulator values.
- Python Lab's existing A2 Rate PID example can read and save the nine Rate gains. On the dual-loop API, Rate-only saves retain the saved Angle gains. Passing both Angle banks saves all 15 values together.

A2 preview is for disarmed bench diagnostics. The Angle estimate requires a saved IMU level calibration and a valid upright gravity vector. The 250 Hz scheduler computes the Rate and Angle diagnostic response and mixer. Flight actuation remains gated off. See [A2 flight qualification](A2_FLIGHT_QUALIFICATION.md).

## Settings exchange

| Operation | Signed AP/STA | USB |
| --- | --- | --- |
| Read | GET `/api/pid/settings` | `ZJPID,GET,kitId,requestId` |
| Save | POST `/api/pid/settings` | `ZJPID,SET,kitId,requestId,bootId,expectedRevision,expectedGeneration,profile,gains` |
| Live preview | POST `/api/pid/apply` | `ZJPID,APPLY,kitId,requestId,bootId,expectedRevision,expectedGeneration,profile,gains` |
| Defaults | POST `/api/pid/reset` | `ZJPID,RESET,kitId,requestId,bootId,expectedRevision,expectedGeneration,profile` |

Writes require authorized network control or USB teacher admin, disabled motor outputs and matching saved frame geometry. Schema 2 encodes 15 pipe-separated integer thousandths in Rate Roll, Rate Pitch, Rate Yaw, Angle Roll and Angle Pitch P/I/D order. Readback distinguishes the saved revision from the active RAM generation and identifies the request.

Each save stages and verifies a slot before updating the marker that identifies the committed revision and its backup. The boot loader can recover the verified previous slot if the active slot is corrupt. Readable schema-1 settings migrate on save while retaining legacy values for APP rollback. Corrupt legacy records without verifiable commit provenance report a storage fault. RAM preview is cleared on reboot. Factory reset clears both storage schemas. APP OTA retains compatible records.
