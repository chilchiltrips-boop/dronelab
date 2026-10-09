# ZEBJUS Flight Training work and review package

Read [WORK_MASTER_PROMPT.md](WORK_MASTER_PROMPT.md) first. It is the supplied controlling assignment, preserved verbatim. [WORK_ASSIGNMENT.md](WORK_ASSIGNMENT.md) maps it to the implemented files and remaining human acceptance. The supplied baseline audit, matrix, reference guides and conceptual diagrams are preserved with `BASELINE_` names / in `references/` and `diagrams/`; they describe the old release and are not proof of current behavior.

| Document | Purpose |
|---|---|
| [EXISTING_CODE_AUDIT.md](EXISTING_CODE_AUDIT.md) | Reproduced source causes, implementation and retained boundaries |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Single plant, authentication/ownership and applied state flow |
| [PHYSICS.md](PHYSICS.md) | Units, parameters, equations, controller scaling and measured preset results |
| [TEST_MATRIX.md](TEST_MATRIX.md) | All 52 supplied acceptance rows, evidence and explicit device limitations |
| [RELEASE_EVIDENCE.md](RELEASE_EVIDENCE.md) | Review source, CI/artifact links, signing, release gates and reproduction |
| [DEVICE_ACCEPTANCE.md](DEVICE_ACCEPTANCE.md) | Remaining physical-phone/camera/audio test script |
| `numerical/` | Actual deterministic CSV traces, metrics and rendered SVG plots |

PR: https://github.com/chilchiltrips-boop/dronelab/pull/9. The feature branch is `feature/unified-flight-training-v1.6.1`. Review artifacts contain actual browser/native screenshots and sanitized traces; pairing QR/SDP/PIN/code values are masked. The downloadable final evidence package records the observed live WebApp/APK publication separately from these pre-merge source documents.

