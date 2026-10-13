# DroneLab AP setup & LAN discovery (1.4.4 candidate)

## First-time commissioning (USB-free)
1. Install the matching verified FlightCore 1.4.4 APP/FACTORY image using existing authorized flashing procedures. This feature cannot be added to older running firmware by only updating the website. Hardware checks are still required.
2. Power the Kit (motors and propellers disconnected) and open the official HTTPS DroneLab WebApp. In the laptop OS join the kit AP, then My Kits > Connect Kit on AP. Grant Chrome Local Network Access.
3. No BOOT button and no USB pairing are required. Joining the Kit AP and pressing Connect Kit opens a device-ID-verified, signed AP-local session with Wi-Fi scan/test/mode access.
4. My Kits > Scan Wi-Fi, select the classroom 2.4 GHz router, enter its password and Test & Save. Only verified router association, DHCP and persistent readback save the new profile. Prior settings survive failed tests.
5. Laptop reconnects to the same classroom router. My Kits > Scan Kits on Wi-Fi > click a matching Kit Name. Full Device ID is rechecked. This STA connection is **read-only monitoring** until separate operator authorization; it does not enable ARM, RC, OTA or teacher admin.

## Discovering newly joined kits
The HTTPS website cannot browse all multicast mDNS services on a LAN. It tries verified known IPs and deterministic mDNS hostnames by default.

To enumerate previously unseen kits, run this optional **local** bridge on the laptop while connected to the router:

```bash
npm run discover:lan
```

The bridge listens for the firmware's `_zebjus._tcp.local` mDNS advertisements and offers candidate IPs via `http://127.0.0.1:8766/kits`. It listens on loopback HTTP only, exposes no credentials, has no control or firmware update endpoint, and accepts browser requests from approved DroneLab development/published origins. Every result is re-probed by the WebApp; mDNS names and advertisements are discovery **not authorization**. Chrome Local Network Access permissions and the system firewall can still block the bridge or kit HTTP requests. Router client isolation / guest mode must be disabled. Known IP and manual STA host remain fallback.

## Permission boundaries
* AP local session: status, motor-disabled diagnostics and Wi-Fi scan/test/mode for clients joined to the Kit AP.
* No BOOT/button setup lease. AP Wi-Fi configuration follows the signed AP-local session and does not work for STA observer sessions. Anyone with Kit AP access can change its saved router Wi-Fi; use a unique AP password on shared networks.
* STA local session: read-only status, telemetry and RC snapshots; IP-bound session, replay counters and boot-bound signing; no setup, RC command, OTA or teacher access.
* Privileged USB/admin/OTA paths remain separate, with factory USB flash for recovery.

Software builds and browser integration are checked automatically; real 2.4 GHz router/A1/A2 hardware acceptance is still required before claiming hardware readiness.

## Verified build artifacts

The review workflow compiles both FlightCore 1.4.4 profiles and synchronizes the matching APP/FACTORY binary images plus SHA256 metadata to this development branch. These are software build checks, **not physical A1/A2 validation**. Production flight readiness is not claimed.

## Unique Kit Names and mDNS

FlightCore 1.4.4 keeps the deterministic `zebjus-a1-<code>.local` / `zebjus-a2-<code>.local` address until a custom Kit Name is saved through AP Setup. Custom names such as `zebjus_drone_7` are advertised as DNS-safe `zebjus-drone-7.local`. Rename or reset causes the STA mDNS service to restart without rebooting the controller; the firmware's immutable Kit ID does not change. Avoid duplicate names across the classroom. The website validates the full Device ID again before using any candidate IP, and a hosted browser still cannot multicast-enumerate every LAN device without the optional local discovery helper.

## Firmware & Connect reference dashboard

The Firmware tab follows the earlier zebjus-drone-simulator-lab's discovery-first layout. Enter the classroom Wi-Fi, open Firmware & Connect, select the live Kit Name or enter a known name, then click **Connect Selected Kit**. The browser tries cached verified addresses, `zebjus_drone_N.local` / `zebjus-drone-N.local` candidates, modern A1/A2 deterministic names, and the optional localhost mDNS bridge. Candidate IPs are **not** trusted without a second Device ID check and a signed status response.

The Connected Kit Details panel shows heartbeat freshness and current gyroscope/RC reports. Barometer and LIDAR are labelled **NOT REPORTED** by the current scanner firmware and never fabricated. Demo mode is a display-only offline preview and does not change flight controls. Kit Name save/reset requires a signed local AP setup session on FlightCore 1.4.4; STA observers cannot rename or flash firmware without separate privileged authorization. Existing USB/STA firmware update and Serial Monitor tools remain available below the connection dashboard.
