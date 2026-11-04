# A2 Output Calibration command timing

FlightCore 1.7.13 and the shared motor client address delayed starts and
CONTROL_LOST during Output Calibration. The Wizard requires the board's
`calibrationSlideKeepsSession` capability before enabling Start. Existing
callers outside the Wizard retain the legacy slider/KEEP protocol.

## Control flow

The slider takes ownership of heartbeat scheduling before starting. A KEEP
already sent may finish; the standalone heartbeat timer sends no more KEEP
while the slider pump owns control. After CAL_SLIDER acknowledges readiness,
the pump sends its first 1000 us SLIDE before any fallback KEEP. A slow ACK
uses the current update period, so the next request can carry the latest
target immediately instead of waiting another complete timer interval.
Only one slider request is in flight. Intermediate targets are not queued.

For a valid CAL_SLIDER start, firmware checks the current READY lease before
switching to the live policy and starts a fresh session lease at the minimum
pulse. The 10-second READY window no longer becomes an already-expired
1.5-second window after a slow acknowledgement.

Each accepted CAL_SLIDER SLIDE renews its session lease. An accepted update
must still belong to the authorized owner, use a newer sequence, select the
same motors and satisfy the pulse range and freshness checks. Replayed,
invalid, unauthorized and late updates do not renew the lease. Older firmware
and ordinary non-Wizard sliders use one serialized SLIDE/KEEP fallback pump.

## Safety and saves

- The independent slider freshness limit remains 750 ms. KEEP does not reset
  that limit. Actual control loss still cuts PWM and requires a new Start.
- The live session lease remains 1500 ms; the hard slider run limit remains
  30 seconds. The separate main-loop output watchdog remains 100 ms.
- Output Calibration remains capped at 1500 us. The minimum 1000 us signal
  is established for at least 500 ms before a higher calibration pulse.
- Header STOP cancels queued work and ends the session. Late acknowledgements
  cannot restore a stopped session or restart a pump.
- Stop captures only the confirmed pulse for the selected motor/group. Save
  verifies the captured value and board readback while outputs stay off.
  Configuration records and ordinary saved-setup boots are unchanged.

No network protocol can maintain the live control deadline through arbitrary
outages. The fix removes avoidable competing requests; it does not relax
watchdogs to hide a delayed connection.

## Diagnostics

CSV/JSON exports now retain approved Wizard/calibration command names,
confirmed starting pulses, Stop capture, configuration revision/readback,
automatic ESC sequence state and stored-result flags. They continue to omit
tokens, request payloads, Device IDs, boot IDs and attempt IDs. A stored
controller sequence is separate from measured ESC endpoint acceptance.

`queueMs` measures the wait before dispatch. `responseWaitMs` measures dispatch
to response, including any authentication setup, network and board processing;
it is not a pure radio-latency measurement. Expired queued control requests
also report their measured queue wait. Read-only WIZARD_STATUS uses monitoring
priority and coalesces separately from STATUS, without caching completed reads.
Writes still invalidate read caches before verified Save readback.

## Verification

Client regressions cover both directions of KEEP/SLIDE contention, a slow
BEGIN/CAL_SLIDER handshake, a 600 ms acknowledgement, latest-target selection,
legacy fallback and STOP before or during delayed replies. Actual C6 command
and timer code runs with simulated clock, NVS and PWM driver doubles to verify
a delayed valid start, twenty seconds of SLIDE-only control, replay/owner/range
rejection, 750 ms loss, the independent watchdog, the hard run limit, group
output, capture/save readback and restoration after a simulated boot.

**Physical A2 bench verification: NOT_RUN.** Verify USB, AP and STA with
propellers removed, including individual/group output, interruption and saved
results after a real power cycle. Host/browser checks do not measure PWM
waveforms, motor rotation or ESC endpoint acceptance.

The [FlightCore 1.7.13 build](https://github.com/chilchiltrips-boop/dronelab/actions/runs/41871988832)
compiled both board profiles and verified all four APP/FACTORY images against
the source manifest. The A1 compile timestamp is `2026-11-04T16:54:41Z`; A2 is
`2026-11-04T16:55:17Z`. The 685-check suite passed with 683 passes and two
existing skips, and the A2 browser flow passed over HTTP with simulated
transport. These results do not change the physical verification status above.
