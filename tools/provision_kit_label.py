#!/usr/bin/env python3
"""Manufacturing-only: install a unique label through protected physical USB.

Requires pyserial. The secret/passphrase is never printed. Store the resulting
label privately, print it for the kit recipient, and do not commit it to Git.
"""
import argparse, getpass, os, re, secrets, time
from pathlib import Path

def main():
    import serial
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--port',required=True)
    ap.add_argument('--output',required=True,help='Private label text path (must not exist)')
    ap.add_argument('--enroll-admin',action='store_true',help='Manufacturing blank kit only')
    args=ap.parse_args()
    target=Path(args.output)
    if target.exists(): raise SystemExit('Output already exists; refusing to replace a private label.')
    password=getpass.getpass('Teacher admin passphrase: ')
    if not 12<=len(password)<=64 or any(c in password for c in ',\r\n'): raise SystemExit('Invalid teacher passphrase.')
    with serial.Serial(args.port,115200,timeout=.3) as port:
        def command(text,prefix):
            port.reset_input_buffer();port.write((text+'\n').encode());end=time.monotonic()+5
            while time.monotonic()<end:
                line=port.readline().decode(errors='replace').strip()
                if line.startswith(prefix): return line
                if ',ERR,' in line: raise RuntimeError('Controller refused manufacturing operation; check admin authorization and idle state.')
            raise RuntimeError('No matching firmware acknowledgment.')
        info=command('ZJKIT,GET','ZJKIT,ID,');device=info.removeprefix('ZJKIT,ID,')
        if not re.fullmatch(r'ZFC-A[12]-[A-F0-9]{12}',device): raise RuntimeError('Invalid Device ID.')
        action='ENROLL' if args.enroll_admin else 'UNLOCK'
        command('ZJADMIN,'+action+','+password,'ZJADMIN,ACK,')
        secret=secrets.token_hex(32)
        # Reserve a private file before mutating the controller. A failed write
        # leaves an explicitly unverified file for recovery, never a lost secret.
        fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as output: output.write(device+':'+secret+'\n')
        command('ZJNET,LABEL,'+secret,'ZJNET,ACK,LABEL_UPDATED')
        command('ZJADMIN,LOCK','ZJADMIN,ACK,LOCKED')
        print('Label installed and admin locked for '+device+'. Private label saved to the requested path.')

if __name__=='__main__': main()
