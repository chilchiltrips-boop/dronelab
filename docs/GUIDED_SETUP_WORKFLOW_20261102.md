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

The primary motor-test button toggles Start/Stop. Motor selection is locked while output is active. **Next motor** sends STOP and returns the pulse to 1000 µs before selecting the next output; it never starts the next motor automatically. A fresh explicit test confirmation remains required. The all-output checkbox stays synchronized with the menu. Each physical minimum remains an operator observation, not a measured RPM or an automatic calibration result.

The left task panel and larger right diagram use the same visual structure on every page and stack on small screens. The existing safety confirmations move to the current task without losing their checkbox state. Reduced-motion preferences stop decorative direction guides and geometry transitions. Keyboard users can select a stopped motor from the diagram; preview diagrams are noninteractive.

No firmware source, pin mapping, test deadline, authorization, ESC calibration sequence, Python API or Android package changes are required. The Motor Test diagram uses the saved board configuration; unsaved Wiring edits remain a preview. Changing expected direction does not reverse an ESC.

Browser regression covers X/+ geometry and node retention, direct Wiring/Test navigation, single/all selection, selection locking, primary Stop, STOP-before-next, minimum persistence, mobile widths, the existing input-monitor recovery and Python worker flow using a simulated A2. Actual motor direction, spin and minimum pulse still require physical observation with propellers removed.
