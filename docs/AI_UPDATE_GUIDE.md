# Lean updates and release boundaries

Read the root `AGENTS.md` map first. Use `npm run impact -- --base origin/main --head HEAD` and `npm run audit:repo` to inspect changed paths and tracked sizes without reading binary contents. The impact report is advisory, not a replacement for release checks.

## One tested Pages artifact

`npm run build:site` copies the explicit allowlist in `tools/site-package.mjs` into `_site`. It verifies static references, assembly assets, APK checksum and every firmware catalog before producing a content-hashed `site-build.json`. Both `index.html` and its source alias `lab.html` are materialized as ordinary files. Never upload the repository root.

Preserved: Python workers, Pyodide/Monaco and all wheels, simulator models, service worker, APK, current stable/bench/candidate firmware and historical download paths. Excluded: C++ source, Android source, tools/tests, docs, CI and local artifacts. Historical `.bin` files remain deployed because removing them would break existing download URLs; they are compatibility archives, not unused junk. Git history and existing releases are unchanged.

`.github/workflows/pages.yml` tests the exact `_site` over HTTP, including offline Python, before uploading it. Production uses GitHub Pages **Source: GitHub Actions**. It compares rendered content to the live manifest; identical content does not redeploy. WebApp version stamping happens in this same run, not in a competing workflow. Firmware/APK-only publication deploys without changing the WebApp version. Main must still match the tested source before metadata is committed. A stale run yields to the newer queued run; active production file sync is not cancelled. A manual `force` dispatch allows recovery without a content change.

APK/firmware publishers use `GITHUB_TOKEN`, whose commits do not trigger new push workflows. Successful publisher `workflow_run` events therefore check the latest main package. No changed assets means no upload/deployment. This deliberately uses a content comparison, not commit-message guesses. An unavailable live digest conservatively requests verification/deployment.

## CI scope

The V2 workflow owns one full Node suite on PRs and main. Domain workflows keep their integration/browser coverage and run focused host tests (`node tools/run-domain-tests.mjs <domain>`). Signed Android publication also waits for the exact-source V2 result, alongside its existing native/signature/integration gates. Branch-specific one-off build workflows were removed; manual firmware builds remain available.

PRs compile ordinary A2 once plus the separately verified A2 experimental candidate when compiled inputs or build infrastructure change. UI-only edits skip compilation. Main source publication remains separately verified. The pinned Arduino toolchain is cached; compiled firmware is never reused by a broad cache key. Browser evidence expires after seven days; firmware/release artifacts retain their existing retention.

`lab.html` aliases the canonical `index.html` in Git. Consumers that do not resolve Git symlinks should use `index.html` or `npm run build:site`, which emits both full HTML files. The live URL remains compatible.

## Qualification and reporting

Do not infer physical acceptance from software tests or a successful flash. Qualification records bind an operator, board, timestamp, actual case observations and exact tested image/source. Preserve STOP, receiver loss, disarm, motor watchdog, output ownership and release holds. General motor bench success is not evidence for every physical case.

Report the starting/final SHA, PR, tests, actual Pages result, whether binaries were published and remaining evidence gaps. Fewer CI jobs can reduce troubleshooting work; they do not change ChatGPT account usage limits.
