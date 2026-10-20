/* Shared Android/WebApp ACK diagnostic recorder. No passwords, tokens,
 * Device IDs, addresses, SSIDs, payloads, or unstructured network errors.
 * Auto-saves bounded sanitized events locally; user-controlled exports only. */
(function(root){
'use strict';
const client=document.getElementById('kitAckDiagnostics')?.dataset?.client==='android'?'android':'web';
const KEY='zebjus.ackdiagnostics.'+client+'.v1',LIMIT=6000,FLUSH_MS=2000;
const allowedEvents=new Set(['app_start','connect_start','connect_ok','connect_error','kit_status',
 'native_request','native_response','native_failure','rc_claim','rc_claim_error','rc_ack',
 'rc_ack_error','udp_start','udp_ack','udp_nack','udp_error','input_disarm','rc_release','link_change','wifi_event','request','request_ok',
 'request_error','web_claim','web_ack','web_ack_error','web_release','web_status','web_disconnect']);
const metricFields=['apClientRssiDbm','reconnectCount','receiverWakeGapMs','ackQueueDelayMs','maxAckQueueDelayMs','sendGapMs','ackGapMs','feedbackAgeMs', 'rxAckAttempted', 'rxAckSent', 'rxAckFailed', 'appliedAckAttempted', 'appliedAckSent', 'appliedAckFailed', 'nackAttempted', 'nackSent', 'nackFailed', 'ackQueueDepth', 'ackQueueHighWatermark', 'rxToAckDelayMs', 'maxRxToAckDelayMs', 'ackSendDurationMs', 'maxAckSendDurationMs', 'maxApplyLatencyMs', 'maxMainLoopGapMs', 'rpcProcessingMs','rpcPacketsPerLoop','wifiLastEventAtMs','rpcMaxProcessingMs', 'rpcMaxResponseDurationMs', 'rpcResponseQueueDepth', 'rpcResponseSendFailures', 'apJoins', 'apLeaves', 'apStarts', 'apStops', 'apDisconnectReason', 'activeApClients', 'modeTransitions'];
const fields=[...metricFields,'diagnosticId','recordingId','linkState','wifiEvent','route','transport','source','mode','board','version','outcome','reason','seq',
 'accepted','rejected','ageMs','roundTripMs','queueMs','bindMs','sendMs','responseWaitMs','readMs',
  'phase','releaseReason','lastReleaseAtMs','staReason','rssi','rcOwned',
 'inputArmed','apActive','staConnected','connected','httpStatus','frameGapMs',
   'feedbackVersion','ackKind','nackReason','lastRxSeq','lastAppliedSeq','receiveAgeMs','applyAgeMs','appliedKnown','appliedAckCount','sent','ackReceived','lost','jitterMs','lastPacketAgeMs','inputAgeMs','maxSendGapMs','maxAckGapMs','managementProtocol','udpActive','udpReceived','udpRejected'];
const routes=new Set(['/api/rc/claim','/api/rc/preview','/api/rc/stop','/api/rc/release',
 '/api/rc/snapshot','/api/status','/api/telemetry','/api/identify','/api/auth/local']);
const statuses=new Set(['ok','fail','timeout','unknown','pending']);
const reasons=new Set(['INPUT_STALE','QUEUE_STALE','ACK_INVALID','TIMEOUT','IDENTITY','AUTH','NETWORK','CANCELLED','OWNER_BUSY','OWNER_STALE','FRAME_REJECTED','OTHER',
 'UDP_SESSION_INVALID','UDP_START_FAILED','UDP_INPUT_STALE','UDP_ACK_TIMEOUT','UDP_NO_ACK','UDP_SEND_OR_AUTH_FAILED','UDP_APPLY_TIMEOUT','UDP_NACK_INVALID_FRAME','UDP_NACK_STALE','UDP_NACK_OWNER_CONFLICT','UDP_NACK_APPLY_STALLED','UDP_NACK_AUTH_EXPIRED','UDP_RECEIVE_FAILED','UDP_SEQUENCE_EXHAUSTED','UDP_UNKNOWN']);
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
  if(metricFields.includes(key)||['feedbackVersion','lastRxSeq','lastAppliedSeq','receiveAgeMs','applyAgeMs','appliedAckCount','seq','accepted','rejected','ageMs','roundTripMs','queueMs','bindMs','sendMs','responseWaitMs','readMs','lastReleaseAtMs','staReason','rssi','httpStatus','frameGapMs','sent','ackReceived','lost','jitterMs','lastPacketAgeMs','inputAgeMs','maxSendGapMs','maxAckGapMs','udpReceived','udpRejected'].includes(key)){
   if(typeof v==='number'&&Number.isFinite(v))result[key]=Math.max(-1000000,Math.min(4294967295,Math.round(v)));
  }else if((key==='diagnosticId'||key==='recordingId')){if(typeof v==='string'&&/^[A-Fa-f0-9]{16}$/.test(v))result[key]=v.toUpperCase();}
  else if(key==='linkState'){if(['HEALTHY','LINK_DEGRADED','CONTROL_LOST','RELEASED'].includes(v))result[key]=v;}
  else if(key==='wifiEvent'){if(['AVAILABLE','LOST','CAPABILITIES','IDENTITY_VERIFIED','IDENTITY_REDACTED','ROUTE_CHANGED'].includes(v))result[key]=v;}
  else if(['appliedKnown' ,'rcOwned','inputArmed','apActive','staConnected','connected','udpActive'].includes(key)){
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
try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');const old=Array.isArray(saved)?saved:saved.events;if(Array.isArray(old))events=old.filter(x=>x&&allowedEvents.has(x.event)&&Number.isFinite(x.at)&&x.data&&typeof x.data==='object').slice(-LIMIT).map(x=>({at:x.at,event:x.event,data:clean(x.data)}))}catch{}
let lastWrite=0,lastPaint=0,ackSamples=0,lastRecordedArm,flushTimer=null;
const panel=()=>document.getElementById('kitAckDiagnostics');
const control=selector=>panel()?.querySelector(selector)||document.querySelector?.(selector);
const recordingId=Array.from({length:16},()=>Math.floor(Math.random()*16).toString(16)).join('').toUpperCase();
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
 const view=control('[data-diag-events]');
 const search=String(p.querySelector('[data-diag-search]')?.value||'').toLowerCase(),filter=p.querySelector('[data-diag-filter]')?.value||'all';
 if(view&&(p.open||view.closest?.('#diagSectionHistory'))){
  const visible=events.filter(e=>(filter!=='errors'||/error|failure|disarm|release/.test(e.event)||e.data.outcome==='fail')&&(filter!=='feedback'||/ack/.test(e.event))&&JSON.stringify(e).toLowerCase().includes(search)).slice(-150);
  const label=e=>new Date(e.at).toLocaleTimeString()+' '+e.event+' '+JSON.stringify(e.data);
  if(typeof view.replaceChildren==='function'){
   const rows=[];let group='';
   for(const e of visible){const id=e.data.diagnosticId||e.data.recordingId||'previous recording';
    if(id!==group){group=id;const heading=document.createElement('div');heading.className='diag-session-heading';heading.textContent=(e.data.diagnosticId?'Control correlation ':'Recording ')+id;rows.push(heading);}
    const row=document.createElement('div');row.textContent=label(e);if(/error|failure|disarm|disconnect/.test(e.event)||e.data.outcome==='fail')row.className='diag-event-error';rows.push(row);
   }view.replaceChildren(...rows);
  }
  else view.textContent=visible.map(label).join('\n')||'No diagnostic events yet. Connect Kit and reproduce ACK timeout.';
 }
}
const PRE_MS=60000,POST_MS=30000,MAX_INCIDENTS=8,MAX_STORE_BYTES=2*1024*1024;
let incidents=[],db=null,storageEpoch=0;
const monotonicStart=typeof performance!=='undefined'?performance.now():0;
function storageNotice(text){const e=panel()?.querySelector('[data-diag-storage]');if(e)e.textContent=text}
function prune(){
 events=events.filter(e=>e.at>=Date.now()-PRE_MS).slice(-LIMIT);
 incidents=incidents.filter(i=>Date.now()-i.triggerAt<7*86400000).slice(-MAX_INCIDENTS);
 for(const i of incidents)if(i.events.length>LIMIT)i.events.splice(0,i.events.length-LIMIT);
}
function persist(){
 prune();
 while(incidents.length&&JSON.stringify({events,incidents}).length*2>MAX_STORE_BYTES)incidents.shift();
 while(events.length>1&&JSON.stringify({events,incidents}).length*2>MAX_STORE_BYTES)events.splice(0,Math.max(1,Math.floor(events.length/8)));
 const snapshot={events,incidents};
 if(db){try{const tx=db.transaction('recordings','readwrite');tx.objectStore('recordings').put(snapshot,client);
  tx.oncomplete=()=>{try{localStorage.removeItem(KEY)}catch{}storageNotice('Saved on this device • 60 s pre-error / 30 s post-error • '+incidents.length+' incidents')};
  tx.onerror=()=>storageNotice('Storage unavailable; export this session before closing');
 }catch{storageNotice('Storage unavailable; export this session before closing')}}
 else {try{localStorage.setItem(KEY,JSON.stringify(snapshot))}catch{storageNotice('Storage unavailable; export this session before closing')}}
}
function flush(force=false){
 if(flushTimer&&!force)return;if(flushTimer)clearTimeout(flushTimer);
 flushTimer=setTimeout(()=>{flushTimer=null;lastWrite=Date.now();persist()},force?0:FLUSH_MS);
}
function sanitizedEntry(e){return {at:e.at,event:e.event,data:clean(e.data),relativeMs:Number.isFinite(e.relativeMs)?e.relativeMs:null}}
function openStorage(){
 if(!root.indexedDB){storageNotice('Asynchronous fallback recording • persistent database unavailable');return}
 const epoch=storageEpoch,request=root.indexedDB.open('zebjus-diagnostics-v2',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('recordings');
 request.onerror=()=>storageNotice('Persistent database unavailable; fallback recording enabled');
 request.onsuccess=()=>{
  db=request.result;const read=db.transaction('recordings').objectStore('recordings').get(client);
  read.onsuccess=()=>{
   if(epoch!==storageEpoch)return;const old=read.result;
   if(old){events=[...(old.events||[]).filter(e=>allowedEvents.has(e.event)&&Number.isFinite(e.at)).map(sanitizedEntry),...events].sort((a,b)=>a.at-b.at).slice(-LIMIT);
    incidents=(old.incidents||[]).filter(i=>Number.isFinite(i.triggerAt)&&Number.isFinite(i.endAt)).slice(-MAX_INCIDENTS).map(i=>({triggerAt:i.triggerAt,endAt:i.endAt,events:(i.events||[]).slice(-LIMIT).filter(e=>allowedEvents.has(e.event)&&Number.isFinite(e.at)).map(sanitizedEntry)}));}
   prune();paint(true);flush();
  };
 };
}
function clearSaved(){
 ++storageEpoch;events=[];incidents=[];if(flushTimer){clearTimeout(flushTimer);flushTimer=null}
 try{localStorage.removeItem(KEY)}catch{}
 if(db)db.transaction('recordings','readwrite').objectStore('recordings').delete(client);
 paint(true);
}
function record(event,data={}){
 if(!allowedEvents.has(event))return;
 const safe=clean({...data,recordingId});
 // Writing to localStorage on every 100ms joystick ACK can create latency;
 // sample every fifth success, but ALWAYS record an outlier or error.
 if(event==='rc_ack'||event==='udp_ack'||event==='web_ack'){
  ackSamples++;
  if(ackSamples%5!==1&&(safe.roundTripMs||0)<180&&safe.inputArmed===lastRecordedArm)return;
  lastRecordedArm=safe.inputArmed;
 }
 const at=Date.now(),entry={at,event,data:safe,relativeMs:typeof performance!=='undefined'?Math.round(performance.now()-monotonicStart):null};
 events.push(entry);
 const activeIncident=incidents.find(i=>at<=i.endAt);
 if(activeIncident)activeIncident.events.push(entry);
 else if(/error|failure|disarm|disconnect/.test(event)||safe.outcome==='fail'||safe.connected===false||safe.wifiEvent==='LOST'||safe.releaseReason&&safe.releaseReason!=='NONE')incidents.push({triggerAt:at,endAt:at+POST_MS,events:events.filter(e=>e.at>=at-PRE_MS)});
 prune();
 if(events.length>LIMIT)events.splice(0,events.length-LIMIT);
 flush(!['rc_ack','udp_ack','udp_nack','web_ack','kit_status','web_status','native_request'].includes(event));
 paint();
}
function exportData(format){
 const s=summary();
 if(format==='json')return JSON.stringify({schema:'zebjus-ack-diagnostics-v1',client,generatedAt:new Date().toISOString(),
  notes:'Sequence gaps are estimates, not measured radio loss. Correlate diagnosticId/sequence; wall clocks may differ. recordingId is a non-secret local recording label. Local diagnostic input only; motor outputs disabled. ACK success is sampled every fifth frame or on slow RTT. No credentials/Device ID/SSID/IP are included.',
  summary:s,events,incidents},null,2);
 const columns=['at','event','relativeMs',...fields];
 const exported=new Map();for(const e of [...incidents.flatMap(i=>i.events),...events])exported.set(JSON.stringify(e),e);
 const timeline=[...exported.values()].sort((a,b)=>a.at-b.at);
 const quote=v=>'"'+String(v===undefined||v===null?'':v).replace(/"/g,'""')+'"';
 return [columns.join(','),...timeline.map(e=>columns.map(k=>quote(k==='at'?new Date(e.at).toISOString():k==='event'?e.event:k==='relativeMs'?e.relativeMs:e.data[k])).join(','))].join('\r\n');
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
 (document.querySelectorAll?.('[data-diag-export]')||p.querySelectorAll('[data-diag-export]')).forEach(b=>b.addEventListener('click',()=>{
  try{save(b.dataset.diagExport)}catch{const output=p.querySelector('[data-diag-summary]');if(output)output.textContent='Export unavailable; your local log remains saved.'}
 }));
 const clear=control('[data-diag-clear]');
 clear?.addEventListener('click',()=>{if(!confirm('Erase locally saved ACK diagnostics from this device?'))return;
  clearSaved();
 });
 p.querySelector('[data-diag-search]')?.addEventListener('input',()=>paint(true));
 p.querySelector('[data-diag-filter]')?.addEventListener('change',()=>paint(true));
 control('[data-diag-incident]')?.addEventListener('click',()=>save('json'));
 p.addEventListener('toggle',()=>paint(true));openStorage();
 root.addEventListener('pagehide',()=>flush(true));
 paint(true);record('app_start');
}
root.zebjusNativeDiagnosticSaveResult=data=>{
 const status=control('[data-diag-export-status]');
 if(status)status.textContent=data?.ok?'Diagnostic file saved in chosen location':data?.cancelled?'Export cancelled; local diagnostics retained':'Export failed; local diagnostics retained';
};
function firmwareFields(status){
 const udp=status?.udp||{},wifi=status?.wifiDiagnostics||{},rpc=status?.rpc||{};
 return clean({...Object.fromEntries(metricFields.map(k=>[k,udp[k]??wifi[k]])),diagnosticId:status?.rc?.diagnosticId,maxMainLoopGapMs:status?.maxMainLoopGapMs,
  rpcProcessingMs:rpc.processingMs,rpcPacketsPerLoop:rpc.packetsPerLoop,wifiLastEventAtMs:wifi.lastEventAtMs,rpcMaxProcessingMs:rpc.maxProcessingMs,rpcMaxResponseDurationMs:rpc.maxResponseDurationMs,rpcResponseQueueDepth:rpc.responseQueueDepth,rpcResponseSendFailures:rpc.responseSendFailures});
}
root.ZebjusAckDiagnostics=Object.freeze({record,firmwareFields,clearSaved,reasonClass,exportData,flush,getEvents:()=>events.map(x=>({...x,data:{...x.data}})),summary});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
