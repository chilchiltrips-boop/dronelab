# ZEBJUS Aerion horizontal header — 2026-10-26

The shared WebApp header returns to horizontal navigation. On desktop widths
from 736px, it occupies two 32px rows (64px total). Brand, Kit name and connection status,
STA/AP, input selection/confirmation, actual RC state, Input mirror and mobile
pairing occupy the first row in that order. Kit name and status share one line.
Larger left-aligned page tabs, independent Web/RC/diagnostic status, File and
Shop occupy the second row. Desktop edge padding is 24px on both sides, 16px
from 1000–1279px and 12px in compact 736–999px windows. Controls have fixed
space for changing status text and no expanding gap between groups. Tabs have
hover, pressed, persistent selected and keyboard focus states. There is no navigation rail or third controls
row. Narrow windows retain a natural flow; touch targets retain their fallback.

File opens Save, Undo, Redo and Reset vertically over the workspace without
increasing header height. These are the existing controls and project handlers,
including the existing Undo history and project storage key. Keyboard arrows,
Escape and outside-click dismissal work. Undo/Redo can disable their own buttons
during execution; the admitted click still closes the menu correctly.

The shared brand and document title become ZEBJUS Aerion. The header displays
only v1.10. Subsequent main updates advance the minor integer to v1.11, v1.12,
and so on. Build number, source commit and publication time remain separate
metadata. An explicit release change is preserved and retrying the same source
does not increment twice. APK publication paths and version-stamp commits do
not create additional WebApp release increments.

Kit IDs, pairing sessions, authorization, source confirmation, motor control,
firmware versions and installed Android package inputs are unchanged. The native
Android flight shell is separate from this desktop WebApp header. The published
APK retention verifier reports that no package rebuild is needed.

Local Chromium checks cover two rows at 736, 768, 850, 1024, 1280, 1294, 1366 and
1920px, all connection/input/mobile controls remaining in row one, aligned edge insets,
left-to-right control order, inline Kit status, page selection/focus effects,
real File Save/Undo/Redo actions,
all five tabs, popover bounds, status-width stability, Input mirror geometry,
form fit, independent RC/diagnostic access, source selection/confirmation,
Android PPM touch locks, Live Inputs scrolling and the full Python IDE/runtime
smoke. Native WebRTC ICE and service-worker coverage run in GitHub CI. Physical
A1/A2, handset, PPM loss and OTA acceptance is not claimed by this layout update.
