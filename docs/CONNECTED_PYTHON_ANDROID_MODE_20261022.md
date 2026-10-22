# Connected Python target and Android simulator mode

Baseline: production `f47585dd4d0eed7b2c58927b29696b2839529a4b` / WebApp 1.8.1+432. This WebApp follow-up changes the mode and Python selection behavior introduced in PR #112. Firmware and Android binaries are unchanged.

## Confirmed findings and resulting behavior

- The Python selector stayed on its default **Python 3 / Simulator** after a Kit connected. The supplied screenshot shows this isolated target selected for an LED program. Adding a manual Auto option did not meet the requested automatic detection. The idle Python UI now selects the verified **currently selected connection** (USB, AP, STA or Relay) without a manual Auto option. It does not prefer an incidental open USB port over the selected AP/STA Kit.
- Explicit Python Simulator selection remains isolated, and explicit hardware overrides remain available. Hardware examples restore connected-Kit detection. A running program or live LED session stays bound to its original Device ID and transport; reconnection cannot silently redirect it. Automatically detected Relay remains read-only. Autosave no longer overwrites RUNNING with SAVED.
- The simulator deliberately ignored connected Kit mode changes and showed them only as metadata. It now follows a changed, authenticated Kit **SAVED** selection for the chosen remote input, including while Run is active. Android's saved choice can be PENDING until physical input disarms; the virtual plant applies it immediately while the separate Kit ACTIVE/SAVED/PENDING display remains truthful. No physical mode/ARM/STOP/write request is added. Manual virtual mode edits remain possible until the next remote selection changes. A locked WebApp input ignores unrelated Android arrivals.
- During connection, authenticated host identity could be missed when the current selection was empty and credentials matched an earlier Kit. The verified admin host-to-Device-ID mapping now takes precedence over credential lookup. The browser regression deliberately exercises A1 and A2 with the same fixture credential to ensure identity comes from the verified board/host, not a shared secret.

AP and STA use the same allowlisted authenticated LED command endpoint. The supplied image does not include an AP command error, so a physical AP-specific radio failure is not established. The default isolated-target problem is fixed, and a new end-to-end test executes the actual Python blink example through production Classroom connection, bound network requests and the independent LED queue for all four A1/AP, A1/STA, A2/AP and A2/STA cases. Device authentication replies are explicit doubles. It checks ON/OFF/STOP, automatic target selection, exact Device ID/transport, retained explicit isolation and zero RC ownership writes.

## Verification

```sh
npm test
npm run check
npm run verify:firmware
# With the workflow's Playwright and an HTTP server on port 8765:
node tools/python-connected-led-browser.mjs
node tools/python-auto-browser.mjs
node tools/python-browser-smoke.mjs
node tools/tripod-ap-mirror-browser.mjs
node tools/authoritative-status-browser.mjs
node tools/full-page-input-fit-browser.mjs
```

The Smart Kit Setup/Python workflow includes the new connected LED browser test and uploads screenshots/evidence. Mode regressions cover high-throttle Run, a saved change pending on physical firmware, manual virtual overrides and no hardware writes. Existing identity, session-loss, independent LED health, failsafe and firmware compilation checks remain enabled.

Physical acceptance remains 18 NOT_RUN. Real A1/A2 AP/STA radio timing, handset behavior, PPM loss and interrupted OTA require boards and phones. Browser doubles and compilation are not recorded as hardware PASS.
