#!/usr/bin/env python3
"""Validate the shipped, board-matched compiled release images and metadata."""
from pathlib import Path
import hashlib, json, struct, sys
ROOT=Path(__file__).resolve().parents[1]
CAT=json.loads((ROOT/'firmware-catalog.json').read_text())
LATEST=json.loads((ROOT/'firmware-latest.json').read_text())
OUT=ROOT/'FlightCore_Firmware'
assert LATEST['version']==CAT['version']
assert json.loads((OUT/'catalog.json').read_text())==CAT

def sha(b): return hashlib.sha256(b).hexdigest()
def chip(b,at=0):
 assert b[at]==0xe9 and 1<=b[at+1]<=16
 return struct.unpack_from('<H',b,at+12)[0]
def slots(b):
 found=[]
 for at in range(0x8000,0x9000,32):
  magic,typ,sub,addr,size=struct.unpack_from('<HBBII',b,at)
  if magic!=0x50aa: break
  if typ==0 and sub in (0x10,0x11):found.append((addr,size))
 return found
for board in CAT['boards']:
 images={}
 for kind in ('app','factory'):
  meta=board['latest'][kind]
  assert meta['available'] and meta['size'] and len(meta['sha256'])==64
  b=(OUT/meta['file']).read_bytes();images[kind]=b
  assert len(b)==meta['size'],(board['id'],kind,'size')
  assert sha(b)==meta['sha256'],(board['id'],kind,'sha256')
  assert chip(b)==board['imageChipIds'][0],(board['id'],kind,'chip')
  offset=0x10000 if kind=='factory' else 0
  assert struct.unpack_from('<I',b,offset+32)[0]==0xabcd5432,(board['id'],kind,'descriptor')
  assert chip(b,offset)==board['imageChipIds'][0],(board['id'],kind,'app chip')
  assert CAT['version'].encode() in b,(board['id'],kind,'embedded release')
 app,factory=images['app'],images['factory']
 assert len(factory)==4*1024*1024
 assert len(app)<=0x1e0000
 assert slots(factory)==[(0x10000,0x1e0000),(0x1f0000,0x1e0000)],(board['id'],'partition layout')
 assert factory[0x10000:0x10000+len(app)]==app,(board['id'],'APP differs from factory')
 print(f"PASS {board['id']} {board['build']['fqbn']} {CAT['version']} APP {len(app)} bytes FACTORY {len(factory)} bytes SHA-256 matches")
print('Release images verified; physical board flashing not performed.')
