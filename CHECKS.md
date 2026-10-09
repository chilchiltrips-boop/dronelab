# ZEBJUS DroneLab candidate checks

The published scanner remains **1.0.1** with unchanged binaries and hashes. `npm run verify:firmware` verifies both profiles, APP/Factory sizes, chip IDs, SHA-256, the 0x10000/0x1f0000 application slots and byte-identical APP contents. This source prints scanner activity, not a board/version banner.

Run:

```sh
npm run check
npm test
npm run verify:firmware
# With test-only Playwright installed and an HTTP server on 127.0.0.1:8765:
node tools/qr-pairing-browser.mjs
node tools/audit-browser.mjs
node tools/controls-browser.mjs
node tools/python-browser-smoke.mjs
node tools/offline-browser.mjs
```

GitHub Actions performs these browser tests on the dedicated testing branch. QR tests use real Chromium peers and LED acknowledgements, with a simulated camera recognition callback; no physical camera is available in CI. Code orchestration uses a mock answer transport in that test, authenticated code behavior is separately tested, and a live public-broker smoke test is explicitly marked optional.

The Android workflow compiles debug only for validation, then builds a permanently signed non-debug release review artifact. `tools/verify_signed_android_release.py` checks the pinned certificate, APK v2 signature, app identity, versionCode 10, non-debuggable flag and compatibility against the published code 9 APK. Only main publishes the stable APK URL.

Software verification does not demonstrate physical Android upgrade installation, camera autofocus/density performance, board flashes, Wi-Fi roaming, campus firewall reachability or real transmitter latency. Those remain explicit release review checks.
