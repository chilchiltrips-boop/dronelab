# FlightCore 1.4.0 API contract

Scope: communication, sensor and diagnostic firmware only; A1 and A2 retain existing pin profiles and USB bootloader recovery. No motor PWM, DShot, real arming or flight PID implementation.

## Identity and enrollment v2

Public GET `/api/health` returns product/board. GET `/api/identify` returns `kitId`, six-digit `kitCode`, name, board, `authVersion:2`, `labelInstalled`. Neither public endpoint is authorization.

Manufacturing label syntax: `ZFC-A1-<12 uppercase hex MAC digits>:<64 lowercase hex secret>` (A2 analog). The label is generated with a cryptographic RNG. HMAC keys below are ASCII hex strings, except the AES key is decoded hex. All concatenated protocol strings are UTF-8.

* Diagnostic credential = first 32 hex characters of HMAC-SHA256(labelSecret, `diagnostic|kitId`).
* POST `/api/auth/challenge`: URL-form `kind=setup|diagnostic`, `client=<32 random hex>`. Setup requires actual AP socket. Returns kitId, 32-hex nonce, 32-hex bootId, expiresMs=30000. Four challenge slots; 300 ms global rate limit; three failed proofs trigger 30-second cooldown. A label must already be installed.
* `M = enroll|kitId|bootId|nonce|kind|client`.
* POST `/api/auth/enroll`: deviceId, nonce, proof=HMAC(credential,M). Challenge is IP-bound, expiring and consumed before verification. Returns kitId, session, proof, expiresMs=1800000, setupExpiresMs=300000 or 0. Eight active sessions; re-enrolling the same random client ID replaces its previous session (no scope escalation).
* Session key = HMAC(credential, `session|M|session`). Server proof = HMAC(sessionKey, `server|M`). Verify this before trusting any status.
* Every authorized request uses X-ZJ-Device, X-ZJ-Session, X-ZJ-Seq (nonzero increasing uint32), X-ZJ-Proof. Signed text = `METHOD|route|kitId|bootId|session|counter|payload`. GET payload is empty. Requests on one session must be serialized.
* POST `payload` form field = hex(12-byte random IV + AES-256-GCM ciphertext + 16-byte tag). Plaintext is the URL-encoded original form. AES key = hex-decoded session key; empty additional data. Maximum payload 2048 hex characters. The outer HMAC authenticates method/route/identity/counter/payload.
* Response X-ZJ-Response = HMAC(sessionKey, `response|counter|HTTPstatus|exactBody`). Verify bytes before JSON parsing, including errors. An unsigned 401 requires fresh enrollment; never treat an unsigned response as device data.
* POST `/api/auth/close` authenticates, sends a signed response, then destroys the session. Boot destroys all sessions.

The existing X-ZJ-Key teacher/admin path remains for installed recovery/OTA tools. X-ZJ-Device pins identity when provided. Public Kit Code and AP password cannot substitute for it. Do not expose keys in logs, URLs or reports.

## Endpoints

| Route | Scope / restrictions | Result |
|---|---|---|
| GET `/api/status` | Diagnostic | Identity, firmware, bootId, selected mode, physical AP/STA, requestTransport, IP/SSID/channel/RSSI, networkState/phase, test state, setup/OTA permissions, RC, motorsDisabled |
| GET `/api/wifi/scan` | Unexpired setup or teacher; no RC ownership/test | `scanning` then `ready` networks; poll, do not assume immediate completion |
| POST `/api/wifi/test` | Setup or teacher; idle RC/scan/test | Encrypted ssid/password; 202 pending; poll status until saved/failed; 20-second association window, new GOT_IP + matching SSID + DHCP + stable interval before atomic NVS save |
| POST `/api/wifi/mode` | Setup or teacher; idle | `auto`, `ap`, `sta`; STA-only requires saved credentials; AUTO keeps AP after STA success |
| GET `/api/telemetry` | Diagnostic | Exact kitId, board, gyro rates, scanner results, firmware RC snapshot |
| POST `/api/command` | Diagnostic; allowlist and existing pin guards | ZJINFO GET, I2C scan, existing safe LED patterns and telemetry rates; no arbitrary serial/firmware execution |
| POST `/api/rc/claim` | Diagnostic; exact kitCode, source WEB/ANDROID, one owner | Private ownership session, public owner ID, full kitId; no real ARM |
| POST `/api/rc/preview` | Diagnostic plus RC owner token/source/IP; ≤50 Hz | seq, throttle/roll/pitch/yaw (strict integers 1000..2000), armed=false, responseMode Slow/Medium/Fast; ACK accepted seq, receivedAtMs, kitId |
| GET `/api/rc/snapshot` | Read-only diagnostic, no RC claim needed | Firmware receive state after watchdog processing |
| POST `/api/rc/release` | Matching owner session | Neutral/released state |
| POST `/api/rc/stop` | Any authorized diagnostic reader | Emergency neutral + release; real motors remain disabled |
| POST `/api/ota` | Teacher admin, actual STA socket, idle RC/scan/test | APP only; strict chip/image size checks; no FACTORY network upload; reboot after verified Update completion |

RC snapshot includes `kitId`, `source`, public `ownerId`, `seq`, `receivedAtMs`, `ageMs` (null before receipt), `throttle`, `roll`, `pitch`, `yaw`, `responseMode`, accepted/rejected counts, claimed/active, `inputValid`, `failsafe`, `motorsDisabled:true`. Private RC bearer tokens are never exposed by status/snapshot. Timestamp is firmware uptime; age is authoritative, not synchronized wall time. Stale snapshots are neutral. Deadman 350 ms; ownership lease 1800 ms; uint32 rollover is handled.

## Python API

Python runs locally in the existing browser Pyodide worker. Select the verified STA target:

```python
from zebjus_simple import Drone
import asyncio

drone = Drone()
while True:
    rc = await drone.read_joystick()
    print(rc["source"], rc["throttle"], rc["roll"], rc["pitch"], rc["yaw"],
          rc["seq"], rc["age_ms"], rc["input_valid"])
    await asyncio.sleep(0.1)
```

The adapter caps requests at 10 Hz, measures RTT, verifies the selected full ID again after the response, and adds RTT conservatively to input age. At >350 ms it returns neutral axes and invalid/failsafe flags. An unavailable link raises an error, never frontend preview values. Snake-case fields include device_id, owner_id, age_ms, input_valid, response_mode, received_at_ms, round_trip_ms, motors_disabled and transport. Reading never claims RC control and may coexist with Android ownership.

## Manufacturing and revocation

Protected USB admin only: `ZJNET,LABEL,<64 hex>` installs/rotates the label; `ZJNET,REVOKE_LABEL,CONFIRM` revokes it. No label value is echoed. Re-provision a fresh private label after revocation; factory reset removes provisioning. Boot logs omit AP passwords/access keys. Factory utility output must remain private, outside the repository.
