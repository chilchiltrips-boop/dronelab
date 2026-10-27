# Android 1.8.17 layout corrections

Android versionCode 55 keeps the existing application ID and pinned production certificate. WebApp v1.12 serves the same corrected companion layout. FlightCore 1.5.12 is unchanged.

## Behavior

- QR, response and LED actions occupy a separate grid column outside the right joystick's touch region. At landscape heights of 300 CSS pixels or less, the rail uses two rows of 44-pixel actions, keeping LED above the telemetry footer.
- Back remains outside the scrolling category list. Pair/Kit/Wi-Fi/Control/More scroll below it; keyboard navigation reveals the focused category.
- The existing listener-bound controls, native bridge, input ownership, firmware acknowledgement and STOP behavior remain in place.

## Verification

The browser checks cover ten landscape viewports from 488×227 through 1080×480 and five menu viewports, including portrait fallback. They assert utility/joystick separation, utility hit sizes and footer bounds, category hit testing after scrolling, and keyboard Home visibility. Existing pointer capture, independent multi-touch, CANCEL, third-finger STOP and direct AP tests remain required.

Production-signed native instrumentation additionally checks utility separation and the category scroll area below Back, alongside the existing upgrade, two landscape directions, OS background/resume and API30 networking release gates. The publication workflow retains all eight mandatory exact-source checks and the stable signer verification. This review branch is added explicitly to those workflows and to signed native review conditions; publication remains main-only.

Physical A1/A2, real-handset radio, PPM-loss and interrupted-OTA acceptance remain NOT_RUN until actual hardware evidence is recorded.
