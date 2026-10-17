# ZEBJUS remote access — Phase 1 (remote telemetry and virtual simulator)

## What the current release supports
- **Phone internet / different LANs:** Browser WebRTC DataChannel now gathers
  STUN candidates. QR or 6-digit CONNECT code exchanges encrypted SDP offers.
  The 6-digit CONNECT mechanism uses the existing public PeerJS signaling
  service (not a ZEBJUS-operated uptime/security SLA).
- **Virtual simulator control:** Only the approved, exclusive Android controller
  session can send authenticated simulator frames to the virtual flight
  receiver. Physical motors are never enabled. Do not expose internet-based
  physical Kit RC control in Phase 1.
- **Remote Kit telemetry:** On the Web pairing settings, explicitly select
  "Start remote telemetry". Android must already have a **verified Kit
  AP/STA connection**, the WebRTC Safety PIN must have been approved, and
  Android Settings → "Grant paired WebApp read-only status/telemetry" must be ON.
  The PC reads GET /api/telemetry through the encrypted channel only; it
  cannot use the telemetry widget to ARM, flash, or change Wi-Fi.
- **Ownership and timeout:** Pairing QR expires in 180 seconds, session
  heartbeat every 2 seconds, heartbeat failure at 9.5 seconds, Wi-Fi recovery
  grace 8.5 seconds. Interruptions revoke simulator control. Remote monitoring
  never silently resumes after disconnection or backgrounding.
- **Freshness:** Monitoring requests no faster than once every 1.1 seconds;
  one in flight at a time. Remote Kit read failures show unavailable, stale
  readings stop showing as live after 2.8 seconds, RC input requires valid
  firmware accepted timestamp <=350ms.
- **Connection status:** A displayed "STUN ONLY" indicates that restrictive
  NAT/cellular/school networks may not connect. Successful connection across
  all networks is **NOT** guaranteed until TURN is deployed.

## TURN installation (infrastructure required; currently NOT deployed)
1. Deploy your own coturn with TLS, UDP relay enabled, strict origin access,
   rate limits, and restricted relay ports on a server with a public address.
   Never publish long-lived TURN passwords or static API tokens in a GitHub
   Pages file, Android assets, URLs, logs, or QR.
2. Deploy a separate HTTPS endpoint on a backend that authenticates the user
   and *issues short-lived per-session TURN credentials*. Use e.g. coturn's
   shared-secret REST authentication. Set TTL <=10 minutes (ideally 60–120s).
   Secure the credential endpoint with real login/authorization, CSRF protection
   where applicable, exact allowed CORS origins, rate limits and abuse controls.
   This repo does NOT contain an authenticated backend deployment.
3. Response format (no real credentials shown):
```json
{
  "expiresAt": 1800000000000,
  "iceServers": [{
    "urls": ["turns:turn.example.org:5349?transport=tcp", "turn:turn.example.org:3478?transport=udp"],
    "username": "short-lived-username",
    "credential": "short-lived-secret"
  }]
}
```
   **expiresAt** must be a current Unix timestamp in *milliseconds*, at least
   15 seconds from now and no more than 10 minutes ahead. Use TLS HTTPS and
   CORS with credentials when serving the JSON to Web and Android clients.
   The application will not persist credential values. UI never exposes them.
4. Edit public `remote-rtc-config.json` to set
   `"turnCredentialsUrl": "https://your-auth-server.example/api/rtc/credentials"`.
   Leave it `null` until the service is operational. The public file stores
   an endpoint **only**, not TURN secrets. When no endpoint is configured or
   credentials fail, the client transparently falls back to STUN-only and
   reports that limitation.
5. Web App (GitHub Pages/Wix/WordPress embed): check browser WebRTC permissions;
   Android application uses the same remote config URL on HTTPS DroneLab.
   Existing Wix iframe policies may block camera/USB/LAN access even when
   WebRTC itself works. Test direct top-level web app as a fallback.

## How to test after the Android APK includes Phase 1 assets
1. Power FlightCore from independent power; connect Android to its verified
   AP or STA as needed. Confirm the phone still has internet/data connectivity.
2. Open DroneLab on a separate network (PC school's wired LAN is fine as long
   as signaling and UDP/TCP/TLS TURN can traverse firewalls).
3. Pair by QR+CONNECT code and verify safety PIN on the Web App.
4. On Android explicitly grant read-only Kit telemetry, then in Web pairing
   settings press "Start remote telemetry." Verify Kit ID, Gyro, RC timestamp.
5. Enable exclusive Android control *only* to fly the **virtual simulator**,
   and verify simulator telemetry/ACK, not any physical motor response.
6. Test airline-mode/switch Wi-Fi, background app, shut receiver down,
   replay old QR, deny permission, and swap physical Kit. Remote panel must
   show stale/unavailable/disconnected and require explicit resumption.
7. Test two different mobile carrier NATs and a restrictive school network.
   STUN-only sessions may fail. Deploy TURN before describing the feature as
   reliable different-network access.

## Not included
- No production STUN/TURN infrastructure deployed by this source update.
- No production private, authenticated signaling server configured; the
  existing public PeerJS code broker is a temporary dependency.
- No internet-accessible physical Kit joystick, OTA, or Wi-Fi admin tunnel
  added by the Phase 1 monitor.
- No end-to-end carrier/mobile-data hardware verification has been performed.
