#!/usr/bin/env python3
"""Validate board-aware I2C scanner + LED release metadata and binaries."""
from pathlib import Path
import argparse,hashlib,json,struct,subprocess
from firmware_compile_time import check_compiled_at
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'FlightCore_Firmware'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--bench',type=Path,help='Verify the approved bench package against the current compiled source')
bench=parser.parse_args().bench
OUT=bench or SOURCE
catalog_path=OUT/'catalog.json' if bench else ROOT/'firmware-catalog.json'
CAT=json.loads(catalog_path.read_text())
LATEST=json.loads((OUT/'latest.json' if bench else ROOT/'firmware-latest.json').read_text())
assert CAT['schema']==2 and CAT['product']=='ZEBJUS_FLIGHTCORE'
assert LATEST['version']==CAT['version']
source_version=(ROOT/'VERSION.txt').read_text().strip()
if CAT.get('releaseScope')=='BENCH_DIAGNOSTIC':
 assert CAT.get('flightOutputQualified') is False and CAT.get('physicalAcceptance')=='NOT_RUN', 'Bench release must never claim flight qualification'
 assert LATEST.get('releaseScope')=='BENCH_DIAGNOSTIC' and LATEST.get('flightOutputQualified') is False, 'Latest firmware metadata must show bench status'
hold_path=SOURCE/'publication-hold.json'
held=CAT['version']!=source_version
if bench:
 policy=json.loads((SOURCE/'bench-release-policy.json').read_text())
 assert not held and CAT['version']==policy['candidateVersion'], 'Bench package is for a different firmware source version'
 for metadata in (CAT,LATEST):
  assert metadata.get('releaseScope')=='BENCH_DIAGNOSTIC' and metadata.get('flightOutputQualified') is False and metadata.get('physicalAcceptance')=='NOT_RUN', 'Bench qualification metadata is invalid'
if held:
 hold=json.loads(hold_path.read_text()) if hold_path.exists() else {}
 assert hold.get('schema')==1 and hold.get('candidateVersion')==source_version and hold.get('publishedVersion')==CAT['version'], 'Source/catalog version mismatch: rebuild both profiles'

assert json.loads((OUT/'catalog.json').read_text())==CAT
assert len(CAT['boards'])==2
assert [b['name'] for b in CAT['boards']]==['ZEBJUS AERION A1','ZEBJUS AERION A2']
assert CAT['boards'][0]['build']['fqbn']=='esp32:esp32:esp32c3:CDCOnBoot=cdc'
sketch=(SOURCE/'I2C_ADDRESS_SCANNER.ino').read_text()
assert f'FW_VERSION="{source_version}"' in sketch, 'Sketch/catalog version mismatch'
report=json.loads((OUT/'build-report.json').read_text())
assert report['version']==CAT['version'], 'Build report/catalog version mismatch'
assert report.get('sourceCommit') and report.get('sourceSha256'), 'Compile provenance required; rebuild both profiles'
if bench:
 approved=policy['benchArtifact']
 assert report['sourceCommit']==approved['sourceCommit'], 'Wrong source commit for the approved bench artifact'
 assert hashlib.sha256(catalog_path.read_bytes()).hexdigest()==approved['catalogSha256'], 'Bench catalog differs from the approved artifact'
 assert hashlib.sha256((OUT/'build-report.json').read_bytes()).hexdigest()==approved['reportSha256'], 'Bench report differs from the approved artifact'
 assert report['hardwareFlashingTested'] is False and {b['boardId'] for b in report['boards']}=={'ZFC-A1','ZFC-A2'}
 compiled={str(p.relative_to(ROOT)) for p in [SOURCE/'I2C_ADDRESS_SCANNER.ino',SOURCE/'partitions.csv',*SOURCE.glob('*.h')]}
 assert set(report['sourceSha256'])==compiled, 'Bench report has an incomplete compiled source set'
 subprocess.run(['git','merge-base','--is-ancestor',report['sourceCommit'],'HEAD'],cwd=ROOT,check=True)
if held:
 assert report['sourceCommit']==hold['publishedSourceCommit'] and hashlib.sha256((OUT/'build-report.json').read_bytes()).hexdigest()==hold['publishedBuildReportSha256'], 'Held release report differs from pinned production provenance'
 print(f"Publication hold: verifying published {CAT['version']}; current source is candidate {source_version}")
else:
 for name,digest in report['sourceSha256'].items():
  assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest, 'Compiled source differs: '+name
assert '#include <Wire.h>' in sketch and 'Wire.begin(BUS_SDA,BUS_SCL);' in sketch and 'if(!scanRequested)return;' in sketch and 'readLedCommands();' in sketch and 'updateLedEffect(now);' in sketch and 'updateGyro(now);' in sketch
def sha(b):return hashlib.sha256(b).hexdigest()
def chip(b,at=0):
 assert b[at]==0xe9 and 1<=b[at+1]<=16
 return struct.unpack_from('<H',b,at+12)[0]
def slots(b):
 found=[]
 for at in range(0x8000,0x9000,32):
  magic,typ,sub,addr,size=struct.unpack_from('<HBBII',b,at)
  if magic!=0x50aa:break
  if typ==0 and sub in (0x10,0x11):found.append((addr,size))
 return found
for board in CAT['boards']:
 assert board['id'] in ('ZFC-A1','ZFC-A2')
 a=board['latest']['app'];f=board['latest']['factory']
 if bench:
  assert board['latest']['version']==CAT['version'] and a['available'] and f['available'], 'Missing approved bench images'
 if not (a['available'] and f['available']):
  assert not a['available'] and not f['available']
  assert not a['size'] and not f['size']
  print('BUILD PENDING',board['id'],'No legacy FlightCore image advertised')
  continue
 app=(OUT/a['file']).read_bytes();factory=(OUT/f['file']).read_bytes()
 assert (CAT['version']+'\0').encode() in app, 'Catalog firmware version differs from APP'
 assert len(app)==a['size'] and len(factory)==f['size']==4*1024*1024
 assert sha(app)==a['sha256'] and sha(factory)==f['sha256']
 compiled_utc=check_compiled_at(app,CAT['builtAt'],require_marker=True)
 assert a.get('compiledAt')==compiled_utc and f.get('compiledAt')==compiled_utc, 'Published compiledAt differs from embedded APP/FACTORY binary'
 assert board['latest'].get('compiledAt')==compiled_utc, 'Latest board compile metadata must match the binary'
 assert check_compiled_at(factory,CAT['builtAt'],offset=0x10000,require_marker=True)==compiled_utc
 assert next((v.get('compiledAt') for v in report.get('boards',[]) if v.get('boardId')==board['id']),None)==compiled_utc, 'Build report compile stamp differs from image'
 assert chip(app)==chip(factory)==board['imageChipIds'][0]
 assert chip(factory,0x10000)==board['imageChipIds'][0]
 assert struct.unpack_from('<I',app,32)[0]==0xabcd5432
 assert struct.unpack_from('<I',factory,0x10000+32)[0]==0xabcd5432
 if CAT['version']=='1.3.1':assert b'Scanning I2C bus...' in app
 else:assert b'Scanning I2C bus...' not in app and b'ZJSCAN,' in app
 assert slots(factory)==[(0x10000,0x1e0000),(0x1f0000,0x1e0000)]
 assert factory[0x10000:0x10000+len(app)]==app
 print('PASS',board['id'],'I2C SCANNER',len(app),'APP',len(factory),'FACTORY',sha(app)[:12], 'COMPILED_UTC',compiled_utc)
print('Scanner + LED + board-specific IMU release metadata verified. Physical USB board not tested.')
