# Embedding DroneLab on Wix or any other website (AP/STA discovery)

The DroneLab WebApp is served over HTTPS. A Kit is a local LAN/AP device addressed via \`http://192.168.4.1\`, a saved private STA IP or a \`.local\` hostname. Wi-Fi discovery probes \`/api/identify\`; a candidate is **never** authorized or connected until its Device ID, Kit Code and board are verified.

## Why a Wix iframe can show 0 Kits when the direct WebApp works

Chrome Local Network Access (LNA) is an explicit user/browser permission, with \`Permissions-Policy\` inheritance. A **cross-origin iframe** may be denied by the embedding parent's policy even if the child code is allowed to run, so normal CORS headers on the ESP32 do not fix it. Wix HTML elements may add a sandbox/opaque origin, and Wix Editor/Preview can restrict some browser APIs differently from the live published page. **An iframe cannot grant itself permission or change its embedding site's headers.**

## Generic website iframe (where you control the HTML and policy)

Embed the actual published, HTTPS DroneLab **index.html** URL, not a copied page source or an iframe of the Wi-Fi device.

\`\`\`html
<iframe
  src="https://YOUR-DRONELAB-HOST/your-path/index.html"
  title="ZEBJUS DroneLab"
  allow="local-network; loopback-network; local-network-access"
  style="width:100%;min-height:860px;border:0">
</iframe>
\`\`\`

If the host also enforces an HTTP \`Permissions-Policy\` header, that **parent** must delegate the exact child origin too, for example:

\`\`\`http
Permissions-Policy: local-network=(self "https://YOUR-DRONELAB-HOST"), loopback-network=(self "https://YOUR-DRONELAB-HOST")
\`\`\`

Some browser versions also accept \`local-network-access\` as an alias. Preserve other sandbox/permissions policy settings needed by the host. If the host denies LNA, the iframe cannot override it.

## Wix or a host that does not let you set iframe permissions

Use Wix **Embed a Site** with the HTTPS DroneLab URL. If a previously embedded copy still shows the retired discovery warning even though the direct GitHub Pages URL is clean, set the Wix embed address to `https://chilchiltrips-boop.github.io/dronelab/index.html?v=embed-clean-20261017` and **Publish** the Wix page (not just Preview). Refresh the published page; if needed, remove and re-add the Embed a Site element rather than pasting an outdated WebApp HTML snapshot. Clearing old site data for the GitHub Pages origin may also help where an older Service Worker still controls the frame. In Wix **published Site mode**, the iframe may work if permissions are delegated; the editor and preview are not reliable tests of hardware/network reachability. DroneLab does not display a persistent embedded-site warning banner or direct-launch button. If the iframe cannot request LAN access, manually open the published DroneLab HTTPS address in a separate top-level browser tab on the **same computer**. This fallback is described here rather than inserted into the Kit connection UI.

On the **same laptop/desktop running that browser**, connect the Kit AP (typically \`192.168.4.1\`) or the same STA router as the Kit. Allow the top-level site permission for **Local network** (and if using the optional loopback mDNS helper, **Loopback network**). Run **Rescan This Wi-Fi**, choose the actual Device ID, then connect using the normal permission/security flow. A phone joined to Kit AP does **not** put the laptop on that AP.

## Boundaries

- The direct-tab path addresses browser iframe restrictions, not missing Wi-Fi connectivity, client isolation/VLAN separation, or unsupported mDNS enumeration. New STA kits can use the existing optional localhost discovery helper on the **same computer**.
- A user must approve local network access; never disable browser security, issue private requests through arbitrary public-site proxies, forward pairing keys to the parent website or silently reconnect a different Kit.
- No guarantee of direct in-iframe scanning on every website. A top-level tab, and where necessary USB, are the safe supported fallbacks.
- If your site only accepts a Wix HTML Code snippet with a separate sandbox, **do not** paste the entire WebApp source there. Embed the published DroneLab HTTPS URL instead.
