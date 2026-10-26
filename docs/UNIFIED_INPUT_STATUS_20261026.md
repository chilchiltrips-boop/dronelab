# Four control paths and shared status — 26 October 2026

The header and device pages distinguish the selected path, firmware-accepted input, target, independent diagnostic permissions and telemetry age. Selecting a path does not arm input. A read-only WebRTC input targets the virtual simulator; it never claims physical Kit RC.

| Path | Kit Wi-Fi | Target | Prerequisites |
| --- | --- | --- | --- |
| Android AP | AP | Kit diagnostics | Authorized Android connected to the selected hotspot |
| Android WebRTC | STA | Virtual simulator | Approved paired Android; Run/Stop on WebApp |
| PPM RX/TX | AP or STA | Kit receiver diagnostics | Fresh physical receiver; low throttle and ARM switch off for handover |
| WebApp Joystick | STA | Kit diagnostics | Authorized browser; enable Kit target and explicitly use WebApp RC |

USB remains a verified monitoring/teacher-management transport and standalone simulator WebApp input remains available offline. Four-path writes require FlightCore 1.5.12 capability/readback; old firmware is labelled update-required rather than inferring that legacy Android STA input is WebRTC.

## Changes

- Shared policy and stable header popover in WebApp/Android, summaries in all eight device workspace views and Python/PID headers. Unavailable paths include a reason. Selection remains pending until same-Device-ID/boot/transport/connection readback.
- Firmware enforces path/source/radio matching, safe low-throttle/disarmed ownership handover and WebRTC/Kit target separation. Receiver ownership survives a deliberate safe AP/STA monitoring switch; the radio switch is rechecked at execution if physical controls changed after ACK.
- Fresh idle telemetry is IDLE even when RC sequence does not advance. Temporary status request failures show response-delayed while the previous identity heartbeat is still valid; authentication/identity errors and expired heartbeats fail closed. RC packet/ACK deadlines, PPM-loss watchdog and motor-disabled policy are unchanged.
- Late Overview/status results cannot update a different Device ID, boot, transport or connection generation. Last same-session Overview/Live Inputs values are retained briefly and marked historical; the simulator receives only the actual connection/input freshness.
- Android PPM/WebApp selection locks touch joysticks, ARM, physical claims and previews while monitoring remains available. Physical control is released on confirmed source changes; reconnect never automatically arms.
- Explicit Android AP/WebRTC origins in simulator selection, source locking and source-change stop. Virtual WebApp input remains usable without a physical Kit.
- Offline cache and bundled Android assets include shared policy/UI. Source versions: FlightCore 1.5.12; Android 1.8.16 (code 54). Existing signing, binary hash/source, exact-SHA and native-emulator publication gates are retained; the authoritative-status/browser workflow is also required for APK publication.

## Verification

- Local Node suite: 601 tests, 599 passed, 2 socket-dependent tests skipped in the restricted local runtime; no failures.
- `npm run check`: JavaScript parsing, HTML IDs/assets, 15/15 GLB decodes passed.
- `python3 tools/verify_release.py`: correctly blocked by source/catalog version mismatch. The existing 1.5.11 images/catalog must be rebuilt and verified as 1.5.12 for both boards; existing binaries are not represented as updated.
- Production-function regressions cover AP/STA paths, authorization, stale/unknown-age inputs, idle telemetry, late Overview responses, firmware safe handover/PPM radio switching and receiver loss.
- Browser regression `tools/control-path-browser.mjs` exercises all eight device views, delayed reads, idle telemetry, four selector options, same-Kit selection readback, 320–1366 px layouts and Android PPM touch lock with explicit Kit doubles. GitHub CI runs this alongside existing simulator, transport, Python and Android tests.
- Local Chromium is blocked by the execution runtime's Unix-socket restrictions. The user authorized GitHub push and merge on 26 October 2026. CI browser runs, board compilations and permanent-signed APK/native verification must pass on the final source before release.
- Physical A1/A2, actual radio loss/receiver loss, handset endurance and OTA recovery acceptance remain NOT_RUN. Automated doubles and compiled firmware do not constitute physical acceptance. Existing hardware evidence is not marked PASS.
