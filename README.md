# ZEBJUS Drone Lab — Simple Edition

A browser-only control simulation made with three files. No npm, framework,
build step, server, external fonts, or downloaded libraries are needed.

| File | Purpose |
| --- | --- |
| `index.html` | Page and controls |
| `style.css` | Desktop and mobile layout |
| `script.js` | Demo controls, telemetry and link recovery |

## Open locally

Extract the ZIP and double-click `index.html`. Keep all three files together.

## Publish on GitHub Pages

1. Create a new repository for this demo.
2. Upload `index.html`, `style.css` and `script.js` directly into the repository
   root. Do not upload only the ZIP or put the files inside an extra folder.
3. Commit the upload to `main`.
4. Open **Settings → Pages → Build and deployment**.
5. Set **Source** to **Deploy from a branch**.
6. Choose branch **main** and folder **/(root)**, then **Save**.
7. Wait for deployment. Use the site URL shown on the Pages settings screen.

Official instructions:
https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

These files were prepared for upload. No repository has been changed and no
site has been published as part of this delivery.

## Try the demo

- Connect the demo. Arm with throttle at 1000 µs.
- Drag the joystick to change roll/pitch; release to center. The sliders also
  allow keyboard control. Adjust throttle and yaw to change demo telemetry.
- Simulate link loss. Inputs reset and the demo disarms immediately. It
  reconnects after 3 seconds; controls become available automatically.
- Arm again to resume. Arming is never restored automatically.
- Stop & reset or press Escape to disarm and reset all controls. Stop also
  cancels a pending reconnect. Leaving the page disarms an active simulation.

## Hardware scope

This is a UI simulation, not a flight controller or a physics simulator. Motor
output is a percentage calculated from the throttle slider while armed.
Telemetry values are simulated inputs; they are not IMU measurements.

There is no ESP32 connection, AP/STA connection, USB flashing, authentication,
cloud relay, or Android APK. Real hardware integration needs the controller's
actual communication protocol and a separately validated transport. Do not
treat the demo reconnect timer as a hardware failsafe.

All asset paths are relative so the page can run under a GitHub project path.
The app keeps no saved control state and registers no service worker.
