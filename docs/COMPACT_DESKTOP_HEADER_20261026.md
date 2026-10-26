# Compact desktop WebApp shell — 2026-10-26

The shared Assembly, Wiring, Python Lab, PID Tuning and Devices & Firmware
shell uses a 96px left navigation rail and a single 44px toolbar at desktop
widths of 1280px and above. Navigation and Shop move to the rail. Kit identity,
verified connection state, refresh, STA/AP, Web/RC/diagnostic status, input
selection, input mirror, mobile pairing, Undo/Redo, Save and Reset remain
visible in the toolbar. The collapsed Workspace & mobile controls disclosure
is removed. Narrow or zoomed windows flow naturally without hiding controls.

Input selection exposes the existing select and explicit confirmation button;
it retains same-Kit firmware readback, authorization, safe handover and simulator
stop checks. The actual RC state is displayed separately from the selected input.
The Android cockpit retains its existing shell, STOP and stick geometry.
Connection and input explanations have explicit Close buttons and Escape support.
Long Kit names retain their complete identity in the native title and connection
panel. The offline cache is advanced with the new shell.

The Devices workspace observes navigation height as well as toolbar height.
Python sticky execution controls exclude the vertical rail from their top
offset, so the rail cannot push Run/Stop over the editor or output controls.
Input and mobile status reserve stable widths across live state changes.
The Live Inputs test waits for actual fitted bounds after a viewport change;
its strict viewport, scroll reachability and read-only assertions remain intact.

Local Chromium checks cover the 44px/96px contract at 1280, 1294, 1366 and 1920px,
all five tabs, directly visible input controls, control non-overlap, popover bounds,
33 mirror-switch width/state combinations, 81 form/page viewport combinations,
49 placeholder measurements, AP/STA input availability, source confirmation,
Android PPM touch locks, independent RC/diagnostic access, simulator startup and
Run/Stop, and Live Inputs at 320–2048px including short-laptop scrolling.
The local browser harness serves local files through request interception;
it does not verify service workers or native WebRTC ICE. Those remain CI gates.
Physical A1/A2, handset, PPM loss and OTA acceptance is not claimed by this UI work.
