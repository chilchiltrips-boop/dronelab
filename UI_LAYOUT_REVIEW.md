# UI layout review

Baseline: 1.6.4+192. Target: 1.7.0. Preserve the compact header, six existing labs, simulator, camera pairing and Android cockpit.

| Screen | Observed issue / action | Evidence |
|---|---|---|
| MY KITS | Large discovery intro and USB-first actions delayed setup. Moved New Kit/Resume and six-step progress first; compact discovery; label enrollment disclosure. | [Before](docs/network-release/before-kits-1366.png) / [After](docs/network-release/after-kits-1366.png) |
| MY KITS forms | Tall Remember Browser control; grid rows left avoidable holes; offline identity matrix showed many empty cells. Compact inline checkbox, independent balanced columns and explicit offline empty state. | Browser 360/390/768/1024/1366/1920 |
| Header | Preserve brand/version underneath, one row, CONTROL and Mobile Ctrl, no header STOP. Existing header assertion used obsolete word order. | header-ota-browser three viewport pass; Emergency STOP remains in MY KITS |
| Assembly / Wiring | Preserve canvas/workspace and compact toolbars; check clipping and horizontal overflow. | audit-browser screenshots |
| Python | Preserve Monaco/file controls/terminal/plots and sticky execution toolbar. Add STA joystick example; transport follows selected kit. | Real Pyodide browser regression pass |
| PID Tuning | Preserve full-width embedded simulator, Rate/Angle controls, sound and virtual flight. No real motor/flight firmware added. | Existing simulator/WebRTC suites |
| Firmware & USB | Preserve board/catalog/hash/APP/FACTORY distinctions; teacher STA OTA priority and USB recovery. | Firmware/header/browser suites |
| Android | Preserve splash, landscape two-stick cockpit and presets. Separate direct AP status and firmware RX ACK from WebRTC/virtual ARM. | Native/browser screenshots; physical radio pending |

Screenshots mask QR/PIN/access fields. A file-route local sandbox is not evidence for actual Local Network Access, camera hardware or radio behavior. The general visual audit also exercises permission denial/cancel states. Any local scheduled-navigation/ICE timeout is retained in the test report and must be resolved or compared with CI before main release.

## Captured evidence

The desktop header measures **82 px before and after at 1366 px**. MY KITS full-page height dropped from 2885 to 2628 px (257 px, about 9%) despite adding guided enrollment. The document width equals the viewport at 360, 390, 768, 1024, 1366 and 1920 px; see [layout metrics](docs/network-release/layout-metrics.json). The single-row phone header intentionally scrolls horizontally to reach controls. Grant-control geometry is checked after normal scroll-into-view, including visible text, separate 40 px track and all three switch states (33 combinations). Full form audit passes 45 rendered page/viewport checks with no clipping after shortening the STA-IP placeholder.

| Layout | Screenshot |
|---|---|
| Phone 360 / 390 | [360](docs/network-release/kits-360.png) · [390](docs/network-release/kits-390.png) |
| Tablet 768 / 1024 | [768](docs/network-release/kits-768.png) · [1024](docs/network-release/kits-1024.png) |
| Wide desktop 1920 | [1920](docs/network-release/kits-1920.png) |
| Assembly / Wiring | [Assembly](docs/network-release/assembly-1366.png) · [Wiring](docs/network-release/wiring-1366.png) |
| Python / Firmware | [Python](docs/network-release/python-1366.png) · [Firmware](docs/network-release/firmware-1366.png) |
| Android browser cockpit | [915 × 412](docs/network-release/android-915.png) |
| Production-signed Android WebView emulator | [Landscape](docs/network-release/android-native-16x9.png) · [Reverse landscape](docs/network-release/android-native-reverse-16x9.png) |

Native images come from [signed APK upgrade/touch run](https://github.com/chilchiltrips-boop/dronelab/actions/runs/38178487861), not desktop browser emulation. Both orientations passed 25 assertions each: independent MotionEvent pointers, touch-follow initial zero displacement, release/CANCEL, 3-finger STOP, settings, OS HOME/resume and compositor/layout. Physical touchscreen/radio checks remain pending.
