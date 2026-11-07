#!/usr/bin/env python3
"""Verify the separately compiled A2 Rate candidate. Never grants physical PASS."""
import argparse
import hashlib
import json
import struct
import subprocess
from pathlib import Path
from firmware_compile_time import check_compiled_at

ROOT = Path(__file__).resolve().parents[1]


def verify(directory):
    catalog = json.loads((directory / 'catalog.json').read_text())
    report = json.loads((directory / 'build-report.json').read_text())
    assert catalog['releaseScope'] == report['buildProfile'] == 'EXPERIMENTAL_PPM_RATE'
    assert catalog['flightOutputEnabled'] is True
    assert catalog['flightOutputQualified'] is False and catalog['physicalAcceptance'] == 'NOT_RUN'
    assert report['hardwareFlashingTested'] is False
    assert report['compilerFlags'] == ['-fstack-usage', '-DZJ_A2_EXPERIMENTAL_RATE_FLIGHT=1']
    assert report['sourceCommit'] == subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    assert catalog['version'] == report['version'] == (ROOT / 'VERSION.txt').read_text().strip()
    expected = {'FlightCore_Firmware/I2C_ADDRESS_SCANNER.ino', 'FlightCore_Firmware/partitions.csv'}
    expected.update(str(p.relative_to(ROOT)) for p in (ROOT / 'FlightCore_Firmware').glob('*.h'))
    assert set(report['sourceSha256']) == expected
    for name, digest in report['sourceSha256'].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest, name
        committed = subprocess.check_output(['git', 'show', f'{report["sourceCommit"]}:{name}'], cwd=ROOT)
        assert hashlib.sha256(committed).hexdigest() == digest, 'Uncommitted compiled source: ' + name
    assert len(catalog['boards']) == len(report['boards']) == 1
    board, built = catalog['boards'][0], report['boards'][0]
    assert board['id'] == built['boardId'] == 'ZFC-A2'
    assert built['chipId'] == 13 and built['fqbn'] == board['build']['fqbn']
    assert built['otaSlots'] == [{'address': 0x10000, 'bytes': 0x1e0000}, {'address': 0x1f0000, 'bytes': 0x1e0000}]
    images = {}
    for kind in ('app', 'factory'):
        item = board['latest'][kind]
        assert item['file'] == f'ZEBJUS_FLIGHTCORE_A2_{kind.upper()}_RATE_EXPERIMENTAL.bin'
        data = (directory / item['file']).read_bytes()
        assert item['available'] is True and len(data) == item['size']
        assert hashlib.sha256(data).hexdigest() == item['sha256']
        assert data[0] == 0xe9 and struct.unpack_from('<H', data, 12)[0] == 13
        stamp = check_compiled_at(data, report['builtAt'], offset=0x10000 if kind == 'factory' else 0, require_marker=True)
        assert item['compiledAt'] == built['compiledAt'] == stamp
        images[kind] = data
    app, factory = images['app'], images['factory']
    assert b'ZJ_OUTPUT=PPM_RATE_EXPERIMENTAL\0' in app
    assert b'ZJ_OUTPUT=BENCH_DIAGNOSTIC\0' not in app
    assert (catalog['version'] + '\0').encode() in app
    assert len(app) <= 0x1e0000 and len(factory) == 4 * 1024 * 1024
    assert factory[0x10000:0x10000 + len(app)] == app
    print('PASS exact-source A2 experimental Rate APP/FACTORY and build flags. Physical acceptance NOT_RUN.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    verify(parser.parse_args().directory)
