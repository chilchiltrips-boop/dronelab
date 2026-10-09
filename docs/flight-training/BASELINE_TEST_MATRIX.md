# ZEBJUS Flight Training — Acceptance & Regression Test Matrix

**Work must change every status from TODO to PASS / FAIL / BLOCKED with reproducible evidence.** Tests are not assumed to have passed just because older V1.6.0 CI was green. Store screenshots, CPU/audio/physics traces, WebRTC captures and logs in review artifacts, not sensitive pairing materials.

| ID | Priority | Scenario and action | Expected result | Test level | Status |
|---|---|---|---|---|---|
| A01 | P0 | Launch Android without network, tap/move left thumb | Thumb base appears exactly at touch, knob moves; `PREVIEW ONLY`; nothing ARMed or transmitted | Real phone + Playwright | TODO |
| A02 | P0 | Launch without network, tap/move right thumb | Same touch motion/zero-first-displacement, roll/pitch preview | Real phone | TODO |
| A03 | P0 | Two concurrent pointer IDs left + right | Independent anchors, no steal, no flicker | Real phone multitouch | TODO |
| A04 | P0 | Touch at edge of thumb zone then move | True anchor unchanged; knob/ring visible, radial clamp valid | Real phone + browser | TODO |
| A05 | P0 | Release one stick, keep other finger down | Released roll/pitch/yaw neutral, other stick continues | Real phone | TODO |
| A06 | P0 | Left up for 1s at Medium | Approx +400 µs/s after deadband shaping at full stroke; clamped 1000..2000 | Unit + real phone | TODO |
| A07 | P0 | Release throttle while ARMed | Last accepted throttle retained; yaw neutral | E2E phone↔Web | TODO |
| A08 | P0 | STOP while fingers down | Immediate local neutral/disarm; remote virtual motors off; no further output | E2E | TODO |
| A09 | P0 | Blur/background/orientation/lost pointer capture | No stuck roll/pitch/yaw; disarm if lifecycle/safety requires | Android lifecycle | TODO |
| A10 | P1 | Slow/Medium/Fast test | Distinct response; exactly three profiles, persisted, no first-frame spikes | Unit + phone | TODO |
| W01 | P0 | Flight Training nav | Exactly ONE canonical simulator; no separate ANDROID FLIGHT or LED tab | DOM + browser | TODO |
| W02 | P0 | Click header ⚙ | Complete WebRTC QR/code connection UI, close/reopen without losing valid RTC session | Browser | TODO |
| W03 | P0 | Pair via camera two-way QR + PIN | Active DataChannel, verified authenticated owner, correct UI state | Real phone + Web | TODO |
| W04 | P0 | Pair via optional six-digit code | Existing signaling works; connection security remains | Phone + Web | TODO |
| W05 | P0 | Grant Android control | Web sticks view-only and mirror remote applied state; Web keys cannot fight remote | E2E | TODO |
| W06 | P0 | Android left yaw right | Both Android and Web show negative yaw under reversed-v1.5.3 contract; 3D nose turns correctly | E2E + geometry | TODO |
| W07 | P0 | Android throttle 1300 | Android applied 1300, Web exact 1300, simulator state 1300, RPM/thrust reflect same frame chain | E2E | TODO |
| W08 | P0 | Android two sticks | Web both mirrored knobs/axis values update correctly, separate input sources | E2E | TODO |
| W09 | P0 | Release Android controls | Web axes recenter, throttle remains held until Stop | E2E | TODO |
| W10 | P0 | Disconnect/reconnect | All motors off, authority cleared, no auto-arm, fresh explicit arm required | E2E failure injection | TODO |
| W11 | P0 | Replay old sequence / wrong session / unapproved peer | Rejected, no changed simulator state | Unit + E2E | TODO |
| W12 | P0 | Reordered ACK or high jitter/backpressure | No stale overwrite, bounded queue, last applied state visible | E2E network emulation | TODO |
| W13 | P1 | Leave and return from other main Web tabs | Only one live simulation/peer; no orphan iframe or timers; safe navigations | Browser | TODO |
| W14 | P1 | Open old `#simcontrol` bookmark | Redirect to canonical Flight Training, no duplicate page | Browser | TODO |
| W15 | P1 | Remove WebRTC virtual LED | No LED controls/buttons/demo nav; Python hardware LED untouched | DOM + source search | TODO |
| W16 | P1 | Remove unwanted title underline | `FLIGHT TRAINING` heading/nav polished; keyboard focus remains visible | Desktop/phone visual | TODO |
| P01 | P0 | ARM at throttle >1050 | Refuse; clear reason; no motor spin | Unit + E2E | TODO |
| P02 | P0 | ARM at throttle 1000 | Controlled motor idle behaviour; display accurate; no free movement | Physics + visual | TODO |
| P03 | P0 | Increase throttle steps 1000→1200→1400→1600 | Monotonic speed/thrust where unsaturated; damped mast z response; force/weight correctly labeled | Numerical traces + 3D | TODO |
| P04 | P0 | Decrease throttle 1600→1200→1000 | Motor RPM/thrust decay with lag; z deflection returns within constrained travel | Numerical traces + 3D | TODO |
| P05 | P0 | STOP | RPM, thrust, virtual audio and propwash converge to zero; support remains mechanically attached | Numerical + audio | TODO |
| P06 | P0 | Alter battery, payload, motor lag | Response changes according to plant math, not random graphics | Unit + A/B | TODO |
| P07 | P0 | High/low P at equal deterministic disturbance | Measured rise/settling/error/overshoot differ as physically plausible; plot and RPM agree | Deterministic tests | TODO |
| P08 | P0 | High/low I under constant CG/wind bias | Persistent error vs recovery difference; antiwindup and saturation bounded | Deterministic tests | TODO |
| P09 | P0 | High/low D with noise and transient | Damping/noise sensitivity visible in controller trace and motor command jitter | Deterministic tests | TODO |
| P10 | P0 | ANGLE roll release after disturbance | Outer angle PID drives inner rate and returns toward trim | Unit + visual | TODO |
| P11 | P0 | ACRO roll release after disturbance | Rate target 0 but no auto-level; tilted angle remains after angular rate decays | Unit + visual | TODO |
| P12 | P0 | Yaw in ANGLE and ACRO | Yaw Rate PID only; no yaw heading lock, reversed input sign held | Unit + visual | TODO |
| P13 | P0 | Live PID Apply under running motor load | Gain effect immediate without resetting attitude/throttle/motor state; separate integrator control | E2E + numeric | TODO |
| P14 | P0 | 30/60/120 FPS same simulated scenario | Similar numeric state after equal simulated time, 4-ms fixed timestep | Deterministic unit | TODO |
| P15 | P1 | Constrained vertical rig limits | Mast never detaches/penetrates support; z always within declared bounds | Unit + visuals | TODO |
| P16 | P1 | Motor mixer & 3D signs | CW/CCW yaw torque, R/P tilt, nose red arrow, M1..M4 map match | Geometry physics test | TODO |
| V01 | P1 | Quadrotor GLBs and large stage | Matches assembly drone, one forward arrow, professional lighting/shadows | Browser screenshot | TODO |
| V02 | P1 | 4 individual motor effects | Blur, wash rings/dust, sound track each actual motor RPM/thrust | Visual/audio instrumented | TODO |
| V03 | P1 | QUIET audio default and STOP | Audio mild, no startup blare/click or residual oscillators; mute functions | Manual + automated | TODO |
| V04 | P1 | WebGL unavailable | Clear 2D fallback and working status/input/STOP | Browser forced fallback | TODO |
| V05 | P1 | Smartphone small/large landscape / inset | Buttons readable, STOP reachable, no clipped thumb areas, no portrait squeeze | Emulator + phone | TODO |
| R01 | P0 | Android APK upgrade previous V1.6 | Same app ID/cert, versionCode >11, installs over prior version preserving allowed data | Signing verify + phone | TODO |
| R02 | P0 | Existing Python/Wiring/Assembly/Firmware | Complete legacy regression green, no accidental feature removals | CI | TODO |
| R03 | P0 | WebRTC QR/codes/regression | QR autofocus, code approval, no camera-before-gesture, disconnect and ownership green | CI + real phone | TODO |
| R04 | P0 | Production deployment | GitHub Actions green, Pages live, correct app version/cache, signed APK verified | Release verification | TODO |
| R05 | P1 | Evidence | PR link, commit SHA, screenshot/MP4, PID and thrust CSV traces, test logs, hashes, limitations | Release notes | TODO |

