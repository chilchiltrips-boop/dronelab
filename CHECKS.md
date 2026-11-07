# ZEBJUS DroneLab candidate checks

The 1.7.20 source adds an explicitly imported **experimental PPM Rate** build with saved-Setup/PID gates and a single receiver ARM gesture. Standard bench releases remain flight-disabled. WebApp and Android display firmware-reported output state. See [Setup to Rate ARM](docs/A2_SETUP_RATE_FLOW.md) for build profiles, controls and remaining physical tests.

Published firmware version and checksums come from `firmware-catalog.json`. `npm run verify:firmware` verifies both profiles, APP/Factory sizes, chip IDs, SHA-256, the 0x10000/0x1f0000 application slots and byte-identical APP contents. Runtime identity and build time are available over `ZJINFO` or signed status.

`node tools/sync-pid-profiles.mjs --check` verifies the generated Aerof450 firmware defaults. The A2 Motor Setup Browser workflow tests the Wizard and the shared Rate/Angle editor using a simulated transport. The candidate build workflow attaches verified A2 artifacts while `publication-hold.json` pins the published firmware. The strict production acceptance gate requires operator-signed physical evidence for the exact tested build. See [A2 flight qualification](docs/A2_FLIGHT_QUALIFICATION.md).

Run the source and published-image checks. The publication hold pins the existing firmware catalog while the candidate builds are uploaded separately for qualification.

```sh
npm run check
npm test
npm run verify:firmware
npm run verify:acceptance
npm run verify:acceptance:strict  # physical evidence required
# With test-only Playwright installed and an HTTP server on 127.0.0.1:8765:
node tools/qr-pairing-browser.mjs
node tools/audit-browser.mjs
node tools/controls-browser.mjs
node tools/python-browser-smoke.mjs
node tools/a2-rate-pid-browser.mjs
node tools/a2-motor-setup-browser.mjs
node tools/live-inputs-layout-browser.mjs
node tools/offline-browser.mjs
```

GitHub Actions performs these browser tests on the dedicated testing branch. QR tests use real Chromium peers and LED acknowledgements, with a simulated camera recognition callback; no physical camera is available in CI. Code orchestration uses a mock answer transport in that test, authenticated code behavior is separately tested, and a live public-broker smoke test is explicitly marked optional.

The Android workflow compiles debug only for validation, then builds a permanently signed non-debug release review artifact. `tools/verify_signed_android_release.py` checks the pinned certificate, APK v2 signature, app identity, the Gradle versionCode, non-debuggable flag and compatibility against the prior published APK. Only main publishes the stable APK URL.

Software verification does not demonstrate physical Android upgrade installation, camera autofocus/density performance, board flashes, Wi-Fi roaming, campus firewall reachability or real transmitter latency. Those remain explicit release review checks.

## Repository and deployment checks

See [the project map](AGENTS.md) and [lean update guide](docs/AI_UPDATE_GUIDE.md). Run `npm run audit:repo`, `npm run impact -- --base origin/main --head HEAD`, and `npm run build:site`. Pages uploads only the verified `_site` directory; historical firmware download URLs remain intact.
