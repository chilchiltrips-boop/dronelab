"""Pack Arduino's compiled XIAO ESP32-C6 sketch into an app and factory image."""
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
FLASH_SIZE=4*1024*1024
APP_OFFSET=0x10000

def image_check(data: bytes,base=0):
    if len(data)<base+32768 or data[base]!=0xe9 or not 1<=data[base+1]<=16:
        raise ValueError('ESP image header/segments missing')
    if data[base+12:base+14]!=b'\x0d\x00':
        raise ValueError('Image chip ID is not ESP32-C6 (13)')
    if data[base+32:base+36]!=bytes.fromhex('3254cdab'):
        raise ValueError('ESP application descriptor missing')

def unique(folder: Path,suffix: str):
    files=list(folder.glob('*'+suffix))
    if len(files)!=1: raise ValueError(f'Expected one *{suffix} in {folder}, got {files}')
    return files[0]

def build(folder: Path):
    app=unique(folder,'.ino.bin').read_bytes()
    boot=unique(folder,'.bootloader.bin').read_bytes()
    partitions=unique(folder,'.partitions.bin').read_bytes()
    image_check(app)
    if partitions[:2]!=b'\xaa\x50':
        raise ValueError('ESP partition table magic missing')
    if len(boot)>0x8000 or len(partitions)>0x8000 or len(app)>0x140000:
        raise ValueError('Image or partition data exceeds its flash slot')
    factory=bytearray(b'\xff'*FLASH_SIZE)
    for offset,data in ((0,boot),(0x8000,partitions),(APP_OFFSET,app)):
        factory[offset:offset+len(data)]=data
    image_check(factory,APP_OFFSET)
    if factory[0]!=0xe9: raise ValueError('Bootloader header missing')
    output=ROOT/'firmware'
    (output/'XIAO_C6_BOOTLOADER.bin').write_bytes(boot.ljust(0x8000,b'\xff'))
    (output/'XIAO_C6_PARTITIONS.bin').write_bytes(partitions.ljust(0x8000,b'\xff'))
    files={'factory':('XIAO_C6_SAMPLE_FACTORY.bin',bytes(factory)),'app':('XIAO_C6_SAMPLE_APP.bin',app)}
    catalog={'schema':1,'boardId':'xiao-c6','board':'XIAO_ESP32C6','version':'sample-1.0.0','appOffset':'0x10000','flashBytes':FLASH_SIZE}
    for kind,(name,data) in files.items():
        (output/name).write_bytes(data)
        catalog[kind]={'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    (output/'sample.json').write_text(json.dumps(catalog,indent=2)+'\n')
    print(json.dumps(catalog,indent=2))

if __name__=='__main__': build(Path(sys.argv[1]).resolve())
