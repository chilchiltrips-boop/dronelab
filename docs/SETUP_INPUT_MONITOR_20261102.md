# Setup Wizard receiver observations and flicker fix

Reviewed main through PR #133 / FlightCore 1.7.4 / WebApp 1.26. PR #132 already separated receiver capture evidence from delayed RC telemetry in Live Inputs. The wizard still used a 150 ms PPM / 300 ms network-input eligibility check plus the entire request round trip to color its read-only channels. A normal 220 ms request therefore made every PPM observation look stale despite a valid 50 Hz receiver report. It also erased the last receipt time after one failed STATUS request, rebuilt the input SVG repeatedly, and could append one response to its history twice.

The monitor now distinguishes these states:

| Observation | Wizard behavior |
| --- | --- |
| Recent board sample, receiver present | `MONITORING`, channel values and sample age; receiver reports `PPM LAST VERIFIED … Hz`. This is a read-only observation, not proof of a currently eligible control frame. |
| One failed read or delayed response | Keep the original timestamp and bounded observation. Explain the delayed refresh and back off retries; never renew the age from a redraw. |
| Observation older than 3.5 seconds | Clear channels and mark receiver evidence unverified. Do not infer physical receiver loss from a network timeout. |
| Newer explicit receiver-absent report | Clear channels immediately and report signal absent. A cached motor reply cannot override a newer receiver-loss observation. |
| Disconnected link | Historical values may remain briefly, dimmed; no verified receiver/control eligibility. |
| Different Kit, boot, transport, reconnect generation or selected path | Clear the old observation and wait for the newly bound source. |

Live Inputs and the wizard share the pure receiver-health helper in `js/input-monitor.js`. The strict `setupInputSample` eligibility calculation remains unchanged. Firmware input freshness, PPM signal-loss handling, simulator eligibility, motor watchdogs, authentication and the PR #133 AP/STA handover checks are unchanged. Existing stick/trace SVG nodes are updated in place and each new response contributes at most one history sample.

The review also found two failed main workflows (Android release and horizontal-header source checks) with the same cause: packaged firmware/diagnostic inputs changed without incrementing Android versionCode. Android 1.8.24 (63) advances the installed 1.8.23 (62) release and must pass the existing signature, native upgrade/touch, API 30 and exact-source publication gates. Firmware remains 1.7.4; no firmware source or binary is modified by this change.

Validation includes deterministic delayed-read/loss/identity/expiry tests, the existing Live Inputs and motor regressions, and rendered wizard/Python browser tests with a clearly simulated A2. The browser test checks a 220 ms read delay, one failed read, expiry and recovery, stable SVG identity, and immediate confirmed receiver loss. Physical receiver behavior and real Wi-Fi timing still require verification on the user's board.
