# FlightCore 1.4.11 — One-line USB serial diagnostics

## COMBINED (default)

The running A1/A2 firmware sends a single `ZJTEL,1` record per telemetry tick, containing the original **12 fields** followed by eight labelled RC diagnostic fields. Separate high-rate `ZJRC` input-frame logs are suppressed. Claim/release/failsafe events remain separate so safety events and USB command acknowledgments are still visible.

```text
ZJTEL,1,A2,3250,1841677,0x68,READY,-5.65,4.29,-0.29,1,2,RC=AP/ANDROID,RCSEQ=32,T=1000,R=1500,P=1500,Y=1500,INPUT_ARMED=1,MOTORS=OFF
```

- The first 12 fields retain the previous sensor schema for sequence, uptime, I2C address, gyro, LED *availability*, and dropped samples.
- The suffix reports the last accepted, fresh joystick input. Inactive or stale input is shown as `RC=NONE/IDLE,RCSEQ=0,T=1000,R=1500,P=1500,Y=1500,INPUT_ARMED=0,MOTORS=OFF`.
- `INPUT_ARMED=1` is **diagnostic input** only; it never means propellers or ESC motor outputs are enabled. **Bench tests must be performed without propellers.**

## Explicit legacy mode

Send these commands using the USB Serial Monitor at **115200 baud**:

```text
ZJTEL,FORMAT,RAW
ZJTEL,FORMAT,COMBINED
ZJTEL,RATE,10
ZJTEL,RATE,20
ZJTEL,RATE,50
```

`RAW` emits legacy `ZJTEL,1` (12 fields) and separate 10Hz `ZJRC` frames. `COMBINED` restores one telemetry record with both sensor and RC fields. The selected format resets to COMBINED after reboot.

## WebApp

In **Firmware & Connect → USB Serial Tools → Serial Monitor**, the default Readable view combines IMU, current RC channels, and motor safety state into a concise line, capped at 5 updates/second; select **Raw packets** to inspect the unchanged firmware frames. The Serial Plotter and Python gyro bridge parse both legacy and combined formats. Serial commands, USB pairing, network authorization, and ACK/FAILSAFE handling are unchanged.

## Updating a physical kit

Install the **matching A1 or A2 FlightCore 1.4.11 APP** image using an authorized APP-only USB or OTA upgrade, without full-flash erase. First-time installation/recovery may require a matching FACTORY image. Existing kits continue outputting their old serial format until the **actual 1.4.11 firmware is flashed**. Always verify the running firmware version over USB afterward.
