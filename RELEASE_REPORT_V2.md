# V2 review release status

**NOT RELEASE ELIGIBLE. Do not merge as completed V2.**

Original main: `04f2d8d3a00b205f6ddec7e16d435f37f69acb1f`. Main is intentionally unchanged. Integrated PR #25 head: `2c0bd704712a07fd0e38e93cd8a2a127bb709c56`.

Target branch: `feature/unified-connection-admin-v2`. New PR and exact pushed SHA/CI evidence will be recorded after push.

WebApp baseline metadata: 1.7.0+194 (no production version claim). Firmware baseline: 1.4.0. Android review source: 1.7.1-v2-review, versionCode 17, unchanged application ID and release signing configuration. Code 17 signing/build/install not yet verified.

No new download URLs fabricated. Existing artifact checks pass; fresh builds and signed APK results pending CI. Screenshots and test logs are CI artifacts. Physical acceptance: **PHYSICAL PENDING**.

Remaining release blockers: owner onboarding migration; complete per-student/teacher capability enforcement, revocation and Home Mode; full Android feature parity; required native/offline/firmware build results; physical acceptance. See the recovery matrix and test matrix for the precise checkpoint scope.


## First remote checkpoint

- Commit: `978f9ecb8e4056733e692a90a2243d8b0c017178`; exact tree matched locally tested tree `f7eef762628bd4791ae5c7b8c7754668969e9c18`.
- Draft PR: https://github.com/chilchiltrips-boop/dronelab/pull/26 (open, unmerged).
- Passing push validation: https://github.com/chilchiltrips-boop/dronelab/actions/runs/38297637956
- PR validation: https://github.com/chilchiltrips-boop/dronelab/actions/runs/38297661112 — source and fresh firmware jobs passed, network enrollment fixture timed out. Fixture now waits for full application readiness; final rerun required.
- Failed Android verifier: https://github.com/chilchiltrips-boop/dronelab/actions/runs/38297638238 — signed APK assembled with correct pinned certificate, but verifier still expected versionCode 16. Verifier/native upgrade expectation corrected to 17; signature and monotonic-upgrade checks retained.
- Firmware review artifact (APP/FACTORY + build report/catalog): https://github.com/chilchiltrips-boop/dronelab/actions/runs/38297661112/artifacts/11769700435
- Firmware artifact ZIP SHA256: `62905cd17b7364b40a89388ddc50eaedcc73c9eaa4b6c3e7686d28bbaf8c6f38` (ZIP digest, not an individual firmware image).
- Header screenshots: https://github.com/chilchiltrips-boop/dronelab/actions/runs/38297661112/artifacts/11770050080
- Browser artifact ZIP SHA256: `1330e31a3d44b08be4cc1b14eb7f4f28e64902784eeb7b838364021a5062ffa6`.

The first passing push run does not erase the PR run failure. Both are recorded. No APK download was published after failed verification.
