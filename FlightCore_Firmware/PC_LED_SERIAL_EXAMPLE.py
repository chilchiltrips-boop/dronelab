#!/usr/bin/env python3
"""PyCharm/desktop Python LED test for FlightCore A1 and A2.
Install: python -m pip install pyserial
Run: python PC_LED_SERIAL_EXAMPLE.py /dev/cu.usbmodemXXXX
or:  python PC_LED_SERIAL_EXAMPLE.py COM5
Use the application serial port, not a ROM/download-only session.
"""
import argparse
import time
import serial

def send(port, command):
    port.write((command + "\n").encode("ascii"))
    port.flush()
    print("TX", command)

def listen(port, duration=0.2):
    until=time.monotonic()+duration
    while time.monotonic()<until:
        line=port.readline().decode("utf-8",errors="replace").strip()
        if line and line.startswith(("ZJINFO,","ZJLED,","ZJI2C,","ZJGYRO,STATUS")):
            print("RX",line)

def main():
    p=argparse.ArgumentParser(description="Blink A1/A2 onboard LED through USB Serial at 115200 baud")
    p.add_argument("port",help="Serial device, e.g. COM5 or /dev/cu.usbmodemXXXX")
    args=p.parse_args()
    with serial.Serial() as ser:
        ser.port=args.port;ser.baudrate=115200;ser.timeout=0.1
        ser.dtr=False;ser.rts=False
        ser.open()
        time.sleep(1)
        send(ser,"ZJINFO,GET")
        listen(ser,1)
        print("If RX shows waiting for download, release BOOT and press RESET before retrying.")
        seq=1
        try:
            while True:
                send(ser,f"ZJLED,{seq},SET,100");seq+=1;listen(ser,0.2);time.sleep(0.8)
                send(ser,f"ZJLED,{seq},SET,0");seq+=1;listen(ser,0.2);time.sleep(0.8)
        except KeyboardInterrupt:
            pass
        finally:
            send(ser,f"ZJLED,{seq},STOP");listen(ser,0.3)

if __name__=="__main__":
    main()
