import test from 'node:test';
import assert from 'node:assert/strict';
import {appendFlightSample, buildFlightData} from '../js/flight-data-model.js';

const now = 100000;
const kitId = 'ZFC-A2-ABCDEF123456';
const bootId = 'a'.repeat(32);
function connected(overrides = {}) {
  const kit = {
    connected: true, linkVerified: true, linkState: 'connected', board: 'ZFC-A2',
    kitId, kitName: 'Bench A2', bootId, connectionGeneration: 1, transport: 'sta',
    version: '1.7.20', flightMode: 'acro',
    imu: {board: 'A2', state: 'READY', configValid: true, dataReady: true, imuValid: true,
      corrected: [0, 0.2, -0.1], accelG: [0, 0, 1], sampleSequence: 50, controlHealth: 'HEALTHY',
      controlTargetHz: 250, controlMeasuredHz: 249.9, controlDtUs: 4001, controlMaxDtUs: 120600,
      controlMissedTicks: 0, flightQualified: false, flightDeadlineFault: false, escPwmHz: 50},
    imuObservedAt: now - 50, imuSampleObservedAt: now - 50, imuTimingObservedAt: now - 50,
    imuSampleAgeAtObservationMs: 4,
    rcAccess: {pathVersion: 1, controlPath: 'PPM', stationary: true},
    ppm: {present: true, ageMs: 15}, ppmObservedAt: now - 50,
    rc: {kitId, source: 'PPM', active: true, inputArmed: true, inputValid: true,
      ageMs: 15, seq: 42, roll: 1500, pitch: 1520, throttle: 1000, yaw: 1500, accepted: 42,
      receiver: {sourceId: 1, sequence: 42, receivedAtMs: 1234, accepted: 42, generation: 0,
        availableMask: 31, valid: true, selected: true, inputArmed: true,
        channels: [1500, 1520, 1000, 1500, 1800, null, null, null]}},
    rcAt: now - 50, motorsDisabled: true, motorsArmed: false, outputObservedAt: now - 50,
    flight: {enabled: true, state: 'DISARMED', authorized: false, setupComplete: true, pidSaved: true},
    ...overrides
  };
  kit.telemetryRc = {rc: kit.rc, bootId: kit.bootId, observedAt: kit.rcAt};
  return kit;
}

test('verified A2 status keeps diagnostic arm, output, qualification and physical observations separate', () => {
  const data = buildFlightData(connected(), now);
  assert.deepEqual(data.rates, [0, 0.2, -0.1]);
  assert.deepEqual(data.accel, [0, 0, 1]);
  assert.equal(data.tilt.roll, 0);
  assert.equal(data.tilt.stationary, true);
  assert.equal(Math.abs(data.tilt.pitch), 0);
  assert.equal(data.imuAgeMs, 54);
  assert.equal(data.rc.inputArmed, true);
  assert.equal(data.output.armed, false);
  assert.equal(data.output.disabled, true);
  assert.deepEqual(data.rc.channels, [1500, 1520, 1000, 1500, 1800, null, null, null]);
  assert.equal(data.timing.targetHz, 250);
  assert.equal(data.timing.escPwmHz, 50);
  assert.equal(data.timing.missedTicks, 0);
  assert.equal(data.health.timing.state, 'good'); // A historical boot spike alone is not a live deadline fault.
  assert.equal(data.health.setup.state, 'good');
  assert.equal(data.health.qualification.state, 'warning');
  for (const key of ['attitude', 'heading', 'gps', 'altitude', 'speed', 'battery']) {
    assert.match(data.unsupported[key], /unavailable/);
  }
});

test('offline, unverified and retired boards expose no prior flight data', () => {
  for (const overrides of [{connected: false}, {linkVerified: false}, {board: 'ZFC-A1'}, {kitId: 'unknown'}]) {
    const data = buildFlightData(connected(overrides), now);
    assert.equal(data.connected, false);
    assert.equal(data.binding, null);
    assert.equal(data.rates, null);
    assert.equal(data.tilt, null);
    assert.equal(data.rc.channels, null);
    assert.equal(data.output.disabled, null);
    assert.ok(Object.values(data.health).every(row => row.state === 'unknown'));
  }
});

