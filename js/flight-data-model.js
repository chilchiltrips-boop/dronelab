import {isOlderReceiverCounter, parseReceiverSnapshot, PPM_OBSERVATION_MS} from './input-monitor.js';

const usbObservationMs = 2500;
const outputObservationMs = 1500; // Same freshness window as the Hardware Center.
const firmwareImuAgeMs = 12;
const supportedTransports = ['usb', 'ap', 'sta', 'android-relay'];
const controllerSources = ['PPM', 'WEB', 'ANDROID'];
const controlPaths = ['AUTO', 'PPM', 'ANDROID_AP', 'ANDROID_WEBRTC', 'WEB_STA'];
const unsupported = Object.freeze({
  attitude: 'Flight attitude is unavailable on A2.',
  heading: 'Heading is unavailable on A2.',
  gps: 'GPS position is unavailable on A2.',
  speed: 'Ground speed is unavailable on A2.',
  altitude: 'Altitude is unavailable on A2.',
  battery: 'Battery voltage is unavailable on A2.'
});

const counter = n => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;
const number = n => Number.isFinite(n) && n >= 0 ? n : null;
const pulse = n => Number.isInteger(n) && n >= 1000 && n <= 2000 ? n : null;
const bool = value => typeof value === 'boolean' ? value : null;
const reason = value => typeof value === 'string' && /^[A-Z_]{1,40}$/.test(value) ? value : null;
const healthRow = (state, label, detail = '') => ({state, label, detail});

function observationAge(at, now) {
  return Number.isFinite(at) && at > 0 && at <= now ? now - at : null;
}

function within(age, limit) {
  return age !== null && age <= limit;
}

function vector(value, limit) {
  return Array.isArray(value) && value.length === 3 &&
    value.every(n => Number.isFinite(n) && Math.abs(n) <= limit) ? [...value] : null;
}

function inputSnapshot(kit, connected, now) {
  const path = kit.rcAccess?.controlPath;
  const selectedPath = connected && kit.rcAccess?.pathVersion === 1 && controlPaths.includes(path) ? path : null;
  const usb = kit.transport === 'usb';
  const usbRc = usb && kit.usbStatus?.kitId === kit.kitId ? kit.usbStatus.rc : null;
  // USB compact state reports board age. Network charts only consume the
  // authenticated status/snapshot, never the preview command's local values.
  const observation = kit.telemetryRc?.bootId === kit.bootId ? kit.telemetryRc : null;
  const rc = connected ? (usb ? usbRc : observation?.rc) : null;
  const limit = usb ? usbObservationMs : PPM_OBSERVATION_MS;
  const observedAt = usb ? kit.usbStatusObservedAt : observation?.observedAt;
  const observationAgeMs = connected ? observationAge(observedAt, now) : null;
  const frame = parseReceiverSnapshot(rc);
  const source = controllerSources.includes(rc?.source) ? rc.source : null;
  const ppmObservedAt = kit.ppm?.observedAt ?? kit.ppmObservedAt;
  const ppmAge = observationAge(ppmObservedAt, now);
  const ppm = connected && within(ppmAge, PPM_OBSERVATION_MS) ? kit.ppm : null;
  const ppmPresent = bool(ppm?.present);
  const newPpmLoss = ppm?.signalLost === true && (!observedAt || ppmObservedAt >= observedAt);
  const active = source !== null && rc.active === true && rc.inputValid !== false &&
    rc.failsafe !== true && (!rc.receiver || frame?.valid === true) && !(source === 'PPM' && newPpmLoss);
  const boardAgeMs = number(rc?.ageMs);
  const ageMs = active && boardAgeMs !== null && observationAgeMs !== null ? boardAgeMs + observationAgeMs : null;
  const sequence = counter(frame?.sequence ?? rc?.seq) && active ? frame?.sequence ?? rc.seq : null;
  let channels = active && within(observationAgeMs, limit) ? [
    pulse(rc.roll), pulse(rc.pitch), pulse(rc.throttle), pulse(rc.yaw),
    null, null, null, null
  ] : null;
  if (frame?.valid && channels) channels = [...frame.channels];
  if (channels?.slice(0, 4).includes(null)) channels = null;
  const releaseReason = newPpmLoss ? 'PPM_SIGNAL_LOST'
    : within(observationAgeMs, limit) ? reason(rc?.lastReleaseReason) : null;
  const lost = releaseReason === 'PPM_SIGNAL_LOST' &&
    ppmPresent !== true && !active && [null, 'AUTO', 'PPM'].includes(selectedPath);
  let state = 'unknown';
  let health = healthRow('unknown', 'Input unconfirmed');
  if (lost) {
    state = 'lost';
    health = healthRow('error', 'PPM signal lost', 'FlightCore recorded receiver loss.');
  } else if (active && channels && within(boardAgeMs, source === 'PPM' ? 150 : 300) &&
    within(observationAgeMs, usb ? 1000 : 2500)) {
    state = 'fresh';
    health = healthRow('good', source + ' accepted', 'FlightCore reported a valid receiver frame in the latest observation.');
  } else if (active || observationAgeMs !== null && !within(observationAgeMs, limit)) {
    state = 'delayed';
    health = healthRow('warning', 'Input observation delayed', 'Browser observation age does not confirm receiver loss.');
  } else if (selectedPath === 'PPM' && ppmPresent === false) {
    state = 'waiting';
    health = healthRow('warning', 'PPM signal absent', 'Waiting for a physical receiver signal.');
  } else if (within(observationAgeMs, limit)) {
    state = 'idle';
    health = healthRow('unknown', 'No active input', 'FlightCore has no active accepted receiver frame.');
  }
  const inputArmed = lost || newPpmLoss && source === 'PPM' ? false
    : within(observationAgeMs, limit) ? bool(rc?.inputArmed) : null;
  return {
    rc: {selectedPath, source, state, ageMs, boardAgeMs, observationAgeMs, sequence, channels,
      inputArmed, releaseReason},
    health
  };
}

