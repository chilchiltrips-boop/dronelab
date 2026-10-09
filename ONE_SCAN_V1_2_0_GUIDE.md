# ZEBJUS DroneLab v1.2.0 — One-Scan LAN QR Pairing

## IMPORTANT: the local bridge is required

The live [GitHub Pages](https://chilchiltrips-boop.github.io/dronelab/) remains available for Assembly, Wiring, Python, LED simulation, and firmware. **One-scan Android ↔ WebRTC pairing on GitHub Pages by itself cannot work without a same-origin LAN signaling bridge**: an HTTPS static web page cannot directly accept the Android phone's WebRTC answer.

Use the laptop local bridge (free, no cloud, no Firebase, no extra package installation):

1. **Download ZIP** of DroneLab main from GitHub and extract it; or clone the repo.
2. Both laptop and Android phone must join the **same normal Wi-Fi** (not an isolated guest network).
3. On Mac, double click `START_ONE_SCAN_Mac.command`; if Mac blocks it, run `zsh START_ONE_SCAN_Mac.command` in Terminal. On Windows use `START_ONE_SCAN_Windows.bat`. Manually:
   ```sh
   python3 tools/local_pair_server.py --lan-ip 192.168.1.50
   ```
   Replace `192.168.1.50` with the laptop's actual LAN IPv4 if automatic detection is wrong. Ensure firewall allows **TCP port 8765** from the Android phone.
4. Open desktop Chrome/Edge to **http://localhost:8765/#settings** (this exact localhost browser address is required).
5. Click **Pair Mobile**; Web App shows one short-lived QR containing WebRTC offer and laptop LAN reply address.
6. Install **ZEBJUS DroneLab ONE SCAN V1.2.0 test APK**; press **Scan Web QR**. Only Android needs camera permission. The app automatically zooms/focuses if supported, reads the QR and sends the WebRTC answer over Wi-Fi without a second QR scan.
7. Verify matching six-digit PINs, then click **Confirm Pairing** on the Web App.
8. Android taps **Take Control**; Web App flips the top **Grant Mobile Control** switch ON. LED commands carry ACKs; turning the switch OFF revokes phone controls immediately.
9. If phone Wi-Fi changes or you reload a page, old pairing and control privileges are invalidated. Return to the laptop Wi-Fi, click **Pair Mobile** again, and scan the **NEW QR**. A previous QR is not reusable.

### Important limitations

- No relay, STUN, TURN or cloud backend is used. Laptop and phone need direct LAN connectivity; router AP isolation, OS firewalls, VPN interference can block this.
- The local Python script must stay running during pairing setup. It only relays a short-lived, authenticated WebRTC response; LED commands pass through encrypted WebRTC.
- The Android WebView uses a carefully constrained native HTTP bridge because HTTPS appassets pages cannot send HTTP answers to laptop LAN directly. QR answers are allowed only to private IPv4 targets, TCP port 8765.
- No guaranteed automatic P2P reconnection across a *different Wi-Fi*; **fresh QR and explicit control permission** required after a network switch.
- Browser / headless Chromium tests verify the shared JavaScript protocol and Python service, but physical Android camera permission/zoom and a real phone-to-laptop firewall setup still require field testing.
- The APK is debug-signed; installation over a prior debug APK signed by another key may require uninstalling the old app.
- Safe backup refs: `backup/stable-v1.1.1-before-one-scan` and `backup/stable-2026-10-09-before-qr`.