test('tilt requires a current gyro sample and a plausible gravity magnitude', () => {
  const fixture = connected();
  for (const overrides of [
    {imu: {...fixture.imu, accelG: [1, 1, 1]}},
    {imuSampleAgeAtObservationMs: 13},
    {imuSampleObservedAt: now + 1},
    {imuSampleObservedAt: now - 4000},
    {imu: {...fixture.imu, accelG: [0, Infinity, 1]}},
    {imu: {...fixture.imu, corrected: [NaN, 0, 0]}}
  ]) {
    assert.equal(buildFlightData(connected(overrides), now).tilt, null);
  }
  const tilted = buildFlightData(connected({imu: {...fixture.imu, accelG: [0, 0.6, 0.8]}}), now);
  assert.ok(Math.abs(tilted.tilt.roll - 36.8698976) < 1e-6);
  assert.equal(Math.abs(tilted.tilt.pitch), 0);
});

test('motion tilt follows disarmed AP/STA samples even with no active PPM input', () => {
  const fixture = connected();
  const overrides = {
    rcAccess: {...fixture.rcAccess, stationary: false},
    ppm: {present: false},
    rc: {source: 'NONE', active: false, inputArmed: false},
    imu: {...fixture.imu, accelG: [-0.8525, -0.3031, 0.4497], corrected: [4.6491, -2.7708, 1.5083]}
  };
  for (const transport of ['sta', 'ap']) {
    const data = buildFlightData(connected({...overrides, transport}), now);
    assert.equal(data.rc.state, 'waiting');
    assert.equal(data.tilt.stationary, false);
    assert.ok(Math.abs(data.tilt.roll + 34) < 0.1);
    assert.ok(Math.abs(data.tilt.pitch - 57.5) < 0.1);
  }
  // A current moving frame takes precedence over the maintenance quiet flag.
  const moving = buildFlightData(connected({...overrides, rcAccess: fixture.rcAccess}), now);
  assert.equal(moving.tilt.stationary, false);
});

test('motion tilt rejects stale output, armed outputs and non-direct transports', () => {
  const fixture = connected();
  const moving = {imu: {...fixture.imu, accelG: [0, 0.6, 0.8], corrected: [7, 0, 0]}};
  for (const overrides of [
    {transport: 'usb'}, {transport: 'android-relay'}, {linkState: 'delayed'},
    {outputObservedAt: now - 3200}, {motorsDisabled: false}, {motorsArmed: true}, {flight: null},
    {flight: {...fixture.flight, state: 'ARMED', authorized: true}}
  ]) {
    assert.equal(buildFlightData(connected({...moving, ...overrides}), now).tilt, null);
  }
});

test('delay keeps the last source label and expires data, without reporting a PPM failsafe', () => {
  const kit = connected();
  const normalCadence = buildFlightData(kit, now + 2200);
  assert.equal(normalCadence.rc.state, 'fresh');
  assert.equal(normalCadence.rc.ageMs, 2265);
  assert.equal(normalCadence.rc.boardAgeMs, 15);
  assert.equal(normalCadence.output.disabled, true);
  assert.equal(normalCadence.output.fresh, true);
  assert.equal(normalCadence.output.label, 'Output disabled');
  assert.equal(normalCadence.health.output.state, 'good');
  const recentDelay = buildFlightData(kit, now + 2800);
  assert.equal(recentDelay.rc.source, 'PPM');
  assert.equal(recentDelay.rc.state, 'delayed');
  assert.equal(recentDelay.health.input.state, 'warning');
  assert.equal(recentDelay.rc.ageMs, 2865);
  assert.notEqual(recentDelay.rc.channels, null);
  const stale = buildFlightData(kit, now + 4000);
  assert.equal(stale.rc.source, 'PPM');
  assert.equal(stale.rc.channels, null);
  assert.equal(stale.rates, null);
  assert.equal(stale.tilt, null);
  assert.equal(stale.timing.health, null);
  assert.equal(stale.output.disabled, null);
});