function outputSnapshot(kit, connected, now) {
  const usb = kit.transport === 'usb';
  const usbFlags = kit.usbStatusOutputExplicit === true && kit.usbStatus?.kitId === kit.kitId
    ? kit.usbStatus.rc : null;
  const observedAt = usb ? kit.usbStatusObservedAt : kit.outputObservedAt;
  const observedAgeMs = connected ? observationAge(observedAt, now) : null;
  const observed = within(observedAgeMs, usb ? usbObservationMs : PPM_OBSERVATION_MS);
  const fresh = within(observedAgeMs, outputObservationMs);
  const flight = observed && !usb ? kit.flight ?? null : null;
  const flags = usb ? usbFlags : kit;
  const benchArmed = observed ? bool(flags?.motorsArmed) : null;
  const flightArmed = flight?.state === 'ARMED' && flight.authorized === true;
  const armed = flightArmed ? true : benchArmed;
  // Compact USB fields describe the bench session. They omit both flight
  // ownership and the driver's PWM OFF acknowledgement.
  const disabled = observed && !usb ? bool(flags?.motorsDisabled) : null;
  let health = healthRow('unknown', 'Output unconfirmed', 'Waiting for a fresh FlightCore output status.');
  if (flight?.state === 'FAILSAFE') {
    health = healthRow('error', disabled ? 'Failsafe · output off' : 'Failsafe', reason(flight.lastArmReason) || '');
  } else if (armed === true && disabled === true) {
    health = healthRow('error', 'Conflicting output status', 'FlightCore reported simultaneous arm and output disabled.');
  } else if (flightArmed) {
    health = healthRow('warning', 'Rate flight armed', 'FlightCore reports flight output authorization.');
  } else if (benchArmed === true || usb && observed && usbFlags?.motorsDisabled === false) {
    health = healthRow('warning', 'Bench output active', 'FlightCore reports a bench output session. Motor rotation is unmeasured.');
  } else if (disabled === true) {
    health = healthRow('good', 'Output disabled', 'FlightCore reports PWM output disabled.');
  } else if (disabled === false) {
    health = healthRow('warning', 'Output OFF unconfirmed', 'FlightCore has not acknowledged that PWM is off.');
  }
  if (!fresh && health.state !== 'unknown') {
    health = healthRow('warning', 'Last observed · ' + health.label, 'Waiting for an updated FlightCore output status.');
  }
  return {output: {label: health.label, armed, disabled, fresh, observedAgeMs}, flight, health};
}

