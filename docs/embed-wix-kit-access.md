# Embed ZEBJUS DroneLab on Wix and other HTTPS websites

The **physical kit and browser computer must be on the same reachable LAN**, or the computer must be connected to the Kit AP (normally `192.168.4.1`). An Android phone connected to Kit AP does NOT make a desktop on a different router able to see it.

Modern Chrome/Edge require iframe **Local Network Access** permissions delegation. Cross-origin iframes default to no access unless the host site permits it. Nested frames need permission delegation through **every ancestor**. This cannot be bypassed in JavaScript or in FlightCore firmware. Do not disable browser security controls.

## Host-controlled iframe (WordPress/custom HTML/website builders that preserve attributes)

```html
<iframe
  title="ZEBJUS DroneLab"
  src="https://chilchiltrips-boop.github.io/dronelab/"
  loading="lazy"
  width="100%" height="800"
  allow="local-network-access; local-network; loopback-network; serial; usb"
  referrerpolicy="strict-origin-when-cross-origin">
</iframe>
```

Host site's `Permissions-Policy` response header **must not forbid** the features. For a controlled HTTPS host, you can add `Permissions-Policy: local-network=(self "https://chilchiltrips-boop.github.io"), loopback-network=(self "https://chilchiltrips-boop.github.io")`, and delegate in the iframe as above.

**Wix Embed a Site / HTML iframe:** the Wix editor can wrap your HTML in additional sandboxed nested iframes or prevent setting the outer iframe's `allow` attributes. You cannot repair those outer layers from inside DroneLab. If Wix does not expose delegation to every frame, use the direct WebApp link below. Test the **published HTTPS site**, not only the editor preview.

```html
<a href="https://chilchiltrips-boop.github.io/dronelab/"
   target="_blank" rel="noopener noreferrer">
  Open ZEBJUS Kit Connection — Scan AP / STA
</a>
```

Use direct WebApp for reliable permission prompts and USB Web Serial access. Embedded form is suitable for simulator lessons and other UI even when embedded kit scanning is restricted.

## Diagnose 0 kits

1. Confirm the browser **computer** is connected to the Kit AP (AP) or the **same reachable router** (STA); school client isolation/firewall may block kit traffic.
2. On AP, manually visit `http://192.168.4.1/api/identify` in a fresh tab on that computer. The physical Kit must return a Device ID/board. Do not share pairing keys.
3. Test the **direct** HTTPS DroneLab URL. Grant the browser's local-network access prompt. When direct works but the iframe fails, inspect the parent iframe Permissions-Policy / `allow` delegation.
4. For an unseen STA kit, mDNS cannot be enumerated directly by a hosted browser; the existing localhost LAN discovery helper can provide **candidate** addresses, each still verified against the physical Kit.
5. A Kit remains authenticated by Device ID, board and signed/USB pairing policy. No CORS wildcard or arbitrary embedded website is allowed to send privileged commands.

Note: In a direct external iframe, the browser fetch Origin typically remains DroneLab's HTTPS origin, not the Wix page, so **do not relax FlightCore's CORS allowlist** to all websites or `Origin: null`. Wix's opaque HTML sandbox and internal frames can still forbid local-network access even with correct CORS.
