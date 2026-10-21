# Step 2 — Authenticated Angle/Acro diagnostic-mode persistence

**Implementation branch:** `feature/step2-flightcore-mode-pending-safe-20261021`. Base: `main@c090b2a3bfcbe0ce403dac0b8e0dfca958ff1a0b`.

## Scope and safety

The shipping FlightCore diagnostic firmware has **no physical Angle/Acro stabilization loop and no motor PWM/DShot output**. Here, `activeFlightMode` is the active **diagnostic metadata setting**, not an actual aircraft stabilization or physical motor flight mode. A diagnostic Input ARM request is different from motor arming. The existing RC ownership, sequence, signed session, device identity, 500 ms firmware input deadman, native 300 ms input guard, and single-associated AP/STA remain unchanged.

## Firmware state

- `requestedFlightMode` is the desired value durably saved in `zj-network` Preferences under the existing `flightMode` key. Only write when it **changes**.
- `activeFlightMode` is the selected diagnostic metadata currently effective. Legacy `flightMode` remains a mirror of **active**, not requested, to preserve existing readers.
- `pendingFlightMode` is `angle|acro|null`. If a mode is requested while `zjRcInputArmed` is true, the saved desired mode is queued; active remains unchanged until the next accepted diagnostic disarm/release or input expiration.
- `flightModeRevision` increments on accepted metadata-state transitions within a boot; `bootId` distinguishes a restarted Kit. Revision resets on reboot. On boot NVS desired is loaded as active and pending is cleared (nothing is physically armed at boot).
- `flightModeImplementation: "diagnostic-metadata"` prevents confusing this with real stabilization.

The firmware never silently re-arms, reclaims ownership, restarts UDP, or changes the motors due to a mode write.

## Authenticated network contract

- Signed `POST /api/flight/mode` (payload `flightMode=angle|acro`) verifies the existing authenticated session and Device ID. STA observer sessions cannot write. With an existing RC claim, only that claim's authenticated client session or an authorized teacher/admin session may write.
- Accepted response includes `kitId,bootId,flightMode,activeFlightMode,requestedFlightMode,pendingFlightMode,flightModePending,flightModeRevision,flightModeImplementation,saved:true,motorsArmed:false`.
- Unauthorized request: HTTP 401/403. Other owner's claim: HTTP 423. Invalid mode: HTTP 400. Network/OTA busy: HTTP 409. NVS write failure: HTTP 500. Existing signed response authentication and replay counters apply.
- `GET /api/status` and `GET /api/rc/snapshot` expose active/requested/pending state and revision. Poll authenticated status to observe mode writes from the other client; there is no cross-device WebSocket push.
- `mode` is reserved for Wi-Fi `auto|ap|sta` and **never** means flight mode.

## USB compatibility

- `ZJFLIGHT,GET` returns `ZJFLIGHT,STATE,<kitId>,<active>,<requested>,<pending|NONE>,<revision>`.
- `ZJFLIGHT,SET,<angle|acro>` is available **only after existing physical USB teacher admin unlock**; preserves any current owner and schedules pending if diagnostic input is armed. It replies with `STATE` or `ZJFLIGHT,ERR,<reason>`.
- WebApp verifies the selected USB physical Kit ID before trusting the response and never stores teacher admin passphrase in the browser.
- Old firmware without `ZJFLIGHT` commands remains read-only/unknown; it cannot be assumed to persist mode.

## Android and WebApp

- Android reads signed status and mode response on the actual AP/STA Kit; the selector is not disabled solely by input ARM. During **native UDP** RC streaming, the app uses the separate authenticated management request to save a pending mode. No RC input stream is stopped.
- **Legacy signed HTTP joystick streaming remains a limitation:** to preserve its single-worker ACK priority and firmware 500 ms deadman, mode writing during active HTTP RC is rejected, with a specific message. Users may still see and choose the selector but a requested change is **not** shown as saved unless the Kit acknowledges it. No unsafe false acknowledgement.
- WebApp's Live Inputs selector uses the selected and verified physical Kit, authenticated network or teacher-unlocked physical USB. It shows REQUESTED / ACTIVE / PENDING and actual Kit state. Android/WebApp clients refresh signed Kit state and reject stale revision or mismatched boot/device ID.
- The PID simulator continues to have a separate virtual Run/Stop and Angle/Acro plant; this change does not wire physical Kit mode selection to motor outputs.

## Verification matrix

Check defaults/invalid NVS, reboot restore, repeated no-op requests (no NVS wear), request while accepted Input ARM (pending), accepted disarm and release (apply), two authenticated clients in sequential/concurrent writes, same-owner vs other-owner/admin claims, revoked STA observer, stale signed response, mismatched Device ID, USB teacher unlock, network/OTA busy, mode changed externally and status refresh, native UDP smoothness at 50 Hz, and A1/A2 board compilation.

**Not certified by source tests alone:** running firmware on a real ESP32-C3/C6, physical NVS persistence across power cycling, Android Wi-Fi radio behavior or flight/motor safety. Test with props removed and ESC/motor power disconnected. Do not publish firmware or APK until CI and hardware acceptance are separately recorded.
