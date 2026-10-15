# School production firmware policy — A1/C3 and A2/C6

**Current status: NOT APPROVED for signed-hardware production deployment.**
The current Arduino-generated APP/FACTORY binaries are development/bench images.
AES-GCM/HMAC authorizes a transport *session* and SHA-256 validates transfer bytes;
these do **not** prove publisher authenticity or protect against physical flash
replacement. Firmware will not automatically burn any security eFuses.

## Production acceptance gates

1. Freeze the correct PCB BOM, ESP32-C3 (A1) / ESP32-C6 (A2) revision,
   flash sizes, OTA partitions, test-jig and USB recovery procedure.
   ESP32-C3 Secure Boot v2 support is hardware-revision dependent: confirm
   real silicon and bootloader compatibility before provisioning.
2. Migrate manufacturing builds to ESP-IDF security settings validated for
   **each chip family**. Configure Secure Boot v2 with signed second-stage
   bootloader and signed APP/OTA images. Use secure signing outside public CI
   (prefer KMS/HSM/offline signing), never commit private signing keys.
3. Enable Flash Encryption **Release Mode** with a unique per-device flash
   encryption key, and Secure Boot to prevent untrusted code execution.
   Confirm authorized USB recovery design *before* disabling debug/download
   interfaces. A mistaken eFuse write or lost key can permanently brick a Kit.
4. Enable OTA rollback/test-boot confirmation; after verified startup,
   mark APP valid. Consider anti-rollback secure_version only after a complete
   downgrade and rescue policy has been exercised on test units.
5. Factory-provision Device ID, per-kit label secret, pairing, Wi-Fi profile
   recovery and admin privileges over physically controlled tooling.
   No shared school/default AP password must grant control or firmware OTA.
6. Sign release attestations with a separate Ed25519 metadata-signing key
   and record source APP SHA-256, signed APP SHA-256, target Device ID/board,
   Secure Boot + Flash Encryption eFuse readback, rollback test evidence,
   signer custody, and manufacturing audit.
7. Run `node tools/verify-school-production.mjs` with PRIVATE env vars
   `ZEBJUS_RELEASE_ATTESTATION_PATH`,
   `ZEBJUS_RELEASE_ATTESTATION_SIGNATURE_PATH`, and
   `ZEBJUS_RELEASE_PUBLIC_KEY_PATH`. All files and signed firmware binaries
   must be outside the GitHub/public WebApp tree. This gate fails closed
   until an externally attested rollout exists. An attestation is only one
   part of actual ROM/bootloader signed-image verification.
8. Pilot with isolated non-classroom hardware (A1 and A2): interrupted OTA,
   rollback on boot failure, factory-reset/recovery, STA/AP switching,
   signed-image rejection, Wi-Fi/PAIRING retention, and power loss.
   Obtain written production acceptance before enabling irreversible security
   fuses on deployed school Kits.

## Rollout levels

| Stage | Transport | Image provenance | Device enforcement | Eligible |
|---|---|---|---|---|
| Current lab | AES-GCM/HMAC, SHA-256 | Catalog digest, not publisher signature | No asserted eFuse protection | Bench only |
| Controlled pilot | Same + signed release metadata | Signed bootloader/APP, offline private signer | Secure Boot/Flash Encryption verified per board | Test jigs |
| School production | Same + monitored rollout | Signed images and audited key rotation | ROM Secure Boot + Release Mode flash encryption + rollback | After acceptance |

Never advertise current lab binaries as signed image policy compliant.
Do not turn on eFuses in source builds or remote OTA routines. Switching
existing unlocked kits to production mode requires a physical device-specific
manufacturing/recovery plan and may prevent normal USB FACTORY flashing.

References (vendor):
- https://docs.espressif.com/projects/esp-idf/en/latest/esp32c6/security/secure-boot-v2.html
- https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/security/security.html
- https://docs.espressif.com/projects/esp-idf/en/release-v4.3/esp32c3/security/secure-boot-v2.html
- https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/ota.html

## Shared module boundary

`js/kit-network-policy.js` owns OTA target priority, transient/nonretryable
error classification and transport request budgets. Both classroom connectivity
and Firmware Center consume it; physical FlightCore STA fallback delegates
reason categories to `FlightCoreWifiRetryPolicy.h`. Browser pages continue to
reuse the same modules; hardware identity and cryptographic verification remain
on the firmware, not in UI templates.
