# AP to STA handover correction

WebApp: 1.7.2+205. Compatible firmware: FlightCore 1.4.5 A1/A2.

## What was reproduced

- After an AP connection, Connect STA could reuse the AP gateway when no router endpoint was reachable. The action completed through AP rather than reporting that STA was unavailable.
- Network connection verification checked hardware identity but accepted an authenticated AP reply for a requested STA connection.
- The onboarding handover searched the last router IP and the older board/code hostname. It missed the current advertised Kit Name when DHCP changed the address.
- A verified Wi-Fi save updated the router address without immediately adopting the complete router status, including the SSID.

The regression cases failed on the preceding source and passed after the correction.

## Current behavior

Connect STA requires a reachable router endpoint and an authenticated STA reply from the selected physical Device ID. It cannot fall back through 192.168.4.1. When STA is unavailable, the existing AP setup connection remains available and the message explains how to join the router.

Handover checks saved addresses, the advertised hostname and Kit Name, with a 30-second retry window. Disconnect or a newer selection cancels delayed discovery replies. Reconnection restores monitoring and requires a separate explicit control grant.

The firmware page distinguishes the browser's actual link from the kit's radio mode and router status. `STA + AP` means the kit is connected to its router while its hotspot remains available. An AP browser link is possible at the same time.

## Connect after Test & Save

1. Keep the AP link while the router test runs. Wait for `Wi-Fi VERIFIED and saved` and a router STA address.
2. In the computer's Wi-Fi settings, leave the kit hotspot and join the same router.
3. In Firmware & Connect, click Connect STA. Allow browser Local Network Access if prompted.
4. Confirm Browser Link shows STA and the same Device ID is selected.

AUTO deliberately retains the AP hotspot. To request STA-only operation, release control, open My Kits Wi-Fi settings, choose STA and use Apply AP / STA / AUTO. The firmware disables AP after a successful router connection; it can restore AP on failure.

If router STA is offline, hotspot visibility alone does not diagnose the reason. Inspect the selected firmware version, router SSID/address, test outcome and STA disconnect reason. A saved profile is not proof of a current association.

## Validation

- Runtime regressions cover AP-only reachability, rejection of wrong-interface authenticated replies, changed DHCP addresses, complete router-status adoption and cancellation after Disconnect.
- Chromium tests cover AP monitoring, unavailable STA, joining the mocked router, verified STA monitoring and Disconnect on both desktop entries at 360, 768 and 1366 pixels.
- Project/offline checks and firmware binary/source integrity remain required.

These tests use device doubles. The physical kit's router association, browser network permission and actual AP/STA handover still require its live status. This WebApp fix does not change the firmware binaries.
