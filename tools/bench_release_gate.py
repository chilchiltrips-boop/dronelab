#!/usr/bin/env python3
"""Verify bench-only build candidates and the one-time 1.7.15 publication."""
import argparse,json,re,subprocess,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
fw=root/'FlightCore_Firmware'
def validate(compiled=False, publish_source=False):
    policy=json.loads((fw/'bench-release-policy.json').read_text())
    version=(root/'VERSION.txt').read_text().strip()
    flight=(fw/'FlightCoreFlightOutput.h').read_text()
    scheduler=(fw/'FlightCoreControlRuntime.h').read_text()
    ino=(fw/'I2C_ADDRESS_SCANNER.ino').read_text()
    assert policy['schema']==1 and policy['candidateVersion']==version
    assert policy['releaseScope']=='BENCH_DIAGNOSTIC'
    assert policy['flightOutputQualified'] is False and policy['physicalAcceptance']=='NOT_RUN'
    # Check the compiled default, not merely the presence of a false branch.
    probe=f'#include "{fw / "FlightCoreFlightOutput.h"}"\nstatic_assert(!ZJ_FLIGHT_OUTPUT_ENABLED);\nstatic_assert(!ZJ_FLIGHT_HARDWARE_QUALIFIED);\n'
    with tempfile.TemporaryDirectory() as temporary:
        subprocess.run(['g++','-std=c++17','-DCONFIG_IDF_TARGET_ESP32C6=1','-x','c++','-c','-o',temporary+'/gate.o','-'],input=probe,text=True,check=True)
    assert not re.search(r'\b(?:ledcWrite|analogWrite)\s*\(',scheduler), 'PID scheduler cannot directly drive motors'
    assert 'controlActuating' in ino and any('controlActuating' in line and 'false' in line for line in ino.splitlines())
    assert f'FW_VERSION="{version}"' in ino
    hold_path=fw/'publication-hold.json'
    hold=json.loads(hold_path.read_text()) if hold_path.exists() else None
    if hold:
        assert hold['candidateVersion']==version and hold['publishedVersion']!=version
    if publish_source and not (version=='1.7.15' and hold and hold['publishedVersion']=='1.7.14'):
        print(f'Publication remains held for FlightCore {version}')
        return False
    if compiled:
        catalog=json.loads((fw/'catalog.json').read_text())
        latest=json.loads((fw/'latest.json').read_text())
        report=json.loads((fw/'build-report.json').read_text())
        assert catalog['version']==latest['version']==report['version']==version
        for item in (catalog,latest):
            assert item.get('releaseScope')=='BENCH_DIAGNOSTIC'
            assert item.get('flightOutputQualified') is False and item.get('physicalAcceptance')=='NOT_RUN'
        assert report['hardwareFlashingTested'] is False
        assert report['buildProfile']=='BENCH_DIAGNOSTIC' and report['compilerFlags']==['-fstack-usage']
        assert {b['boardId'] for b in report['boards']}=={'ZFC-A1','ZFC-A2'}
        for board in catalog['boards']:
            image=(fw/board['latest']['app']['file']).read_bytes()
            assert b'ZJ_OUTPUT=BENCH_DIAGNOSTIC\0' in image
            assert b'ZJ_OUTPUT=PPM_RATE_EXPERIMENTAL\0' not in image
    print(f'PASS: {version} bench-only checks; flight motor actuation disabled')
    return True
if __name__=='__main__':
    ap=argparse.ArgumentParser()
    g=ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--source',action='store_true')
    g.add_argument('--compiled',action='store_true')
    g.add_argument('--publish-source',action='store_true')
    args=ap.parse_args()
    raise SystemExit(0 if validate(args.compiled,args.publish_source) else 1)
