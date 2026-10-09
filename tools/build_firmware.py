#!/usr/bin/env python3
import argparse, hashlib, json, re, shutil, struct, subprocess, tempfile, time
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'FlightCore_Firmware'
SRC=OUT/'ZEBJUS_FLIGHTCORE.ino'
CAT=OUT/'catalog.json'
VERSION_FILE=ROOT/'VERSION.txt'
CORE_VERSION='3.3.12'
INDEX_URL='https://espressif.github.io/arduino-esp32/package_esp32_index.json'


def run(cmd, label='command', attempts=1):
    for attempt in range(1, attempts + 1):
        print('+', ' '.join(map(str, cmd)), flush=True)
        try:
            subprocess.run(cmd, check=True)
            return
        except subprocess.CalledProcessError as error:
            if attempt == attempts:
                raise RuntimeError(f'{label} failed with exit code {error.returncode} after {attempt} attempt(s). See the command output above.') from error
            delay = min(10 * 2 ** (attempt - 1), 40)
            print(f'{label}: attempt {attempt}/{attempts} failed; retrying in {delay}s. Cached downloads are retained.', flush=True)
            time.sleep(delay)


def install_core(command):
    # Network setup is retried; compiler errors are reported after one attempt.
    run(command + ['core', 'update-index', '--additional-urls', INDEX_URL], 'Arduino package index download', attempts=4)
    run(command + ['core', 'install', f'esp32:esp32@{CORE_VERSION}', '--additional-urls', INDEX_URL], 'ESP32 core installation', attempts=4)


def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()


def source_version():
    text=SRC.read_text(errors='replace')
    m=re.search(r'FW_VERSION\s*=\s*"([^"]+)"',text)
    return m.group(1).strip() if m else VERSION_FILE.read_text().strip()


def find_app_bin(build):
    bins=[p for p in build.glob('*.bin') if not any(x in p.name.lower() for x in ('bootloader','partitions','merged','factory'))]
    bins.sort(key=lambda p:p.stat().st_size,reverse=True)
    if not bins: raise RuntimeError('Application .bin was not produced')
    return bins[0]

def find_factory_bin(build):
    bins=[p for p in build.glob('*.bin') if 'merged' in p.name.lower() or 'factory' in p.name.lower()]
    bins.sort(key=lambda p:p.stat().st_size,reverse=True)
    return bins[0] if bins else None


def verify_build(build, board, version):
    app=find_app_bin(build).read_bytes()
    if len(app)<24 or app[0]!=0xE9: raise RuntimeError('Invalid ESP application header')
    chip=struct.unpack_from('<H',app,12)[0]
    if chip not in board['imageChipIds']: raise RuntimeError(f'Wrong image chip ID: {chip}')
    if version.encode() not in app: raise RuntimeError('Release version is absent from compiled application')
    table=next(build.glob('*.partitions.bin')).read_bytes()
    slots=[]
    for offset in range(0,len(table)-31,32):
        magic,typ,sub,address,size,label,flags=struct.unpack_from('<HBBII16sI',table,offset)
        if magic!=0x50AA: break
        if typ==0 and sub in (0x10,0x11): slots.append({'address':address,'bytes':size})
    if len(slots)!=2 or slots[0]['address']!=int(board['appAddress'],0) or [v['bytes'] for v in slots]!=[0x1e0000,0x1e0000] or slots[1]['address']!=0x1f0000: raise RuntimeError('Matching dual OTA partition layout is required')
    if any(len(app)>slot['bytes'] for slot in slots): raise RuntimeError('Application exceeds an OTA slot')
    factory=find_factory_bin(build)
    if not factory: raise RuntimeError('Merged USB factory image was not produced')
    merged=factory.read_bytes()
    if merged[0]!=0xE9 or struct.unpack_from('<H',merged,12)[0]!=chip: raise RuntimeError('Factory bootloader chip/offset mismatch')
    address=slots[0]['address']
    if merged[address:address+len(app)]!=app: raise RuntimeError('Factory image application differs from OTA image')
    return {'boardId':board['id'],'fqbn':board['build']['fqbn'],'chipId':chip,'appBytes':len(app),'otaSlots':slots,'factoryBytes':len(merged),'factoryAddress':'0x0','checks':['image magic','profile chip ID','release version','dual OTA slots','slot size','factory bootloader at 0x0','factory/APP identical']}


def verify_monitor_stack(build):
    # Direct frame only: leave the remaining task stack for ROM/library calls.
    frames=[]
    for path in build.rglob('*.su'):
        for line in path.read_text().splitlines():
            fields=line.split('\t')
            if len(fields)>=3 and 'void rcMonitorTask(void*)' in fields[0]:
                frames.append((int(fields[1]),fields[2]))
    if len(frames)!=1 or frames[0][1]!='static' or frames[0][0]>1024:
        raise RuntimeError(f'RC monitor stack frame exceeds its 1024-byte budget or is unmeasured: {frames}')
    return {'taskStackBytes':8192,'directFrameBytes':frames[0][0],'directFrameLimitBytes':1024,'includesROMCallDepth':False}


def sync_catalog_version(catalog,version):
    catalog['version']=version
    for board in catalog.get('boards',[]):
        board.setdefault('latest',{})['version']=version
    return catalog


