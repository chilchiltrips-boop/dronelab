# Connection observations

- `disconnected`: no verified selected kit.
- `connected`: last authenticated identity/transport response within 6500 ms, or an open selected USB serial connection.
- `stale`: failed polling/refresh; exposed connection is false and hardware claims/frames are blocked.
- `reconnecting`: bounded exponential retries to the same Device ID; never restore controller ownership.

Polling runs every 2200 ms without overlap. Concurrent manual and timed reads share a promise. Selection/disconnect increments a ticket so late responses cannot repopulate selected state. Visibility restoration and browser online events trigger real refresh. `navigator.onLine` never marks a kit connected.

Web host reachability, AP/STA interface flags, current request transport and firmware controller ownership remain separate observations. USB serial-open is not equivalent to a newly authenticated HTTP heartbeat; physical USB acceptance remains pending.
