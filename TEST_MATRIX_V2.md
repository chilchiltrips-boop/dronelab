# V2 validation matrix

| Test | Result at implementation checkpoint |
|---|---|
| Baseline Node suite | 192/192 pass |
| New monitor runtime tests | 5/5 pass: actual transport, stale heartbeat, single request, late response rejection, missing transport |
| Project syntax / assets | Pass; 15/15 GLBs decode |
| Existing APP/FACTORY images | Pass A1/A2 size, chip and hash/catalog verification |
| Seven browser widths | Pass Chromium with local file routing |
| Network integration | Pass simulated ESP32 HTTP/native bridge + real Chromium/Pyodide: enrollment, save, handover, Android input, Python observer, STOP |
| Updated complete Node suite | Final rerun required after changed navigation labels |
| Service Worker real HTTP | CI pending; local server inaccessible from browser process |
| Fresh A1/A2 compilation | CI pending |
| Signed code 17 APK + upgrade/native touch | CI pending |
| Physical AP/STA/USB/OTA, power cycle and motors-disabled measurement | PHYSICAL PENDING |

Static string assertions are not runtime acceptance. Mock radio/native tests are explicitly simulation. CI workflow URLs and conclusions belong in the release report when returned by GitHub.
