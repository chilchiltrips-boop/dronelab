# DroneLab AP setup & LAN discovery (1.4.2 candidate)

## First-time commissioning (USB-free)
1. Install the matching verified FlightCore 1.4.2 APP/FACTORY image using existing authorized flashing procedures. This feature cannot be added to 1.4.1 by only updating the website. Hardware checks are still required.
2. Power the Kit (motors and propellers disconnected) and open the official HTTPS DroneLab WebApp. In the laptop OS join the kit AP, then My Kits > Connect Kit on AP. Grant Chrome Local Network Access.
3. With the controller **already running normally**, press and hold the physical BOOT button (GPIO9 on A1 and A2) for 3 seconds, then release. **Do not hold BOOT during reset/power-on:** that invokes the ESP ROM downloader. Setup permission lasts 5 minutes.
4. My Kits > Refresh Status; verify Wi-Fi setup unlocked. Scan 2.4 GHz Wi-Fi, select the classroom router, enter its password and Test & Save. Only verified router association, DHCP and persistent readback save the new profile. Prior settings survive failed tests.
5. Laptop reconnects to the same classroom router. My Kits > Scan Kits on Wi-Fi > click a matching Kit Name. Full Device ID is rechecked. This STA connection is **read-only monitoring** until separate operator authorization; it does not enable ARM, RC, OTA or teacher admin.

## Discovering newly joined kits
The HTTPS website cannot browse all multicast mDNS services on a LAN. It tries verified known IPs and deterministic mDNS hostnames by default.

To enumerate previously unseen kits, run this optional **local** bridge on the laptop while connected to the router:

```bash
npm run discover:lan
```

The bridge listens for the firmware's `_zebjus._tcp.local` mDNS advertisements and offers candidate IPs via `http://127.0.0.1:8766/kits`. It listens on loopback HTTP only, exposes no credentials, has no control or firmware update endpoint, and accepts browser requests from approved DroneLab development/published origins. Every result is re-probed by the WebApp; mDNS names and advertisements are discovery **not authorization**. Chrome Local Network Access permissions and the system firewall can still block the bridge or kit HTTP requests. Router client isolation / guest mode must be disabled. Known IP and manual STA host remain fallback.

## Permission boundaries
* AP local diagnostic session alone: status and motor-disabled diagnostics, not router setup.
* AP local + physically held BOOT (3s, 5-minute lease): /api/wifi/scan, test, mode (with normal busy/RC guards). Setup lease is lost after expiration, reboot or switching away from AP.
* STA local session: read-only status, telemetry and RC snapshots; IP-bound session, replay counters and boot-bound signing; no setup, RC command, OTA or teacher access.
* Privileged USB/admin/OTA paths remain separate, with factory USB flash for recovery.

Both board builds, browser integration and real 2.4 GHz router/hardware acceptance must pass before claiming production readiness.

## Verified build artifacts

The review workflow compiles both FlightCore 1.4.2 profiles and synchronizes the matching APP/FACTORY binary images plus SHA256 metadata to this development branch. These are software build checks, **not physical A1/A2 validation**. Production flight readiness is not claimed.
