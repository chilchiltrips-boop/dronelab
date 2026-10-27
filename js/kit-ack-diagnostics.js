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
 'request_error','web_claim','web_ack','web_ack_error','web_release','web_status','web_disconnect','input_freshness','input_sample','ppm_lost','ppm_recovered','input_path_change','handover_request','handover_ack','handover_error','handover_state']);
const fields=['ackRequired','requestedInputArmed','sentSeq','route','transport','source','mode','board','version','outcome','reason','seq',
 'accepted','rejected','ageMs','roundTripMs','queueMs','bindMs','sendMs','responseWaitMs','readMs',
  'phase','releaseReason','lastReleaseAtMs','staReason','rssi','rcOwned',
 'inputArmed','apActive','staConnected','connected','httpStatus','frameGapMs',
   'feedbackVersion','ackKind','nackReason','feedbackHealth','lastRxSeq','lastAppliedSeq','receiveAgeMs','applyAgeMs','appliedKnown','appliedAckCount','sent','ackReceived','lost','jitterMs','lastPacketAgeMs','inputAgeMs','maxSendGapMs','maxAckGapMs','managementProtocol','udpActive','udpReceived','udpRejected',
 'rxAckSent','rxAckFailed','appliedAckSent','appliedAckFailed','nackSent','nackFailed',
 'maxAckTxUs','maxRxToAckUs','rpcMaxLoopUs','rpcMaxDispatchUs','firmwareDeadmanMs','feedbackWarnMs','feedbackStopMs','apClientCount','apJoinEvents','apLeaveEvents','apLastLeaveReason','throttle','roll','pitch','yaw','ch1','ch2','ch3','ch4','ch5','ch6','ch7','ch8','ppmAgeMs','ppmSeq','ppmLosses','ppmFaults','telemetryAgeMs','observationAgeMs','profileRevision','ppmPresent','rcActive','inputValid','failsafe','profileSaved','selectedPath','activePath','targetInput','lastStaInput','handoverState','handoverError'];
const routes=new Set(['/api/rc/claim','/api/rc/preview','/api/rc/stop','/api/rc/release',
 '/api/rc/snapshot','/api/status','/api/telemetry','/api/identify','/api/auth/local','/api/rc/access','/api/wifi/mode']);
const statuses=new Set(['ok','fail','timeout','unknown','pending']);
const reasons=new Set(['PROFILE_SAVE_FAILED','INPUT_UNSAFE','HANDOVER_BUSY','STA_CONFIG_REQUIRED','INPUT_STALE','QUEUE_STALE','ACK_INVALID','TIMEOUT','IDENTITY','AUTH','NETWORK','CANCELLED','OWNER_BUSY','OWNER_STALE','FRAME_REJECTED','OTHER',
 'UDP_SESSION_INVALID','UDP_START_FAILED','UDP_INPUT_STALE','UDP_ACK_TIMEOUT','UDP_FIRMWARE_RX_STALE','UDP_FIRMWARE_APPLY_STALE','UDP_FEEDBACK_DELAY','UDP_NO_ACK','UDP_SEND_OR_AUTH_FAILED','UDP_APPLY_TIMEOUT','UDP_NACK_INVALID_FRAME','UDP_NACK_STALE','UDP_NACK_OWNER_CONFLICT','UDP_NACK_APPLY_STALLED','UDP_NACK_AUTH_EXPIRED','UDP_UNKNOWN']);
