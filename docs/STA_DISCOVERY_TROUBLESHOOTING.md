# STA connected, but WebApp finds zero Kits

STA and AP are exclusive. When the Kit joins its saved router, its AP hotspot disappears. That is expected and does not mean the Kit is offline. Browser discovery and the Kit's physical Wi-Fi association are separate observations.

## What the reported errors meant

Before this fix, `connectDiscoveredKit()` displayed **Kit identity changed since discovery** both when another Device ID answered and when no response arrived at all. A DNS failure, timeout or browser local-network restriction therefore looked like an identity mismatch. The error alone could not prove the physical Kit had changed.

A discovered hostname could become unreachable before the Connect click. Revalidation used only that one address, without retrying the same Kit's remembered IP/hostname. Scan also ignored the manually entered STA IP. Editing the visible name/address could still connect an older dropdown selection instead of the typed value.

The fixes keep those cases separate. A selected Kit is rechecked through a bounded list of addresses associated with its immutable Device ID, preferring numeric IPs. Every candidate must return the selected Device ID and Kit Code before any authentication is sent. A DHCP-reassigned address that belongs to another Kit is not authorized. Discovery remains public identification; Take Control, pairing and OTA authorization are unchanged.

## Connect without working mDNS

1. Join the same router as the Kit on the computer. A wired desktop also works if its LAN can reach the Kit's Wi-Fi subnet and client isolation is disabled. Internet connectivity alone does not prove local reachability.
2. Obtain the Kit's current STA IP from Android's verified Kit status, the router's DHCP client list, or USB Serial at 115200 baud. The USB command `ZJNET,GET` reports `ZJNET,STA,CONNECTED,<IP>,<SSID>` without revealing credentials.
3. In **Devices & Firmware → Kit Connection**, enter that IP in **Kit name / STA IP**, then press **Connect Selected Kit**. The WebApp still verifies the actual Device ID and authenticated status.
4. If an IP works but a `.local` name does not, the remaining problem is hostname/mDNS resolution. The verified IP can be remembered after connection. A router DHCP reservation can keep that Kit's address stable.
5. If the IP also fails, check the browser's Local Network Access permission, the surrounding iframe policy, guest Wi-Fi/client isolation, VPN routing and whether the Kit still has that IP. The WebApp cannot tell DNS, CORS and network isolation apart when the browser exposes only `Failed to fetch`.

For a reachability check, opening `http://<actual-STA-IP>/api/identify` should return public identity JSON. Success in a separate browser tab does not by itself prove that an HTTPS embedded WebApp has local-network/CORS permission. Never enter credentials on that local HTTP page.

## New diagnostics

An empty scan reports counts of probed addresses, timeouts, network/DNS/permission failures, HTTP errors and invalid identity responses. It does not infer a physical disconnect or an identity change from missing responses. A browser cannot enumerate every arbitrary LAN address; a current IP, reachable known hostname or the optional `npm run discover:lan` mDNS bridge is still required.

These changes are WebApp-only. No firmware flash, factory reset, Wi-Fi erasure or Android reinstall is needed for the discovery fix. Actual router/browser reachability still needs verification on the user's network.

## Release validation

After publishing an APK, equal source/published version codes are valid only when version names and all packaged/native Android inputs still match the published source commit. The release preflight verifies that condition and the existing APK checksum before retaining the immutable signed APK. A changed Android input with the same code fails; a higher code still runs the full signing, native touchscreen, compatibility and exact-source publication gates. This prevents a WebApp/test-only fix from trying to republish an identical Android version.
