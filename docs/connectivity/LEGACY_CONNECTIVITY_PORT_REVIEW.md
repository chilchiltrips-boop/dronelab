# ZEBJUS legacy connectivity review and DroneLab port

Date: 13 October 2026. Target: WebApp 1.7.1 / FlightCore 1.4.5.
Reference revision: `756061f0b46621b04a83aa5e5a65e553b8b89647`.
DroneLab starting revision: `716a899b2791b8b3dcf07338b3de885d7e111097`.
Implementation branch: `feature/legacy-connectivity-port-20261013`.

This review traces the requested connection, status, Wi-Fi management and firmware-update sections through browser code and controller firmware. It records confirmed code defects, the implemented fixes and the remaining physical acceptance checks. A software build or a device double is not a physical AP/STA/USB/OTA test.

## Requested sections and implementation

| Requested section | Reference source | DroneLab implementation |
|---|---|---|
| SAME-WI-FI • AUTOMATIC DISCOVERY / Connect Your ZEBJUS Kit | [index.html](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/index.html#L256), [kit-local.js](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/kit-local.js#L156) | [Connection workspace](https://github.com/chilchiltrips-boop/dronelab/blob/feature/legacy-connectivity-port-20261013/index.html), [firmware-connect.js](https://github.com/chilchiltrips-boop/dronelab/blob/feature/legacy-connectivity-port-20261013/js/firmware-connect.js), [discovery client](https://github.com/chilchiltrips-boop/dronelab/blob/feature/legacy-connectivity-port-20261013/js/classroom-kits.js) |
| CONNECTED KIT DETAILS / No kit selected | [index.html](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/index.html#L270), [school-lab.js](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/school-lab.js) | Device ID, selected interface, controller ownership, heartbeat, firmware/build, signal and actual AP/STA interface observations |
| AUTOMATIC DISCOVERY • SAME WI-FI / Available Kits | [index.html](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/index.html#L293), [kit-local.js](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/kit-local.js) | Default names, saved addresses, saved names, AP gateway and optional mDNS helper; explicit Device ID selection |
| KIT IDENTITY | [index.html](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/index.html#L296), [firmware name routines](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/FlightCore_Firmware/ZEBJUS_FLIGHTCORE.ino#L418) | Controller-persisted name/reset, free default-name allocation and mDNS restart; immutable physical ID retained |
| NETWORK / Wi-Fi management | [index.html](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/index.html#L303), [Wi-Fi API](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/kit-local.js#L208) | Dedicated firmware-page card, router scan/test/save, AP/STA/AUTO, five saved profiles, preferred router and forget actions |
| WEB FLASH • WIFI OTA • USB RECOVERY / Firmware Center | [index.html](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/index.html#L308), [firmware-updater.js](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/firmware-updater.js) | Shared verified-kit transport, matching APP/FACTORY packages, encrypted APP OTA and USB recovery |
| STEP 1 • FIRMWARE SOURCE / Choose firmware | [index.html](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/index.html#L313) | Latest matching package, official checksum/size verification, byte-based import type/board detection, download and cache |
| STEP 2 • TARGET / Connect controller | [index.html](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/index.html#L326) | USB ROM/Serial and direct AP/STA targets; update authorization is separate from discovery and diagnostic ownership |
| STEP 3 • UPDATE MONITOR / Flash, reboot & reconnect | [index.html](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/index.html#L333) | Prepare → Flash → Verify → Reboot → Reconnect; completion needs live runtime identity, new boot, version and build fingerprint |
| Header STA / AP / NO KIT / Take control OFF / KIT OFFLINE | [school-lab.js](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/school-lab.js) | Visible header switches, shared ownership state, explicit transport selection, actual request/interface status and independent WebApp reachability |

Both `index.html` and the older `lab.html` entry now provide the same desktop workspace. Firmware, My Kits and the header consume one selected-kit client rather than keeping independent connection claims.

## Why the old files and BINs cannot simply be copied

The reference uses `deviceId`, SRP/ZFC3 sessions, `/api/control/*` and encrypted firmware commands. DroneLab uses `kitId`, a physical six-digit selector, enrollment/HMAC/AES-GCM sessions and bench RC APIs. Its A1/A2 pin profiles and partition layout belong to the current diagnostic firmware.

The port reproduces the operator flow through the DroneLab protocol. Install the DroneLab A1/A2 package. The reference 18.3.84 image is not a DroneLab update package. Existing compatible DroneLab firmware can migrate with a matching APP; a different/unknown partition layout requires USB FACTORY.

Current DroneLab firmware receives diagnostic RC and sensor data with motor outputs disabled. This connection port does not establish physical flight readiness.

## Confirmed defects and fixes

| Finding in the starting DroneLab tree | Confirmed mechanism | Implemented correction |
|---|---|---|
| My Kits Connect/Disconnect did not bind | The event bindings followed a single-line comment and were swallowed by it | Separate executable handlers; actual button-action regression |
| Some existing STA USB pairings were ignored | Simple observer enrollment took precedence over the physical USB key | USB-paired STA admin enrollment; unpaired STA remains observer-only |
| Firmware-page Take Control disagreed with the header | One path disabled STA unconditionally; another called claim without enabling the hardware target | Both call the same guarded controller action and read authoritative permissions |
| Discovery subscribers could receive partial results | A second caller returned the current array while the first scan was still running | All callers await the shared scan; progressive rendering remains available |
| Default-name scanning could miss new controllers | Firmware advertised board/code names while the UI mainly scanned default kit names | Allocate and advertise free `zebjus_drone_N` names with DNS-safe `zebjus-drone-N.local`; retain saved/code/helper candidates |
| Header Connect could still require manual code/IP | A selected discovery candidate was not consumed by the header action | Use the selected full Device ID and reachable candidates to fill internal fields |
| Named AP connection depended on a prior scan | AP has no mDNS; the name-only candidate list omitted its gateway | Probe AP gateway alongside name/known addresses and still match name and full ID |
| AP gateway overwrote the useful remembered STA address | The live AP request address was stored ahead of the signed device-reported STA address | Retain verified identity and reported STA address; recheck the endpoint before reuse |
| Reconnect lacked some current aliases | It primarily used last IP and the old board/code hostname | Saved address, advertised hostname, Kit Name and discovery candidates, pinned to the same ID |
| Reconnect/update could display stale freshness | A successful update readback did not always renew heartbeat/interface fields | One status-adoption path; no restored RC grant |
| Late control/USB responses could undo user intent | A late grant or a complete delayed USB handshake could follow Disconnect | Connection/control tickets plus explicit automatic-reconnect suppression after manual Disconnect |
| Reboot/reconnect buttons used a removed school client | They stayed disabled or used unavailable legacy methods | Current verified-kit reboot/reconnect APIs and device-side idle/admin checks |
| Rename permissions differed across views | AP-only UI rules and observer/admin rules were conflated | AP setup or separately USB-paired STA admin can rename; observer cannot mutate |
| Wi-Fi success stability was measured from test start | A late GOT_IP could be saved almost immediately | Require a new association, matching SSID, nonzero DHCP address and 1.2 seconds of continuous connection |
| Background retries could disturb an AP user/controller | Saved-STA attempts/retries ran without full client/ownership idle guards | Cancel/pause background attempts for AP clients or RC ownership; resume during idle |
| A stale AP-off timer could survive mode changes | HTTP mode changes did not clear it consistently | Clear obsolete timer before changing preferred radio mode |
| One saved router did not provide reference-style management | Only one SSID/password record existed | Five-entry atomic profile record, preference, round-robin idle fallback and forget; remove deprecated credential copies after migration |
| AP status relied only on mode bits | AP/STA mode could be reported as an active hotspot without confirmed start | AP start result/events and stop tracking feed the status field |
| Default development server was blocked by CORS | Server uses localhost:4173; firmware allowed 8765/8000 but not 4173 | Add only the matching loopback origins; retain trusted-origin and authorization checks |
| Network board autodetection used a removed client | Wi-Fi A2 could fall back to A1 | Read the current verified kit board; USB retains explicit physical-port priority |
| Import inferred image type from filename | Renamed FACTORY/APP files could be classified incorrectly | Inspect bytes, ESP chip and descriptor; still require published size/SHA-256 |
| Cached-image preparation could appear complete | One restore path displayed 100% without flashing | Package preparation remains distinct from write/boot completion |
| Query-bearing scripts were missing on AP-only first revisit | Worker cached plain URLs but requested scripts/styles included cache-busting parameters | Canonical fallback for static scripts/styles; BIN version keys stay exact |
| OTA used only the previous IP for reboot checks | DHCP reuse/movement could prevent reconnection or answer from another kit | Re-probe address/name candidates before authenticated readback |
| OTA had no encrypted, session-bound chunk path in DroneLab | Multipart legacy upload was the only path | Admin-only encrypted begin/chunk/end/abort, exact offsets and full SHA-256 before activation |
| Version alone did not identify the running build | Multiple review builds can share 1.4.5 | Compare live app ELF fingerprint with the uploaded application descriptor |
| Source and binaries could drift within one version | Catalog checks alone did not establish compiled header identity | Record source commit and every firmware input hash; release verifier rejects drift |

Code entry points: [classroom-kits.js](https://github.com/chilchiltrips-boop/dronelab/blob/feature/legacy-connectivity-port-20261013/js/classroom-kits.js), [firmware-connect.js](https://github.com/chilchiltrips-boop/dronelab/blob/feature/legacy-connectivity-port-20261013/js/firmware-connect.js), [firmware-updater.js](https://github.com/chilchiltrips-boop/dronelab/blob/feature/legacy-connectivity-port-20261013/firmware-updater.js), [FlightCoreNetwork.h](https://github.com/chilchiltrips-boop/dronelab/blob/feature/legacy-connectivity-port-20261013/FlightCore_Firmware/FlightCoreNetwork.h), [FlightCoreEnrollment.h](https://github.com/chilchiltrips-boop/dronelab/blob/feature/legacy-connectivity-port-20261013/FlightCore_Firmware/FlightCoreEnrollment.h), [FlightCoreOta.h](https://github.com/chilchiltrips-boop/dronelab/blob/feature/legacy-connectivity-port-20261013/FlightCore_Firmware/FlightCoreOta.h), [FlightCoreWifiProfiles.h](https://github.com/chilchiltrips-boop/dronelab/blob/feature/legacy-connectivity-port-20261013/FlightCore_Firmware/FlightCoreWifiProfiles.h), [worker](https://github.com/chilchiltrips-boop/dronelab/blob/feature/legacy-connectivity-port-20261013/sw.js).

## Discovery and connection logic

1. Scan the AP gateway, previously verified addresses/names, default names 1–30 and optional localhost discovery-helper results.
2. Treat `/api/identify` as a candidate. Check board prefix, full MAC-based Kit ID and six-digit selector.
3. Fill the detected Kit Name. A candidate does not grant ownership, settings permission or OTA.
4. On Connect, recheck live identity, open the appropriate session and verify status.
5. Cache public metadata only after this connection succeeds. Credentials use the existing separate pairing store.
6. Reconnect to the same physical ID using address and name candidates. A DHCP address that now answers as another ID is skipped before sending the saved credential.
7. Restore monitoring, then require a fresh explicit Take Control action.

A hosted browser cannot enumerate every LAN host or automatically join Wi-Fi networks. mDNS/client isolation, Local Network Access permission and the laptop's actual network still matter. The optional helper enumerates service candidates; every candidate is reverified by the device client.

## Header and connected details

| Observation | Meaning |
|---|---|
| STA/AP switch selection | Requested connection transport; this does not claim the firmware radio mode changed |
| Actual request transport | Authenticated controller socket/interface that answered the browser |
| AP/STA interface flags | Controller-reported hotspot and router state, independent of selected transport |
| Take control OFF/ON/LOCKED | Explicit diagnostic grant, same owner state used by Firmware/My Kits/PID |
| KIT CONNECTED / KIT OFFLINE / LINK STALE | Identity/session and heartbeat freshness, not browser `navigator.onLine` |
| Web reachable/offline | Uncached reachability of the WebApp host; independent of local Kit connectivity |
| Sensor health | Actual gyro/RC reports; barometer/LIDAR are not fabricated when firmware does not report them |
| No kit selected | No live verified selected target; cached rows remain candidates |

Freshness is 6.5 seconds. Polling runs every 2.2 seconds without overlapping status reads. Three misses initiate bounded identity-pinned recovery. Manual Disconnect suppresses background reconnect and delayed USB auto-selection until an explicit connect action.

## Permissions

| Connection | Monitor | Router/name settings | Diagnostic RC | APP OTA |
|---|---|---|---|---|
| Public discovery | Candidate identity only | No | No | No |
| STA local observer | Yes | No | No | No |
| AP local setup | Yes | Yes | Bench diagnostics | No |
| Strong label diagnostic session | Yes | Scope-dependent setup | Bench diagnostics | No |
| Physical USB-paired admin session | Yes | Yes | Bench diagnostics | Yes, idle kit only |
| Physical USB runtime | Live serial identity/diagnostics | USB management | Bench diagnostics | Use separate USB flasher |

The public six-digit Kit Code and AP Wi-Fi password do not authorize firmware administration. New WebApp admin sessions prove the USB-paired key without sending it in the enrollment request, serialize signed counters, and encrypt POST payloads.

The older multipart endpoint is retained for compatible installed maintenance/native clients and first migration from older DroneLab firmware. The new WebApp uses encrypted OTA when the controller advertises it.

## Wi-Fi management behavior

- AP setup permits router scan and Test & Save.
- A failed association leaves saved profiles unchanged. A successful stable test commits one complete profile-list record and keeps AUTO coexistence.
- The preferred profile is first. Idle reconnect can rotate through the remaining saved profiles. This is an idle, bounded round-robin policy rather than the reference's RSSI-ranked retry.
- Use selected router changes the preference and attempts that tested profile. Forget removes it from the active persistent list.
- Deprecated single-profile credential keys are removed after a successful migration commit.
- AUTO retains AP and STA together; their radio channel is shared.
- AP is a persistent explicit preference. STA-only requires saved credentials and disables the AP after successful router connection.
- AP fallback and pause protect setup/controller activity. Firmware mode changes still require release of control.
- The operating system must join the router or Kit hotspot. Browser controls verify the resulting path.

Renamed Kit identity and mDNS advertisement are separate from a teacher-customized AP SSID. The details card displays the actual AP SSID. A default hotspot name can follow the saved Kit Name on the next boot.

## Firmware source, target and monitor

APP: matching existing dual-OTA layout, application at 0x10000, slot capacity 0x1e0000.
FACTORY: complete 4 MiB image at 0x0, USB first installation/recovery, with the same APP bytes embedded at 0x10000.
A1: ESP32-C3 image chip ID 5. A2: ESP32-C6 image chip ID 13.

Auto Load chooses the verified connected board; a physically selected USB board takes precedence. Manual import reads type/chip from bytes, validates descriptor/layout and matches the published size/SHA-256. Old cached packages are not relabeled as the new release.

A loaded package or a ROM connection is not installed-firmware evidence. Running USB version comes from ZJINFO; network runtime evidence comes from authenticated status.

Encrypted OTA:

1. Require exact selected Kit ID/board, idle RC/network state, admin permission and a matching APP.
2. Begin a session-bound write with size and SHA-256.
3. Send encrypted chunks up to 384 bytes. Every offset and Device ID must be acknowledged.
4. Reject wrong chip/APP descriptor, invalid offsets, incomplete content or a SHA-256 mismatch. Activate only after final Update verification.
5. Abort an abandoned transfer after 30 seconds; preserve recovery through USB.
6. Mark the old connection unavailable during reboot.
7. Reconnect by pinned identity, verify changed boot ID, expected version and exact application ELF fingerprint.
8. Show 100% only after runtime readback succeeds; acknowledged writes without readback remain pending at 99%.

USB recovery retains board detection, matching image checks, partition/capacity guards, manual BOOT instructions, write verification, SPI boot reset and serial reconnection. A firmware APP cannot migrate an unknown partition layout.

## API additions and compatibility

| Route | Purpose | Required access |
|---|---|---|
| POST /api/auth/challenge + /api/auth/enroll, kind=admin | USB-key proof and encrypted admin session | Physical USB-paired credential |
| GET /api/wifi/saved | Profile names/preference, no passwords | Setup/admin |
| POST /api/wifi/use | Prefer and connect an existing tested router | Idle setup/admin |
| POST /api/wifi/forget | Remove a saved router | Idle setup/admin |
| POST /api/kit/name and /reset | Controller-persisted identity maintenance | AP setup or USB-paired STA admin |
| POST /api/firmware/begin | Start bounded APP write | Encrypted admin, idle |
| POST /api/firmware/chunk | Ordered authenticated content | Same admin session |
| POST /api/firmware/end | Verify digest and activate | Same admin session |
| POST /api/firmware/abort | Cancel incomplete write | Same admin session |
| POST /api/reboot | Controlled reboot and identity-pinned reconnect | Idle admin |

Status adds control authorization, advertised hostname, actual build time, layout/capacity, encrypted-OTA capability and active application ELF fingerprint. Existing diagnostic/Android protocols and USB pin profiles remain compatible.

## Validation evidence and limits

Final validation:
- **227 Node regressions passed**, with zero failures/cancellations.
- **A1 and A2 APP + FACTORY builds passed** on Arduino-ESP32 3.3.12.
- Release checks passed: chip IDs, hashes/sizes, both OTA slots, byte-identical embedded APP, source/catalog agreement and all **8 firmware-input hashes**.
- Project/syntax/model checks passed: 33 modules, 35 asset references and all 15 GLB models.
- Chromium header checks passed at **320 / 360 / 390 / 768 / 1024 / 1366 / 1920 px**.
- Actual connection-page interactions passed at **360 / 768 / 1366 px**, plus **lab.html at 1366 px**, using device doubles.
- Compiled source: `f796f23f5d857be19e5e1963ac4af6bf1affdec2`.
- Verified binary commit: `0f28d77bb886d82f17e983b3dd78591bf60efe8a`.
- [Firmware build + 227 tests + release verification](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38444407741)
- [Chromium layout and connection checks](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38444407445)

The earlier source-only validation job correctly rejected the previous build report before the new binary/provenance build completed. The completed build job ran the release gate against the newly compiled matching artifacts.

| Published package | Bytes | SHA-256 |
|---|---:|---|
| ZEBJUS_FLIGHTCORE_A1_APP.bin | 1173216 | `010e6efc3277a326cf18f9e9b10ae0c06d7c571197f5afdab452c9c14d36733a` |
| ZEBJUS_FLIGHTCORE_A1_FACTORY.bin | 4194304 | `0d1bc86d12ff940f04e2d6769584d7fad6e15a5435acbcaa995b4d7b0a3c1133` |
| ZEBJUS_FLIGHTCORE_A2_APP.bin | 1180768 | `efd3079e800ca67aa7c6e385e5f9dfca265b968b1eb28d72a8e90e53b0c2e07d` |
| ZEBJUS_FLIGHTCORE_A2_FACTORY.bin | 4194304 | `1fa45135f39b17a4bafe14247cfa23165e01d40db1751000b7ea6bd42c417da9` |

Added regressions exercise actual Connect/Disconnect bindings, observer/admin separation, explicit AP authorization, shared control actions, late grants, late USB handshakes, remembered STA addresses, wrong identity, DHCP address reuse, encrypted chunk order/digest, actual firmware profile/OTA handlers and AP-only cache URLs.

A1/A2 compilation and APP/FACTORY hash/chip/layout checks are software evidence. Hardware flashing is explicitly marked false in the build report.

Remaining physical checks: first AP onboarding on both boards; real router authentication/failure and power-cycle persistence; simultaneous AP/STA channel changes; stale-link/deadman/ownership recovery; real browser Local Network Access/mDNS; USB BOOT/RESET/reenumeration; successful/aborted/power-interrupted OTA and recovery.

Publisher signatures, production secure-boot/anti-rollback provisioning and verified NVS encryption remain separate release requirements. SHA-256 and encrypted sessions protect submitted content/session integrity; they do not establish a hardware-rooted publisher signature. The shared default AP credential and local setup scope are for the existing motor-disabled bench model.

## Source references

- [Reference connection client](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/kit-local.js)
- [Reference UI/state/ownership](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/school-lab.js)
- [Reference Wi-Fi/mDNS/firmware implementation](https://github.com/chilchiltrips-boop/zebjus-drone-simulator-lab/blob/756061f0b46621b04a83aa5e5a65e553b8b89647/FlightCore_Firmware/ZEBJUS_FLIGHTCORE.ino)
- [Starting DroneLab connection client](https://github.com/chilchiltrips-boop/dronelab/blob/716a899b2791b8b3dcf07338b3de885d7e111097/js/classroom-kits.js)
- [Starting DroneLab updater](https://github.com/chilchiltrips-boop/dronelab/blob/716a899b2791b8b3dcf07338b3de885d7e111097/firmware-updater.js)
- [Arduino-ESP32 3.3.12 ESPmDNS API](https://github.com/espressif/arduino-esp32/blob/3.3.12/libraries/ESPmDNS/src/ESPmDNS.h)
- [ESP-IDF application descriptor/fingerprint](https://github.com/espressif/esp-idf/blob/v5.5.1/components/esp_app_format/include/esp_app_desc.h)
- [mbedTLS SHA-256 streaming API](https://github.com/Mbed-TLS/mbedtls/blob/v3.6.4/include/mbedtls/sha256.h)
