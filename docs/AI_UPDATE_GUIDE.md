# DroneLab — Lean updates, CI and deployment guide

## Use this context first (smallest useful read)

Before any GitHub change, inspect the current **main SHA**, the user's exact failing screen/log, and **only the related paths**. Avoid fetching the entire 100+ MB tree or all workflow logs.

Run `npm run impact -- --base <known-commit> --head HEAD` after a change (or use `--json`). This is **advisory**; it classifies changed paths and recommends scope-specific checks without running tests or modifying hardware. It does not replace release gates.

| Change | Start with | Test |
| --- | --- | --- |
| WebApp interface | `index.html`, `lab.html`, `js/`, `firmware-updater.js`, relevant CSS | Focused Node tests, `npm run check`, browser smoke for edited page |
| Physical A1/A2 firmware | `FlightCore_Firmware/*.h`, `I2C_ADDRESS_SCANNER.ino`, `VERSION.txt` | Host safety tests, Arduino A1/A2 compilation, checksums and held release gates |
| Firmware availability | `bench-release-policy.json`, `FlightCore_Firmware/bench/<version>/`, `firmware-updater.js` | Verify exact build source, APP/FACTORY SHA-256, catalog and Firmware Center |
| Android | `mobile-android/`, companion and pairing modules | Exact-source Android signing and acceptance workflows |
| Documentation | `docs/` | Link/content review; no unrelated C++ compile |

## Changes made to reduce unnecessary GitHub Actions work

- WebApp version stamping no longer runs when **only** docs, tests/tools, CI workflows, firmware or APK files change. Real WebApp assets still advance the version. A WebApp change may still create a second Pages deployment because the repository uses an automatic source-branch Pages deployment; this is **not** eliminated yet.
- The main A1/A2 source-image builder now triggers only for firmware inputs, release policies and compiler/validator changes, not HTML/CSS/JS-only changes.
- The immutable bench-package publisher now runs on release policy and verifier edits (or explicit manual dispatch), not every Firmware Center UI change. Never relabel an older binary with a new source version.
- The all-PR V2 workflow keeps ordinary UI/protocol tests, but skips its expensive Arduino compile and artifact upload when C++/firmware inputs did not change. Missing diff ancestry fails **toward** compiling.

## Deployment size and next safe step

At the audit, 658 tracked blobs totaled approximately 112 MB (raw file sizes). The GitHub Pages build uploaded an approximately 52.8 MB ZIP, including non-web materials. **GitHub Pages uses the built-in branch deployment** (`dynamic/pages/pages-build-deployment`), so editing CI path filters does **not** make that site artifact smaller.

The next optimization should be a **reviewed, site-only GitHub Actions Pages build**. Preserve all actually loaded JavaScript/CSS, Pyodide + Monaco runtime wheels/modules, source maps needed for debugging, service worker/offline files, WebApp assets, release metadata, *published stable* and *currently approved bench* APP/FACTORY firmware, and the downloadable signed APK. Exclude Git history, tests, C++ headers/source, obsolete firmware candidate images and documentation from **deployed assets only** (retain them in Git). Build and test an exact-path allowlist, all referenced asset URLs, offline behavior, and OTA/USB downloads **before** changing GitHub Pages Settings → Build and deployment → Source to **GitHub Actions**. Do not activate a competing Pages workflow while source-branch deployment remains enabled.

Compression of real `.bin`, `.wasm`, `.whl` or `.apk` files is not interchangeable with delivering them unchanged: preserve binary SHA-256, boot images and flash offsets. Let the Pages transport handle ordinary HTTP compression; only minify JS/CSS after browser tests and measured output.

## Safety and release boundaries

- WebApp UI test passes are **not** physical-flight acceptance. `flightQualified=false` remains until separately documented physical qualification.
- Never bypass PPM ARM/DISARM, STOP, failsafe, RC/OTA ownership, independent motor watchdog, or signed firmware release provenance to save CI minutes.
- Do not make an unattended firmware publish trigger on every WebApp commit. A release must pin exact source SHA, built image digests and board identity.

## Communication when ChatGPT updates the repository

Return only: changed files and reason; branch/PR or merged SHA; focused test results; whether WebApp Pages was **actually deployed**; whether **new binaries** were **actually published**; and any physical acceptance still missing. Reuse a failing run ID/log rather than repeating full-repository scans. Fewer GitHub jobs may indirectly reduce ChatGPT troubleshooting tool calls, but do **not** directly increase or reset ChatGPT plan usage limits.
