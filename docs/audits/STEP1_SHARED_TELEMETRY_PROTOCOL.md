# Step 1 — Shared telemetry and protocol contract (proposed v2)

**Status**: design only; **NOT IMPLEMENTED**. Baseline `main@c090b2a3bfcbe0ce403dac0b8e0dfca958ff1a0b`. Preserve the existing v1 wire contracts and negotiated `ZJUDP1` protocol. This specification normalizes what clients display; it **does not** authorize real flight motors or change any failsafe.

## A. Three independent state machines

1. **Physical Kit/network**: immutable `kitId`, board, firmware/build, `bootId`, intended Wi-Fi policy `auto|ap|sta`, verified actual connected `AP|STA|USB`; Android relay is a *logical monitor hop*, not a simultaneous radio mode. AP/STA associations remain mutually exclusive.
2. **Authenticated diagnostic RC**: unclaimed / claimed / input-idle / accepted-disarmed / accepted-input-armed / stale / released. Distinguish `claim.ownerId` (opaque public marker), requested and **applied** frame sequence, requested and accepted input-arm bit, receiver source, transport and watchdog reason. Never publish bearer RC claim token or auth secret in telemetry.
3. **Virtual training**: independent `simulator.running`, `simulator.mode`, virtual throttle/sticks/PID, virtual motor RPM. Read-only mirror receives sampled Kit or Android frames; it never implies Kit motor arming.

Current firmware sets `motorsDisabled:true` and `motorsArmed:false`; clients must label it **MOTOR OUTPUTS OFF**, not `FLIGHT ARMED`. An eventual physical flight controller requires independent physical motor state and a guarded flight-mode implementation.

## B. Existing facts to preserve

| Interface | Existing fields / behavior |
|---|---|
| Signed GET `/api/status` | `kitId`, `board`, `bootId`, Wi-Fi `mode`, `requestTransport`, `flightMode`, `rc`, `ppm`, `ledOn`, `motorsDisabled`, `motorsArmed`, `udp` |
| Signed POST `/api/flight/mode` | `flightMode=angle|acro`; saves NVS; returns `kitId,flightMode,saved,motorsArmed:false`; currently disallows an RC claim and STA observer writes |
| Signed GET `/api/rc/snapshot` | Firmware-accepted `source/transport/seq/receivedAtMs/ageMs`, `throttle/roll/pitch/yaw`, `inputArmed/active/claimed/inputValid/failsafe`, accepted/rejected counts, release reason, flight mode, optional 8-channel PPM snapshot |
| Signed POST `/api/rc/preview` | Owner+session+IP, monotonic seq, `inputArmed` and `armed=false`, four 1000..2000 microsecond pulses; never physical motor ARM |
| UDP port 4210 `ZJUDP1` | `ZJU1` frame 58 bytes: 16-byte authenticated header, 12-byte unique nonce, 14 encrypted bytes, 16-byte GCM tag; encrypted body has **six** big-endian pulse values (T,R,P,Y,AUX1,AUX2), 1 input-arm bit, 1 reserved byte; authenticated feedback v2 `ZJA2` 72 bytes reports RX and APPLIED separately with NACK reasons |
| Physical USB `ZJRC`, `ZJTEL`, `ZJPPM` | Legacy RAW RC and combined 20-field telemetry report four accepted RC channels; PPM diagnostic can report eight separately; USB doesn't have an authenticated HTTP session |
| WebRTC simulator | Authenticated and owned simulator channel with 1000..2000 throttle, normalized axes `[-1,+1]`, Angle/Acro and virtual `armed` (meaning simulator Run); no physical Kit actuation |

