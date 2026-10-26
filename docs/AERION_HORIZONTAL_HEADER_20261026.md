# ZEBJUS Aerion header — 2026-10-27

The shared WebApp header has a 56px control row and a 48px centered navigation
row (104px total on desktop). Brand, inline Kit name/status, STA/AP, input
selection/confirmation, actual RC state, Input mirror, mobile pairing,
Web/RC/diagnostic status and File stay in the top row. Only Assembly, Wiring,
Python Lab, PID Tuning, Devices & Firmware and Shop occupy the lower row.
Shop is an ordinary labeled navigation link to the configured store, opening
in a new tab; the previous top-row Shop arrow link is removed.

The two navy surfaces, fading divider and subtle lower shadow distinguish the
header from the workspace. Controls have 12px vertical breathing room; larger
navigation buttons have hover, pressed, persistent selection and keyboard focus
states. Motion respects the reduced-motion preference. Equal side insets are
24px from 1360px and 20px in smaller desktop windows.

At 1280px and above all controls fit without horizontal scrolling. From
736–1279px the control row scrolls horizontally at readable sizes; the centered
navigation row and page do not scroll sideways. Keyboard focus reveals controls,
and File/connection/input popovers escape the scrolling row using viewport
positioning. Narrower windows retain the existing natural-flow fallback.

File still opens Save, Undo, Redo and Reset vertically over the workspace.
Existing action handlers, undo history and storage identity are retained.
Keyboard arrows, Escape and outside-click dismissal work, including after
scrolling the control row. The shell and pairing/input nodes persist across
all five application pages. This release displays v1.11; subsequent releases
advance the minor integer (v1.12, v1.13). Build metadata remains separate.

Browser verification covers desktop breakpoints, edge/vertical spacing,
centered navigation, six navigation items including Shop, control reachability,
popover clipping, status stability, File actions, mirror geometry, form fit,
Live Inputs scrolling, Python, source confirmation, WebRTC and offline use.
Installed Android package inputs are unchanged. Physical A1/A2, handset,
PPM loss and OTA acceptance are not claimed by this visual update.