def write_metadata(catalog,version,built_at):
    catalog['builtAt']=built_at
    data=json.dumps(catalog,indent=2)+'\n'
    CAT.write_text(data); (ROOT/'firmware-catalog.json').write_text(data)
    sub={'schema':2,'product':'ZEBJUS_FLIGHTCORE','version':version,'builtAt':built_at,'catalog':'catalog.json','note':'Board-aware firmware catalog. Build automation marks each verified package available after compilation.'}
    top={**sub,'catalog':'firmware-catalog.json'}
    (OUT/'latest.json').write_text(json.dumps(sub,indent=2)+'\n')
    (ROOT/'firmware-latest.json').write_text(json.dumps(top,indent=2)+'\n')


def main():
    ap=argparse.ArgumentParser(description='Build verified ZEBJUS FlightCore firmware packages with stable replace-in-place filenames.')
    ap.add_argument('--board',default='all',help='Board profile ID from catalog.json, or all')
    setup=ap.add_mutually_exclusive_group()
    setup.add_argument('--skip-core-install',action='store_true')
    setup.add_argument('--install-only',action='store_true',help='Install the pinned core without compiling or changing firmware files')
    ap.add_argument('--config-file',help='Optional Arduino CLI configuration file')
    args=ap.parse_args()
    if not SRC.exists(): raise SystemExit(f'Missing source: {SRC}')
    if not CAT.exists(): raise SystemExit(f'Missing catalog: {CAT}')
    version=source_version()
    built_at=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
    catalog=sync_catalog_version(json.loads(CAT.read_text()),version)
    ids=[b['id'] for b in catalog.get('boards',[]) if b.get('build',{}).get('builder')=='arduino-cli']
    if args.board!='all' and args.board not in ids: raise SystemExit(f'Unknown/non-buildable board profile: {args.board}. Available: {", ".join(ids)}')
    cli=shutil.which('arduino-cli')
    if not cli: raise SystemExit('arduino-cli not found. Install Arduino CLI, then rerun this script.')
    command=[cli]+(['--config-file',args.config_file] if args.config_file else [])
    if not args.skip_core_install:
        install_core(command)
    if args.install_only:
        print(f'Arduino-ESP32 {CORE_VERSION} setup complete; no firmware files changed.')
        return
    targets=[b for b in catalog['boards'] if b['id'] in ids and (args.board=='all' or b['id']==args.board)]
    report={'version':version,'builtAt':built_at,'arduinoEsp32':CORE_VERSION,'hardwareFlashingTested':False,'boards':[]}
    for b in targets:
        cfg=b['build']; pkg=b['latest']['app']; filename=pkg['file']
        with tempfile.TemporaryDirectory(prefix='zfc-build-') as td:
            td=Path(td); sketch=td/'ZEBJUS_FLIGHTCORE'; sketch.mkdir(); shutil.copy2(SRC,sketch/'ZEBJUS_FLIGHTCORE.ino')
            for pattern in ('*.h','*.hpp','*.c','*.cpp','partitions.csv'):
                for extra in OUT.glob(pattern): shutil.copy2(extra,sketch/extra.name)
            if (OUT/'src').is_dir(): shutil.copytree(OUT/'src',sketch/'src')
            build=td/'build'; build.mkdir()
            print(f'\n=== BUILD {b["id"]} • {b["name"]} • {cfg["fqbn"]} ===',flush=True)
            run(command+['compile','--fqbn',cfg['fqbn'],'--warnings','all','--build-path',str(build),'--build-property','upload.maximum_size=1966080','--build-property','compiler.cpp.extra_flags=-fstack-usage','--output-dir',str(build),str(sketch)], f'{b["id"]} ({cfg["fqbn"]}) compile')
            verified=verify_build(build,b,version);verified['rcMonitorStack']=verify_monitor_stack(build);report['boards'].append(verified)
            srcbin=find_app_bin(build); dst=OUT/filename; shutil.copy2(srcbin,dst); digest=sha(dst)
            build_id=f'{version}-{b["id"]}-{digest[:12]}'
            pkg.update({'available':True,'sha256':digest,'size':dst.stat().st_size,'builtAt':built_at,'buildId':build_id}); b['latest']['builtAt']=built_at
            factory_pkg=b['latest'].get('factory',{}); merged=find_factory_bin(build)
            if merged and factory_pkg.get('file'):
                fdst=OUT/factory_pkg['file']; shutil.copy2(merged,fdst); fdigest=sha(fdst)
                factory_pkg.update({'available':True,'sha256':fdigest,'size':fdst.stat().st_size,'builtAt':built_at,'buildId':f'{version}-{b["id"]}-FACTORY-{fdigest[:12]}'})
                print(f'{b["name"]}: {fdst.name} {fdst.stat().st_size} bytes SHA256 {fdigest}')
            else:
                if factory_pkg.get('file'):
                    stale=OUT/factory_pkg['file']
                    if stale.exists(): stale.unlink()
                factory_pkg.update({'available':False,'sha256':'','size':0,'builtAt':built_at,'buildId':''})
            print(f'{b["name"]}: {dst.name} {dst.stat().st_size} bytes SHA256 {digest} buildId {build_id}')
    write_metadata(catalog,version,built_at)
    (OUT/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f'Updated firmware metadata for {version}; Arduino-ESP32 core {CORE_VERSION}')


if __name__=='__main__': main()

