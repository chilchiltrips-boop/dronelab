# Connection architecture

`ZebjusKits` owns the selected kit, authenticated status, immutable Device ID and controller session. Network Lab consumes this state; independent stale fallback was removed by PR #25. Firmware remains the authority for ownership, safe settings and request transport.

Public discovery is only a hint. Every connection checks the authenticated ID and reported AP/STA request transport. AP and STA interface availability is separately reported. USB uses serial identity and commands. Android native requests stay bound to Wi-Fi; virtual WebRTC remains separate.

The refresh action performs a status request, or bounded discovery and reauthentication of the sole credential-bearing candidate. Multiple candidates require explicit selection. No refresh or reconnect claims RC ownership. Transport selection does not change firmware mode.

Web reachability means a successful uncached version response from the WebApp host, not proof that the entire Internet works. The Service Worker bypasses `connectivity_probe` requests. The firmware can remain connected while that host is unreachable.