test('output display covers the network poll cycle and distinguishes delayed status from a reported fault', () => {
  const kit = connected();
  const delayed = buildFlightData(kit, now + 3000);
  assert.equal(delayed.output.fresh, false);
  assert.match(delayed.output.label, /Last observed · Output disabled/);
  assert.equal(delayed.health.output.state, 'warning');
  const linkDelayed = buildFlightData({...kit, linkState: 'delayed'}, now);
  assert.equal(linkDelayed.output.fresh, false);
  assert.equal(linkDelayed.health.output.state, 'warning');

  const failsafe = {...kit, flight: {...kit.flight, state: 'FAILSAFE', lastArmReason: 'IMU_STALE'}};
  assert.equal(buildFlightData(failsafe, now).health.output.state, 'error');
  const delayedFailsafe = buildFlightData(failsafe, now + 3000);
  assert.equal(delayedFailsafe.output.fresh, false);
  assert.equal(delayedFailsafe.health.output.state, 'error');
  assert.match(delayedFailsafe.output.label, /Last observed · Failsafe/);
  assert.match(delayedFailsafe.health.output.detail, /IMU_STALE/);
  assert.equal(buildFlightData(failsafe, now + 3500).health.output.state, 'unknown');
});

test('only explicit reported loss makes missing PPM red, and recovery replaces it', () => {
  const absent = {rc: {source: 'NONE', active: false}, ppm: {present: false}};
  const waiting = buildFlightData(connected(absent), now);
  assert.equal(waiting.health.input.state, 'warning');
  assert.equal(waiting.rc.state, 'waiting');
  const lost = buildFlightData(connected({...absent, rc: {...absent.rc, lastReleaseReason: 'PPM_SIGNAL_LOST'}}), now);
  assert.equal(lost.health.input.state, 'error');
  assert.equal(lost.rc.state, 'lost');
  assert.equal(lost.rc.inputArmed, false);
  const recovered = buildFlightData(connected(), now);
  assert.equal(recovered.health.input.state, 'good');
  assert.equal(recovered.rc.state, 'fresh');
});

test('AUTO with no PPM frames displays waiting without a receiver fault or output warning', () => {
  const kit = connected();
  const data = buildFlightData(connected({
    rcAccess: {...kit.rcAccess, controlPath: 'AUTO'},
    rc: {source: 'NONE', claimed: false, active: false, inputArmed: false, failsafe: true, lastReleaseReason: 'NONE'},
    ppm: {present: false}
  }), now);
  assert.equal(data.rc.state, 'waiting');
  assert.equal(data.rc.channels, null);
  assert.equal(data.health.input.label, 'PPM no signal');
  assert.equal(data.health.input.state, 'warning');
  assert.equal(data.health.output.state, 'good');
});

test('IMU, deadline, and flight failsafe use reported faults and never invent values', () => {
  const fixture = connected();
  const data = buildFlightData(connected({
    imu: {...fixture.imu, state: 'FAILED', dataReady: false, flightDeadlineFault: true, controlHealth: 'LATE'},
    flight: {...fixture.flight, state: 'FAILSAFE', lastArmReason: 'IMU_STALE'}
  }), now);
  assert.equal(data.rates, null);
  assert.equal(data.health.imu.state, 'error');
  assert.equal(data.health.timing.state, 'error');
  assert.equal(data.health.output.state, 'error');
  assert.equal(data.health.output.detail, 'IMU_STALE');
  const empty = buildFlightData(connected({imu: null, flight: null, rc: null, motorsDisabled: null}), now);
  assert.equal(empty.timing.measuredHz, null);
  assert.equal(empty.timing.missedTicks, null);
  assert.equal(empty.health.qualification.state, 'unknown');
  assert.equal(empty.output.disabled, null);
});

