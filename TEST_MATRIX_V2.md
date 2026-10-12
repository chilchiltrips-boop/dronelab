# V2 validation matrix

| Test | Result at implementation checkpoint |
|---|---|
| Baseline Node suite | 192/192 pass |
| New monitor runtime tests | 6/6 pass: actual transport, stale heartbeat, single request, late response rejection, missing transport, cancelled connection |
| Project syntax / assets | Pass; 15/15 GLBs decode |
| Existing APP/FACTORY images | Pass A1/A2 size, chip and hash/catalog verification |
| Seven browser widths | Pass Chromium with local file routing |
| Network integration | Pass simulated ESP32 HTTP/native bridge + real Chromium/Pyodide: enrollment, save, handover, Android input, Python observer, STOP |
| Updated complete Node suite | 199/199 pass after verifier adjustment |
| Service Worker real HTTP | Passed on push run 38297637956 and corrected PR run 38303771631; earlier PR timeout preserved in release report |
| Fresh A1/A2 compilation | Passed run 38297661112 |
| Signed code 17 APK + upgrade/native touch | Passed build, pinned signing, 16→17 emulator upgrade and native touchscreen acceptance in run 38303708120 |
| Physical AP/STA/USB/OTA, power cycle and motors-disabled measurement | PHYSICAL PENDING |

Static string assertions are not runtime acceptance. Mock radio/native tests are explicitly simulation. CI workflow URLs and conclusions belong in the release report when returned by GitHub.
