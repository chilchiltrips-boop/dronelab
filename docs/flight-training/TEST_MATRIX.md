# Acceptance matrix — scope and evidence

All 52 supplied rows are retained. PASS means the stated automated scope has reproducible evidence; it is **not** proof of a physical-phone test. Native emulator acceptance is recorded separately. Physical phones, real camera/radio/OEM cutouts/120-Hz/acoustic tests are unavailable and explicitly **BLOCKED / UNVERIFIED**. The release gate is green mandatory CI plus available native acceptance; an actual failing device safety/control result blocks release.

The supplied original priority, scenario, expectation and test level are preserved in [BASELINE_TEST_MATRIX.md](BASELINE_TEST_MATRIX.md). Exact latest-source run IDs and sanitized artifacts are linked in [RELEASE_EVIDENCE.md](RELEASE_EVIDENCE.md); final publication is recorded in the downloadable live-release report.

| ID | Priority | Scenario | Automated status | Native emulator | Physical phone | Evidence / limitation |
|---|---|---|---|---|---|---|
| A01 | P0 | Launch Android without network, tap/move left thumb | PASS | PASS — API35, 4 native cases | BLOCKED / UNVERIFIED | flight-preview-browser: offline preview/sequence0; native touch gate |
| A02 | P0 | Launch without network, tap/move right thumb | PASS | PASS — API35, 4 native cases | BLOCKED / UNVERIFIED | Independent right pointer and roll/pitch preview; native touch gate |
| A03 | P0 | Two concurrent pointer IDs left + right | PASS | PASS — API35, 4 native cases | BLOCKED / UNVERIFIED | CDP dual IDs and native MotionEvent pointers |
| A04 | P0 | Touch at edge of thumb zone then move | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | Exact edge anchor/radial-clamp unit + six-size CDP capture |
| A05 | P0 | Release one stick, keep other finger down | PASS | PASS — API35, 4 native cases | BLOCKED / UNVERIFIED | Release one ID, other remains active in CDP/native |
| A06 | P0 | Left up for 1s at Medium | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | flight-input unit: Medium full stroke ≈400 µs/s; real RTC throttle rise |
| A07 | P0 | Release throttle while ARMed | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | Real RTC applied held throttle after release |
| A08 | P0 | STOP while fingers down | PASS | PASS — API35, 4 native cases | BLOCKED / UNVERIFIED | Native/CDP third-finger STOP + RTC remote zero outputs |
| A09 | P0 | Blur/background/orientation/lost pointer capture | PASS | PASS — API35, 4 native cases | BLOCKED / UNVERIFIED | Native pause/resume/reverse; browser cancel/visibility/ownership/STOP |
| A10 | P1 | Slow/Medium/Fast test | PASS | PASS — API35, 4 native cases | BLOCKED / UNVERIFIED | Three-profile math, browser persisted Slow and native retained Fast |
| W01 | P0 | Flight Training nav | PASS | Not exercised / browser or unit scope | Not a physical test | training-ui-contract + QR/audit browser: canonical/no iframe |
| W02 | P0 | Click header ⚙ | PASS | Not exercised / browser or unit scope | Not a physical test | QR/audit browser: settings steps, close/reopen/camera cleanup + continuous RTC |
| W03 | P0 | Pair via camera two-way QR + PIN | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | Generated offer/answer QR pixels decoded; actual DTLS/SCTP; camera input is test surrogate |
| W04 | P0 | Pair via optional six-digit code | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | Real PeerJS Cloud authenticated broker smoke; code UI+real RTC with mocked lookup |
| W05 | P0 | Grant Android control | PASS | Not exercised / browser or unit scope | Not a physical test | Real RTC: Web Run/mode/keys excluded; live PID available |
| W06 | P0 | Android left yaw right | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | Reversed yaw unit/geometry/actual RTC mirror |
| W07 | P0 | Android throttle 1300 | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | 1300 µs through real transmitter/peer/plant/ACK; exact UI checks |
| W08 | P0 | Android two sticks | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | Simultaneous CDP sticks; applied axes + both Web knobs |
| W09 | P0 | Release Android controls | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | Applied release neutral/held throttle; receiver tests |
| W10 | P0 | Disconnect/reconnect | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | QR lifecycle/re-pair/network reset + watchdog + no auto-arm |
| W11 | P0 | Replay old sequence / wrong session / unapproved peer | PASS | Not exercised / browser or unit scope | Not a physical test | pairing-lifecycle/training-receiver unit + browser replay/wrong SID |
| W12 | P0 | Reordered ACK or high jitter/backpressure | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | Real RTC delayed/reordered 80/220/300 ms feedback/ACK loss; 140000 B queue override exercises refusal+watchdog; overload STOP is correct, no auto-ARM |
| W13 | P1 | Leave and return from other main Web tabs | PASS | Not exercised / browser or unit scope | Not a physical test | audit-browser: navigate to/from canonical, fresh disarmed plant, no hidden main-tab plant |
| W14 | P1 | Open old `#simcontrol` bookmark | PASS | Not exercised / browser or unit scope | Not a physical test | audit-browser: simcontrol/flight/led bookmark redirects |
| W15 | P1 | Remove WebRTC virtual LED | PASS | Not exercised / browser or unit scope | Not a physical test | Source/DOM contract + retained physical LED/Python lab |
| W16 | P1 | Remove unwanted title underline | PASS | Not exercised / browser or unit scope | Not a physical test | Actual desktop/mobile screenshots + retained focus-visible styles |
| P01 | P0 | ARM at throttle >1050 | PASS | Not exercised / browser or unit scope | Not a physical test | training-receiver refuses1051; core rejects unauthorized/malformed ARM |
| P02 | P0 | ARM at throttle 1000 | PASS | Not exercised / browser or unit scope | Not a physical test | Physics idle/stop unit + measured rendered motor/attached mast |
| P03 | P0 | Increase throttle steps 1000→1200→1400→1600 | PASS | Not exercised / browser or unit scope | Not a physical test | vertical-thrust.csv/SVG + fixed-step tests + rendered mast state |
| P04 | P0 | Decrease throttle 1600→1200→1000 | PASS | Not exercised / browser or unit scope | Not a physical test | Down-step CSV/lag/constraint unit and numerical recovery |
| P05 | P0 | STOP | PASS | Not exercised / browser or unit scope | Not a physical test | Zero RPM/N unit + audio voices0/context closed/wash0/disposal |
| P06 | P0 | Alter battery, payload, motor lag | PASS | Not exercised / browser or unit scope | Not a physical test | Actual voltage/payload/lag parameter tests; same-condition A/B |
| P07 | P0 | High/low P at equal deterministic disturbance | PASS | Not exercised / browser or unit scope | Not a physical test | seven-preset metrics/CSV; P overshoot46.36% vs lowP0%, rise differs |
| P08 | P0 | High/low I under constant CG/wind bias | PASS | Not exercised / browser or unit scope | Not a physical test | LowI vs highI bias traces; antiwindup bounds; contact-aware N/A settling |
| P09 | P0 | High/low D with noise and transient | PASS | Not exercised / browser or unit scope | Not a physical test | tripod-noise unit + isolated d-noise CSV/SVG/RMS; no fake vibration |
| P10 | P0 | ANGLE roll release after disturbance | PASS | Not exercised / browser or unit scope | Not a physical test | ACRO vs ANGLE level-return physics tests and browser mode/cascade |
| P11 | P0 | ACRO roll release after disturbance | PASS | Not exercised / browser or unit scope | Not a physical test | ACRO no-angle-hold tests; no release-angle target |
| P12 | P0 | Yaw in ANGLE and ACRO | PASS | Not exercised / browser or unit scope | Not a physical test | Yaw Rate bank, no heading PID; reversed keyboard/pointer geometry |
| P13 | P0 | Live PID Apply under running motor load | PASS | Not exercised / browser or unit scope | Not a physical test | 250-Hz queued gain/bumpless unit + real RTC running live Apply |
| P14 | P0 | 30/60/120 FPS same simulated scenario | PASS | Not exercised / browser or unit scope | Not a physical test | 30/60/120-Hz equal-sim-time tests at 4ms fixed step |
| P15 | P1 | Constrained vertical rig limits | PASS | Not exercised / browser or unit scope | Not a physical test | 0–12cm projection tests, attached mast render assertions/screenshots |
| P16 | P1 | Motor mixer & 3D signs | PASS | Not exercised / browser or unit scope | Not a physical test | Cross-product mixer/spin torque unit, assembly-derived motor origins |
| V01 | P1 | Quadrotor GLBs and large stage | PASS | Not exercised / browser or unit scope | Not a physical test | Real15/15GLBs parse; assembly F450 rendered; stage screenshots |
| V02 | P1 | 4 individual motor effects | PASS | Not exercised / browser or unit scope | Not a physical test | Actual RPM prop spin/wash/mast diagnostics; four audio voices; individual values |
| V03 | P1 | QUIET audio default and STOP | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | Quiet25%, user gesture, mute/profile/volume persistence, STOP/disposal voices0 |
| V04 | P1 | WebGL unavailable | PASS | Not exercised / browser or unit scope | Not a physical test | Forced null WebGL context → actual2D fallback with Run/throttle/STOP |
| V05 | P1 | Smartphone small/large landscape / inset | PASS | PASS — API35, 4 native cases | BLOCKED / UNVERIFIED | Six CSS landscape sizes incl488x227; API35 density/reverse cases; 44px STOP |
| R01 | P0 | Android APK upgrade previous V1.6 | PASS | PASS — API35, 4 native cases | BLOCKED / UNVERIFIED | Real pinned apksigner/aapt and production-signed11→12 native adb install-r/data retention |
| R02 | P0 | Existing Python/Wiring/Assembly/Firmware | PASS | Not exercised / browser or unit scope | Not a physical test | All legacy lab/browser/firmware/Python/offline regressions; unchanged firmware hashes |
| R03 | P0 | WebRTC QR/codes/regression | PASS | Not exercised / browser or unit scope | BLOCKED / UNVERIFIED | Actual QR/code/ownership/re-pair/permission cancellation; live Cloud broker smoke |
| R04 | P0 | Production deployment | BLOCKED — release pending | Not exercised / browser or unit scope | Not a physical test | Pre-merge blocked; final exact-source checks/main/Pages/APK observation required |
| R05 | P1 | Evidence | PASS | Not exercised / browser or unit scope | Not a physical test | PR9, source/CI/artifact links, SVG/CSV/metrics, screenshot references and limitations |

Native OS motion injection is distinct from Playwright/CDP touch. Code signaling tests distinguish real Cloud broker access from the mocked lookup used in the full applied-state browser scenario. Camera pixel decoding and permission tests use clearly named surrogates; physical autofocus is unverified. Software-GPU timings are disclosed and do not prove handset performance. No active QR/SDP/PIN/code/private candidate address is stored in the evidence package.

For remaining human acceptance follow [DEVICE_ACCEPTANCE.md](DEVICE_ACCEPTANCE.md). Do not replace BLOCKED physical rows with PASS without recording the actual device and observations.
