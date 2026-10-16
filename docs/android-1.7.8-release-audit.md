# Android 1.7.8 release audit — 2026-10-16

Baseline main: `89c3753bce67ddf9fda518026d138bc93f6618d3`.
The published APK at that revision is **1.7.7-ota-grants-vault, versionCode 23**.
Changing Gradle to 1.7.8 / 24 did not publish an update: native acceptance failed
in run `38865490220`; publication was correctly skipped.

## Confirmed defects and repairs

| Defect | Repair and verification |
| --- | --- |
| Native acceptance kept its launch-time Activity/WebView after HOME/relaunch | Track Activity resume/destruction, find the attached WebView before each JS call, reacquire after HOME, and explicitly recreate the Activity in the native test. Keep all OS multi-pointer assertions. |
| Diagnostic JavaScript threw AssertionError outside an Exception-only catch, hiding the original failure | Log the original throwable and stack first; independently guard screenshot, JavaScript, and accessibility diagnostics against Throwable. |
| Runtime PeerJS CDN script conflicts with the APK's local-asset-only WebView policy | Bundle PeerJS 1.5.5 and its MIT license, package both in the APK and offline cache, and byte-compare APK assets with the checked-out source. Do not weaken the WebView origin policy. |
| PeerJS server failure could leave an invalid code displayed or registration pending | Separate bundled-client failure from online signaling failure, bound registration to 18 seconds, clear invalid codes, and reject late callbacks after timeout/disconnect. The six-digit service still needs Internet; QR/manual response remains an independent LAN fallback. |
| Existing partial header change supplied markup but no click handler, styling, or APK bundle entry | Add a synchronized, 44px AP/STA selector; stop input and reopen connection settings for verification. Block selection during OTA. This selects the phone request transport; the separate authenticated Kit Wi-Fi Mode action changes the Kit radio mode. |
| Legacy landscape three-column grid squeezed entire accordion sections and nested Wi-Fi fields | Full-width sections, two pairing cards only on sufficiently wide landscape screens, wrapping labels/buttons, responsive Wi-Fi fields, sticky STOP/Back controls. |
| Final publication source comparison omitted bundled vendor/auth/catalog assets | Compare those inputs too before publishing. Require the existing six exact-source workflows plus native acceptance. |
| Native BACK touch closed the sheet on pointerdown, allowing its later compatibility click to reopen the sheet through the underlying header | Keep the sheet present through the touch, cancel compatibility mouse events, and close on touchend. Verify repeated AP/STA/Back taps and a held Back touch with real Android MotionEvents. |
| Transport/host could change while the permission or identity operation was pending | Lock transport, host and connection controls through verification/OTA, and restore them on completion or denial. |
| Browser acceptance assumed all sections open and all optional downloads pre-cached | Open Permissions using its visible summary; verify Factory assets start uncached, then exercise on-demand Factory/Python caching before the offline reuse checks. |

## Release evidence requirements

- Local Node regression and repository integrity checks.
- Chromium: bundled PeerJS without external scripts, AP/STA synchronization,
  expanded menu geometry at 360x800, 488x227, 640x360, 844x390 and 1080x480,
  plus existing flight/WebRTC, QR, Firmware Center, Python Lab, PID and Tripod tests.
- Signed API35 emulator: in-place upgrade from the published APK, native prefs and
  localStorage and Android Keystore diagnostic-enrollment retention, two touchscreen pointers, third-finger STOP, CANCEL,
  HOME/resume, both landscape directions and forced Activity recreation.
- Verify pinned production certificate, package ID, versionCode 24 > 23,
  non-debuggable APK, v2 signature, embedded asset equality, checksum and source SHA.

No physical phone/FlightCore radio, real camera, permission denial/regrant,
Keystore consent or interrupted hardware OTA result is claimed by these automated
checks. Use `android-1.7.8-real-device-acceptance.md` for that hardware matrix.
