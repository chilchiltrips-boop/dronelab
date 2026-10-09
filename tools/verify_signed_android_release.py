#!/usr/bin/env python3
"""Fail closed if APK package/version/certificate changes accidentally."""
import re
import subprocess
import sys
from pathlib import Path

APP_ID = "in.zebjus.dronelab.companion"
EXPECTED_VERSION_CODE = 10
EXPECTED_CERT_SHA256 = "f1b86575b3590734654f638e4e0d68056d37b2e8884ac7d6c24636fe9b516894"

def output(cmd):
    return subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT)

def run():
    if len(sys.argv) not in (4, 5):
        raise SystemExit("Usage: verify_signed_android_release.py APK_PATH APKSIGNER_PATH AAPT_PATH [PREVIOUS_APK]")
    apk, apksigner, aapt = sys.argv[1:4]
    assert Path(apk).is_file(), "Missing signed APK"
    signatures = output([apksigner, "verify", "--verbose", "--print-certs", apk])
    # Certificate fingerprints are PUBLIC; printing this subset is safe and
    # helps diagnose different Android build-tools output conventions.
    certificate_lines = [line.strip() for line in signatures.splitlines()
                         if "certificate" in line.lower() or "scheme" in line.lower()]
    print("Android APK signing metadata:")
    for line in certificate_lines: print("  " + line, flush=True)
    matches = re.findall(r"(?:V2 Signer:|Signer #\d+) certificate SHA-256 digest:\s*([0-9a-fA-F]{64})", signatures)
    assert len(matches) == 1, f"Release must have exactly one signing certificate. Found {len(matches)}."
    assert matches[0].lower() == EXPECTED_CERT_SHA256, (
        "APK signed with WRONG key. Release certificate does not match ZEBJUS pinned certificate."
    )
    assert "Verified using v2 scheme (APK Signature Scheme v2): true" in signatures, (
        "APK v2 signature verification failed"
    )
    manifest = output([aapt, "dump", "badging", apk])
    package = re.search(r"^package:\s+name='([^']+)'\s+versionCode='(\d+)'\s+versionName='([^']+)'", manifest, re.M)
    assert package, "Unable to extract Android package/version info"
    app_id, version_code, version_name = package.groups()
    assert app_id == APP_ID, f"Unexpected app ID: {app_id}"
    assert int(version_code) == EXPECTED_VERSION_CODE, f"Release versionCode must be {EXPECTED_VERSION_CODE}, got {version_code}"
    assert version_name.startswith("1.4.5"), "Unexpected Android release versionName"
    assert "application-debuggable" not in manifest, "Release must not be debuggable"
    if len(sys.argv) == 5:
        previous = sys.argv[4]
        old_signatures = output([apksigner, "verify", "--verbose", "--print-certs", previous])
        old_certs = re.findall(r"Signer #\d+ certificate SHA-256 digest:\s*([0-9a-fA-F]{64})", old_signatures)
        assert len(old_certs) == 1 and old_certs[0].lower() == EXPECTED_CERT_SHA256, "Published baseline has an incompatible certificate"
        old_manifest = output([aapt, "dump", "badging", previous])
        old_package = re.search(r"^package:\s+name='([^']+)'\s+versionCode='(\d+)'", old_manifest, re.M)
        assert old_package and old_package[1] == APP_ID, "Published baseline package differs"
        assert int(version_code) > int(old_package[2]), "Update versionCode must increase over published APK"
        print(f"  Update identity verified against published versionCode {old_package[2]} (installation still needs a device)")
    print("PASS: non-debug ZEBJUS Android release")
    print(f"  Package: {app_id}")
    print(f"  VersionCode: {version_code} • VersionName: {version_name}")
    print(f"  Pinned cert SHA256: {EXPECTED_CERT_SHA256}")
    print("  Verified APK Signature v2")

if __name__ == "__main__":
    try:
        run()
    except (AssertionError, subprocess.CalledProcessError) as exc:
        raise SystemExit(f"RELEASE VERIFICATION FAILED: {exc}")