function reasonClass(error){
 const s=String(error?.message||error||'').slice(0,220).toLowerCase();
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
  if(['sentSeq','feedbackVersion','lastRxSeq','lastAppliedSeq','receiveAgeMs','applyAgeMs','appliedAckCount','seq','accepted','rejected','ageMs','roundTripMs','queueMs','bindMs','sendMs','responseWaitMs','readMs','lastReleaseAtMs','staReason','rssi','httpStatus','frameGapMs','sent','ackReceived','lost','jitterMs','lastPacketAgeMs','inputAgeMs','maxSendGapMs','maxAckGapMs','udpReceived','udpRejected','rxAckSent','rxAckFailed','appliedAckSent','appliedAckFailed',
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
 const counts={inputs:0,ppmSamples:0,lastSource:'NONE',lastSelection:'AUTO',lastInputSeq:0,lastInputAgeMs:0,ppmLosses:0,ack:0,nack:0,lastRxSeq:0,lastAppliedSeq:0,loss:0,slow:0,maxRtt:0,latestGap:null,maxNativeWait:0,maxNativeQueue:0};
 for(const e of events){
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
 if(label)label.textContent=events.length+' events • '+s.inputs+' input samples • source '+s.lastSource+' • selected '+s.lastSelection+(s.lastSource==='PPM'?' • PPM #'+s.lastInputSeq+' • age '+s.lastInputAgeMs+' ms • losses '+s.ppmLosses:'')+' • '+s.ack+' sampled ACKs • '+s.nack+' NACKs • RX #'+s.lastRxSeq+' / APPLIED #'+s.lastAppliedSeq+' • '+s.loss+' errors/disarms • max ACK '+s.maxRtt+' ms'+(s.maxNativeWait?' • max response wait '+s.maxNativeWait+' ms':'')+(s.maxNativeQueue?' • max queue '+s.maxNativeQueue+' ms':'');
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
 const ppm=kit.ppm||{},h=kit.radioHandover||{},path=kit.rcAccess?.controlPath||'AUTO';
 const channels=Array.isArray(rc.channels)?rc.channels:Array.isArray(ppm.channels)?ppm.channels:[];
 const data={transport:kit.transport,source:rc.source,seq:rc.seq,accepted:rc.accepted,rejected:rc.rejected,
  ageMs:rc.ageMs,rcOwned:rc.claimed===true,rcActive:rc.active===true,inputArmed:rc.inputArmed===true,
  inputValid:rc.inputValid,failsafe:rc.failsafe,throttle:rc.throttle,roll:rc.roll,pitch:rc.pitch,yaw:rc.yaw,
  selectedPath:path,activePath:rc.active?(rc.source==='PPM'?'PPM':rc.source==='WEB'?'WEB_STA':rc.source==='ANDROID'&&kit.transport==='ap'?'ANDROID_AP':'NONE'):'NONE',
  ppmPresent:ppm.present,ppmAgeMs:ppm.ageMs,ppmSeq:ppm.seq,ppmLosses:ppm.losses,ppmFaults:ppm.faults,
  telemetryAgeMs:Number.isFinite(kit.heartbeatAt)?Math.max(0,Date.now()-kit.heartbeatAt):undefined,
  observationAgeMs:Number.isFinite(kit.rcAt)?Math.max(0,Date.now()-kit.rcAt):undefined,
  releaseReason:rc.lastReleaseReason,handoverState:h.state,handoverError:h.error,profileSaved:h.profileSaved,profileRevision:h.revision,targetInput:h.targetInput,lastStaInput:h.lastStaInput};
 for(let i=0;i<8;i++)if(Number.isFinite(channels[i]))data['ch'+(i+1)]=channels[i];
 if(!Number.isFinite(channels[4])&&Number.isFinite(rc.ch5))data.ch5=rc.ch5;if(!Number.isFinite(channels[5])&&Number.isFinite(rc.ch6))data.ch6=rc.ch6;
 const present=typeof ppm.present==='boolean'?ppm.present:rc.source==='PPM'&&rc.active===true;
 if(Number(ppm.losses)>lastPpmLosses&&lastPpmPresent!==undefined){record('ppm_lost',data);if(present)record('ppm_recovered',data);}
 else if(lastPpmPresent!==undefined&&present!==lastPpmPresent)record(present?'ppm_recovered':'ppm_lost',data);
 if(lastPath&&path!==lastPath)record('input_path_change',data);
 const hs=[h.revision,h.state,h.error].join('|');if(h.state&&hs!==lastHandover)record('handover_state',data);
 lastPpmPresent=present;lastPpmLosses=Number(ppm.losses)||0;lastPath=path;lastHandover=hs;
 const key=[rc.source,rc.active,rc.inputArmed,rc.failsafe,path].join('|');
 if(key!==lastInputState||Date.now()-lastInputAt>=2000){record('input_sample',data);lastInputAt=Date.now();lastInputState=key;}
}
function exportData(format){
 const s=summary();
 if(format==='json')return JSON.stringify({schema:'zebjus-ack-diagnostics-v1',client,generatedAt:new Date().toISOString(),
  notes:'Local diagnostic input only; motor outputs disabled. ACK success is sampled every fifth frame or on slow RTT. No credentials/Device ID/SSID/IP are included.',
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
root.ZebjusAckDiagnostics=Object.freeze({record,observeInput,observeView,reasonClass,exportData,flush,getEvents:()=>events.map(x=>({...x,data:{...x.data}})),summary});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
