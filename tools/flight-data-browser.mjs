import assert from 'node:assert/strict';

// Feed a verified-link fixture through the existing read-only state boundary.
// Real hardware, firmware loop, and physical flight remain separate tests.
export async function testFlightData(page, width) {
  const telemetry = page.locator('#tab-telemetry');
  const nav = page.locator('[data-tab="telemetry"]');
  await nav.click();
  assert.equal(await nav.getAttribute('aria-selected'), 'true');
  assert.equal(await telemetry.locator('#fd-link').getAttribute('data-tone'), 'unknown');
  assert.match(await telemetry.locator('.fd-navigation').innerText(), /GPS position\s+Unavailable/);
  assert.equal(await telemetry.locator('#fd-rate-roll').textContent(), '—');

  const preview = telemetry.locator('[data-vehicle-preview]');
  await preview.click();
  assert.equal(await preview.getAttribute('aria-pressed'), 'true');
  assert.match(await telemetry.locator('[data-vehicle-caption]').textContent(), /preview/i);
  await telemetry.locator('[data-vehicle-right]').click();
  await preview.click();

  await page.evaluate(() => {
    const now = Date.now();
    const snapshot = {
      connected: true, linkVerified: true, linkState: 'connected', transport: 'sta',
      kitName: 'Test A2', kitId: 'ZFC-A2-112233445566', board: 'ZFC-A2',
      bootId: 'boot-1', connectionGeneration: 1, version: '1.7.20',
      rcAccess: {stationary: true, pathVersion: 1, controlPath: 'PPM'},
      rc: {source: 'PPM', active: true, inputArmed: true, ageMs: 10, seq: 23,
        roll: 1502, pitch: 1498, throttle: 1004, yaw: 1500},
      rcAt: now, motorsDisabled: true, motorsArmed: false, outputObservedAt: now,
      flight: {state: 'DISARMED', enabled: true, authorized: false, qualified: false, setupComplete: true, pidSaved: true},
      imu: {board: 'A2', state: 'READY', configValid: true, dataReady: true, imuValid: true,
        corrected: [1, -2, 0.5], accelG: [0, 0.1, 0.99], sampleSequence: 1,
        controlHealth: 'HEALTHY', controlTargetHz: 250, controlMeasuredHz: 249.9,
        controlDtUs: 4000, flightDeadlineFault: false, flightQualified: false},
      imuObservedAt: now, imuSampleObservedAt: now, imuSampleAgeAtObservationMs: 4,
      imuTimingObservedAt: now
    };
    snapshot.telemetryRc = {rc: snapshot.rc, observedAt: now, bootId: snapshot.bootId};
    window.__flightDataFixture = snapshot;
    window.__flightDataGetState = window.ZebjusKits.getState;
    window.ZebjusKits.getState = () => snapshot;
    dispatchEvent(new CustomEvent('dronelab:kit-link'));
  });
  try {
    await page.waitForFunction(() => document.querySelector('#fd-rate-roll').textContent === '1.0 °/s');
    assert.equal(await telemetry.locator('#fd-kit').textContent(), 'Test A2');
    assert.equal(await telemetry.locator('#fd-input').textContent(), 'Input armed');
    assert.equal(await telemetry.locator('#fd-flight').textContent(), 'Flight disarmed');
    assert.equal(await telemetry.locator('[data-health="setup"] .fd-pill').getAttribute('data-tone'), 'good');
    assert.equal(await telemetry.locator('[data-health="qualification"] .fd-pill').getAttribute('data-tone'), 'warning');
    assert.equal(await telemetry.locator('#fd-horizon-world').getAttribute('visibility'), 'visible');
    await page.evaluate(() => {
      const snapshot = window.__flightDataFixture;
      snapshot.imuSampleObservedAt = Math.max(Date.now(), snapshot.imuSampleObservedAt + 1);
      snapshot.imu.sampleSequence++;
      snapshot.imu.corrected = [2, 1, -0.5];
    });
    await page.waitForFunction(() => document.querySelector('#fd-line-roll').getAttribute('points').split(' ').length === 2);
    await page.screenshot({path: `test-output/v2/flight-data-${width}.png`, fullPage: true});
    assert.ok(await telemetry.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'Flight Data fits the viewport');

    await page.evaluate(() => {
      const snapshot = window.__flightDataFixture;
      snapshot.imu.flightDeadlineFault = true;
      snapshot.imuTimingObservedAt = Date.now();
      snapshot.flight.state = 'FAILSAFE';
      snapshot.outputObservedAt = Date.now();
      snapshot.imuSampleObservedAt -= 10000;
    });
    await page.waitForFunction(() => document.querySelector('[data-health="timing"] .fd-pill').dataset.tone === 'error');
    assert.equal(await telemetry.locator('[data-health="output"] .fd-pill').getAttribute('data-tone'), 'error');
    assert.equal(await telemetry.locator('#fd-rate-roll').textContent(), '—');
    assert.equal(await telemetry.locator('#fd-horizon-world').getAttribute('visibility'), 'hidden');
    assert.equal(await telemetry.locator('#fd-line-roll').getAttribute('points'), '');
  } finally {
    await page.evaluate(() => {
      window.ZebjusKits.getState = window.__flightDataGetState;
      dispatchEvent(new CustomEvent('dronelab:kit-link'));
    });
  }

  await telemetry.locator('#fd-setup').click();
  assert.equal(await page.locator('[data-tab="setup"]').getAttribute('aria-selected'), 'true');
  await nav.click();
  await telemetry.locator('#fd-diagnostics').click();
  assert.equal(await page.locator('#dw-tab-diagnostics').getAttribute('aria-selected'), 'true');
  await page.goto('http://127.0.0.1:8765/lab.html#telemetry');
  await page.waitForFunction(() => document.querySelector('#tab-telemetry').classList.contains('active'));
  assert.equal(await page.locator('[data-tab="telemetry"]').getAttribute('aria-selected'), 'true');
  console.log('PASS Flight Data verified snapshot, faults, stale data and navigation', width);
}
