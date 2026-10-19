/* Shared Android/WebApp ACK diagnostic recorder. No passwords, tokens,
 * Device IDs, addresses, SSIDs, payloads, or unstructured network errors.
 * Auto-saves bounded sanitized events locally; user-controlled exports only. */
(function(root){
'use strict';
const client=document.getElementById('kitAckDiagnostics')?.dataset?.client==='android'?'android':'web';
const KEY='zebjus.ackdiagnostics.'+client+'.v1',LIMIT=350,FLUSH_MS=2000;
const allowedEvents=new Set(['app_start','connect_start','connect_ok','connect_error','kit_status',
 'native_request','native_response','native_failure','rc_claim','rc_claim_error','rc_ack',
 'rc_ack_error','udp_start','udp_ack','udp_nack','udp_error','input_disarm','rc_release','link_change','wifi_event','request','request_ok',
 'request_error','web_claim','web_ack','web_ack_error','web_release','web_status','web_disconnect']);
const fields=['route','transport','source','mode','board','version','outcome','reason','seq',
 'accepted','rejected','ageMs','roundTripMs','queueMs','bindMs','sendMs','responseWaitMs','readMs',
  'phase','releaseReason','lastReleaseAtMs','staReason','rssi','rcOwned',
 'inputArmed','apActive','staConnected','connected','httpStatus','frameGapMs',
   'feedbackVersion','ackKind','nackReason','lastRxSeq','lastAppliedSeq','receiveAgeMs','applyAgeMs','appliedKnown','appliedAckCount','sent','ackReceived','lost','jitterMs','lastPacketAgeMs','inputAgeMs','maxSendGapMs','maxAckGapMs','managementProtocol','udpActive','udpReceived','udpRejected'];
const routes=new Set(['/api/rc/claim','/api/rc/preview','/api/rc/stop','/api/rc/release',
 '/api/rc/snapshot','/api/status','/api/telemetry','/api/identify','/api/auth/local']);
const statuses=new Set(['ok','fail','timeout','unknown','pending']);
const reasons=new Set(['INPUT_STALE','QUEUE_STALE','ACK_INVALID','TIMEOUT','IDENTITY','AUTH','NETWORK','CANCELLED','OWNER_BUSY','OWNER_STALE','FRAME_REJECTED','OTHER',
 'UDP_SESSION_INVALID','UDP_START_FAILED','UDP_INPUT_STALE','UDP_ACK_TIMEOUT','UDP_NO_ACK','UDP_SEND_OR_AUTH_FAILED','UDP_APPLY_TIMEOUT','UDP_NACK_INVALID_FRAME','UDP_NACK_STALE','UDP_NACK_OWNER_CONFLICT','UDP_NACK_APPLY_STALLED','UDP_NACK_AUTH_EXPIRED','UDP_UNKNOWN']);
function reasonClass(error){
 const s=String(error?.message||error||'').slice(0,220).toLowerCase();
 if(/udp_nack_owner_conflict/.test(s))return 'OWNER_BUSY';
 if(/udp_nack_invalid_frame/.test(s))return 'FRAME_REJECTED';
 if(/udp_nack_auth_expired/.test(s))return 'AUTH';
 if(/udp_nack_stale|udp_nack_apply_stalled/.test(s))return 'TIMEOUT';
 if(/controller_locked|controller locked|controlled by another/.test(s))return 'OWNER_BUSY';
 if(/not_controller_owner|owner.*expired/.test(s))return 'OWNER_STALE';
 if(/rc_not_owned_or_invalid_frame|invalid.*rc.*frame/.test(s))return 'FRAME_REJECTED';
 if(/udp_input_stale|joystick input paused/.test(s))return 'INPUT_STALE';
 if(/stale|queue|backlog|busy/.test(s))return 'QUEUE_STALE';
 if(/deadline|timeout|timed out|350|failsafe|udp_no_ack/.test(s))return 'TIMEOUT';
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
  if(['feedbackVersion','lastRxSeq','lastAppliedSeq','receiveAgeMs','applyAgeMs','appliedAckCount','seq','accepted','rejected','ageMs','roundTripMs','queueMs','bindMs','sendMs','responseWaitMs','readMs','lastReleaseAtMs','staReason','rssi','httpStatus','frameGapMs','sent','ackReceived','lost','jitterMs','lastPacketAgeMs','inputAgeMs','maxSendGapMs','maxAckGapMs','udpReceived','udpRejected'].includes(key)){
   if(typeof v==='number'&&Number.isFinite(v))result[key]=Math.max(-1000000,Math.min(1000000000,Math.round(v)));
  }else if(['appliedKnown','rcOwned','inputArmed','apActive','staConnected','connected','udpActive'].includes(key)){
   if(typeof v==='boolean')result[key]=v;
  }else if(key==='ackKind'){if(['RX_ACK','APPLIED_ACK','NACK','LEGACY_RX_ACK'].includes(v))result.ackKind=v;}
  else if(key==='nackReason'){if(['NONE','INVALID_FRAME','STALE','OWNER_CONFLICT','APPLY_STALLED','AUTH_EXPIRED'].includes(v))result.nackReason=v;}
  else if(key==='route'){if(routes.has(v))result.route=v;}
  else if(key==='reason'){if(reasons.has(v)||typeof v==='string'&&/^UDP_START_(?:PINNED_NETWORK|OPEN_SOCKET|BIND_SOCKET|CONNECT_PEER|START_SENDER)_(?:MAIN_THREAD_NETWORK|SOCKET|PERMISSION|NETWORK_IDENTITY|ADDRESS|NATIVE)$/.test(v))result.reason=v;}
  else if(key==='transport'){if(['ap','sta','usb','android-relay','none','unknown'].includes(v))result.transport=v;}
  else if(key==='managementProtocol'){if(['ZJM1','HTTP','USB'].includes(v))result.managementProtocol=v;}
  else if(key==='source'){if(['ANDROID','WEB','PPM','USB','NONE'].includes(v))result.source=v;}
  else if(key==='mode'){if(['ap','sta','auto'].includes(v))result.mode=v;}
  else if(key==='board'){if(['ZFC-A1','ZFC-A2','A1','A2'].includes(v))result.board=v;}
  else if(key==='version'){if(typeof v==='string'&&/^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(v))result.version=v;}
  else if(key==='phase'){if(['queued','wifi_bind','send','response','read','complete','complete_udp','queue_busy'].includes(v))result.phase=v;}
   else if(key==='releaseReason'){if(['NONE','NETWORK_RELEASE','NETWORK_EMERGENCY_STOP','ARMED_INPUT_TIMEOUT','UDP_INPUT_TIMEOUT','UDP_AUTH_EXPIRED','UDP_STALE_FRAME','UDP_FRAME_REJECTED','UDP_APPLY_TIMEOUT','UDP_OWNER_CONFLICT','PPM_SIGNAL_LOST','LEASE_TIMEOUT','LEASE_EXPIRED','NETWORK_MODE_CHANGED','USB_STOP','USB_RELEASE','FACTORY_RESET','ENROLLMENT_REVOKED'].includes(v))result.releaseReason=v;}
   else if(key==='outcome'){if(statuses.has(v))result.outcome=v;}
 }
 return result;
}
let events=[];
try{const old=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(old))events=old.filter(x=>x&&allowedEvents.has(x.event)&&Number.isFinite(x.at)&&x.data&&typeof x.data==='object').slice(-LIMIT).map(x=>({at:x.at,event:x.event,data:clean(x.data)}))}catch{}
let lastWrite=0,lastPaint=0,ackSamples=0,lastRecordedArm,flushTimer=null;
const panel=()=>document.getElementById('kitAckDiagnostics');
function summary(){
 const counts={ack:0,nack:0,lastRxSeq:0,lastAppliedSeq:0,loss:0,slow:0,maxRtt:0,latestGap:null,maxNativeWait:0,maxNativeQueue:0};
 for(const e of events){
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
 if(label)label.textContent=events.length+' events • '+s.ack+' sampled ACKs • '+s.nack+' NACKs • RX #'+s.lastRxSeq+' / APPLIED #'+s.lastAppliedSeq+' • '+s.loss+' errors/disarms • max ACK '+s.maxRtt+' ms'+(s.maxNativeWait?' • max response wait '+s.maxNativeWait+' ms':'')+(s.maxNativeQueue?' • max queue '+s.maxNativeQueue+' ms':'');
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
root.ZebjusAckDiagnostics=Object.freeze({record,reasonClass,exportData,flush,getEvents:()=>events.map(x=>({...x,data:{...x.data}})),summary});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
