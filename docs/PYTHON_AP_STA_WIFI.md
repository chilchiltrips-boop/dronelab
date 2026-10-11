# FlightCore AP/STA from Python Lab (bench only)

This Python code runs **inside the browser's Pyodide Worker**, not on the ESP32. FlightCore firmware 1.3.8 remains diagnostic-only: no ESC output, motors, or flight arming.

## Connection and ownership

1. Flash matching A1/A2 firmware **over USB** and verify running `ZJINFO,FW,...,1.3.8`, not just flash MD5.
2. Connect MY KITS via verified AP (`192.168.4.1`) or STA (router IP). The six-digit Kit Code **selects** the kit. The 32-character access key **authenticates** HTTP; it is generated on device and printed to physical USB startup as `ZJNET,ACCESS`. Keep this key private. Initial AP network password `12345678` is a **third, separate** credential.
3. In MY KITS, select source WEB, enable **Send to selected kit**, choose **Take Control**, then return to Python Lab. Select Python target **AP or STA**, matching the active MY KITS transport. Plain `Python 3 / Simulator` needs no hardware.
4. Run the script. A neutral, **motor-disabled** RC diagnostic heartbeat keeps the temporary owner lease alive only during Python Run. Stop/finish releases it. Link loss must never automatically arm.
5. **Wi-Fi Test & Save releases diagnostic Take Control before changing Wi-Fi**. You must reconnect and take control again after successful association.

## Python example: scan for 2.4 GHz routers

```python
from zebjus_simple import Drone

drone = Drone()
networks = await drone.wifi_scan()
for network in networks:
    print(network["ssid"], network["rssi"], "dBm")
```

## Python example: test and save STA

```python
from zebjus_simple import Drone

drone = Drone()
result = await drone.wifi_test_save("YOUR_2_4GHZ_SSID", "YOUR_WIFI_PASSWORD")
print(result)
if result["saved"]:
    print("STA credentials saved in controller flash (NVS)")
else:
    print("Not saved/verified; check USB ZJNET status before retry")
```

Firmware writes SSID/password to NVS **only after associating with the router**. `saved: true` requires a fresh matching runtime status (`sta_test_pass_saved` or `ap_ready_credentials_saved`); a 202 HTTP response is only **test started**, not save success. Connection changes may prevent browser readback; `unverified` does not mean saved. Check `ZJNET,GET` on physical USB if unclear.

**Privacy:** The IDE autosaves student Python files to browser storage. Do not hardcode and share real Wi-Fi passwords inside exported project files or GitHub commits. Use a temporary classroom test network when demonstrating.

**Limitations:** A local HTTPS web page to ESP32 HTTP may be blocked by browser Local Network Access policies. AP/STA hardware, the Android relay, and modem/router compatibility remain unverified on actual A1/A2 devices. USB factory flashing remains in Firmware Center, not in Python.
