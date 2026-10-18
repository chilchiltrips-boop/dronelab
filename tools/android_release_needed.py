#!/usr/bin/env python3
"""Retain an identical published APK; require a new code for changed APK inputs."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

APP_ID = 'in.zebjus.dronelab.companion'
CERT = 'F1B86575B3590734654F638E4E0D68056D37B2E8884AC7D6C24636FE9B516894'
# Inputs copied into the APK plus native sources/build configuration. WebApp-only
# files and regression tests do not alter the installed Android package.
APK_INPUTS = [
    'mobile-android', 'companion.html', 'companion.css', 'companion.js',
    'companion-network.js', 'android-native-bridge.js', 'companion-flight.js',
    'companion-menu.js', 'flight-input.js', 'pairing-core.js', 'pairing-code.js',
    'pairing-qr-ui.js', 'remote-rtc.js', 'remote-rtc-config.json',
    'js/kit-auth.js', 'js/kit-network-policy.js', 'js/kit-ack-diagnostics.js',
    'firmware-catalog.json', 'vendor/crypto', 'vendor/qrgen.js',
    'vendor/jsqr.js', 'vendor/peerjs.min.js', 'vendor/peerjs.LICENSE',
]


def release_needed(repo_root):
    repo_root = Path(repo_root)
    gradle = (repo_root / 'mobile-android/app/build.gradle').read_text()
    code = int(re.search(r'\bversionCode\s+(\d+)', gradle)[1])
    name = re.search(r"\bversionName\s+'([^']+)'", gradle)[1]
    metadata = dict(line.split(': ', 1) for line in
                    (repo_root / 'mobile-apk/ANDROID_RELEASE_META.txt').read_text().splitlines()
                    if ': ' in line)
    if metadata.get('App') != APP_ID or metadata.get('Release certificate SHA256', '').replace(':', '').upper() != CERT:
        raise ValueError('Published Android identity/certificate metadata is not trusted')
    published = int(metadata['VersionCode'])
    if code < published:
        raise ValueError('Android source versionCode regresses the published APK')
    if code > published:
        return {'build': True, 'reason': 'New Android release candidate; all existing signing/native/publication gates apply.'}
    if name != metadata['Version']:
        raise ValueError('Changed Android versionName requires an increased versionCode')
    source = metadata.get('Source commit', '')
    if not re.fullmatch(r'[0-9a-f]{40}', source):
        raise ValueError('Published APK source commit is absent or invalid')
    subprocess.run(['git', 'cat-file', '-e', source + '^{commit}'], cwd=repo_root, check=True)
    diff = subprocess.run(['git', 'diff', '--quiet', source, 'HEAD', '--', *APK_INPUTS], cwd=repo_root)
    if diff.returncode == 1:
        raise ValueError('Android package inputs changed: increment versionCode before building an upgrade')
    if diff.returncode != 0:
        raise ValueError('Unable to compare published Android package inputs')
    apk = repo_root / 'mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk'
    checksum = (repo_root / 'mobile-apk/SHA256SUMS.txt').read_text().split()
    if len(checksum) != 2 or checksum[1] != 'mobile-apk/ZEBJUS_DroneLab_ANDROID_RELEASE.apk' or hashlib.sha256(apk.read_bytes()).hexdigest() != checksum[0]:
        raise ValueError('Existing published APK checksum is invalid')
    return {'build': False, 'reason': 'Published version and APK inputs are unchanged; retain the verified signed APK.'}


if __name__ == '__main__':
    result = release_needed(Path.cwd())
    print(json.dumps(result))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
            out.write('build=' + str(result['build']).lower() + '\n')
