import assert from 'node:assert/strict';

// Feed a verified-link fixture through the existing read-only state boundary.
// Real hardware, firmware loop, and physical flight remain separate tests.
export async function testFlightData(page, width) {
  const telemetry = page.locator('#tab-telemetry');
  const nav = page.locator('[data-tab="telemetry"]');
  await nav.click();
  assert.equal(await nav.getAttribute('aria-selected'), 'true');
  assert.equal(await telemetry.locator('#fd-link').getAttribute('data-tone'), 'unknown');
  await telemetry.locator('.fd-map-canvas image').waitFor({state: 'attached'});
  assert.match(await telemetry.locator('.fd-map-footer').innerText(), /No GPS/);
  const mapAsset = await page.evaluate(async () => {
    const image = new Image();
    image.src = document.querySelector('.fd-map-canvas image').getAttribute('href');
    await image.decode();
    return image.naturalWidth;
  });
  assert.ok(mapAsset > 0, 'Offline map SVG decodes');
  const bounds = await telemetry.locator('.fd-cockpit').evaluate(element => {
    const rect = selector => element.querySelector(selector).getBoundingClientRect().toJSON();
    return {pfd: rect('#fd-pfd'), map: rect('#fd-map'), vehicle: rect('#fd-vehicle'),
      health: rect('#fd-health'), left: rect('.fd-instruments')};
  });
  const {pfd, map, vehicle, health, left} = bounds;
  assert.ok(Math.abs(vehicle.top - health.top) < 1 && vehicle.right <= health.left);
  assert.ok(pfd.bottom <= vehicle.top, 'Instruments sit above the vehicle and health tray');
  if (width > 680) {
    assert.ok(left.right <= map.left && Math.abs(pfd.top - map.top) < 1);
    assert.ok(Math.abs(left.bottom - map.bottom) < 1, 'Map spans both left rows');
    assert.ok(Math.abs(left.width / (left.width + map.width) - 0.44) < 0.01);
  } else {
    assert.ok(left.bottom <= map.top && Math.abs(left.width - map.width) < 1);
  }
  const mapCanvas = telemetry.locator('.fd-map-canvas');
  const overview = await mapCanvas.getAttribute('viewBox');
  await telemetry.locator('[data-map-zoom-in]').click();
  assert.notEqual(await mapCanvas.getAttribute('viewBox'), overview);
  await telemetry.locator('[data-map-reset]').click();
  assert.equal(await mapCanvas.getAttribute('viewBox'), overview);
  const detailsToggle = telemetry.locator('#fd-details-toggle');
  assert.equal(await detailsToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(await telemetry.locator('#fd-details').isVisible(), false);
  await detailsToggle.click();
  assert.equal(await telemetry.locator('#fd-details').isVisible(), true);
  await detailsToggle.click();
  assert.equal(await telemetry.locator('#fd-details').isVisible(), false);
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
    assert.equal(await telemetry.locator('[data-health="setup"]').getAttribute('data-tone'), 'good');
    assert.equal(await telemetry.locator('[data-health="qualification"]').getAttribute('data-tone'), 'warning');
    assert.equal(await telemetry.locator('#fd-horizon-world').getAttribute('visibility'), 'visible');
    await page.evaluate(() => {
      const snapshot = window.__flightDataFixture;
      snapshot.imuSampleObservedAt = Math.max(Date.now(), snapshot.imuSampleObservedAt + 1);
      snapshot.imu.sampleSequence++;
      snapshot.imu.corrected = [2, 1, -0.5];
    });
    await page.waitForFunction(() => document.querySelector('#fd-line-roll').getAttribute('points').split(' ').length === 2);
    await telemetry.locator('.fd-window').screenshot({path: `test-output/v2/flight-data-${width}.png`});
    assert.ok(await telemetry.evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'Flight Data fits the viewport');

    const previousHorizon = await telemetry.locator('#fd-horizon-world').getAttribute('transform');
    await page.evaluate(() => {
      const snapshot = window.__flightDataFixture;
      const now = Date.now();
      snapshot.outputObservedAt = now - 2200;
      snapshot.rcAccess = {...snapshot.rcAccess, stationary: false, controlPath: 'AUTO'};
      snapshot.telemetryRc = {
        rc: {source: 'NONE', claimed: false, active: false, inputArmed: false, failsafe: true},
        observedAt: now, bootId: snapshot.bootId
      };
      snapshot.ppm = {present: false, observedAt: now};
      snapshot.imuSampleObservedAt = now;
      snapshot.imu.sampleSequence++;
      snapshot.imu.corrected = [4.65, 0, 0];
      snapshot.imu.accelG = [-0.8525, -0.3031, 0.4497];
      dispatchEvent(new CustomEvent('dronelab:kit-link'));
    });
    assert.equal(await telemetry.locator('.fd-pfd-main').getAttribute('data-tilt'), 'accel-reference');
    await page.waitForFunction(previous => document.querySelector('#fd-horizon-world').getAttribute('transform') !== previous, previousHorizon);
    assert.match(await telemetry.locator('[data-vehicle-caption]').textContent(), /Accel reference/);
    assert.equal(await telemetry.locator('[data-pfd-status="input"]').textContent(), 'PPM WAIT');
    assert.equal(await telemetry.locator('[data-health="input"]').getAttribute('data-tone'), 'warning');
    assert.equal(await telemetry.locator('[data-health="output"]').getAttribute('data-tone'), 'good');
    assert.equal(await telemetry.locator('[data-pfd-status="output"]').textContent(), 'PWM OFF');

    await page.evaluate(() => {
      const snapshot = window.__flightDataFixture;
      snapshot.imu.flightDeadlineFault = true;
      snapshot.imuTimingObservedAt = Date.now();
      snapshot.flight.state = 'FAILSAFE';
      snapshot.outputObservedAt = Date.now();
      snapshot.imuSampleObservedAt -= 10000;
    });
    await page.waitForFunction(() => document.querySelector('[data-health="timing"]').dataset.tone === 'error');
    assert.equal(await telemetry.locator('[data-health="output"]').getAttribute('data-tone'), 'error');
    assert.equal(await telemetry.locator('#fd-rate-roll').textContent(), '—');
    assert.equal(await telemetry.locator('#fd-horizon-world').getAttribute('visibility'), 'hidden');
    assert.equal(await telemetry.locator('#fd-line-roll').getAttribute('points'), '');
    // New compact firmware: the transmitter may be OFF while fused tilt remains live.
    await page.evaluate(() => {
      const k=window.__flightDataFixture;
      const update=(roll,sequence,overrides={}) => {
        const now=Date.now();
        const sample={version:1,kitId:k.kitId,bootId:k.bootId,sequence,sampleSequence:sequence,atUs:sequence*4000,ageUs:3000,
          valid:true,rates:[1,2,3],gravity:[0,0,1],attitude:[roll,-12],attitudeValid:true,levelCalibrated:true,accelUsed:true,
          offAck:true,authorized:false,deadlineFault:false,owner:0,state:'DISARMED',reason:'NONE',applied:[0,0,0,0],
          dtUs:4000,measuredHz:250,missedTicks:0,flightModeState:{supported:true,saved:'angle',active:'angle',pending:null},...overrides};
        k.flightTelemetry=window.ZebjusFlightTelemetry.normalize(sample,k,k.flightTelemetry,now,20);
        dispatchEvent(new CustomEvent('dronelab:flight-telemetry'));
      };
      window.__setFusedTilt=update;update(0,100);
    });
    assert.equal(await telemetry.locator('.fd-pfd-main').getAttribute('data-tilt'), 'fc-attitude');
    assert.equal(await telemetry.locator('[data-pfd-status="mode"]').textContent(), 'ANGLE');
    assert.match(await telemetry.locator('[data-pfd-status="mode"]').getAttribute('title'), /saved angle/);
    assert.equal(await telemetry.locator('[data-health="output"]').getAttribute('data-tone'), 'good');
    for(let n=1;n<=6;n++){
      await page.evaluate(n=>window.__setFusedTilt(n*5,100+n),n);
      await page.waitForTimeout(100); // one actual 10Hz observation, display interpolates at RAF cadence
    }
    assert.equal(await telemetry.locator('#fd-roll').textContent(), '30.0°');
    assert.match(await telemetry.locator('[data-vehicle-caption]').textContent(), /FC attitude/);
    await telemetry.locator('.fd-window').screenshot({path:`test-output/v2/flight-data-fused-${width}.png`});
    await page.evaluate(()=>{window.__flightDataFixture.flightTelemetry.sampleObservedAt-=1000;dispatchEvent(new CustomEvent('dronelab:flight-telemetry'));});
    assert.equal(await telemetry.locator('.fd-pfd-main').getAttribute('data-tilt'),'monitor-delayed');
    assert.match(await telemetry.locator('[data-pfd-tilt-label]').textContent(),/MONITOR DELAYED/);
    assert.equal(await telemetry.locator('#fd-roll').textContent(),'30.0°');
    assert.equal(await telemetry.locator('#fd-rate-roll').textContent(),'—');
    assert.match(await telemetry.locator('[data-vehicle-caption]').textContent(),/Monitor delayed/);
    await page.evaluate(()=>{window.__flightDataFixture.flightTelemetry.sampleObservedAt-=1200;dispatchEvent(new CustomEvent('dronelab:flight-telemetry'));});
    assert.equal(await telemetry.locator('#fd-horizon-world').getAttribute('visibility'),'hidden');
    await page.evaluate(()=>window.__setFusedTilt(35,107));
    assert.equal(await telemetry.locator('.fd-pfd-main').getAttribute('data-tilt'),'fc-attitude');
    await page.evaluate(()=>window.__setFusedTilt(0,108,{attitudeValid:false,state:'FAILSAFE',reason:'ATTITUDE_INVALID'}));
    assert.equal(await telemetry.locator('#fd-horizon-world').getAttribute('visibility'),'hidden');
    assert.match(await telemetry.locator('#fd-output').textContent(),/ATTITUDE_INVALID/);

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
  console.log('PASS Flight Data cockpit layout, map, verified snapshot, faults, stale data and navigation', width);
}
