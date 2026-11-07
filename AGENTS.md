# DroneLab change map

Start with `git status`, the current main SHA and the failing feature. Run
`npm run impact -- --base origin/main --head HEAD`. Read only the relevant row;
do not dump binaries, vendored libraries or the entire repository into context.

| Task | Start here | Validation |
| --- | --- | --- |
| Main UI/setup | `index.html`, `styles.css`, `js/a2-setup-wizard.js` | setup domain; wizard browser |
| PID/simulator | `tripod.html`, `js/tripod-page.js`, `js/tripod-physics.js`, `js/flightcore-pid-client.js` | pid domain; tripod browser |
| Kit/connection/input | `js/classroom-kits.js`, `js/live-inputs.js`, `js/simulator-input.js` | network/input domains; authoritative browser |
| Python | `js/python-lab.js`, `python-lab-worker.js`, `js/python-ide-workspace.js` | setup domain; Python/offline browsers |
| Physical firmware | `FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino`, relevant `FlightCore*.h` | firmware domain; A2 builds |
| Flash/download | `firmware-updater.js`, firmware catalogs, `tools/verify_release.py` | release domain; bench/candidate browsers |
| Android | `mobile-android/`, `companion-*.js`, `android-native-bridge.js` | Android exact-source signing/native gates |
| CI/Pages | `.github/workflows/pages.yml`, `tools/site-package.mjs`, `tools/prepare-pages.mjs` | package tests; exact `_site` browser tests |

`node tools/run-domain-tests.mjs <domain>` runs focused tests. `npm test` owns
all host contracts; `npm run check` validates the application. V2 runs both on
PRs and main. A focused task is not permission to weaken release prerequisites.

Edit `index.html`; `lab.html` is its Git symlink. Pages materializes both as
ordinary files. Do not edit vendor bundles, generated binaries, or source stamps
manually. `_site`, `site-test-output`, `test-output` and dependencies are ignored.

Versions: `app-version.json` (WebApp), `VERSION.txt` (firmware source), Android
`app/build.gradle` (source), `mobile-apk/ANDROID_RELEASE_META.txt` (published APK).
Firmware source version can differ from published bench/stable catalog versions.
Keep binary hashes, exact compiled source and generated publishing commits distinct.

Historical firmware paths are compatibility archives. Do not delete or rename
them without a verified permanent URL migration. Preserve watchdogs, ownership,
OFF acknowledgement and physical evidence; software CI never creates hardware PASS.
See `docs/AI_UPDATE_GUIDE.md` for deployment/release details.
