# Five-domain stabilization — 22 October 2026

Audited baseline: `fa4bb57a461d09b18529b40acc3e7983e14a16dc` (WebApp 1.8.1+429).
Software checks and physical acceptance are separate. A successful build or browser fixture does not certify a board, radio, OTA interruption, or handset.

| Domain | Software behavior and verification | Physical acceptance |
| --- | --- | --- |
| Communication | Verified USB generations and Kit IDs; signed AP/STA requests; bounded reads, replay/sequence rejection and owner locks. Android Relay now requires the same approved WebRTC session before and after a request. Loss immediately invalidates the header, monitoring paths and pending replies. A new phone session must verify the Kit again. Runtime network tests plus real encrypted WebRTC browser checks. | A1/A2 USB/AP/STA changes and actual radio-loss timing remain unrun. |
| WebApp UI | Live Inputs uses natural card height, compact rows, 44px selectors and scroll access. Viewport checks cover 2048/1920/1366/1024/768/390/320px, stale legacy firmware and PPM fixtures. Unsupported mode settings remain explicitly labeled. | Actual laptop/mobile browser acceptance remains part of the bench session. |
| Simulator | Existing Run, Stop and Reset remain virtual operations. Run requires fresh selected input and low throttle; loss/identity changes stop, and new telemetry cannot restart it. Angle/Acro follows verified Kit metadata with deferred synchronization during Run. Startup now has a 15-second deadline, visible failure and explicit Retry. Three fresh browser sessions check Run/Stop/mode transitions; a blocked-load browser test checks recovery. No separate Pause control or physical ARM feature was introduced. | No physical flight or motor stabilization is certified. |
| Firmware | Production-header C++ tests exercise command ownership, authorization, replay, pulse bounds, 500ms network deadman, PPM arbitration/loss and OTA scope/hash/offset/timeout rejection. A1 and A2 compilation and release-image identity checks remain mandatory. | Real watchdog, power interruption, PPM signal loss, NVS persistence and OTA recovery remain unrun. |
| Android | Existing runtime/Java tests cover permission denial, selected Wi-Fi identity, secure command queues, UDP receive/applied feedback and background release/reconnect. Existing signed APK inputs are unchanged by these WebApp fixes. | Supported-handset acceptance, including POCO X2 background/reconnect/multitouch, remains unrun. Emulator checks are not handset proof. |

## Fixes from this audit

1. Relay connectivity previously depended on the last Kit heartbeat and the existence of a request function. It could remain apparently connected after its paired phone disconnected. Bind the verified Kit to the approved phone session, clear stale accepted input on session loss, and reject replies from a replaced session. Direct USB/AP/STA links retain their own verification.
2. A failed or stalled simulator iframe had no visible bounded recovery path. Expose a load failure after 15 seconds, require explicit Retry, and announce readiness only after the child has installed controls and started its rendering loop. Loading/retry never starts virtual motors.
3. Auto graphics previously waited for 90 slow render frames before reducing load. On software/low-power renderers this can monopolize the main thread and delay telemetry callbacks. Reduce that delay to four consecutive slow frames, retaining the existing lower-quality renderer and every input freshness watchdog. Explicit graphics selections remain available.

## Repeatable verification

Run `npm test`, `npm run check`, `npm run verify:firmware`, and `npm run verify:acceptance`.
The Authoritative Status workflow runs three independent browser sessions, Live Inputs viewport/scroll checks, simulator startup recovery, compact cockpit checks and AP input mirroring. The V2 workflow adds authenticated network, offline and workspace browser checks and both firmware builds. Android runtime and production-header tests are included in the full Node suite.

`npm run verify:acceptance:strict` must continue to fail while required real-device records are `NOT_RUN` or `FAIL`. The canonical ledger still contains **0 PASS / 18 NOT_RUN**; no observation was invented or replaced with a fixture result. Execute `docs/PHYSICAL_ACCEPTANCE_WORKPLAN_20261022.md` with the actual boards, receiver, router and handset, and attach sanitized captures before recording real results.
