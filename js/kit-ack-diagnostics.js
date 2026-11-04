/* Shared Android/WebApp ACK diagnostic recorder. No passwords, tokens,
 * Device IDs, addresses, SSIDs, payloads, or unstructured network errors.
 * Auto-saves bounded sanitized events locally; user-controlled exports only. */
(function(root){
'use strict';
const client=document.getElementById('kitAckDiagnostics')?.dataset?.client==='android'?'android':'web';
const KEY='zebjus.ackdiagnostics.'+client+'.v1',LIMIT=350,FLUSH_MS=2000;
const allowedEvents=new Set(['app_start','connect_start','connect_ok','connect_error','kit_status',
 'native_request','native_response','native_failure','rc_claim','rc_claim_error','rc_ack',
 'rc_ack_error','udp_start','udp_tx','udp_ack','udp_nack','udp_warning','udp_error','input_disarm','rc_release','link_change','wifi_event','request','request_ok',
 'request_error','web_claim','web_ack','web_ack_error','web_release','web_status','web_disconnect','input_freshness','input_sample','ppm_lost','ppm_recovered','input_path_change','handover_preflight','handover_request','handover_ack','handover_error','handover_state','motor_ack','motor_error']);
const fields=['ackRequired','requestedInputArmed','sentSeq','route','transport','source','mode','board','version','outcome','reason','seq',
 'accepted','rejected','ageMs','roundTripMs','queueMs','bindMs','sendMs','responseWaitMs','readMs',
  'phase','releaseReason','lastReleaseAtMs','staReason','rssi','rcOwned',
 'inputArmed','apActive','staConnected','connected','httpStatus','frameGapMs',
   'feedbackVersion','ackKind','nackReason','feedbackHealth','lastRxSeq','lastAppliedSeq','receiveAgeMs','applyAgeMs','appliedKnown','appliedAckCount','sent','ackReceived','lost','jitterMs','lastPacketAgeMs','inputAgeMs','maxSendGapMs','maxAckGapMs','managementProtocol','udpActive','udpReceived','udpRejected',
 'rxAckSent','rxAckFailed','appliedAckSent','appliedAckFailed','nackSent','nackFailed',
 'maxAckTxUs','maxRxToAckUs','rpcMaxLoopUs','rpcMaxDispatchUs','firmwareDeadmanMs','feedbackWarnMs','feedbackStopMs','apClientCount','apJoinEvents','apLeaveEvents','apLastLeaveReason','throttle','roll','pitch','yaw','ch1','ch2','ch3','ch4','ch5','ch6','ch7','ch8','ppmAgeMs','ppmSeq','ppmLosses','ppmFaults','telemetryAgeMs','observationAgeMs','profileRevision','ppmPresent','rcActive','inputValid','failsafe','profileSaved','selectedPath','activePath','targetInput','lastStaInput','handoverState','handoverError','handoverBlocker','handoverLastReject','ppmThrottleUs','handMotorDisabled','diagnosticArmReleased'];
const routes=new Set(['/api/rc/claim','/api/rc/preview','/api/rc/stop','/api/rc/release',
 '/api/rc/snapshot','/api/status','/api/telemetry','/api/ppm/status','/api/motor','/api/identify','/api/auth/local','/api/rc/access','/api/wifi/mode']);
const statuses=new Set(['ok','fail','timeout','unknown','pending']);
const reasons=new Set(['PROFILE_SAVE_FAILED','INPUT_UNSAFE','HANDOVER_BUSY','STA_CONFIG_REQUIRED','INPUT_STALE','QUEUE_STALE','ACK_INVALID','TIMEOUT','IDENTITY','AUTH','NETWORK','CANCELLED','OWNER_BUSY','OWNER_STALE','FRAME_REJECTED','OTHER',
 'UDP_SESSION_INVALID','UDP_START_FAILED','UDP_INPUT_STALE','UDP_ACK_TIMEOUT','UDP_FIRMWARE_RX_STALE','UDP_FIRMWARE_APPLY_STALE','UDP_FEEDBACK_DELAY','UDP_NO_ACK','UDP_SEND_OR_AUTH_FAILED','UDP_APPLY_TIMEOUT','UDP_NACK_INVALID_FRAME','UDP_NACK_STALE','UDP_NACK_OWNER_CONFLICT','UDP_NACK_APPLY_STALLED','UDP_NACK_AUTH_EXPIRED','UDP_UNKNOWN']);
const handoverBlockers=new Set(['NONE','KIT_LINK_UNVERIFIED','FIRMWARE_UNSUPPORTED','HANDOVER_PENDING',
 'MOTOR_OUTPUT_ACTIVE','MAINTENANCE_ACTIVE','OTHER_CONTROLLER_ACTIVE','RC_THROTTLE_HIGH',
 'PPM_THROTTLE_HIGH','PPM_ARM_UNSAFE','INPUT_ARMED','RC_THROTTLE_UNKNOWN','FIRMWARE_REJECTED']);
const handoverRejects=new Set(['NONE','invalid_mode','handover_busy','stop_motor_setup_first',
 'maintenance_active','release_current_controller_first','lower_throttle_and_disarm',
 'save_sta_credentials_first','invalid_sta_input','input_profile_changed','input_profile_save_failed']);
const motorActions=new Set(['STATUS','STOP','BEGIN','KEEP','RTC','LAYOUT','MINIMUM','SLIDER','CAL_SLIDER','SLIDE','SINGLE','ALL','INPUT','CAL_HIGH','CAL_LOW',
 'WIZARD_STATUS','WIZARD_BEGIN','WIZARD_IMU','WIZARD_SAVE','WIZARD_SAVE_PAGE','WIZARD_ESC_CONFIRM','WIZARD_AUTO_ESC_PREPARE','WIZARD_AUTO_ESC_CANCEL','WIZARD_AUTO_ESC_RETRY']);
const motorModes=new Set(['DISABLED','READY','INPUT_TEST','SINGLE_TEST','ALL_TEST','CAL_HIGH','CAL_LOW','AUTO_CAL_HIGH','AUTO_CAL_LOW','FAULT','SLIDER_TEST','UNCONFIRMED']);
const motorReasons=new Set(['NONE','USER_STOP','SESSION_EXPIRED','INPUT_LOST','INPUT_CHANGED','ARM_REQUIRED','THROTTLE_HIGH','SWITCH_REQUIRED','TEST_FINISHED','CAL_TIMEOUT','CAL_FINISHED','OUTPUT_ERROR','DEADLINE_MISSED','CONFIG_ERROR','CONTROL_LOST',...reasons]);
const ppmCaptureCounts=['ppmCaptureHz','ppmCaptureErrors'];
fields.push('ppmCaptureBackend',...ppmCaptureCounts);
const motorCounts=['motorRemainingMs','sliderMask','sessionRemainingMs','commandSequence','pulseM1','pulseM2','pulseM3','pulseM4',
 'stoppedMask','configRevision','autoEscRemainingMs','autoEscHighMs','autoEscLowMs'];
const motorResultPulses=['savedMinimumM1','savedMinimumM2','savedMinimumM3','savedMinimumM4','stoppedPulseUs','autoEscPulseUs'];
const motorResultFlags=['stoppedSlider','configVerified','calibrationSlideKeepsSession','escCalibrationSaved','autoEscResultPersisted',
 'autoEscSequenceReady','autoEscCompatible','autoEscOutputsOff','escAcceptanceVerified','toneDetectionSupported'];
const motorResultEnums={
 wizardSaveScope:new Set(['WIRING','ACCEL','ACCEL_MANUAL','ESC','ALL','M1','M2','M3','M4','RESET_ACCEL','RESET_ESC','RESET_OUTPUT','RESET_ALL']),
 autoEscState:new Set(['NONE','AWAITING_POWER_CYCLE','RUNNING','SEQUENCE_COMPLETE','INCOMPLETE','CANCELLED','INVALID_RECORD']),
 autoEscPhase:new Set(['HIGH','LOW','OFF']),
 autoEscReason:new Set(['NONE','STOPPED','RESET_DURING_SEQUENCE','COLD_POWER_ON_REQUIRED','SETUP_CHANGED','DRIVER_ERROR','DEADLINE_MISSED','STORAGE_ERROR']),
 autoEscResultSource:new Set(['NONE','OPERATOR','CONTROLLER_SEQUENCE_ONLY'])
};
fields.push('motorAction','motorMode','motorReason','motorPolicy',...motorCounts,...motorResultPulses,...motorResultFlags,...Object.keys(motorResultEnums));
// IMU records share the existing bounded/private diagnostic log. IDs below
// select an observation internally and are never exported.
const timingCounts=['controlTargetHz','controlIntervalUs','controlMinIntervalUs','controlMaxIntervalUs','controlJitterUs','controlMaxJitterUs','controlExecutionUs','controlMaxExecutionUs','controlMissedTicks','controlDeadlineMisses','controlOverruns','controlLastTickUs','imuTargetHz','imuSensorOdrHz','imuSampleAgeUs','imuErrors','imuMissedNormalSamples','imuDlpFilter','imuGyroBandwidthHz','gyroRangeDps','accelRangeG','escPwmHz','telemetryConfiguredHz','telemetryDrops'];
const timingRates=['controlActualHz','imuActualHz','telemetryActualHz','imuFilterDelayMs'];
const timingHealth=new Set(['UNAVAILABLE','STARTING','HEALTHY','LATE']);
fields.push(...timingCounts,...timingRates,'controlHealth','controlActuating','imuValid','accelXG','accelYG','accelZG','androidUdpReceivedHz','androidUdpAppliedHz','udpCoalescedFrames');
allowedEvents.add('timing_state');allowedEvents.add('timing_sample');
const imuStates=new Set(['STARTING','SETTLING','CALIBRATING','READY','FAILED','SENSOR_ERROR','NOT_FOUND','READ_ERROR']);
const imuErrors=new Set(['NONE','I2C_ERROR','WHO_AM_I','CONFIG_MISMATCH','INVALID_SAMPLE','DATA_STALE','CALIBRATION_TIMEOUT','CALIBRATION_CANCELLED']);
const imuFloatFields=['gyroRawX','gyroRawY','gyroRawZ','gyroBiasX','gyroBiasY','gyroBiasZ','gyroRateX','gyroRateY','gyroRateZ','gyroStddevX','gyroStddevY','gyroStddevZ'];
const imuCountFields=['imuAttempt','imuSamples','imuTarget','imuValidTotal','imuDurationMs','imuStartedMs','imuRestarts','imuReadFailures','imuWriteFailures','imuLastI2cCode','imuWhoAmI','imuSampleSequence','imuSampleAgeMs','imuMaxGapUs','imuCalibrationMaxGapUs','imuMissedSamples','imuMaxReadUs','imuDiagnosticDrops','imuFailures','imuLastFailureMs','imuLastFailureAttempt'];
fields.push('imuState','imuError','imuLastFailure','imuDataReady','imuConfigValid','gyroUnits',...imuFloatFields,...imuCountFields);
for(const event of ['imu_summary','imu_state','imu_calibration_restart','imu_i2c_error','imu_sample','imu_progress','imu_calibration_error'])allowedEvents.add(event);
function normalizeImu(value,expectedBoard=''){
 if(!value||value.version!==1||typeof value.enabled!=='boolean')return null;
 const board=String(value.board||'').replace(/^ZFC-/,'');
 if(!['A1','A2'].includes(board)||expectedBoard&&board!==String(expectedBoard).replace(/^ZFC-/,''))return null;
 if(!imuStates.has(value.state)||value.enabled&&board!=='A2')return null;
 const out={version:1,board,enabled:value.enabled,state:value.state,dataReady:value.dataReady===true};
 if(typeof value.configValid==='boolean')out.configValid=value.configValid;
 if(value.lastFailure!==undefined){if(!imuErrors.has(value.lastFailure))return null;out.lastFailure=value.lastFailure;}
 if(value.error!==undefined){if(!imuErrors.has(value.error))return null;out.error=value.error;}
 for(const key of ['attempt','samples','target','validTotal','durationMs','startedMs','restarts','readFailures','writeFailures','lastI2cCode','whoAmI','sampleSequence','maxGapUs','calibrationMaxGapUs','missedSamples','maxReadUs','diagnosticDrops','failures','lastFailureMs','lastFailureAttempt']){
  if(value[key]===undefined)continue;
  if(!Number.isSafeInteger(value[key])||value[key]<0||value[key]>0xffffffff)return null;
  out[key]=value[key];
 }
 for(const key of [...timingCounts,...timingRates])if(value[key]!==undefined&&value[key]!==null){
  const v=value[key];if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>0xffffffff||timingCounts.includes(key)&&!Number.isSafeInteger(v))return null;
  out[key]=v;
 }
 if(value.controlHealth!==undefined){if(!timingHealth.has(value.controlHealth))return null;out.controlHealth=value.controlHealth;}
 for(const key of ['controlActuating','imuValid'])if(typeof value[key]==='boolean')out[key]=value[key];
 if(value.accelG!==undefined){if(!Array.isArray(value.accelG)||value.accelG.length!==3||!value.accelG.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=8))return null;out.accelG=[...value.accelG];}
 if(value.sampleAgeMs!==undefined&&value.sampleAgeMs!==null){if(!Number.isSafeInteger(value.sampleAgeMs)||value.sampleAgeMs<0||value.sampleAgeMs>0xffffffff)return null;out.sampleAgeMs=value.sampleAgeMs;}
 if(out.enabled&&(out.target!==2000||!Number.isSafeInteger(out.samples)||out.samples>out.target))return null;
 for(const key of ['raw','bias','corrected','stddev'])if(value[key]!==undefined){
  if(!Array.isArray(value[key])||value[key].length!==3||!value[key].every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1000))return null;
  out[key]=[...value[key]];
 }
 if(out.enabled&&out.state==='READY'&&(out.samples!==2000||!out.attempt||out.configValid!==true))return null;
 if(out.imuValid===false||out.state!=='READY'||Number.isFinite(out.sampleAgeMs)&&out.sampleAgeMs>1000)out.dataReady=false;
 return out;
}
function imuLabel(value){
 const imu=normalizeImu(value);if(!imu)return 'NOT REPORTED';
 if(['SETTLING','CALIBRATING'].includes(imu.state))return 'Calibrating '+imu.samples+'/'+imu.target+' • keep board still';
 if(imu.state==='READY')return imu.dataReady?(imu.enabled?'READY • gyro calibrated':'READY'):'Calibration complete • waiting for fresh gyro';
 if(imu.state==='FAILED')return 'Calibration failed • keep board still';
 if(imu.state==='STARTING')return 'Gyro starting';
 return 'Sensor error • '+(imu.error||imu.state);
}
function parseImuLine(line,previous=null){
 const p=String(line||'').trim().split(',');
 // Fast negative sensor status must not wait for the slower calibration
 // summary before clearing READY. A positive status alone cannot prove a
 // completed bias calibration or a fresh sample.
 if(p[0]==='ZJGYRO'&&p[1]==='STATUS'&&p.length===6&&p[2]==='A2'&&p[3]==='MPU6050'&&p[4].toLowerCase()==='0x68'&&previous?.board==='A2'){
  const state={READ_ERROR:'READ_ERROR',NOT_FOUND:'NOT_FOUND',CALIBRATION_FAILED:'FAILED'}[p[5]];
  if(!state)return null;
  return normalizeImu({...previous,state,dataReady:false,imuValid:false,error:undefined});
 }
 if(p[1]!=='1'||p[2]!=='A2')return null;
 const number=i=>p[i]!==''&&Number.isFinite(Number(p[i]))?Number(p[i]):NaN;
 if(p[0]==='ZJTIMING'&&p.length===20&&previous?.board==='A2'){
  const keys=['controlActualHz','controlIntervalUs','controlMinIntervalUs','controlMaxIntervalUs','controlJitterUs','controlMaxJitterUs','controlExecutionUs','controlMaxExecutionUs','controlMissedTicks','controlOverruns','controlHealth','imuActualHz','imuSampleAgeUs','imuErrors','telemetryConfiguredHz','telemetryActualHz','telemetryDrops'];
  const data={...previous,controlTargetHz:250,controlActuating:false,imuTargetHz:250,escPwmHz:50};
  for(let i=0;i<keys.length;i++){
   if(keys[i]==='controlHealth')data[keys[i]]=p[i+3];
   else {const v=number(i+3);if(v===-1&&['controlActualHz','imuActualHz','imuSampleAgeUs','telemetryActualHz'].includes(keys[i]))delete data[keys[i]];else data[keys[i]]=v;}
  }
  const age=number(15);
  data.imuValid=Number.isFinite(age)&&age>=0&&age<=12000;
  data.sampleAgeMs=age>=0?Math.floor(age/1000):null;
  data.dataReady=data.imuValid&&data.state==='READY';
  return normalizeImu(data);
 }
 if(p[0]==='ZJIMU'&&p.length===18){
  const same=previous?.board==='A2'&&previous.attempt===number(3)&&!(number(5)<previous.samples&&['SETTLING','CALIBRATING'].includes(p[4]));
  return normalizeImu({...(same?previous:{}),version:1,board:'A2',enabled:true,attempt:number(3),state:p[4],samples:number(5),target:number(6),durationMs:number(7),restarts:number(8),bias:[number(9),number(10),number(11)],error:p[12],readFailures:number(13),writeFailures:number(14),whoAmI:number(15),configValid:p[16]==='1',dataReady:p[17]==='1'});
 }
 if(p[0]==='ZJIMUE'&&p.length===7&&previous?.board==='A2')return normalizeImu({...previous,failures:number(3),lastFailure:p[4],lastFailureMs:number(5),lastFailureAttempt:number(6)});
 if(p[0]==='ZJIMUS'&&p.length===15&&number(11)>=-1&&previous?.board==='A2'&&previous.attempt===number(3)){
  const age=number(11),maxAge=previous.imuTargetHz===250?12:1000;
  const valid=number(10)>0&&age>=0&&age<=maxAge;
  // This record reports milliseconds, so discard a microsecond observation
  // from another record rather than combining two different sample ages.
  return normalizeImu({...previous,...(number(10)<(previous.sampleSequence||0)?{failures:0,lastFailure:'NONE',lastFailureMs:0,lastFailureAttempt:0}:{}),raw:[number(4),number(5),number(6)],corrected:[number(7),number(8),number(9)],sampleSequence:number(10),sampleAgeMs:age<0?null:age,imuSampleAgeUs:undefined,imuValid:valid,dataReady:valid&&previous.state==='READY',maxGapUs:number(12),calibrationMaxGapUs:number(13),missedSamples:number(14)});
 }
 return null;
}
let lastImuBinding='',lastImu=null,lastImuAt=0,lastImuProgressAt=0,lastTimingAt=0;
function observeImu(value,kit={}){
 if(!kit.connected||!kit.kitId)return null;
 const imu=normalizeImu(value,kit.board);if(!imu)return null;
 const binding=[kit.kitId,kit.bootId,kit.connectionGeneration,kit.transport].join('|');
 if(binding!==lastImuBinding){lastImuBinding=binding;lastImu=null;lastImuAt=0;lastImuProgressAt=0;}
 const data={transport:kit.transport,board:imu.board,version:kit.version,imuState:imu.state,imuError:imu.error||'NONE',imuLastFailure:imu.lastFailure,imuDataReady:imu.dataReady,imuConfigValid:imu.configValid,gyroUnits:'deg/s'};
 for(const [key,field] of Object.entries({attempt:'imuAttempt',samples:'imuSamples',target:'imuTarget',validTotal:'imuValidTotal',durationMs:'imuDurationMs',startedMs:'imuStartedMs',restarts:'imuRestarts',readFailures:'imuReadFailures',writeFailures:'imuWriteFailures',lastI2cCode:'imuLastI2cCode',whoAmI:'imuWhoAmI',sampleSequence:'imuSampleSequence',sampleAgeMs:'imuSampleAgeMs',maxGapUs:'imuMaxGapUs',calibrationMaxGapUs:'imuCalibrationMaxGapUs',missedSamples:'imuMissedSamples',maxReadUs:'imuMaxReadUs',diagnosticDrops:'imuDiagnosticDrops',failures:'imuFailures',lastFailureMs:'imuLastFailureMs',lastFailureAttempt:'imuLastFailureAttempt'}))data[field]=imu[key];
 for(const key of [...timingCounts,...timingRates,'controlHealth','controlActuating','imuValid'])if(imu[key]!==undefined)data[key]=imu[key];
 if(imu.accelG)imu.accelG.forEach((v,i)=>data['accel'+'XYZ'[i]+'G']=v);
 if(lastImu&&imu.controlHealth!==lastImu.controlHealth&&imu.controlHealth)record('timing_state',data);
 if(imu.controlTargetHz&&Date.now()-lastTimingAt>=2000){record('timing_sample',data);lastTimingAt=Date.now();}
 for(const [key,prefix] of [['raw','gyroRaw'],['bias','gyroBias'],['corrected','gyroRate'],['stddev','gyroStddev']])if(imu[key])imu[key].forEach((v,i)=>data[prefix+'XYZ'[i]]=v);
 const fresh=!lastImu||lastImu.attempt!==imu.attempt;
 if(fresh)record('imu_summary',data);
 if((imu.failures||0)>(lastImu?.failures||0))record('imu_calibration_error',data);
 if(!fresh){
  if(lastImu.state!==imu.state||lastImu.dataReady!==imu.dataReady)record('imu_state',data);
  if((imu.restarts||0)>(lastImu.restarts||0))record('imu_calibration_restart',data);
  if((imu.readFailures||0)+(imu.writeFailures||0)>(lastImu.readFailures||0)+(lastImu.writeFailures||0))record('imu_i2c_error',data);
 }
 if(['SETTLING','CALIBRATING'].includes(imu.state)&&(fresh||Date.now()-lastImuProgressAt>=1000)){record('imu_progress',data);lastImuProgressAt=Date.now();}
 if(imu.dataReady&&(fresh||Date.now()-lastImuAt>=2000)){record('imu_sample',data);lastImuAt=Date.now();}
 lastImu=imu;return imu;
}