Input freshness is not the Wi-Fi signal strength. Preserve receiver 500 ms deadman and UDP receive/**apply** deadlines, native 300 ms stale local-input limit, monotonic seq, identity pinning, owner lease, emergency STOP, and separate RX/APPLIED/NACK diagnostics. Never use a received ACK as a substitute for accepted input or a motor-actuation acknowledgement.

## C. Canonical read-only client snapshot (proposed additive normalization)

Example only; new names below must be capability-negotiated and optional for old firmware:

```json
{
  "schema": "zebjus.kit.telemetry.v2",
  "kit": {
    "kitId": "ZFC-A2-EXAMPLE",
    "board": "ZFC-A2",
    "bootId": "boot-opaque",
    "firmwareVersion": "1.5.9",
    "verified": true
  },
  "link": {
    "monitorPath": "android-relay",
    "physicalTransport": "AP",
    "wifiConfiguredMode": "auto",
    "connected": true,
    "sampleReceivedAtClientMs": 0
  },
  "flightMode": {
    "value": "angle",
    "source": "firmware",
    "revision": null,
    "persisted": true,
    "modeImplementation": "diagnostic-metadata"
  },
  "rc": {
    "ownerSource": "ANDROID",
    "ownerId": "opaque-public-marker",
    "claimed": true,
    "frameSource": "ANDROID",
    "frameTransport": "AP",
    "requestedInputArm": null,
    "acceptedInputArm": false,
    "acceptedSeq": 123,
    "appliedSeq": null,
    "receiveAgeMs": 20,
    "applyAgeMs": null,
    "accepted": 100,
    "rejected": 0,
    "stale": false,
    "releaseReason": null,
    "channelsUs": {
      "throttle": 1000, "roll": 1500, "pitch": 1500, "yaw": 1500,
      "aux1": null, "aux2": null
    },
    "ppmChannelsUs": null
  },
  "led": {
    "known": true, "on": false, "source": "signed-kit-status"
  },
  "motors": {
    "outputsDisabled": true,
    "physicallyArmed": false,
    "stateKnown": true
  },
  "simulator": {
    "running": false,
    "mode": "angle",
    "usesReadOnlyKitMirror": true
  }
}
```

All string IDs shown above are placeholders, never real Device ID data. Null means **not independently reported**; never replace null with zero/false for unknown motor arm, applied seq, AUX values, LED or input status. The example `simulator` object is **client-only** and must not be merged into signed firmware telemetry. UI may derive a combined view, retaining per-field provenance.

### Naming, source and ordering

- `flightMode.value` is Kit authoritative for the selected physical Kit. `simulator.mode` is independent; mismatch is a valid state. `flightMode.modeImplementation="diagnostic-metadata"` avoids implying firmware flight stabilization.
- `link.physicalTransport` = `AP|STA|USB|PPM|UNKNOWN`; `link.monitorPath` = `usb|ap|sta|android-relay|none`. The *RC source* remains `ANDROID|WEB|PPM|NONE`, not `USB`. `PPM` is a receiver input source, not Wi-Fi or browser transport.
- UDP channel ordering already is `T,R,P,Y,AUX1,AUX2`. For PPM, keep `CH1..CH8` in receiver order; use existing calibrated channel map for roll/pitch/throttle/yaw/ARM switch. `CH5` is not assumed to mean LED.
- Valid channel pulse range = **integer 1000–2000 µs** for normalized six-channel RC; legacy PPM receiver capture/thresholds stay as implemented. `aux1/aux2=null` indicates an older transport cannot confirm them; never mark Android constant-sent 1000 as user-adjusted AUX.
- Sequence numbers scoped to the same kit/boot/owner/source, checked for monotonic advance; new boot or source invalidates prior freshness. A repeated HTTP poll must not refresh `acceptedSeq` age.
- Input `requestedInputArm` is a local intent, not signed receiver-accepted state; use `acceptedInputArm` only when firmware accepted it. `motors.physicallyArmed` must come from an independent motor controller, never infer from either input bit.
- LED status comes from signed Kit state or verified current USB sample; UI should say UNKNOWN when status does not report the LED, rather than deriving from AUX channels.

## D. Command policy and mode update acknowledgements (proposed)

**Read-only**: unauthenticated discovery may expose non-secret identity, but full Kit state uses existing signed session over network, or a physically verified USB serial stream. Relay reads require established WebRTC pairing, explicit user grant and validated full Device ID.

**Mode update**: use existing `POST /api/flight/mode`, with current-kit identity and the authenticated owner capability. A source claiming RC while **diagnostic input disarmed** can update saved classroom metadata only if it owns the existing claim; other controllers and STA observer sessions cannot. Concurrent OTA, network handover and other owners remain blocked. For an actual physically armed flight controller, this design does *not* automatically authorize changing physical stabilization: that requires a separate physically tested transition policy. Restore mode from NVS and broadcast/refresh signed readback; no optimistic UI lock-in on a failed write.

Proposed additive response fields: `flightModeRevision` (monotonic within a boot), `saved`, `applied`, `kitId`, `bootId`, `modeImplementation`. Existing response fields remain unchanged. Race/conflict errors should be typed (`401 SESSION_REQUIRED`, `403 OBSERVER_ONLY`, `409 OTHER_OWNER|OTA_BUSY|TRANSITION_UNSAFE`, `500 NVS_WRITE_FAILED`), without revealing secrets. Client must re-read signed status and compare the expected Kit ID, boot ID, revision and mode.

**USB mode selection** requires a new constrained diagnostic serial command and explicit ACK/readback after matching physically verified `ZJKIT,ID`/board. Do not reinterpret `ZJNET,MODE` (Wi-Fi) as a flight-mode setting. Serial commands cannot authorize remote admin privileges.

**Disarmed input preview**: allow only a currently owned, authorized diagnostic claim to publish signed RC frames with `acceptedInputArm=false`; no auto-claim while another source owns the Kit. A fresh mode command must not silently start motor outputs. When control is unclaimed, local Android/WebApp stick movements can be shown **LOCAL PREVIEW ONLY**, never as `KIT RX`.

**AUX & LED**: Version/capability-negotiate optional AUX1/AUX2 in signed HTTP/serial/UDP accepted snapshots; preserve old four-channel requests/decoders. LED remains the existing allowlisted `ZJLED` command plus explicit `ledOn` readback. Do not derive a motor or LED action from a new channel without a separately reviewed mapping policy.

**STOP/failsafe**: existing authenticated STOP, source lease expiration, input-age and UDP apply-age limits always win over stale frames, stale network status or pending mode writes; a timeout always requires a new low-throttle owner claim before diagnostic input ARM.

## E. Transport compatibility matrix

| Transport | Read Kit accepted RC | Persist Kit flight mode now | AUX1/AUX2 accepted telemetry now | Future target |
|---|---|---|---|---|
| USB Serial | Yes, verified RAW/combined stream | No serial mode command | No (PPM CH1..8 separate) | Versioned mode ACK, accepted AUX, LED/mode readback |
| AP HTTP | Yes, signed snapshot | Yes, only while *unclaimed* | No | Owner-aware disarmed mode write, 6-channel extension |
| STA HTTP | Yes, signed snapshot | Yes for permitted controller/admin; observers denied | No | Same policy, explicit observer reason |
| Native Android UDP 4210 over AP/STA | Yes via signed status/feedback; send 6 channels | Mode uses signed management route, not UDP | Wire has AUX1/AUX2 but fixed at 1000 in Android and not preserved by accepted RC snapshot | Input controls + accepted seq and six-channel snapshot |
| Android WebRTC relay | Yes if paired, granted and Kit verified | Route available with diagnostic grant, but blocked during active Android RC | No normalized readback | Same central write capability and read-only provenance |
| Standalone WebRTC simulator | Virtual telemetry only | No physical Kit writes | No physical Kit AUX | Preserve independent virtual mode/run |
| PPM physical receiver | Eight channels via PPM status/USB diagnostic | No PPM flight-mode command | CH5..8 receiver data, not generalized six-axis network AUX | Read-only monitor with source/PPM mapping and signal-loss validity |

## F. UI and test contract

**Flight mode selector**: always render known Kit mode even when input-armed or simulator running. Display `SAVING`, `SAVED`, `REJECTED`, `NOT VERIFIED` independently from enabled/disabled control state. Authorized disarmed owner may change diagnostic metadata; do not create a false "flight armed" state.

**Live Inputs & PID**: show accepted T/R/P/Y, AUX1/AUX2 or unavailable; CH1–CH8 for PPM as a separate grouping; source, path, sequence, last packet age, rate, `INPUT ARM`, `MOTOR OUTPUTS`, `LED`, `flightMode`; per-path LIVE/STALE/UNKNOWN. The PID simulator's WebApp keyboard/joystick is local, Android WebRTC mirror is remote, Kit accepted RC is read-only, USB and relay require independent verified binding. The virtual Run/Stop state stays separate.

**Unit/host/browser acceptance**:
- Mode save/read/reboot restore; unauthorized, observer, other-owner, disarmed-owner and motor-transition blocks; readback mismatch.
- Six-channel UDP AES-GCM sequence/replay, RX vs APPLIED, v1 backward compatibility, ownership and stale-frame tests; six-channel signed HTTP and USB schema negotiation.
- USB RAW/combined/PPM signal-loss decoders; mismatched Kit ID/boot rejects; no fake LED/motors state.
- AP/STA exclusive association with scan transient; relay grant revoked and Android RC-owned conflict.
- WebApp Live Inputs source switch (auto/usb/ap/sta/relay), PID mirror USB and AP/STA, unsupported firmware, stale inputs, mode mismatch while virtual Run.
- Run standard source, firmware, native Android/emulator, browser CI then **separate physical A1/A2 acceptance** before any release.

## G. No-go items

No removal of receiver deadman, signed pairing, owner lease, sequence protection or safety guards. No false claim that virtual propellers represent physical motors. No release claims based solely on CI. No unapproved real-motor GPIO/PWM/DShot change. No simultaneous associated AP + STA interfaces, uncontrolled WebRTC physical drone relay, or privileged route via unverified Device ID.
