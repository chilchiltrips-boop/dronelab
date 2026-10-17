#!/usr/bin/env python3
"""Write public APK release metadata only from the checked source identity.

The previous CI step must successfully verify the actual signed APK using
verify_signed_android_release.py and the existing certificate pin.
"""
import re
import sys
from pathlib import Path

APP_ID = "in.zebjus.dronelab.companion"
CERT_SHA256 = "F1:B8:65:75:B3:59:07:34:65:4F:63:8E:4E:0D:68:05:6D:37:B2:E8:88:4A:C7:D6:C2:46:36:FE:9B:51:68:94"

def build_metadata(gradle: str, source: str) -> str:
    code = re.search(r"(?m)^\s*versionCode\s+([1-9][0-9]*)\s*$", gradle)
    name = re.search(r"(?m)^\s*versionName\s+'([a-zA-Z0-9][a-zA-Z0-9._-]*)'\s*$", gradle)
    if not code or not name:
        raise ValueError("Release versionCode/versionName not present in trusted Gradle source")
    if not re.fullmatch(r"[a-f0-9]{40}", source):
        raise ValueError("Expected exact verified 40-hex release source commit")
    return (f"App: {APP_ID}\nVersion: {name.group(1)}\n"
            f"VersionCode: {code.group(1)}\nRelease certificate SHA256: {CERT_SHA256}\n"
            f"Source commit: {source}\n")

def main():
    if len(sys.argv) != 4:
        raise SystemExit("Usage: write_android_release_metadata.py GRADLE OUTPUT GITHUB_SHA")
    gradle, target, source = sys.argv[1:]
    result = build_metadata(Path(gradle).read_text(encoding="utf-8"), source)
    Path(target).write_text(result, encoding="utf-8")
    print("Release metadata prepared from verified Gradle source:")
    print(result, end="")

if __name__ == "__main__":
    main()
