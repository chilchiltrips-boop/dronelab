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

## Connection freshness and browser permission acceptance matrix (October 2026)

The authenticated **MY KITS** heartbeat remains approximately 2.2 seconds. When
**Kit Connection → Live Inputs** is in the foreground, its separate read-only
`/api/rc/snapshot` reader is limited to one request at a time, aiming for
5–7 requests per second on a responsive kit. It does not claim RC ownership,
send joystick control packets or change the physical motor state. Slow HTTP or
WebRTC replies reduce the achieved rate instead of producing a backlog.

A fresh HTTP reply is **not** proof that the joystick frame inside it is new:
the panel checks firmware `ageMs`, elapsed time since the sample, and how long
its accepted frame sequence has stopped changing. A missed or stale frame is
displayed as STALE (never LIVE); disconnection wipes the selected Kit's values.
A fresh verified frame and exact Device ID are required after reconnect.

| Host / path | AP/STA discovery and joystick readings | USB Serial | Camera / Android Relay |
|---|---|---|---|
| Direct top-level DroneLab HTTPS in Chromium | Local Network Access approval, reachable Kit AP or routed STA LAN, authenticated Kit identity required | Web Serial-compatible browser, HTTPS, device port permission and user gesture required | WebRTC relay uses separately paired/authorized Android app; browser camera still requires permission |
| Wix embedded site | Cross-origin sandbox and parent Permissions-Policy may block local-network; opening a top-level tab is the supported fallback | Wix HTML component cannot be assumed to delegate the `serial` feature or expose Web Serial | Velo documents `camera` and `fullscreen` for HTML Component `allow`; QR/camera and WebRTC require their own permissions |
| WordPress embedded site | Works only if the parent HTTP policy, iframe `allow` and browser site permission delegate `local-network`; also requires actual Wi-Fi/LAN reachability | Requires parent `serial` policy, compatible browser, secure context and explicit port selection | Requires iframe `camera` delegation as appropriate and a valid paired WebRTC session |
| Android native companion | Android is the Kit network client: AP/STA signed identity and phone Wi-Fi checks apply | Separate physical USB setup; Android does not magically grant desktop Web Serial access | App background always disarms/relinquishes input; foreground requires fresh signed Kit verification or a deliberate reconnect |

When controlling the WordPress page/iframe HTML, an example permission
delegation (subject to the parent's own HTTP policy) is:

```html
<iframe src="https://chilchiltrips-boop.github.io/dronelab/index.html"
  title="ZEBJUS DroneLab" allow="local-network; loopback-network; serial; camera; fullscreen"
  style="border:0;width:100%;min-height:860px"></iframe>
```

In Wix, `$w("#html1").allow = "serial; camera; fullscreen"`
does **not** guarantee local-network or USB permission. Wix's documented
HTML Component `allow` settings include `camera`, `encrypted-media`,
and `fullscreen`, but Wix sandbox and parent policy control the other APIs.
The embedded UI cannot override a denied permission. Verify on the **published**
Wix/WordPress URL, in the target Chromium browser, using an actual Kit;
source-level tests cannot prove that an external host delegates the policies.

### Required hardware acceptance

1. Remove the propellers / disconnect ESCs. Confirm the physical motors remain disabled.
2. With a verified Kit in AP, open Live Inputs; expect current accepted input and
   stale status in about one second after packets stop (not several seconds of false LIVE).
3. Switch AP → STA, then STA → AP. The old Kit transport/frames must become stale
   immediately, and reconnection must verify the **same full Device ID**. Do not
   automatically trust a different kit or request network authorizations silently.
4. Disconnect Kit power or Wi-Fi while Android sends diagnostic values; expect
   input failsafe and UI STALE/OFFLINE, bounded read retries and eventual
   identity-checked reconnect (may require user approval).
5. Background Android and return to foreground; input must remain disarmed until
   a fresh signed status and the correct SSID/BSSID/path confirm the intended Kit.
   WebRTC controller permission is not restored merely by foregrounding.
6. On Wix and WordPress, independently test AP, STA, USB Serial and Android Relay.
   Record iframe `sandbox`/`allow`, `Permissions-Policy`, Local Network Access
   prompt, Serial API availability, and whether the top-level tab succeeds.
   External host/browser restrictions are not treated as firmware bugs.

These are **hardware tests to execute**, not claims that every iframe/browser
combination has already passed. Connection loss cannot be eliminated: verified
recovery and firmware failsafe must remain active.

References: Chrome/MDN Local Network Access security guidance and Wix Velo HTML
Component `allow` documentation.
