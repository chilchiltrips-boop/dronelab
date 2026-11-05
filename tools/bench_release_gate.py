#!/usr/bin/env python3
"""Fail closed: 1.7.15 can be published only as non-actuating bench firmware."""
import argparse,json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
fw=root/'FlightCore_Firmware'
def validate(compiled=False):
    policy=json.loads((fw/'bench-release-policy.json').read_text())
    version=(root/'VERSION.txt').read_text().strip()
    flight=(fw/'FlightCoreFlightOutput.h').read_text()
    scheduler=(fw/'FlightCoreControlRuntime.h').read_text()
    ino=(fw/'I2C_ADDRESS_SCANNER.ino').read_text()
    assert policy['schema']==1 and policy['candidateVersion']==version=='1.7.15'
    assert policy['releaseScope']=='BENCH_DIAGNOSTIC'
    assert policy['flightOutputQualified'] is False and policy['physicalAcceptance']=='NOT_RUN'
    assert re.search(r'ZJ_FLIGHT_HARDWARE_QUALIFIED\s*=\s*false\s*;',flight), 'Physical flight output must remain disabled'
    assert not re.search(r'\b(?:ledcWrite|analogWrite)\s*\(',scheduler), 'PID scheduler cannot directly drive motors'
    assert 'controlActuating' in ino and any('controlActuating' in line and 'false' in line for line in ino.splitlines())
    assert f'FW_VERSION="{version}"' in ino
    held=fw/'publication-hold.json'
    if held.exists():
        hold=json.loads(held.read_text())
        assert hold['publishedVersion']=='1.7.14' and hold['candidateVersion']==version
    if compiled:
        catalog=json.loads((fw/'catalog.json').read_text())
        latest=json.loads((fw/'latest.json').read_text())
        report=json.loads((fw/'build-report.json').read_text())
        assert catalog['version']==latest['version']==report['version']==version
        for item in (catalog,latest):
            assert item.get('releaseScope')=='BENCH_DIAGNOSTIC'
            assert item.get('flightOutputQualified') is False and item.get('physicalAcceptance')=='NOT_RUN'
        assert report['hardwareFlashingTested'] is False
        assert {b['boardId'] for b in report['boards']}=={'ZFC-A1','ZFC-A2'}
    print('PASS: 1.7.15 bench-only publication checks; flight motor actuation disabled')
if __name__=='__main__':
    ap=argparse.ArgumentParser()
    g=ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--source',action='store_true')
    g.add_argument('--compiled',action='store_true')
    args=ap.parse_args()
    validate(args.compiled)
