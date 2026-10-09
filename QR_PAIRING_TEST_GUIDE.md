# ZEBJUS DroneLab V1.4.0 — Two-Way QR + No-Camera 6-Digit Code

Open the hosted **[Web App](https://chilchiltrips-boop.github.io/dronelab/)** on the college PC. Install the **[Android Companion](https://github.com/chilchiltrips-boop/dronelab/raw/refs/heads/main/mobile-apk/ZEBJUS_DroneLab_QR_CODE_V1_4_0_TEST.apk)**. **No software/ZIP/Python install on the college PC.**

Both PC (Wi-Fi or Ethernet) and Android phone (Wi-Fi) should be able to reach each other on the same local network. The code mode additionally requires Internet on **both** devices.

## Method A — PC has a webcam (Two-Way QR; no signaling server)

1. Web App **Settings → Pair Mobile → Camera • Two-Way QR**.
2. Tap **Pair Mobile**. Web App shows the offer QR and starts the laptop camera when permitted.
3. Android **Scan Web QR**. The response QR automatically appears on the phone.
4. Point laptop webcam at phone QR; response is scanned automatically.
5. Verify the Web App **Safety Verification PIN** matches Android's confirmation PIN, and click **Confirm Pairing**.
6. Android **Take Control** → Web App header **Grant Mobile Control ON** → LED ON/OFF. Responses are ACK-confirmed.

## Method B — College PC without a camera (6-digit CONNECT code)

1. Web App **Settings → No Camera • 6-Digit Code → Pair Mobile**. Laptop camera will not be requested.
2. Android **Scan Web QR**. Android generates BOTH a response QR and a temporary six-digit **CONNECT code**, for example `482731`. Wait until the code field shows real digits rather than dashes.
3. Type the Android **CONNECT code** into the **PC No Camera code input** → **Connect with Code**. You never need a PC webcam, secondary QR scan, laptop app, Python server, or long answer text.
4. This optional flow uses the public **PeerJS Cloud signaling service** to privately authenticate the QR session and transfer the phone's WebRTC answer to the browser. The service is third-party, **requires Internet**, may be blocked by college firewalls, and is **not an owned production service**. If unavailable use Method A or Advanced manual QR transfer.
5. Once Connected, compare the **Safety Verification PIN** shown in the Web App and Android App (different from the CONNECT code) → **Confirm Pairing**.
6. Android **Take Control** → Web App header **Grant Mobile Control ON** → LED ON/OFF.

## Technical and security limits

- A six-digit number **alone** cannot carry the WebRTC SDP. The code names an expiring remote peer at a signaling broker; an authenticated challenge derived from the QR offer and typed code is required before the phone sends its answer. The code expires with the QR (three minutes).
- No flight motors or real drone actuators are exposed by this demo.
- The online broker sees connection metadata such as peer IDs/IPs; do not describe code mode as cloud-free.
- The real LED-control data travels over encrypted direct WebRTC peer-to-peer DataChannel after host authentication/confirmation; the online broker is only for the optional *pairing answer*.
- Even with working Internet, the PC and phone must allow WebRTC peer connectivity; campus VLAN isolation, firewall restrictions and VPNs can prevent it. In that case a production TURN relay or network adjustment would be needed.
- If the Web page refreshes, Android App restarts, or the phone changes networks, existing pairing/control rights are lost. Repeat QR scan + response/coded answer, approval, and grant mobile control.
- Android camera autofocus/zoom steps are opportunistic where supported.
- The APK is a debug/test build. Field test must validate actual Android WebView, college network, PeerJS Cloud reachability, and real mobile camera permissions before large-scale use. For production deployment, use an owned PeerServer with monitoring/rate limits rather than a free shared public signaling broker.

## Backups

`backup/stable-v1.3.0-before-code-pairing` is the pre-code-pairing safe point. Older `backup/stable-v1.2.0-before-two-way` also remains available.
