# Guided airframe and motor-output workflow

The user-provided configuration/output-calibration screenshots guide the interaction order. ZEBJUS keeps its own branding, colors and original SVG diagrams.

| Page | Controls | Companion visual |
| --- | --- | --- |
| Board | Verify the selected USB/AP/STA A2 and its capabilities | Controller connection diagram |
| Wiring | Select Quad X or Quad +, read the frame description, assign pins/directions, save and verify | The same four motor nodes morph between X and +; animated CW/CCW arrows are explicitly a configuration guide |
| Inputs | Read-only channels, receiver evidence and sample age | Existing stable stick/trace monitor; the PR #134 freshness separation is retained |
| ESC calibration | Battery disconnected confirmation, HIGH, LOW, success-tone observation | Existing endpoint pulse sequence and finite phase status |
| Motor test | Select a motor using the menu or diagram, or select all outputs; Start at 1000 µs, raise the slider, observe, Stop and save minimum pulses | Selected motors highlighted; rotation animation follows acknowledged test pulses only |
| Report | Review saved layout, operator observations and stored minimum pulses | Saved minimum-output summary |

The primary motor-test button toggles Start/Stop. **Save & next** replaces the native motor dropdown and cycles M1 → M2 → M3 → M4 → M1; All motors returns to M1. Save & next records a freshly confirmed spinning pulse (or uses the existing saved/recorded minimum), saves pending minima to the board and advances only after acknowledgement. All four motors must have recorded minima to advance from All motors. Save & next and the all-output checkbox remain available during a wizard test. They stop the current session, wait for STOP acknowledgement, reset the pulse to 1000 µs and only then change the selected output mask. Failed STOP keeps the previous selection. No selection action starts another test; Start still requires explicit confirmation. The diagram uses the same STOP-before-selection flow. Selection is locked while STOP is pending or another owner controls motor setup. Each physical minimum remains an operator observation, not a measured RPM or an automatic calibration result.

All six pages use compact, aligned task/visual cards and stack on small screens. Repeated guidance paragraphs and the frame-description card are removed. The three required output checks share a compact strip above the relevant pages. Minimum-pulse recording occupies a full-width row below the motor-test cards. Signal and firmware details remain collapsible. Reduced-motion preferences stop decorative direction guides and geometry transitions. Keyboard users can select a stopped motor from the diagram; preview diagrams are noninteractive.

No firmware source, pin mapping, test deadline, authorization, ESC calibration sequence, Python API or Android package changes are required. The Motor Test diagram uses the saved board configuration; unsaved Wiring edits remain a preview. Changing expected direction does not reverse an ESC.

Browser regression covers X/+ geometry and node retention, direct Wiring/Test navigation, complete Save & next cycling and per-motor minimum persistence, single/all selection during output, STOP acknowledgement delays and failure, primary Stop, STOP-before-next, minimum persistence, mobile widths, the existing input-monitor recovery and Python worker flow using a simulated A2. Actual motor direction, spin and minimum pulse still require physical observation with propellers removed.