## Suggested deterministic physics tests

1. **Motor first order:** step command at t=0 from 0 to 0.6; check `omega(t)` bounded, monotonic and approaches target. For constant `tau`, compare with `omega_target*(1-exp(-t/tau))` within numerical error.
2. **Quadratic thrust:** if `omega` doubles below saturation, `F` should rise approximately 4×; never use linear percentage to fabricate actual force without declared mapping.
3. **Weight and constrained force:** varying mass increases `W=m*g`, affects deflection at a given throttle, and no `z` leaves `[z_min,z_max]`.
4. **Vertical recovery:** after throttle step up/down at equal initial state, validate `z`, `v_z`, `F_up` time traces and damping; not arbitrary animation.
5. **Controller loop:** compare same seed/initial conditions for 7 presets, report numeric RMS/overshoot/settling and motor saturation; ACRO must have zero commanded angular rate on stick release.
6. **Transport:** only acknowledge an actually applied receiver sequence; duplicate and late session frames cannot be applied; invalid JSON doesn't crash the receiver.

## Minimum human test script

- Install production-signed candidate over current Android release on a physical phone. Verify update rather than uninstall; inspect app data preservation.
- Before pairing, move both left and right joysticks. They *move visibly* and show PREVIEW ONLY while no motor commands are sent.
- Open the WebApp Flight Training page, click top-right gear, run existing QR/code pairing, confirm PIN, grant Mobile Control. Verify both badges match ownership.
- ARM at 1000, raise throttle gradually, combine yaw with right roll/pitch, release, monitor Web mirror and 3D effect. Capture screen recordings on BOTH devices showing identical axes/throttle/ACK and motor/height/graph changes.
- Set high/low PID and apply while running. Compare A/B traces in a recorded session. Activate QUIET sound to assess perceptual quality.
- Turn off Wi-Fi/close mobile app without STOP, then restore. Confirm safe stop and no auto-arm. Restart and demonstrate STOP while fingers are touching.
