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


## Verified continuation artifacts

Android run https://github.com/chilchiltrips-boop/dronelab/actions/runs/38303708120 passed signed build and native 16:9 emulator acceptance, including install-over-code-16. Public publication was correctly skipped on the development branch. This is an emulator result, not a real-phone Wi-Fi/OTA acceptance result.

- APK source: `302b903ad0fd4939504be6d5a113d5fd4aa71c5f`.
- APK review ZIP: https://github.com/chilchiltrips-boop/dronelab/actions/runs/38303708120/artifacts/11771128670
- APK file SHA256: `6a62b1f6b5658ee1146b3c0764c1fa046c10b1ee0c5099b760fd36bf5ff6eec7`.
- APK identity: `in.zebjus.dronelab.companion`, 1.7.1-v2-review, versionCode 17, release certificate `f1b86575b3590734654f638e4e0d68056d37b2e8884ac7d6c24636fe9b516894`.
- The following commit `c39820c22e11cbfaa5e6d388c0dda787e287a918` only preserves the native runner's executable mode; its Android workflow independently reruns the gates.
- Browser/network/real offline job passed on https://github.com/chilchiltrips-boop/dronelab/actions/runs/38303771631.
- Latest local Node suite: 199/199. Expanded workspace grant geometry: 33 width/state combinations pass. Seven header widths and simulated authenticated network integration rerun successfully.

Individual firmware hashes for artifact 11769700435 (source `978f9ecb8e4056733e692a90a2243d8b0c017178`, version **1.4.0**):

| Image | SHA256 |
|---|---|
| A1 APP | `fdbfd5cb6c4e3719bf181583734cb8114363dc8eb23f11d3182323ff4bb76600` |
| A1 FACTORY | `c619533b480132542824918e1a85d49ba08759229c63de69db666df59add7d29` |
| A2 APP | `4c12bfd26f9b460c4d906a489f225dc74fc3cc5dec20de60d2523f8f7d2e7aaf` |
| A2 FACTORY | `d1ecbe25c8ca4d95e532c36d8c934a1bb8dc57705c7f45995353fc4457e3ae75` |

These review builds do not add the still-missing 1.5.0 classroom permissions. Do not describe them as a completed V2 firmware release. GitHub Pages remains the unmodified main deployment. New source/header/test changes remain review-only until all feature gates are satisfied.

Final branch head and last workflow conclusions are also recorded in the PR description after CI completes, avoiding a document-only commit that would invalidate the checked SHA.
