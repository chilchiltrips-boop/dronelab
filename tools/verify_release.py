#!/usr/bin/env python3
"""Validate board-aware scanner-only release metadata and compiled binaries."""
from pathlib import Path
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]
CAT=json.loads((ROOT/'firmware-catalog.json').read_text())
LATEST=json.loads((ROOT/'firmware-latest.json').read_text())
OUT=ROOT/'FlightCore_Firmware'
assert CAT['schema']==2 and CAT['product']=='ZEBJUS_I2C_SCANNER'
assert LATEST['version']==CAT['version']
assert json.loads((OUT/'catalog.json').read_text())==CAT
assert len(CAT['boards'])==2
sketch=(OUT/'I2C_ADDRESS_SCANNER.ino').read_text()
assert '#include <Wire.h>' in sketch and 'Wire.begin();' in sketch and 'delay(5000);' in sketch
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
 if not (a['available'] and f['available']):
  assert not a['available'] and not f['available']
  assert not a['size'] and not f['size']
  print('BUILD PENDING',board['id'],'No legacy FlightCore image advertised')
  continue
 app=(OUT/a['file']).read_bytes();factory=(OUT/f['file']).read_bytes()
 assert len(app)==a['size'] and len(factory)==f['size']==4*1024*1024
 assert sha(app)==a['sha256'] and sha(factory)==f['sha256']
 assert chip(app)==chip(factory)==board['imageChipIds'][0]
 assert chip(factory,0x10000)==board['imageChipIds'][0]
 assert struct.unpack_from('<I',app,32)[0]==0xabcd5432
 assert struct.unpack_from('<I',factory,0x10000+32)[0]==0xabcd5432
 assert b'Scanning I2C bus...' in app
 assert slots(factory)==[(0x10000,0x1e0000),(0x1f0000,0x1e0000)]
 assert factory[0x10000:0x10000+len(app)]==app
 print('PASS',board['id'],'I2C SCANNER',len(app),'APP',len(factory),'FACTORY',sha(app)[:12])
print('Scanner release metadata verified. Physical USB board not tested.')
