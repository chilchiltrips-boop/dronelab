# ZEBJUS DroneLab: permanent Android APK upgrades (V1.4.2+)

**Why old APKs require uninstall:** Prior APKs were signed with a new temporary debug key on each GitHub Actions runner. Android does not permit replacing the APK under the same application ID using a different certificate.

**Solution:** This repository's Android CI now builds a **non-debuggable RELEASE APK**, not a debug APK, signed with one **permanent private ZEBJUS key** loaded only from GitHub Actions encrypted secrets. A pinned certificate fingerprint is checked on every release. From **V1.4.2 onwards**, the phone can install updates on top of the previous signed release as long as the key stays the same, `applicationId` stays unchanged, and `versionCode` increases.

## Once-only GitHub setup (repository owner)

Obtain these two **PRIVATE** files from the person who generated the ZEBJUS release signing identity:

* `ZEBJUS_ANDROID_RELEASE_V1.p12` (keystore)
* `ZEBJUS_PRIVATE_SIGNING_SETUP.txt` (private password and instructions)

**Never commit either file to GitHub, share them with students, or store them in the APK directory.**

On the repository owner account, open:

[GitHub → Settings → Secrets and variables → Actions](https://github.com/chilchiltrips-boop/dronelab/settings/secrets/actions)

Create these two **repository secrets** (case-sensitive):

1. **`ZEBJUS_ANDROID_KEYSTORE_B64`**: one-line base64 content of the `.p12` file. To generate on macOS/Linux:
   ```bash
   base64 < ZEBJUS_ANDROID_RELEASE_V1.p12 | tr -d '\n'
   ```
   Copy the full output into the secret's value. On Windows PowerShell:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("ZEBJUS_ANDROID_RELEASE_V1.p12"))
   ```
2. **`ZEBJUS_ANDROID_SIGNING_PASSWORD`**: the exact password from `ZEBJUS_PRIVATE_SIGNING_SETUP.txt`.

After saving the two secrets, ask to finalize the V1.4.2 release from testing to `main`, or dispatch the Android release workflow after it is on `main`.

### Certificate pin

ZEBJUS production release signing certificate SHA256 (public fingerprint only):
```
F1:B8:65:75:B3:59:07:34:65:4F:63:8E:4E:0D:68:05:6D:37:B2:E8:88:4A:C7:D6:C2:46:36:FE:9B:51:68:94
```
If a workflow receives another signing key, it **fails** instead of publishing a mismatched APK.

### First installation vs later upgrades

Old Android V1.4.1 and earlier were CI-debug-signed, and the original debug private key was not preserved. Therefore **one final uninstall of the old debug app is unavoidable** before installing the first release-signed V1.4.2 APK. Every future ZEBJUS-signed release with a higher `versionCode` installs over V1.4.2 without uninstalling. Android automatically decides whether to offer Update based on package ID, certificate and version code.

To install: download `mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk` and open on Android. A new version can reuse that same download URL. It does **not** force-install; Android asks for user confirmation.

### Important future release rule

Keep `applicationId 'in.zebjus.dronelab.companion'`, the pinned release signing key, and always increment integer `versionCode` (7 → 8 → 9…). Changing only the Web App version or Android `versionName` is insufficient. Never distribute `assembleDebug` artifacts as the official release; only publish `assembleRelease` after signature verification.

Back up the keystore and password offline in two safe locations. **If lost, Android cannot upgrade the app under the same package identity** without an approved signing key rotation path.

### Scope of CI verification

CI verifies Gradle code, signing configuration and APK cryptographic signature. A real phone upgrade should also be tested by installing one release followed by a **second signed release with a higher version code**, confirming Android shows **Update** and retains the app. Until those two signed builds and phone test are complete, do not claim in-place upgrades are physically verified.