export function buildFlightData(kit = {}, now = Date.now()) {
  const connected = kit.connected === true && kit.linkVerified === true && kit.board === 'ZFC-A2' &&
    /^ZFC-A2-[A-Fa-f0-9]{12}$/.test(kit.kitId) && supportedTransports.includes(kit.transport);
  const transport = connected ? kit.transport : null;
  const linkState = connected ? kit.linkState : null;
  const limit = transport === 'usb' ? usbObservationMs : PPM_OBSERVATION_MS;
  const imu = connected && kit.imu?.board === 'A2' ? kit.imu : null;
  const imuObservedAge = observationAge(kit.imuObservedAt, now);
  const sampleAge = observationAge(kit.imuSampleObservedAt, now);
  const boardSampleAge = number(kit.imuSampleAgeAtObservationMs);
  const imuAgeMs = imu && sampleAge !== null && boardSampleAge !== null ? sampleAge + boardSampleAge : null;
  const imuSequence = counter(imu?.sampleSequence) ? imu.sampleSequence : null;
  const imuFresh = imu?.state === 'READY' && imu.configValid === true && imu.dataReady === true &&
    imu.imuValid !== false && imuSequence > 0 && within(boardSampleAge, firmwareImuAgeMs) &&
    within(imuAgeMs, limit);
  const rates = imuFresh ? vector(imu.corrected, 500) : null;
  // Network status binds gyro and acceleration to a single observation. The
  // USB diagnostic stream currently reports rates without acceleration.
  const accel = rates && transport !== 'usb' ? vector(imu.accelG, 8) : null;
  const stationary = kit.rcAccess?.stationary === true && rates?.every(n => Math.abs(n) < 3);
  const magnitude = accel ? Math.hypot(...accel) : null;
  const tilt = stationary && accel && magnitude >= 0.9 && magnitude <= 1.1 ? {
    roll: Math.atan2(accel[1], accel[2]) * 180 / Math.PI,
    pitch: Math.atan2(-accel[0], Math.hypot(accel[1], accel[2])) * 180 / Math.PI
  } : null;
  const {rc, health: inputHealth} = inputSnapshot(kit, connected, now);
  const {output, flight, health: outputHealth} = outputSnapshot(kit, connected, now);
  const timingFresh = imu && within(observationAge(kit.imuTimingObservedAt, now), limit);
  const timing = {
    health: timingFresh ? imu.controlHealth ?? null : null,
    targetHz: timingFresh && imu.controlTargetHz > 0 ? number(imu.controlTargetHz) : null,
    measuredHz: timingFresh && (imu.controlMeasuredHz ?? imu.controlActualHz) > 0
      ? number(imu.controlMeasuredHz ?? imu.controlActualHz) : null,
    dtUs: timingFresh && (imu.controlDtUs ?? imu.controlIntervalUs) > 0
      ? number(imu.controlDtUs ?? imu.controlIntervalUs) : null,
    maxDtUs: timingFresh && (imu.controlMaxDtUs ?? imu.controlMaxIntervalUs) > 0
      ? number(imu.controlMaxDtUs ?? imu.controlMaxIntervalUs) : null,
    missedTicks: timingFresh ? number(imu.controlMissedTicks) : null,
    deadlineFault: timingFresh ? bool(imu.flightDeadlineFault) : null,
    escPwmHz: timingFresh && imu.escPwmHz > 0 ? number(imu.escPwmHz) : null
  };
  let imuHealth = healthRow('unknown', 'IMU unconfirmed');
  if (rates) {
    imuHealth = healthRow('good', 'Calibrated gyro', 'Current corrected angular-rate observation.');
  } else if (imu && within(imuObservedAge, limit)) {
    if (['FAILED', 'SENSOR_ERROR', 'NOT_FOUND', 'READ_ERROR'].includes(imu.state)) {
      imuHealth = healthRow('error', 'IMU fault', reason(imu.error) || imu.state);
    } else if (['STARTING', 'SETTLING', 'CALIBRATING'].includes(imu.state)) {
      imuHealth = healthRow('warning', 'IMU ' + imu.state.toLowerCase(), 'Waiting for fresh calibrated gyro samples.');
    } else if (imu.state === 'READY') {
      imuHealth = healthRow('warning', 'Gyro sample delayed', 'Waiting for a current, valid rate observation.');
    }
  } else if (imu) {
    imuHealth = healthRow('warning', 'IMU observation delayed');
  }
  const timingHealth = timing.deadlineFault === true || timing.health === 'LATE'
    ? healthRow('error', 'Control deadline fault', 'FlightCore reported a late control loop or flight deadline fault.')
    : timing.health === 'HEALTHY' && timing.dtUs !== null
      ? healthRow('good', 'Control timing healthy', 'Scheduler timing reported by FlightCore.')
      : timing.health === 'STARTING'
        ? healthRow('warning', 'Control loop starting')
        : healthRow('unknown', 'Control timing unconfirmed');

  const flightObservation = connected && within(observationAge(kit.outputObservedAt, now), limit) ? kit.flight : null;
  const setupHealth = flightObservation?.setupComplete === true && flightObservation.pidSaved === true
    ? healthRow('good', 'Setup and PID saved', 'FlightCore reports both settings saved.')
    : flightObservation && typeof flightObservation.setupComplete === 'boolean' && typeof flightObservation.pidSaved === 'boolean'
      ? healthRow('warning', 'Setup incomplete', 'Check the Setup Wizard and saved PID settings.')
      : healthRow('unknown', 'Saved setup unconfirmed');
  const qualification = timingFresh ? bool(imu.flightQualified) : null;
  const qualificationHealth = qualification === true
    ? healthRow('good', 'Qualified build reported', 'FlightCore firmware reports hardware qualification.')
    : qualification === false
      ? healthRow('warning', 'Hardware qualification pending', flightObservation?.enabled === true
        ? 'FlightCore reports experimental output capability.' : 'Check release acceptance before physical flight.')
      : healthRow('unknown', 'Hardware qualification unconfirmed');
  const linkHealth = connected && linkState === 'connected'
    ? healthRow('good', 'Verified kit link', transport.toUpperCase())
    : connected ? healthRow('warning', 'Kit monitoring delayed', 'Waiting for a new verified observation.')
      : healthRow('unknown', 'Kit offline', 'Connect and verify an A2 FlightCore.');
  const kitId = connected ? kit.kitId : null;
  const bootId = connected ? kit.bootId || null : null;
  const binding = connected ? JSON.stringify([
    kitId, bootId, transport, kit.connectionGeneration ?? null, kit.imuGeneration ?? null,
    rc.selectedPath, rc.source
  ]) : null;
  const sample = rates ? {binding, sequence: imuSequence, at: kit.imuSampleObservedAt, rates} : null;
  return {
    binding, connected, kitId, kitName: connected ? kit.kitName || kit.kitId : null,
    board: connected ? kit.board : null, bootId, version: connected ? kit.version || null : null,
    transport, linkState, mode: connected ? kit.flightMode ?? null : null, rates, accel, tilt,
    imuAgeMs, imuSequence, sample, rc, output, flight, timing,
    health: {link: linkHealth, imu: imuHealth, input: inputHealth, timing: timingHealth,
      output: outputHealth, setup: setupHealth, qualification: qualificationHealth},
    unsupported
  };
}

export function appendFlightSample(samples, data, limit = 60) {
  const last = samples.at(-1);
  const history = last && last.binding !== data.binding ? [] : samples;
  const sample = data.sample;
  if (!sample) return history;
  if (history.length && (sample.at <= last.at || sample.sequence === last.sequence ||
    isOlderReceiverCounter(sample.sequence, last.sequence))) return history;
  return [...history, sample].slice(-limit);
}
