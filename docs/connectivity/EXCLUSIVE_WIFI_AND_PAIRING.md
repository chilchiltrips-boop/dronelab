# Exclusive AP / STA and remembered pairing

WebApp 1.8.0+206 and FlightCore 1.4.6 implement the requested single-interface behavior. This replaces the simultaneous AUTO AP+STA behavior described in the earlier connectivity reviews.

| Choice / condition | Kit behavior |
| --- | --- |
| Manual AP | Disconnect router STA; serve only the kit hotspot. Keep this choice across reboot until STA is selected. |
| STA or legacy Automatic | Remove the kit hotspot before trying saved router profiles. `WiFi.begin` scans for each saved SSID, starting with the preferred profile. |
| All saved routers fail | Restore AP only after the bounded attempts (20 seconds per profile, maximum five profiles). Retry later while the fallback AP is idle. |
| Fallback AP has a user | Keep AP available. Explicitly selecting STA starts a new router attempt. |
| Router Test & Save | Acknowledge the encrypted request, then turn AP off before testing STA. Save credentials only after a fresh IP association remains stable for 1.2 seconds. Failed association restores AP without saving the attempted password. |

The ESP32 scan API briefly enables an unassociated station interface to list routers while AP setup is open. This does not connect STA to a router; the AP is disabled before any STA association. The firmware returns to AP-only after the scan.

## Browser connection

1. Install the matching A1 or A2 1.4.6 APP image using authorized OTA or USB. Existing matching dual-slot layouts support APP updates; FACTORY recovery remains a separate USB operation.
2. Use **Read Running Firmware** over physical USB once. **Remember this kit after one USB pairing** is enabled by default. The existing encrypted IndexedDB vault stores the private pairing; public discovery records contain no key. Disable remembering or use **Forget Saved Access** to remove the persistent copy.
3. Join the kit AP or its saved router using the computer's Wi-Fi settings. A browser cannot change the operating system Wi-Fi network.
4. Background discovery offers **Connect this kit? → Connect / Later** for the remembered physical identity. Discovery does not authorize requests. Connect rechecks the full Device ID and opens the permitted authenticated session. Later leaves the kit offline and suppresses repeated offers for that identity/interface in the current tab. Manual Connect remains available.
5. The header AP/STA switch now changes the kit's actual saved Wi-Fi mode. After its signed acknowledgement, the old browser link is cleared. Discovery repeats while the computer joins the new network, and asks before connecting. Online is shown only after authenticated status confirms the requested transport. Take Control remains a separate action.

AP setup still uses its scoped local session. STA without a valid pairing stays observer-only. A remembered valid USB pairing can authorize protected settings, diagnostic control and idle APP OTA on either interface. Factory erasure, key rotation, forgotten access or cleared browser data legitimately require pairing again.

## Enrollment error recovery

The reported logs showed public discovery succeeding, followed by `enrollment_proof_invalid_or_expired`, then `enrollment_rate_limited`. That does not identify a router-association failure. Exact rejection on the physical kit cannot be established from these logs alone.

Regression tests reproduced two client defects: rejected saved credentials were retained and reused, and concurrent status/telemetry renewal could open competing enrollment sessions. The client now serializes requests/session creation per physical kit, removes a rejected saved pairing, and retains AP setup or verified STA observer monitoring. Rejected proofs are not automatically replayed. Rate limiting alone retains the pairing, pauses enrollment for 31 seconds, and leaves scoped monitoring available. Explicit authorization waits for an existing observer poll before verifying admin scope.

If an existing browser reports the error after upgrading, wait out the cooldown, read the physical kit once over USB to replace its stale pairing, rejoin its Wi-Fi, approve Connect, then authorize control and updates. Firmware still enforces nonce consumption, proof verification, identity, scope, counters and rate limits.

## Validation

- Node regressions cover rejected-key recovery, cooldown, concurrent renewal, physical USB pairing refresh, encrypted APP OTA, mode commands and reconnect consent.
- A C++ host test executes the actual `FlightCoreWifiPolicy.h` with simulated Wi-Fi/time: AP before acknowledgement, AP off before association, saved-profile failover, fallback, persistent manual AP, router-test handover and clock wrap.
- Chromium integration executes the real UI, pairing vault and HMAC/AES client with a simulated kit: stale proof recovery, saved pairing across tabs, encrypted AP/STA commands, Connect/Later consent and online/offline status.
- Both board profiles must compile and pass binary magic, chip ID, partition, source provenance, APP/FACTORY equivalence and SHA-256 checks before merge.

ESP32 radio association, physical USB flashing and real-device handover remain hardware acceptance checks; the automated device simulations do not claim those results.
