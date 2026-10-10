# Android reference cockpit — 1.6.2

The supplied `image.png` requests a landscape transmitter with a slim metal-toned header, dark circuit-pattern background, large circular joysticks at the lower left/right, coral-ringed knobs, a central attitude ladder, ARM and CONNECT. The existing APK previously used a tall header and central telemetry cards. This update implements the supplied layout in the existing production companion.

## Controls

| Visible control | Behavior |
|---|---|
| MENU | Opens existing WebRTC connection and joystick settings. |
| CONNECT / LINK SETTINGS | Opens the same pairing sheet directly from the cockpit. |
| Left circular stick | Floating first-touch center; yaw and elapsed-time throttle; neutral yaw and held applied throttle on release. |
| Right circular stick | Independent floating first-touch center; roll/pitch; neutral on release. |
| ARM switch | Explicit virtual ARM after paired ownership, receiver readiness and low throttle; armed state follows receiver feedback. |
| STOP | Immediate disarm and neutral output, including a third pointer while both thumb sticks are held. |
| ANGLE / ACRO | Selects the existing simulator mode with protected command sequencing. |
| RESP pill | Cycles Slow, Medium and Fast and persists the chosen joystick response. |
| QR scan icon | Opens connection settings and starts the existing camera offer scanner with the existing Android permission flow. |
| Timer | Counts receiver-confirmed armed time, freezes on STOP, resets on explicit new ARM. Preview does not start it. |
| Attitude ladder and footer | Receiver-applied simulator pose/RPM/mount height and joystick values, with explicit preview/ownership status. |

The reference's side Trim/camera decoration is represented by functional response and QR controls. No physical motor trim or camera recording is implied. The top-right STOP stays visible. Each action keeps a 44 CSS-pixel touch height; the two rings remain circular down to 488×227 landscape. Native Android enters immersive mode; swipe gestures can reveal Android system navigation. Cutout and keyboard insets remain handled once by MainActivity.

## Regression fixed during the UI audit

`onTelemetry` targeted `flightAppliedControls`, but that element was absent from the production HTML. Peer callbacks caught the exception, so joystick ACK and periodic control rendering continued while the detailed telemetry display stopped updating. The cockpit now contains the element. The real encrypted browser WebRTC test requires visible RPM, receiver-applied ARM text and an applied attitude source; unit/geometry tests alone do not prove this feedback path.

## Release and evidence

Android versionCode 13 / versionName 1.6.2-flight-training retains package `in.zebjus.dronelab.companion` and the permanent release certificate. The signed verifier requires version13 and an increase above the currently published APK 12. Native CI installs 12, upgrades in place to 13, checks retained preferences, OS multitouch, immersive system bars, circular geometry, CONNECT, all three response profiles, menu, STOP and lifecycle behavior at 16:9/19.5:9 in both orientations. The baseline preference sentinel is a fixed string; its historical name does not identify the installed baseline version.

Local browser screenshots use file-routed resources for layout/OS-pointer preview and cannot establish network ICE or camera performance. CI repeats actual HTTP/DTLS/SCTP WebRTC. Review/main workflow links and publication hash are recorded in the PR once observed. Mandatory exact-source checks and available native acceptance must pass before stable APK publication.

Eight browser viewport cases include 488×227/595×227 with visible navigation and 488×275/595×275 in immersive native density. Initial native acceptance captured Android's first-launch “Viewing full screen / Got it” tutorial: the active package was `android`, the app had no window focus and the WebView received no pointer events. Instrumentation identifies that exact OS tutorial throughout the bounded window-focus wait and taps its button using real MotionEvents before requiring stable cockpit focus. It does not disable the tutorial, fabricate WebView input or relax the independent-pointer assertions. Lifecycle acceptance presses Android HOME while holding the stick, resumes the existing activity and requires neutral sticks plus resumed animation frames. Foreground screenshots are captured before instrumentation closes the activity; they cover all four completed native cases. Display size changes occur while the app is stopped, without an extra screenshot-only relaunch.

Physical handset native-WebView-to-Web RTC, autofocus/radio/OEM behavior, 120-Hz performance and perceived audio comfort remain UNVERIFIED. Follow DEVICE_ACCEPTANCE.md for those results. This change preserves the single Flight Training receiver and plant, firmware, assembly, wiring and Python labs; no AP/STA or real motor control is introduced.

Native wide-screen acceptance also identified Android selecting the BACK button label and opening a text-selection toolbar. Touch actions now prevent label selection and their context menu; manual pairing textarea/code text remains selectable. Both native and browser acceptance hold BACK beyond the long-press threshold and require the sheet to close without selecting text.

The protected HOME key and activity return use Android's shell input/activity services on API 35; the test requires actual loss/restoration of window focus. Thumb inputs remain real touchscreen MotionEvents. No JavaScript input surrogate or direct Activity callback invocation substitutes for the native checks.

CI boots two fresh named AVDs, one per aspect ratio, and repeats APK12→13 installation/data retention plus forward/reverse native input in each. Both emulator steps must succeed before the mandatory release gate. This avoids the observed emulator 37.2.12 connection loss when changing the two display sizes in one running virtual device; it does not omit the wider-screen cases. Snapshot save/load is disabled for these disposable test devices.

Physical LCD width/height/density are written to each disposable AVD before boot, and acceptance checks the reported physical size. The running emulator is never resized; emulator 37.2.12 also lost connection when applying the wider runtime override on a fresh device. The four native assertions/foreground captures remain required. AVD configuration follows Android's documented override of hardware-profile properties: https://developer.android.com/studio/run/managing-avds .

Android immersive API guidance: https://developer.android.com/develop/ui/views/layout/immersive

The integration preserves main's WebApp 1.6.3 shared PID shell and persistent connection settings. APK 1.6.2/versionCode 13 is an independent Android version. Publication now also requires the shared PID shell WebRTC workflow for the exact source SHA, in addition to the original five browser/regression workflows and native signed-APK acceptance.

The integrated source also retains main's corrected inline-settings QR audit and embedded-PID offline-cache tests. Disposable API35 Google AVDs use 3 GiB RAM for the launcher/WebView/instrumentation workload; failure logcat is collected before stopping, including process crashes that bypass the Java assertion handler. These infrastructure settings do not alter the APK or reduce acceptance requirements.
