# Review and release evidence

PR: https://github.com/chilchiltrips-boop/dronelab/pull/9. Baseline main is `80bd3376c2b2201e77d9480b8affde149f3b2165`. The implementation was tested in reviewable phases on `feature/unified-flight-training-v1.6.1`. Pre-document validation source **`3316bad13c266c6b7b26f80c85c83623ef7bb0aa`** has all six required workflows green. Local final-source unit validation is **102/102**, with no failures/skips; syntax/assets/15 GLBs and unchanged firmware hashes pass.

The final branch tip includes the compact-footer/system-bar polish and this work package, and must repeat all mandatory checks before merging. This source document is a pre-merge evidence snapshot: it does not claim Pages/APK have already been published. Final observed deployment/build IDs and published APK hash are recorded in the downloadable live-release report and PR. Physical handset, camera autofocus/radio/OEM inset/120-Hz and acoustic tests remain **UNVERIFIED**.

| Mandatory workflow on validation source3316bad | Result | Run / artifact evidence |
|---|---|---|
| Android Landscape Flight WebRTC Tests | PASS | [38001031230](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38001031230): six-size CDP native-density preview, exact anchors/edge/capture/third-finger STOP, real encrypted applied control/ACK/telemetry, ownership/live PID, 1300 µs, replay, 80–300ms reordered/lost feedback, bounded queue/watchdogs/network reset |
| QR WebRTC Browser Pairing Test | PASS | [38001031144](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38001031144): actual QR pixel decode/DTLS/SCTP, code UI, PIN approval/grant/revoke/re-pair, camera permission/cancel/reopen, legacy controls/35 viewport screens, old-hash navigation, real SW offline firmware/Python/Flight GLBs/STOP/companion |
| Tripod PID Simulator Tests | PASS | [38001031179](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38001031179): deterministic math, actual rendered F450, live gains/A/B, RPM/thrust/mast/effects, quiet audio/persistence/zero voices/disposal and forced 2D fallback |
| Browser Test Python Lab | PASS | [38001031129](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38001031129): existing editor/worker/Python execution/plotting regressions |
| Verify DroneLab FlightCore Firmware Center | PASS | [38001031184](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38001031184): full unit suite, known app/factory image hashes, UI guards/assets |
| Build ZEBJUS Stable-Signed Android APK | PASS | [38001031107](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38001031107): debug compile only, permanent non-debug signing, real apksigner/aapt/v2/identity verification, signed native11→12 upgrade and four API35 touchscreen cases |

The native acceptance independently passed earlier at [38000116105](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38000116105), source77a3c4d, with17 assertions in each normal/reverse16:9 and19.5:9 case plus the baseline/data fixture. The final acceptance adds a footer/label bounds assertion. These are real Android `MotionEvent`s injected through `UiAutomation`, not JS PointerEvents. The candidate APK and instrumentation are signed with the same production key; installed code12 retains the stored Fast preset and native app-data sentinel from code11.

| Public Android identity | Required value |
|---|---|
| Package | `in.zebjus.dronelab.companion` |
| Version | `1.6.1-flight-training`, versionCode12 over published11 |
| Certificate SHA256 | `F1:B8:65:75:B3:59:07:34:65:4F:63:8E:4E:0D:68:05:6D:37:B2:E8:88:4A:C7:D6:C2:46:36:FE:9B:51:68:94` |
| Candidate flags | Non-debug; verified APK Signature v2; same published baseline certificate |
| Stable URL after gated publication | https://github.com/chilchiltrips-boop/dronelab/raw/refs/heads/main/mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk |
| Published hash/source | `mobile-apk/SHA256SUMS.txt` and `ANDROID_RELEASE_META.txt`, recorded only after publication |

The optional **live public PeerJS Cloud broker** smoke passed on [37999576386](https://github.com/chilchiltrips-boop/dronelab/actions/runs/37999576386); final-run status must also be reported. It uses synthetic offer/answer data to verify authenticated six-digit broker exchange. Full browser code-UI integration uses a mocked lookup with a **real** subsequent encrypted WebRTC channel. Camera test inputs are explicitly named surrogates; no physical camera focusing claim is made.

## Numerical and visual evidence

`numerical/` contains a chronological 20-second throttle-up/down/STOP trace, all seven identical-condition PID CSVs, isolated seeded D-noise CSVs, exact metrics and rendered SVG plots. [PHYSICS.md](PHYSICS.md) defines units, parameters, metric windows and mechanical-contact limitations; low-I contact reports N/A settling rather than false stabilization. The export/plot source is in `tools/`.

Browser artifacts contain actual disconnected/connected/mirrored/STOP/active-thrust/F450/2D/offline/landscape UI screenshots, applied-state JSON and renderer/audio diagnostics. Native artifacts contain real emulator PNGs, each acceptance log, installed identity and `adb install -r` success. Camera/QR/PIN/code/SDP elements are masked. The final share package selects sanitized screenshots and acceptance logs; it excludes raw sensitive pairing/network materials and the reference Aerion APK.

Performance targets:25Hz commands under normal link, 250Hz fixed numerical step, 10Hz telemetry/readouts, ~13Hz charts, ~30Hz audio parameter updates and 60Hz rendering where the GPU supports it. The restricted local **software GPU**, qualityLow, measured120 frames at p50 **83.3ms**, p95 **100ms**, longest133.3ms and ~20.5MB JS heap. This is below the rendering target and is disclosed; it does not establish phone FPS or acoustic quality. Weak renderers have bounded64ms catch-up, adaptive low quality/effect controls and a working2D fallback. Native WebView preview responsiveness is separately tested. Under real jitter/load, exceeding a450/650ms safety watchdog correctly stops; restoring feedback requires explicit ARM and cannot silently resume.

## Reproduce and publish

```sh
npm test
npm run check
npm run verify:firmware
node tools/export-flight-bench.mjs
python3 tools/plot-flight-bench.py
# Test-only: install Playwright1.56.1/Chromium and serve repository on port8765.
node tools/flight-preview-browser.mjs
node tools/flight-controller-browser.mjs
node tools/qr-pairing-browser.mjs
node tools/audit-browser.mjs
node tools/controls-browser.mjs
node tools/offline-browser.mjs
node tools/tripod-browser.mjs
node tools/tripod-quality-browser.mjs
node tools/python-browser-smoke.mjs
```

Matplotlib/Playwright are review-only dependencies. Real HTTP is mandatory for ICE/Service Worker proof. `DRONELAB_TEST_FILE_ROUTES=1` supports restricted local rendering but cannot prove either. GitHub Actions uses actual HTTP/ICE. Native CI builds the production release/test APKs, installs the prior production APK, preserves allowed data, disables network and injects OS multitouch at both aspect ratios/reverse orientation. [DEVICE_ACCEPTANCE.md](DEVICE_ACCEPTANCE.md) is the remaining physical-phone script.

Before merge, reconcile main and verify all six checks on the final review SHA. Ready PR9 and merge only the expected head after review. On main, the signed APK job re-tests native acceptance and waits for all five other mandatory checks on **exact `GITHUB_SHA`** before publishing; stale concurrent Android asset changes abort publication. Version stamping records the Web build/source/time and metadata-only stamps do not rebuild Android. Verify actual Pages build/deployment and live version/cache plus the published APK bytes/hash/cert evidence. Leave R04 blocked until these observations exist; never substitute an assumed URL or a candidate artifact for a published release.
