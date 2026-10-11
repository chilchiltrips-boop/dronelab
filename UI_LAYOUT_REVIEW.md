# UI layout review

Baseline: 1.6.4+192. Target: 1.7.0. Preserve the compact header, six existing labs, simulator, camera pairing and Android cockpit.

| Screen | Observed issue / action | Evidence |
|---|---|---|
| MY KITS | Large discovery intro and USB-first actions delayed setup. Moved New Kit/Resume and six-step progress first; compact discovery; label enrollment disclosure. | Before/after screenshots in docs/network-release/ (added after final capture) |
| MY KITS forms | Tall Remember Browser control; grid rows left avoidable holes; offline identity matrix showed many empty cells. Compact inline checkbox, independent balanced columns and explicit offline empty state. | Browser 360/390/768/1024/1366/1920 |
| Header | Preserve brand/version underneath, one row, CONTROL and Mobile Ctrl, no header STOP. Existing header assertion used obsolete word order. | header-ota-browser three viewport pass; Emergency STOP remains in MY KITS |
| Assembly / Wiring | Preserve canvas/workspace and compact toolbars; check clipping and horizontal overflow. | audit-browser screenshots |
| Python | Preserve Monaco/file controls/terminal/plots and sticky execution toolbar. Add STA joystick example; transport follows selected kit. | Real Pyodide browser regression pass |
| PID Tuning | Preserve full-width embedded simulator, Rate/Angle controls, sound and virtual flight. No real motor/flight firmware added. | Existing simulator/WebRTC suites |
| Firmware & USB | Preserve board/catalog/hash/APP/FACTORY distinctions; teacher STA OTA priority and USB recovery. | Firmware/header/browser suites |
| Android | Preserve splash, landscape two-stick cockpit and presets. Separate direct AP status and firmware RX ACK from WebRTC/virtual ARM. | Native/browser screenshots; physical radio pending |

Screenshots mask QR/PIN/access fields. A file-route local sandbox is not evidence for actual Local Network Access, camera hardware or radio behavior. The general visual audit also exercises permission denial/cancel states. Any local scheduled-navigation/ICE timeout is retained in the test report and must be resolved or compared with CI before main release.
