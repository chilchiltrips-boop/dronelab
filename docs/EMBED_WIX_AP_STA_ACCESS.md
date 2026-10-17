# Embedding DroneLab on Wix and other websites: AP/STA Kit discovery

## What works

The **Assembly**, **Wiring**, **Python Lab**, PID Simulator and general DroneLab content can be embedded with the official **HTTPS** URL:

- \`https://chilchiltrips-boop.github.io/dronelab/index.html\`

AP/STA Kit discovery is a **browser-to-private-network** operation and has extra controls. A cross-origin iframe may be blocked by **Local Network Access (LNA)** Permissions Policy, Wix iframe sandboxing, Web Serial restrictions, HTTP-on-HTTPS mixed-content handling, or school router client isolation. A website cannot override its parent iframe sandbox from within the child app.

The FlightCore firmware intentionally permits protected CORS only for its audited official GitHub Pages origin plus local development origins. **Do not set \`Access-Control-Allow-Origin: *\` for privileged Kit APIs.** Copying DroneLab files to a random host does not authorize that host to control physical hardware.

## Guaranteed safe cross-site workflow

1. Embed the official URL. When the page runs inside Wix or another iframe it shows **Open Kit Connection in New Tab** beside the connection controls.
2. Click this link (a real user gesture; no credential transfer). It opens the official DroneLab website as a **top-level first-party tab** with normal browser permission prompts.
3. From the **same computer running the browser**, join the Kit's AP Wi-Fi (typically \`192.168.4.1\`) or the Kit's reachable STA router. A phone connected to Kit AP does **not** give the laptop LAN connectivity.
4. Grant Chrome's Local Network Access permission on the official tab, then **Devices & Firmware → Scan Kits**. Verify the exact Device ID before using any RC or firmware feature.
5. Browser storage inside a Wix iframe may be partitioned; the first-party tab may need separate Kit pairing/approval. Nothing secret is passed to the parent page.

If the top-level official tab still cannot fetch \`http://192.168.4.1/api/identify\`, check the Kit AP network, Wi-Fi isolation, the browser's device/Local Network Access permissions and whether the browser allows the local HTTP device. For STA, the laptop must be on the same reachable router/subnet, or use the verified optional laptop discovery helper/USB.

## When an external website controls its iframe HTML

For **non-Wix websites** with access to the full parent document, a site administrator can delegate supported Chrome local network permissions:

\`\`\`html
<iframe
  src="https://chilchiltrips-boop.github.io/dronelab/index.html"
  title="ZEBJUS DroneLab"
  allow="local-network-access; local-network; loopback-network; serial; camera; fullscreen"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
  style="width:100%;height:850px;border:0">
</iframe>
\`\`\`

For cross-origin delegation, the parent server may additionally need a compatible header that explicitly includes the DroneLab origin (browser/version dependent):

\`\`\`http
Permissions-Policy: local-network=(self "https://chilchiltrips-boop.github.io"), loopback-network=(self "https://chilchiltrips-boop.github.io")
\`\`\`

The browser user must still grant Local Network Access; parent \`sandbox\`, origin policies, and network reachability must all permit it. This may still **fail in Wix**, where the HTML component runs inside an outer sandbox that developers do not fully control. The official-new-tab link remains the fallback.

## Security rules

- **No** \`postMessage\` transmission of pairing keys, credentials, RC frames, signed sessions or OTA payloads between unknown parent websites and DroneLab.
- No automatic \`window.top.location\` redirect, forced popup, disabling of LNA checks, open CORS, insecure cloud proxy or drive-by LAN enumeration.
- An explicitly denied iframe policy stops repeated discovery scans and explains the reason; unknown or correctly delegated policies may attempt discovery.
- Direct local access never bypasses Kit identity verification, signed sessions, control authorization or APP OTA verification.

## QA matrix

Official top-level ✅ expected browser LNA prompts; Wix sandbox iframe ➜ guidance + official new tab; delegated standard iframe ➜ may scan if browser/router permits; copied third-party host ➜ official new tab required until explicitly reviewed and trusted by firmware; cross-subnet STA/phone-only AP ➜ not reachable without a real network route or authorized relay.
