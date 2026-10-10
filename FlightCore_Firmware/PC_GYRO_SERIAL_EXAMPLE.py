#!/usr/bin/env python3
"""ZEBJUS FlightCore A1/A2 gyro via USB Serial in desktop Python/PyCharm.

Install: python -m pip install pyserial
Run: python PC_GYRO_SERIAL_EXAMPLE.py COM5
     python PC_GYRO_SERIAL_EXAMPLE.py /dev/cu.usbmodemXXXX

Board      Sensor         I2C address       Pins
ZFC-A1     LSM6DS3        0x6B              SDA GPIO4, SCL GPIO5
ZFC-A2     MPU6050        0x68              SDA GPIO22, SCL GPIO23

Other I2C devices remain on the same bus and can be discovered by the
firmware's I2C scanner. Only the board's assigned gyro is decoded here.
"""
import argparse
import time
import serial

GYROS = {"A1": ("LSM6DS3", "0x6B"), "A2": ("MPU6050", "0x68")}


def decode_gyro(line):
    fields = line.strip().split(",")
    if len(fields) != 12 or fields[:2] != ["ZJTEL", "1"]:
        return None
    board = fields[2]
    if board not in GYROS or fields[5].upper() != GYROS[board][1]:
        return None
    try:
        sequence = int(fields[3])
        uptime_ms = int(fields[4])
        drops = int(fields[11])
        RateRoll, RatePitch, RateYaw = map(float, fields[7:10])
        if sequence < 0 or uptime_ms < 0 or drops < 0:
            return None
    except ValueError:
        return None
    if fields[6] != "READY":
        return {"board": board, "status": fields[6], "address": fields[5].upper()}
    return {
        "board": board, "sensor": GYROS[board][0], "address": fields[5].upper(),
        "status": "READY", "RateRoll": RateRoll, "RatePitch": RatePitch,
        "RateYaw": RateYaw, "sequence": sequence, "uptime_ms": uptime_ms,
        "deviceDrops": drops,
    }


def main():
    parser = argparse.ArgumentParser(description="Read gyro rates from ZEBJUS A1/A2 USB firmware")
    parser.add_argument("port", help="COM5 or /dev/cu.usbmodemXXXX")
    parser.add_argument("--rate", type=int, choices=[10, 20, 50], default=20)
    args = parser.parse_args()

    with serial.Serial(args.port, 115200, timeout=1) as port:
        port.write(b"ZJINFO,GET\n")
        port.write(f"ZJTEL,RATE,{args.rate}\n".encode("ascii"))
        last_print = 0
        identified = None
        print("Reading A1/A2 gyro: RateRoll, RatePitch, RateYaw (deg/s). Ctrl+C to stop.")
        try:
            while True:
                line = port.readline().decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                sample = decode_gyro(line)
                if sample is None:
                    continue
                if sample["status"] != "READY":
                    print(f"Sensor {sample['address']} on {sample['board']}: {sample['status']}")
                    continue
                if sample["board"] != identified:
                    identified = sample["board"]
                    print(f"Board: {identified}; Sensor: {sample['sensor']}; I2C address: {sample['address']}")
                now = time.monotonic()
                if now - last_print < 0.1:  # Display ~10 Hz; firmware can transmit 10/20/50 Hz
                    continue
                last_print = now
                RateRoll = sample["RateRoll"]
                RatePitch = sample["RatePitch"]
                RateYaw = sample["RateYaw"]
                print(f"RateRoll={RateRoll:+8.2f}  RatePitch={RatePitch:+8.2f}  "
                      f"RateYaw={RateYaw:+8.2f} deg/s")
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
