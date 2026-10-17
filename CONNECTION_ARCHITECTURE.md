# DroneLab connections and received inputs

## Current release paths

FlightCore 1.4.11 receives Android or Web controller inputs for bench diagnostics. Physical motor outputs remain disabled. Android 1.7.13 supports direct Kit ARM/DISARM, STOP, joysticks and LED control. Input ARM, simulator ARM and physical motor state are separate concepts.

| Connection selected in WebApp | Receiver read path | Requirements |
| --- | --- | --- |
| USB | Combined `ZJTEL` or legacy `ZJRC` serial frames | Open serial port and verify the physical Kit identity |
| AP | Read-only `/api/rc/snapshot` | Computer on Kit AP; browser local-network permission |
| STA | Read-only `/api/rc/snapshot` | Reachable same network; verified Kit session |
| Android Relay | The same endpoint through the paired phone | WebRTC pairing, verified phone-to-Kit Wi-Fi, Android **Allow WebApp access** grant |

Android direct AP input can be inspected by a computer on that AP or via USB. Android and the computer can also use the same STA network. Opening Live Inputs or reading Python joystick data never claims controller ownership or sends joystick packets back to the Kit.

## Wi-Fi policy and recovery

AP and STA are exclusive. Automatic/STA mode turns AP off and tries saved routers; if all saved routers fail, AP returns. Selecting AP disables STA and keeps the hotspot active until STA is selected again. A phone cannot remain connected to the Kit AP after the Kit successfully switches to STA. Join the matching network on each device.

Connect Kit on AP, scan nearby 2.4 GHz networks, then Test & Save. Credentials are retained only after successful association and storage verification. Mode changes and setup can interrupt the network. The browser cannot change the operating system's Wi-Fi network.

One physical USB pairing can be remembered in the browser's protected vault. Subsequent sessions still verify Device ID. A saved pairing does not authorize automatic control ownership. Reconnection restores monitoring only; ARM/control requires a new operator action. USB recovery remains available independently of Wi-Fi.

## Live Inputs and Python

Open **Devices & Firmware → Live Inputs**. The section shows two read-only stick indicators, four channel bars (1000–2000 µs), source and transport, input ARM, physical motor confirmation, LED state when reported, sequence, input age, observed frame rate and snapshot round trip. The recent-samples CSV contains only receiver observations, never credentials. PPM decoding is not implemented in this firmware.

The shared decoder accepts the original 12-field gyro telemetry alongside separate `ZJRC` packets, and the 20-field combined telemetry introduced in 1.4.11. Combined frames now update Kit cards, the PID receiver summary and Python USB reads as well as the Serial Monitor.

The monitor makes coalesced snapshot reads at up to 10 Hz while Live Inputs or PID is visible; it pauses during setup and OTA. Python shares pending reads rather than adding simultaneous snapshot requests. Hidden pages do not run the monitor's fast polling. The normal identity heartbeat retains its separate slower cadence. Actual update rate depends on network latency; the displayed observed frame count is not a measurement of every packet received by firmware.

Firmware's 350 ms input deadline remains authoritative. The browser adds snapshot round-trip time and locally elapsed time, expires duplicate sequences, and neutralizes stale displays/Python results to throttle 1000 and axes 1500. USB input age starts when a new RC sequence is observed; serial buffering latency is not measurable from the current frame format. A disconnect, different Device ID, transport, connection generation or firmware boot clears cached inputs. LED observations expire separately; missing telemetry is shown as **Not reported**.

In Python Lab select the exact connected target: **USB Hardware**, **FlightCore AP**, **FlightCore STA**, or **Android Relay**:

```python
from zebjus_simple import Drone
import asyncio

drone = Drone()
while True:
    rc = await drone.read_joystick()
    print(rc['source'], rc['throttle'], rc['roll'], rc['pitch'], rc['yaw'],
          rc['input_valid'], rc['age_ms'])
    await asyncio.sleep(0.1)
```

No Take Control switch is needed for this read. Relay read permission remains explicit on Android. A grant refusal is surfaced; the reader does not silently switch transports. Relay access does not enable network OTA.

## Trust and firmware updates

The six-digit Kit Code identifies a Kit; it is not an admin password. Current firmware allows scoped local AP diagnostics and STA observation. Protected STA control/settings and APP OTA require the appropriate USB-paired authorization. Teacher administration remains separately protected. Legacy private-label enrollment is a compatibility path, not a requirement for current AP diagnostics.

Signed sessions bind requests to Device ID, boot identity and monotonic request counters. Protected requests retain their cryptographic proofs; encrypted POST bodies, firmware board matching and SHA-256 verification are unchanged by the receiver monitor. APP-only OTA preserves saved Wi-Fi/pairing; factory recovery is a separate USB operation. Secure Boot/Flash Encryption and production signing policy remain manufacturing decisions.

RC has one owner. The firmware input deadline and ownership lease release/neutralize timed-out input. Read-only reconnect never restores an RC lease or ARM state. Network setup and OTA remain blocked while a controller owns input.

## Embedding and internet boundaries

The GitHub Pages WebApp can be embedded; the surrounding site/browser must allow required capabilities. CORS, iframe permission delegation, browser local-network permission and network reachability are separate checks. Embedding the official URL retains its origin; rehosting files at another origin requires reviewing the firmware origin allowlist. The current Wix warning cleanup is retained.

Automated iframe checks use a controlled host with simulated Kit responses. Actual Wix/WordPress USB chooser, camera, local-network permission prompts and Android dual-network routing still need physical acceptance. Do not infer cross-browser support from one Chromium test.

QR/WebRTC pairing and Android Relay remain local/reachable-peer features. The actual control connection does not yet configure STUN/TURN for reliable different-network Internet use. A six-digit pairing code alone does not provide an Internet control gateway. PPM decoding and authenticated Internet telemetry/control are separate future releases.
