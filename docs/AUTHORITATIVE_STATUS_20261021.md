# FlightCore / Android / WebApp / PID status audit and contract

Audited upstream main: `c090b2a3bfcbe0ce403dac0b8e0dfca958ff1a0b` (21 October 2026).

## Audit before implementation

| Area | Existing behavior | Required change |
| --- | --- | --- |
| Flight mode | `FlightCoreNetwork.h` saves `flightMode` in `zj-network`; rejects changes whenever RC is claimed/armed; rewrites unchanged values | Desired/saved, active and pending metadata; no unchanged writes; safe disarmed activation |
| Android | `companion-network.js` requires released RC; `companion-flight.js` disables while saving/mirroring | Selector usable while armed; authenticated ACK plus read-back; serialize rapid requests; accurate pending state |
| RC | Authenticated HTTP / encrypted ZJUDP1, ownership and sequences; previews accepted with ARM=0 | Carry CH5/CH6 through existing HTTP, UDP and USB; preserve validators and deadlines |
| LED | Authorized command path, leased effects; UI echoes requested state after generic ACK | Return applied mode/state and verify read-back |
| USB | Physical firmware/Kit handshake, combined ZJTEL and RAW ZJRC decoding | Add backward-compatible status record and auxiliary fields; authorized mode commands |
| Live Inputs | Shared authenticated single-flight reads and verified monitor selection already exist | Full auxiliary/status fields, explicit unavailable states, accessible select contrast, Kit mode control |
| PID | Paired Android mirror and verified AP/STA Android RC; no USB option | Fresh USB input, stopped-mode mirroring independent of selected joystick source, pending mode during Run |

## Shared protocol

- `mode` remains Wi-Fi AP/STA/auto. It never means Angle/Acro.
- Legacy `flightMode` means **active selected mode metadata**. `flightModeState` contains `saved`, `active`, `pending` (mode or null), `supported:true`, `stabilizationSupported:false`.
- `POST /api/flight/mode` accepts `flightMode=angle|acro` through the existing signed Device-ID-bound session. An authenticated observer remains read-only. Save only on change; ACK only after NVS success/read-back. If input is armed, preserve active and queue pending. Apply pending after disarm/failsafe/release. Never claim physical stabilization.
- USB mode GET and SET use a Kit ID and request token; SET requires the existing unlocked teacher admin session. Status is a separate versioned `ZJSTATE,1,<JSON>` record, leaving legacy 20-field ZJTEL unchanged. Never interpret a public six-digit Kit code as authorization.
- RC `inputArmed` means the accepted receiver ARM request. `motorsArmed` and `motorsDisabled` describe actual motor capability. This firmware advertises `motorsArmed:false`, `motorsDisabled:true`; virtual `running` is unrelated.
- CH5/CH6 are unsigned pulse values 1000–2000 µs. Defaults remain 1000 on legacy frames. No implicit LED mapping. Preserve PPM receiver's existing channel mapping. LED commands stay explicit and authorized.
- Monitored source identity retains both observation transport (USB/AP/STA/Android Relay) and original accepted RC transport/source. Relaying does not make data physically USB-originated.
- Freshness is based on original input age plus elapsed observation time and advancing sequence; repeated snapshots never refresh an old input. Clear status on Kit/session/transport changes and reject late responses.
- Monitor Auto priority: fresh verified USB, verified direct AP/STA, permitted verified Android relay. Simulator Auto priority: fresh verified USB, fresh paired Android mirror, fresh verified AP/STA Android RC, then WebApp. Lock producer identity throughout virtual Run; source loss stops only the virtual simulation and requires explicit Run.

## File-level implementation stages

1. Audit/contract: this document.
2. Firmware: `FlightCoreClassroom.h`, `FlightCoreNetwork.h`, `FlightCoreUdp.h`, `I2C_ADDRESS_SCANNER.ino`; host tests for persistence, pending, ownership, sequences and auxiliary values.
3. Android: `companion-network.js`, `companion-flight.js`, `companion.html`, package version; retain private pairing and native UDP sender.
4. WebApp: `js/classroom-kits.js`, `js/serial-rc-decoder.js`, `js/kit-data-interface.js`, `js/live-inputs.js`, `index.html`, `lab.html`, `live-inputs.css`.
5. Simulator: `js/simulator-input.js`, `js/tripod-page.js`, `tripod.html`, `tripod.css`; source/freshness/mode tests and responsive browser checks.
6. Integration/release: run source/host/browser and native/release checks; build both correct board targets and signed APK only through required gates. Do not mark skipped checks passed.

## Verification boundaries

No A1/A2 board or Android device is attached to this session. Physical hardware acceptance, restart/OTA persistence on a real board, POCO X2 and native touch acceptance are NOT TESTED until actual evidence exists. Current source was verified against upstream Git blob hashes; upstream firmware/APK binary downloads are unavailable locally. Older cached binaries are not valid evidence for this source.
