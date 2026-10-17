# Local WebRTC Simulator Pairing and Read-Only Telemetry

**Project scope:** Same-network or otherwise directly reachable simulator pairing using WebRTC host/STUN candidates. This is **not** a reliable cross-network WebRTC product. **TURN relay and internet-based physical Drone Kit control are intentionally excluded**.

## Retained
- Local Wi-Fi AP/STA and USB Kit management: signed/verified Kit diagnostics, Live Inputs, input-only diagnostic ARM, PPM and APP OTA with ownership, timestamps and failsafe protection.
- QR + Safety PIN pairing between Android and WebApp for the **virtual simulator**. Direct QR may exchange offers manually on a reachable peer network. Temporary CONNECT codes use existing public signaling and therefore depend on internet access; they do not confer physical Kit authority.
- Existing explicitly granted **read-only** Kit telemetry in the pairing panel. It never enables remote Kit RC, firmware flashing or Wi-Fi settings. If a network cannot establish WebRTC, show an unavailable/disconnected state and stop stale telemetry.

## Excluded
- Restricted-network reliable WebRTC: **no coturn installation, TURN credential service, TURN backend budget or TURN release gate**.
- Internet-based physical Kit joystick/ARM/STOP, OTA tunnel, Wi-Fi configuration or any relay of privileged Kit requests. Physical Kit control stays local.
- Claims of guaranteed carrier/school NAT traversal or WAN coverage.

The published `remote-rtc-config.json` has `turnCredentialsUrl: null`, and `remote-rtc.js` never reads TURN endpoints. The WebApp/Android pairing scripts retain a compatible STUN-only `getIceServers()` API so local virtual simulator tests continue working.

## Local acceptance
1. Same-Wi-Fi Web + Android: QR exchange, Safety PIN confirmation and user-granted **simulator** session.
2. Disconnect one peer, refresh, background Android and expire heartbeat; check virtual control and telemetry stop, and no auto re-arm.
3. Verify physical Kit remains inaccessible from WebRTC simulator control. Signed local AP/STA Kit control remains a separate user-approved path.
4. Firewall blocks should show clear no-link/unavailable status, **not** a suggestion to deploy TURN.

**The optional Central Admin HTTPS backend is unrelated to WebRTC transport.** See `docs/REMOTE_DEPLOYMENT_RUNBOOK.md`.