test('USB rates are available without tilt or driver OFF ACK, and bench status uses explicit compact flags', () => {
  const fixture = connected();
  const usb = connected({transport: 'usb', bootId: '', imu: {...fixture.imu, flightQualified: undefined},
    usbStatus: {kitId, rc: {...fixture.rc, motorsArmed: false, motorsDisabled: true}},
    usbStatusObservedAt: now - 60, usbStatusOutputExplicit: true});
  const current = buildFlightData(usb, now);
  assert.deepEqual(current.rates, [0, 0.2, -0.1]);
  assert.equal(current.tilt, null);
  assert.equal(current.accel, null);
  assert.equal(current.output.disabled, null);
  assert.equal(current.flight, null);
  assert.equal(current.health.qualification.state, 'unknown');
  assert.equal(current.rc.ageMs, 75);
  assert.equal(current.rc.inputArmed, true);
  const lost = buildFlightData({...usb, ppm: {present: false, signalLost: true, observedAt: now - 10}}, now);
  assert.equal(lost.rc.state, 'lost');
  assert.equal(lost.rc.inputArmed, false);
  assert.equal(lost.rc.channels, null);
  const legacy = buildFlightData({...usb, usbStatusOutputExplicit: false, rc: {...usb.rc, seq: 43}}, now);
  assert.equal(legacy.output.disabled, null);
  assert.equal(legacy.rc.ageMs, 75);
  const bench = buildFlightData({...usb, usbStatus: {kitId, rc: {...usb.usbStatus.rc, motorsDisabled: false}}}, now);
  assert.equal(bench.output.disabled, null);
  assert.match(bench.output.label, /Bench output active/);
  const delayedBench = buildFlightData({...usb, usbStatus: {kitId, rc: {...usb.usbStatus.rc, motorsDisabled: false}}}, now + 1500);
  assert.equal(delayedBench.output.fresh, false);
  assert.match(delayedBench.output.label, /Last observed · Bench output active/);
  // Timing reports must not renew old measured gyro rates.
  const stale = buildFlightData({...usb, imuSampleObservedAt: now - 3000}, now);
  assert.equal(stale.rates, null);
  assert.equal(stale.health.timing.state, 'good');
});

test('network flight authorization is independent of bench arm and a missing OFF ACK is ambiguous', () => {
  const fixture = connected();
  const unknown = buildFlightData({...fixture, motorsDisabled: false}, now);
  assert.match(unknown.output.label, /OFF unconfirmed/);
  const armed = buildFlightData({...fixture, motorsDisabled: false,
    flight: {...fixture.flight, state: 'ARMED', authorized: true}}, now);
  assert.equal(armed.output.armed, true);
  assert.match(armed.output.label, /Acro flight armed/);
});

test('network reads ignore local echoes and RC observations from a prior boot', () => {
  const kit = connected();
  const local = buildFlightData({...kit, rc: {...kit.rc, seq: 1234, roll: 2000}}, now);
  assert.equal(local.rc.sequence, 42);
  assert.equal(local.rc.channels[0], 1500);
  const old = buildFlightData({...kit, bootId: 'b'.repeat(32)}, now);
  assert.equal(old.rc.channels, null);
  assert.equal(old.rc.sequence, null);
});

test('chart history is bounded, rejects duplicates/reordering, and clears on source or boot change', () => {
  const kit = connected();
  const observation = (sequence, at, overrides = {}) => buildFlightData({
    ...kit, ...overrides, imuSampleObservedAt: at, imu: {...kit.imu, sampleSequence: sequence}
  }, now);
  const first = observation(10, now - 100);
  const next = observation(11, now - 80);
  let samples = appendFlightSample([], first, 2);
  assert.equal(appendFlightSample(samples, observation(10, now - 90), 2), samples);
  samples = appendFlightSample(samples, next, 2);
  assert.equal(appendFlightSample(samples, observation(9, now - 70), 2), samples);
  samples = appendFlightSample(samples, observation(12, now - 60), 2);
  assert.deepEqual(samples.map(row => row.sequence), [11, 12]);
  const source = observation(12, now - 60, {rcAccess: {pathVersion: 1, controlPath: 'WEB_STA', stationary: true}});
  assert.deepEqual(appendFlightSample(samples, source, 2), [source.sample]);
  const reboot = observation(1, now - 50, {bootId: 'b'.repeat(32)});
  assert.deepEqual(appendFlightSample(samples, reboot, 2), [reboot.sample]);
  const disconnected = buildFlightData(connected({connected: false}), now);
  assert.deepEqual(appendFlightSample(samples, disconnected, 2), []);
});
