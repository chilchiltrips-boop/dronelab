# ZEBJUS DroneLab — Safe Zone and Two-way QR Pairing Test Plan

## Safe / protected-by-workflow baseline (9 Oct 2026)

- Repository: `chilchiltrips-boop/dronelab`
- Baseline SHA: `f205cfcf405d6e2f9536ad5f4944d9496f2fb6bb`
- Read-only-by-convention backup branch: `backup/stable-2026-10-09-before-qr`
- Production website: https://chilchiltrips-boop.github.io/dronelab/ (GitHub Pages publishes **main**)
- Development branch: `testing/two-way-qr-pairing`

**Never commit, force-push, or merge QR feature experiments into `main` or the backup branch until the user explicitly approves the finished result.** Backups and testing are separate references to the original commit. GitHub itself has no branch-protection rule installed here, so preserving these branches requires respecting this workflow.

## QR feature test sequence (no ESP32 hardware needed)

1. Implement QR offer/answer and manual pairing-code exchange in `testing/two-way-qr-pairing` only.
2. Implement the virtual LED state and ACK messages shared by Web App and Android App.
3. Test two browser peers on the same LAN with WebRTC DataChannel before building the APK.
4. Test pairing rejection, stale/expired codes, unauthenticated control, wrong QR, disconnect/reconnect and only one active controller.
5. Test Android phone and laptop on same Wi-Fi, even when external Internet is unavailable (website assets must already be available).
6. Verify Assembly, Wiring, Python Lab (including infinite-loop Stop and live Serial), and Firmware flashing pages still behave as before.
7. Only after the user approves, open a PR from testing to `main`, review CI and diff, then merge. Retain backup branch permanently.

## Browser testing

GitHub Actions checks source files on pushes to the testing branch. A browser smoke test uses Chromium on localhost for real Python 3 runtime, Monaco suggestions, resizers, and Matplotlib. Future QR pairing browser tests should use two independent contexts and a simulated LED to avoid needing ESP32 hardware.

GitHub Pages is **not** configured to publish this testing branch. Do not overwrite the public `main` site while testing. For remote mobile testing, publish an independent HTTPS preview URL from a separate staging host/repository after explicit setup; the development branch alone does not create a second website.

## Emergency recovery

Option A (preferred): revert or repair changes on `testing/two-way-qr-pairing`; `main` and its Pages deployment have not changed.

Option B (if production was accidentally changed): restore the saved baseline from `backup/stable-2026-10-09-before-qr` by a reviewed PR/revert, or check out the exact SHA. Avoid force-pushing `main` because it rewrites shared history.

To get the exact archive, use the backup branch's GitHub **Code → Download ZIP**. Save a copy outside GitHub for protection against whole-repository loss.

**Important:** the current baseline passed Chromium UI tests and Pages deployment, but was not electrically validated on a real ESP32 after every change. This label means the last known tested version, not a proof that all hardware scenarios work.
