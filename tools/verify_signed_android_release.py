#!/usr/bin/env python3
"""Fail closed if APK package/version/certificate changes accidentally."""
import re
import subprocess
import sys
from pathlib import Path

APP_ID = "in.zebjus.dronelab.companion"
EXPECTED_VERSION_CODE = 7
EXPECTED_CERT_SHA256 = "f1b86575b3590734654f638e4e0d68056d37b2e8884ac7d6c24636fe9b516894"

def output(cmd):
    return subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT)

def run():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: verify_signed_android_release.py APK_PATH APKSIGNER_PATH AAPT_PATH")
    apk, apksigner, aapt = sys.argv[1:]
    assert Path(apk).is_file(), "Missing signed APK"
    signatures = output([apksigner, "verify", "--verbose", "--print-certs", apk])
    matches = re.findall(r"Signer #\d+ certificate SHA-256 digest:\s*([0-9a-fA-F]+)", signatures)
    assert len(matches) == 1, "Release must have exactly one signing certificate"
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
    assert version_name.startswith("1.4.2"), "Unexpected Android release versionName"
    assert "application-debuggable" not in manifest, "Release must not be debuggable"
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
