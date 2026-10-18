#!/usr/bin/env python3
"""Verify that the APK actually contains this checkout's bundled web assets."""
import sys
from pathlib import Path
from zipfile import ZipFile

ASSETS = (
    "companion.html", "companion.css", "companion.js", "companion-network.js",
    "android-native-bridge.js", "companion-flight.js", "companion-menu.js", "flight-input.js",
    "pairing-core.js", "pairing-code.js", "pairing-qr-ui.js", "firmware-catalog.json",
    "js/kit-auth.js", "js/kit-network-policy.js", "js/kit-ack-diagnostics.js", "vendor/crypto/zfc-crypto.js",
    "vendor/qrgen.js", "vendor/jsqr.js", "vendor/peerjs.min.js", "vendor/peerjs.LICENSE",
)

def verify(apk):
    root = Path(__file__).resolve().parent.parent
    with ZipFile(apk) as bundle:
        for asset in ASSETS:
            if bundle.read("assets/" + asset) != (root / asset).read_bytes():
                raise ValueError("APK asset differs from source revision: " + asset)
    print(f"PASS: {len(ASSETS)} bundled Android assets match this source revision")

if __name__ == "__main__":
    verify(sys.argv[1])