function reasonClass(error){
 const s=String(error?.message||error||'').slice(0,220).toLowerCase();
 if(/motor_session_expired_or_not_owner/.test(s))return 'OWNER_STALE';
 if(error?.code==='KIT_DELAYED'||/heartbeat is delayed|networkdelayerror/.test(s))return 'TIMEOUT';
 if(/input_profile_save_failed/.test(s))return 'PROFILE_SAVE_FAILED';
 if(/lower_throttle|disarm and lower|lower throttle/.test(s))return 'INPUT_UNSAFE';
 if(/handover_busy|radio_handover_pending|maintenance_active/.test(s))return 'HANDOVER_BUSY';
 if(/save_sta_credentials_first/.test(s))return 'STA_CONFIG_REQUIRED';
 if(/udp_nack_owner_conflict/.test(s))return 'OWNER_BUSY';
 if(/udp_nack_invalid_frame/.test(s))return 'FRAME_REJECTED';
 if(/udp_nack_auth_expired/.test(s))return 'AUTH';
 if(/udp_nack_stale|udp_nack_apply_stalled/.test(s))return 'TIMEOUT';
 if(/controller_locked|controller locked|controlled by another/.test(s))return 'OWNER_BUSY';
 if(/not_controller_owner|owner.*expired/.test(s))return 'OWNER_STALE';
 if(/rc_not_owned_or_invalid_frame|invalid.*rc.*frame/.test(s))return 'FRAME_REJECTED';
 if(/udp_input_stale|joystick input paused/.test(s))return 'INPUT_STALE';
 if(/stale|queue|backlog|busy/.test(s))return 'QUEUE_STALE';
 if(/deadline|timeout|timed out|350|500|750|failsafe|udp_no_ack/.test(s))return 'TIMEOUT';
 if(/ack|receive|sequence|seq|replay/.test(s))return 'ACK_INVALID';
 if(/identity|device id|wrong kit|mismatch/.test(s))return 'IDENTITY';
 if(/session|401|403|authorization|authenticate|permission|scope/.test(s))return 'AUTH';
 if(/wi.fi|ssid|bssid|network|disconnected|offline|link|unreachable|fetch|socket/.test(s))return 'NETWORK';
 if(/cancell|background|paused|hidden|release/.test(s))return 'CANCELLED';
 return 'OTHER';
}
function clean(data){
 const result={};
 if(!data||typeof data!=='object')return result;
 for(const key of fields){
  const v=data[key];
  if(v===undefined||v===null)continue;
  if(key==='ppmCaptureBackend'){if(['RMT_RX','GPIO_ISR'].includes(v))result[key]=v;}
  else if(key==='handoverBlocker'){if(handoverBlockers.has(v))result[key]=v;}
  else if(key==='handoverLastReject'){if(handoverRejects.has(v))result[key]=v;}
  else if(key==='ppmThrottleUs'){if(Number.isSafeInteger(v)&&v>=0&&v<=2150)result[key]=v;}
  else if(['handMotorDisabled','diagnosticArmReleased'].includes(key)){if(typeof v==='boolean')result[key]=v;}
  else if(key==='motorPolicy'){if(['TIMED_MANUAL','LIVE_LEASE'].includes(v))result[key]=v;}
  else if(ppmCaptureCounts.includes(key)){if(Number.isSafeInteger(v)&&v>=0)result[key]=Math.min(0xffffffff,v);}
  else if(key==='motorAction'){if(motorActions.has(v))result[key]=v;}
  else if(key==='motorMode'){if(motorModes.has(v))result[key]=v;}
  else if(key==='motorReason'){if(motorReasons.has(v))result[key]=v;}
  else if(motorResultPulses.includes(key)){if(Number.isSafeInteger(v)&&v>=0&&v<=2000)result[key]=v;}
  else if(motorResultFlags.includes(key)){if(typeof v==='boolean')result[key]=v;}
  else if(motorResultEnums[key]){if(motorResultEnums[key].has(v))result[key]=v;}
  else if(motorCounts.includes(key)){if(Number.isSafeInteger(v)&&v>=0)result[key]=Math.min(0xffffffff,v);}
  else if(timingCounts.includes(key)){if(Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff)result[key]=v;}
  else if([...timingRates,'androidUdpReceivedHz','androidUdpAppliedHz','accelXG','accelYG','accelZG'].includes(key)){if(typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1000000)result[key]=Math.round(v*10000)/10000;}
  else if(key==='udpCoalescedFrames'){if(Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff)result[key]=v;}
  else if(key==='controlHealth'){if(timingHealth.has(v))result[key]=v;}
  else if(['controlActuating','imuValid'].includes(key)){if(typeof v==='boolean')result[key]=v;}
  else if(imuFloatFields.includes(key)){if(typeof v==='number'&&Number.isFinite(v))result[key]=Math.round(Math.max(-1000,Math.min(1000,v))*10000)/10000;}
  else if(imuCountFields.includes(key)){if(Number.isSafeInteger(v)&&v>=0)result[key]=Math.min(0xffffffff,v);}
  else if(key==='imuState'){if(imuStates.has(v))result[key]=v;}
  else if(['imuError','imuLastFailure'].includes(key)){if(imuErrors.has(v))result[key]=v;}
  else if(['imuDataReady','imuConfigValid'].includes(key)){if(typeof v==='boolean')result[key]=v;}
  else if(key==='gyroUnits'){if(v==='deg/s')result[key]=v;}
  else if(['sentSeq','feedbackVersion','lastRxSeq','lastAppliedSeq','receiveAgeMs','applyAgeMs','appliedAckCount','seq','accepted','rejected','ageMs','roundTripMs','queueMs','bindMs','sendMs','responseWaitMs','readMs','lastReleaseAtMs','staReason','rssi','httpStatus','frameGapMs','sent','ackReceived','lost','jitterMs','lastPacketAgeMs','inputAgeMs','maxSendGapMs','maxAckGapMs','udpReceived','udpRejected','rxAckSent','rxAckFailed','appliedAckSent','appliedAckFailed',
   'nackSent','nackFailed','maxAckTxUs','maxRxToAckUs','rpcMaxLoopUs','rpcMaxDispatchUs','firmwareDeadmanMs','feedbackWarnMs','feedbackStopMs',
   'apClientCount','apJoinEvents','apLeaveEvents','apLastLeaveReason','throttle','roll','pitch','yaw','ch1','ch2','ch3','ch4','ch5','ch6','ch7','ch8','ppmAgeMs','ppmSeq','ppmLosses','ppmFaults','telemetryAgeMs','observationAgeMs','profileRevision'].includes(key)){
   if(typeof v==='number'&&Number.isFinite(v))result[key]=Math.max(-1000000,Math.min(1000000000,Math.round(v)));
  }else if(['ackRequired','requestedInputArmed','appliedKnown','rcOwned','inputArmed','apActive','staConnected','connected','udpActive','ppmPresent','rcActive','inputValid','failsafe','profileSaved'].includes(key)){
   if(typeof v==='boolean')result[key]=v;
  }else if(key==='ackKind'){if(['RX_ACK','APPLIED_ACK','NACK','LEGACY_RX_ACK'].includes(v))result.ackKind=v;}
  else if(key==='feedbackHealth'){if(['HEALTHY','DEGRADED','WAITING_RX','STOPPED','UNKNOWN'].includes(v))result.feedbackHealth=v;}
  else if(key==='nackReason'){if(['NONE','INVALID_FRAME','STALE','OWNER_CONFLICT','APPLY_STALLED','AUTH_EXPIRED'].includes(v))result.nackReason=v;}
  else if(key==='route'){if(routes.has(v))result.route=v;}
  else if(key==='reason'){if(reasons.has(v)||typeof v==='string'&&/^UDP_START_(?:PINNED_NETWORK|OPEN_SOCKET|BIND_SOCKET|CONNECT_PEER|START_SENDER)_(?:MAIN_THREAD_NETWORK|SOCKET|PERMISSION|NETWORK_IDENTITY|ADDRESS|NATIVE)$/.test(v))result.reason=v;}
  else if(key==='transport'){if(['ap','sta','usb','android-relay','none','unknown'].includes(v))result.transport=v;}
  else if(key==='managementProtocol'){if(['ZJM1','HTTP','USB'].includes(v))result.managementProtocol=v;}
  else if(key==='source'){if(['ANDROID','WEB','PPM','USB','NONE'].includes(v))result.source=v;}
  else if(key==='mode'){if(['ap','sta','auto'].includes(v))result.mode=v;}
  else if(['selectedPath','activePath','targetInput','lastStaInput'].includes(key)){if(['AUTO','PPM','WEB_STA','ANDROID_AP','ANDROID_WEBRTC','NONE'].includes(v))result[key]=v;}
  else if(key==='handoverError'){if(['','CONTROLS_CHANGED','AP_START_FAILED','STA_UNAVAILABLE'].includes(v))result[key]=v;}
  else if(key==='handoverState'){if(['IDLE','PREPARED','SWITCHING','WAITING_CONTROLLER','FAILED'].includes(v))result[key]=v;}
  else if(key==='board'){if(['ZFC-A1','ZFC-A2','A1','A2'].includes(v))result.board=v;}
  else if(key==='version'){if(typeof v==='string'&&/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(v))result.version=v;}
  else if(key==='phase'){if(['queued','wifi_bind','send','response','read','complete','complete_udp','queue_busy'].includes(v))result.phase=v;}
   else if(key==='releaseReason'){if(['NONE','NETWORK_RELEASE','NETWORK_EMERGENCY_STOP','ARMED_INPUT_TIMEOUT','UDP_INPUT_TIMEOUT','UDP_AUTH_EXPIRED','UDP_STALE_FRAME','UDP_FRAME_REJECTED','UDP_APPLY_TIMEOUT','UDP_OWNER_CONFLICT','PPM_SIGNAL_LOST','LEASE_TIMEOUT','LEASE_EXPIRED','NETWORK_MODE_CHANGED','RADIO_HANDOVER','EXPLICIT_SOURCE_HANDOVER','USB_STOP','USB_RELEASE','FACTORY_RESET','ENROLLMENT_REVOKED'].includes(v))result.releaseReason=v;}
   else if(key==='outcome'){if(statuses.has(v))result.outcome=v;}
 }
 return result;
}
let events=[];
try{const old=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(old))events=old.filter(x=>x&&allowedEvents.has(x.event)&&Number.isFinite(x.at)&&x.data&&typeof x.data==='object').slice(-LIMIT).map(x=>({at:x.at,event:x.event,data:clean(x.data)}))}catch{}
let lastWrite=0,lastPaint=0,ackSamples=0,lastRecordedArm,flushTimer=null;
const panel=()=>document.getElementById('kitAckDiagnostics');
function summary(){
 const counts={handoverBlocker:'NONE',inputs:0,ppmSamples:0,lastSource:'NONE',lastSelection:'AUTO',lastInputSeq:0,lastInputAgeMs:0,ppmLosses:0,ack:0,nack:0,lastRxSeq:0,lastAppliedSeq:0,loss:0,slow:0,maxRtt:0,latestGap:null,maxNativeWait:0,maxNativeQueue:0};
 for(const e of events){
  if(['handover_preflight','handover_request','handover_error','handover_ack','handover_state'].includes(e.event)&&e.data.handoverBlocker)counts.handoverBlocker=e.data.handoverBlocker;
  if(e.event==='input_sample'){counts.inputs++;if(e.data.source==='PPM')counts.ppmSamples++;}
  if(e.data.source){counts.lastSource=e.data.source;if(Number.isFinite(e.data.seq))counts.lastInputSeq=e.data.seq;if(Number.isFinite(e.data.ageMs))counts.lastInputAgeMs=e.data.ageMs;}
  if(e.data.selectedPath)counts.lastSelection=e.data.selectedPath;
  if(Number.isFinite(e.data.ppmLosses))counts.ppmLosses=e.data.ppmLosses;
  if(e.event==='udp_nack')counts.nack++;
  if(Number.isFinite(e.data.lastRxSeq))counts.lastRxSeq=e.data.lastRxSeq;
  if(Number.isFinite(e.data.lastAppliedSeq))counts.lastAppliedSeq=e.data.lastAppliedSeq;
  if(e.event==='rc_ack'||e.event==='udp_ack'||e.event==='web_ack'){counts.ack++;counts.maxRtt=Math.max(counts.maxRtt,e.data.roundTripMs||0);if((e.data.roundTripMs||0)>=180)counts.slow++;if(Number.isFinite(e.data.frameGapMs))counts.latestGap=e.data.frameGapMs;}
  if(['rc_ack_error','udp_error','web_ack_error','input_disarm'].includes(e.event))counts.loss++;
  if(['native_response','native_failure'].includes(e.event)){
   counts.maxNativeWait=Math.max(counts.maxNativeWait,e.data.responseWaitMs||0);
   counts.maxNativeQueue=Math.max(counts.maxNativeQueue,e.data.queueMs||0);
  }
 }
 return counts;
}
function paint(force=false){
 const at=Date.now();if(!force&&at-lastPaint<800)return;lastPaint=at;
 const p=panel();if(!p)return;
 const s=summary(),label=p.querySelector('[data-diag-summary]');
 if(label)label.textContent=events.length+' events • '+s.inputs+' input samples • source '+s.lastSource+' • selected '+s.lastSelection+(s.lastSource==='PPM'?' • PPM #'+s.lastInputSeq+' • age '+s.lastInputAgeMs+' ms • losses '+s.ppmLosses:'')+' • '+s.ack+' sampled ACKs • '+s.nack+' NACKs • RX #'+s.lastRxSeq+' / APPLIED #'+s.lastAppliedSeq+' • '+s.loss+' errors/disarms • radio blocker '+s.handoverBlocker+' • max ACK '+s.maxRtt+' ms'+(s.maxNativeWait?' • max response wait '+s.maxNativeWait+' ms':'')+(s.maxNativeQueue?' • max queue '+s.maxNativeQueue+' ms':'');
 const imuView=p.querySelector('[data-diag-imu]');
 if(imuView){const e=[...events].reverse().find(e=>e.data.imuState),d=e?.data;imuView.textContent=d?'Last IMU: '+d.board+' • '+d.imuState+(d.imuTarget?' • '+d.imuSamples+'/'+d.imuTarget+' samples':'')+(Number.isFinite(d.imuDurationMs)?' • '+d.imuDurationMs+' ms':'')+(Number.isFinite(d.gyroBiasX)?' • bias '+[d.gyroBiasX,d.gyroBiasY,d.gyroBiasZ].join(' / ')+' deg/s':'')+(d.controlTargetHz?' • shadow '+(d.controlActualHz??'unknown')+'/'+d.controlTargetHz+' Hz • '+(d.controlHealth||'unknown')+' • missed '+(d.controlMissedTicks||0)+' • IMU '+(d.imuActualHz??'unknown')+' Hz • max tick '+(d.controlMaxExecutionUs??'unknown')+' us':'')+' • read errors '+(d.imuReadFailures||0)+' • calibration failures '+(d.imuFailures||0)+(d.imuLastFailure&&d.imuLastFailure!=='NONE'?' • last '+d.imuLastFailure:'')+(d.imuError&&d.imuError!=='NONE'?' • '+d.imuError:''):'IMU diagnostics: connect a Kit';}
 const view=p.querySelector('[data-diag-events]');
 if(view&&p.open)view.textContent=events.slice(-30).reverse().map(e=>new Date(e.at).toLocaleTimeString()+' '+e.event+' '+JSON.stringify(e.data)).join('\n')||'No diagnostic events yet. Connect Kit and reproduce ACK timeout.';
}
function flush(force=false){
 const at=Date.now();
 if(!force&&at-lastWrite<FLUSH_MS){
  if(!flushTimer)flushTimer=setTimeout(()=>{flushTimer=null;flush(true)},FLUSH_MS);
  return;
 }
 lastWrite=at;try{localStorage.setItem(KEY,JSON.stringify(events))}catch{}
}
function record(event,data={}){
 if(!allowedEvents.has(event))return;
 const safe=clean(data);
 // Writing to localStorage on every 100ms joystick ACK can create latency;
 // sample every fifth success, but ALWAYS record an outlier or error.
 if(event==='rc_ack'||event==='udp_ack'||event==='web_ack'){
  ackSamples++;
  if(ackSamples%5!==1&&(safe.roundTripMs||0)<180&&safe.inputArmed===lastRecordedArm)return;
  lastRecordedArm=safe.inputArmed;
 }
 events.push({at:Date.now(),event,data:safe});
 if(events.length>LIMIT)events.splice(0,events.length-LIMIT);
 flush(!['rc_ack','udp_ack','udp_nack','web_ack','kit_status','web_status','native_request'].includes(event));
 paint();
}
let lastInputAt=0,lastInputState='',lastPpmPresent,lastPpmLosses=0,lastPath='',lastHandover='',lastInputBinding='',lastView='';
function observeView(view,kit){
 const key=[kit.kitId,kit.bootId,kit.connectionGeneration,kit.transport,view.active,view.paused,view.connection].join('|');
 if(key===lastView)return;lastView=key;
 record('input_freshness',{transport:kit.transport,connected:kit.connected===true,selectedPath:kit.rcAccess?.controlPath,
  activePath:view.active||'NONE',rcActive:!!view.active,telemetryAgeMs:view.telemetryAgeMs,
  observationAgeMs:Number.isFinite(kit.rcAt)?Math.max(0,Date.now()-kit.rcAt):undefined});
}
function observeInput(rc={},kit={}){
 const binding=[kit.kitId,kit.bootId,kit.transport,kit.connectionGeneration].join('|');
 if(binding!==lastInputBinding){lastInputBinding=binding;lastInputState='';lastPpmPresent=undefined;lastPpmLosses=0;lastPath='';lastHandover='';}
 const udp=kit.udp||{};
 const ppm=kit.ppm||{},h=kit.radioHandover||{},path=kit.rcAccess?.controlPath||'AUTO';
 const channels=Array.isArray(rc.channels)?rc.channels:Array.isArray(ppm.channels)?ppm.channels:[];
 const data={transport:kit.transport,source:rc.source,seq:rc.seq,accepted:rc.accepted,rejected:rc.rejected,
  androidUdpReceivedHz:udp.androidUdpReceivedHz,androidUdpAppliedHz:udp.androidUdpAppliedHz,udpCoalescedFrames:udp.coalescedFrames,
  ageMs:rc.ageMs,rcOwned:rc.claimed===true,rcActive:rc.active===true,inputArmed:rc.inputArmed===true,
  inputValid:rc.inputValid,failsafe:rc.failsafe,throttle:rc.throttle,roll:rc.roll,pitch:rc.pitch,yaw:rc.yaw,
  selectedPath:path,activePath:rc.active?(rc.source==='PPM'?'PPM':rc.source==='WEB'?'WEB_STA':rc.source==='ANDROID'&&kit.transport==='ap'?'ANDROID_AP':'NONE'):'NONE',
  ppmCaptureBackend:ppm.captureBackend,ppmCaptureHz:ppm.captureHz,ppmCaptureErrors:ppm.captureErrors,ppmPresent:ppm.present,ppmAgeMs:ppm.ageMs,ppmSeq:ppm.seq,ppmLosses:ppm.losses,ppmFaults:ppm.faults,
  telemetryAgeMs:Number.isFinite(kit.heartbeatAt)?Math.max(0,Date.now()-kit.heartbeatAt):undefined,
  observationAgeMs:Number.isFinite(kit.rcAt)?Math.max(0,Date.now()-kit.rcAt):undefined,
  releaseReason:rc.lastReleaseReason,handoverState:h.state,handoverError:h.error,
  handoverBlocker:h.preflightBlocker,handoverLastReject:h.lastReject,ppmThrottleUs:h.ppmThrottleUs,
  handMotorDisabled:h.motorsDisabled,diagnosticArmReleased:h.diagnosticArmReleased,
  profileSaved:h.profileSaved,profileRevision:h.revision,targetInput:h.targetInput,lastStaInput:h.lastStaInput};
 for(let i=0;i<8;i++)if(Number.isFinite(channels[i]))data['ch'+(i+1)]=channels[i];
 if(!Number.isFinite(channels[4])&&Number.isFinite(rc.ch5))data.ch5=rc.ch5;if(!Number.isFinite(channels[5])&&Number.isFinite(rc.ch6))data.ch6=rc.ch6;
 const present=typeof ppm.present==='boolean'?ppm.present:rc.source==='PPM'&&rc.active===true;
 if(Number(ppm.losses)>lastPpmLosses&&lastPpmPresent!==undefined){record('ppm_lost',data);if(present)record('ppm_recovered',data);}
 else if(lastPpmPresent!==undefined&&present!==lastPpmPresent)record(present?'ppm_recovered':'ppm_lost',data);
 if(lastPath&&path!==lastPath)record('input_path_change',data);
 const hs=[h.revision,h.state,h.error,h.preflightBlocker,h.lastReject].join('|');if(h.state&&hs!==lastHandover)record('handover_state',data);
 lastPpmPresent=present;lastPpmLosses=Number(ppm.losses)||0;lastPath=path;lastHandover=hs;
 const key=[rc.source,rc.active,rc.inputArmed,rc.failsafe,path].join('|');
 if(key!==lastInputState||Date.now()-lastInputAt>=2000){record('input_sample',data);lastInputAt=Date.now();lastInputState=key;}
}
function exportData(format){
 const s=summary();
 if(format==='json')return JSON.stringify({schema:'zebjus-ack-diagnostics-v1',client,generatedAt:new Date().toISOString(),
  notes:'Input and explicit motor-bench diagnostics. ACKs are sampled; slow motor ACKs and motor state changes are retained. No credentials/Device ID/SSID/IP are included.',
  summary:s,events},null,2);
 const columns=['at','event',...fields];
 const quote=v=>'"'+String(v===undefined||v===null?'':v).replace(/"/g,'""')+'"';
 return [columns.join(','),...events.map(e=>columns.map(k=>quote(k==='at'?new Date(e.at).toISOString():k==='event'?e.event:e.data[k])).join(','))].join('\r\n');
}
function save(format){
 flush(true);
 const data=exportData(format);
 if(client==='android'&&typeof root.ZebjusNative?.saveDiagnosticLog==='function'){
  root.ZebjusNative.saveDiagnosticLog(format,data);return;
 }
 const blob=new Blob([data],{type:format==='json'?'application/json':'text/csv'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='zebjus-'+client+'-ack-diagnostics-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.'+format;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function init(){
 const p=panel();if(!p)return;
 p.querySelectorAll('[data-diag-export]').forEach(b=>b.addEventListener('click',()=>{
  try{save(b.dataset.diagExport)}catch{const output=p.querySelector('[data-diag-summary]');if(output)output.textContent='Export unavailable; your local log remains saved.'}
 }));
 const clear=p.querySelector('[data-diag-clear]');
 clear?.addEventListener('click',()=>{if(!confirm('Erase locally saved ACK diagnostics from this device?'))return;
  events=[];try{localStorage.removeItem(KEY)}catch{}paint(true);
 });
 p.addEventListener('toggle',()=>paint(true));
 root.addEventListener('pagehide',()=>flush(true));
 paint(true);record('app_start');
}
root.zebjusNativeDiagnosticSaveResult=data=>{
 const status=panel()?.querySelector('[data-diag-export-status]');
 if(status)status.textContent=data?.ok?'Diagnostic file saved in chosen location':data?.cancelled?'Export cancelled; local diagnostics retained':'Export failed; local diagnostics retained';
};
root.ZebjusAckDiagnostics=Object.freeze({record,observeInput,observeView,normalizeImu,parseImuLine,imuLabel,observeImu,reasonClass,exportData,flush,getEvents:()=>events.map(x=>({...x,data:{...x.data}})),summary});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
