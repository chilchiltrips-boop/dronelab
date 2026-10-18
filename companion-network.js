/* Native Android-to-FlightCore AP/STA transport (bench diagnostics only).
 * The per-device key never crosses the WebRTC relay and is not stored in site data.
 * Received RC frames are preview-only; motor arming is deliberately unsupported. */
(function(){
'use strict';
const el=id=>document.getElementById(id),native=window.ZebjusNative;
const pending=new Map();let ip='192.168.4.1',staIp='',link='ap',key='',mode='auto',online=false,requestId=0,previewBusy=false,lastPreview=0,lastStatus=0,lastScan=0,autoApTimer=null,nextAutoApAttempt=0,kitCode='',verifiedKitId='',rcSession='',rcClaiming=false,onKitLink=false,rcSeq=0,auth=null,diagnosticKey='',connecting=false,reconnectEnabled=false,firmwareAck=null,otaBusy=false,otaCancelRequested=false,otaPaused=false,otaNeedsRecheck=false,discoveredId='',cachedFallbackIp='',pinIdentity='',pinWaiters=new Map(),discoveryWaiters=new Map();
const nonRcNativeRequests=new Set();
let statusBusy=false,statusInFlight=null,statusFailures=0,linkEpoch=0,rcEpoch=0,rcInputArmed=false,inputArmSupported=false,controlAuthorized=false,authOpening=null;
let ledOn=false,ledSequence=100,ledBusy=false,savedProfilesFor='',handoverExpectedKit='',handoverTimer=null,handoverAttempts=0,staObserverTimer=null;
const validHost=v=>/^(?:10|192|172)\./.test(v)&&/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v);
const policy=window.ZebjusKitNetworkPolicy;
const readRoutes=new Set(['GET /api/health','GET /api/identify','GET /api/status','GET /api/telemetry','GET /api/rc/snapshot']);
const wifiRoutes=new Set(['GET /api/wifi/scan','GET /api/wifi/saved','POST /api/wifi/test','POST /api/wifi/mode']);
const diagnosticRoutes=new Set(['POST /api/command','POST /api/rc/stop','POST /api/rc/claim','POST /api/rc/release','POST /api/rc/preview']);
const grantFor=(route,method)=>{const key=method+' '+route;return readRoutes.has(key)?'kitAllowWeb':wifiRoutes.has(key)?'kitGrantWifi':diagnosticRoutes.has(key)?'kitGrantDiagnostic':''};
const allowed=new Set(['GET /api/health','GET /api/identify','GET /api/status','GET /api/wifi/scan','GET /api/wifi/saved','GET /api/telemetry','GET /api/rc/snapshot','POST /api/wifi/test','POST /api/rc/stop','POST /api/wifi/mode','POST /api/command','POST /api/rc/claim','POST /api/rc/release','POST /api/rc/preview']);
function show(text,tone=''){
 const v=el('kitNetStatus');if(v){v.textContent=text;v.dataset.state=tone}
 const wifi=el('kitWifiLiveStatus');if(wifi){wifi.textContent=text;wifi.dataset.state=tone}
 if(otaBusy&&el('kitOtaPhase')){el('kitOtaPhase').textContent=text;el('kitOtaPhase').dataset.state=tone}
 window.dispatchEvent(new CustomEvent('zebjus:kit-status',{detail:{text,tone}}));
}
function form(v){return new URLSearchParams(v||{}).toString()}
// The native HTTP deadline is shorter than this JS watchdog (including queue
// time). A timed-out write is UNKNOWN, never a reason to resend blindly.
function cancelNativePending(reason){
 for(const [id,item] of pending){
  clearTimeout(item.timer);pending.delete(id);
  try{native?.cancelRequest?.(id)}catch{}
  const error=Error(reason);error.uncertain=item.write;item.reject(error);
 }
}
function nativeTransport(route,method='GET',args={},headers={},targetIp=ip){
 if(!native?.requestSecure)return Promise.reject(Error('Install the current Android APK for signed Kit Wi-Fi sessions.'));
 if(!validHost(targetIp))return Promise.reject(Error('Use the kit private IPv4 address.'));
 const rcRoute=route.startsWith('/api/rc/'),authentication=route.startsWith('/api/auth/');
 // Signed HMAC counters and Android's single HTTP worker MUST preserve
 // request order. Do not enqueue unrelated reads/writes behind joystick ACKs.
 // /api/auth/ is allowed for the selected RC session's signed reauthentication.
 if(!rcRoute&&!authentication&&(rcClaiming||rcSession||previewBusy))
  return Promise.reject(Error('RC ACK has priority • STOP diagnostic input before Kit requests'));
 const id='zj'+(++requestId),write=method==='POST'&&route.startsWith('/api/firmware/');
 const operation=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{
   if(!pending.has(id))return;
   pending.delete(id);
   try{native.cancelRequest?.(id)}catch{}
   const error=Error((write?'Encrypted firmware write':'Device request')+' timed out at '+route+'; delivery is unconfirmed');
   error.uncertain=write;reject(error);
  },policy?.requestTimeout?.(route,method,link,'android')||(write?18000:6000));
  pending.set(id,{resolve,reject,timer,raw:true,write});
  try{native.requestSecure(id,targetIp,method,route,method==='POST'?form(args):'',JSON.stringify(headers));}
  catch(e){clearTimeout(timer);pending.delete(id);const error=Error('Native request failed: '+e.message);error.uncertain=write;reject(error);}
 });
 // Claiming input waits for ALREADY-STARTED native traffic, without ever
 // jumping ahead of an HMAC counter and without cancelling unknown writes.
 if(!rcRoute&&!authentication){
  nonRcNativeRequests.add(operation);
  void operation.finally(()=>nonRcNativeRequests.delete(operation)).catch(()=>{});
 }
 return operation;
}
// An NSD address is only a candidate. Only a signed Device ID response can
// authorize a kit, and only the matching Wi-Fi Network/SSID/BSSID may carry writes.
const verifiedCacheKey=id=>'zebjus.android.verified-ip:'+id+':'+link;
function cachedIp(id){
 try{
  const saved=JSON.parse(localStorage.getItem(verifiedCacheKey(id))||'null');
  return saved&&Date.now()-saved.at<7*86400000&&validHost(saved.ip)?saved.ip:'';
 }catch{return ''}
}
function saveVerifiedIp(id,host,ssid){
 try{localStorage.setItem(verifiedCacheKey(id),JSON.stringify({ip:host,ssid,at:Date.now()}))}catch{}
}
const permissionWaiters=new Map();
window.zebjusNativeWifiPermissionResult=data=>{
 const waiter=permissionWaiters.get(data?.id);if(!waiter)return;
 clearTimeout(waiter.timer);permissionWaiters.delete(data.id);
 data.granted?waiter.resolve():waiter.reject(Error(data.error||'Precise Location permission required for Wi-Fi verification'));
};
function ensureWifiPermission(silent=false){
 if(typeof native?.requestWifiPermission!=='function')return Promise.reject(Error('Install latest Android APK for Wi-Fi permission verification'));
 return new Promise((resolve,reject)=>{
  const id='permission'+(++requestId);
  const timer=setTimeout(()=>{permissionWaiters.delete(id);reject(Error('Location permission dialog did not return a result'))},120000);
  permissionWaiters.set(id,{timer,resolve,reject});
  try{native.requestWifiPermission(id,silent)}
  catch(error){clearTimeout(timer);permissionWaiters.delete(id);reject(error)}
 });
}
const vaultWaiters=new Map();
window.zebjusNativeVaultResult=data=>{
 const waiter=vaultWaiters.get(data?.id);if(!waiter)return;
 clearTimeout(waiter.timer);vaultWaiters.delete(data.id);
 data.ok?waiter.resolve(data.credential||''):waiter.reject(Error(data.error||'Saved diagnostic credential unavailable'));
};
function vaultCall(op,id,credential){
 if(!/^ZFC-A[12]-[0-9A-F]{12}$/.test(id)||typeof native?.[op]!=='function')
  return Promise.reject(Error('Android Keystore enrollment not available on this APK'));
 return new Promise((resolve,reject)=>{
  const rid='vault'+(++requestId);
  // Native save/load shows user confirmation: no fixed 5-second timeout.
  // Android cancel/back returns a definite reply to settle this promise.
  const timer=op==='forgetDiagnostic'?setTimeout(()=>{vaultWaiters.delete(rid);reject(Error('Android Keystore request timed out'))},15000):null;
  vaultWaiters.set(rid,{timer,resolve,reject});
  try{op==='saveDiagnostic'?native[op](rid,id,credential):native[op](rid,id)}
  catch(error){clearTimeout(timer);vaultWaiters.delete(rid);reject(error)}
 });
}
window.zebjusNativeVersionResult=data=>{
 const version=data?.versionName&&Number.isSafeInteger(Number(data?.versionCode))
  ?data.versionName+' (code '+data.versionCode+')':'Installed APK version unavailable';
 for(const key of ['appBuildVersion']){const v=el(key);if(v)v.textContent=version}
};
function forgetGrants(){for(const id of ['kitAllowWeb','kitGrantWifi','kitGrantDiagnostic'])if(el(id))el(id).checked=false;}
function forgetNativePin(){
 pinIdentity='';
 try{native?.clearSelectedNetwork?.()}catch{}
}
window.zebjusNativePinResult=data=>{
 const pendingPin=pinWaiters.get(data?.id);
 if(!pendingPin)return;
 clearTimeout(pendingPin.timer);pinWaiters.delete(data.id);
 data.ok?pendingPin.resolve():pendingPin.reject(Error(data.error||'Unable to pin trusted Wi-Fi network'));
};
async function pinVerifiedStatus(data){
 if(typeof native?.pinSelectedNetwork!=='function')return; // Non-Android test stub.
 const expectedSsid=link==='ap'?data.apSsid:data.ssid;
 if(!expectedSsid||!data.kitId)throw Error('Signed kit status has no Wi-Fi SSID; cannot pin selected network.');
 const identity=[data.kitId,ip,link,expectedSsid].join('|');
 if(pinIdentity===identity)return;
 const pinId='pin'+(++requestId);
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pinWaiters.delete(pinId);reject(Error('Wi-Fi pin acknowledgment timed out'))},5000);
  pinWaiters.set(pinId,{resolve,reject,timer});
  native.pinSelectedNetwork(pinId,data.kitId,ip,link.toUpperCase(),expectedSsid);
 });
 pinIdentity=identity;
}
window.zebjusNativeDiscoveryResult=data=>{
 const lookup=discoveryWaiters.get(data?.kitId);if(!lookup)return;
 clearTimeout(lookup.timer);discoveryWaiters.delete(data.kitId);
 if(data.ip&&validHost(data.ip))lookup.resolve(data.ip);
 else lookup.resolve('');
};
async function discoverKit(idOverride=''){
 const labelText=el('kitKey')?.value.trim()||'';
 let id=typeof idOverride==='string'&&/^ZFC-A[12]-[0-9A-F]{12}$/.test(idOverride)?idOverride:verifiedKitId;
 if(labelText&&!idOverride)id=window.ZebjusKitAuth.label(labelText).deviceId;
 if(!id){
  const savedId=(el('kitSavedId')?.value||'').trim().toUpperCase();
  if(/^ZFC-A[12]-[0-9A-F]{12}$/.test(savedId))id=savedId;
 }
 if(!id)throw Error('Enter saved Kit Device ID or private label for mDNS discovery.');
 if(link!=='sta')throw Error('mDNS discovery requires the Android phone and Kit on the same router (STA).');
 await ensureWifiPermission();
 let found='';
 if(typeof native?.discoverKit==='function'){
  found=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{discoveryWaiters.delete(id);resolve('')},7500);
   discoveryWaiters.set(id,{resolve,reject,timer});
   native.discoverKit(id);
  });
 }
 const known=cachedIp(id),candidate=found||known;
 discoveredId=found?id:'';cachedFallbackIp=found&&known!==found?known:'';
 if(!candidate)throw Error('mDNS found no matching Device ID and no cached verified STA IP. Enter IP manually or check router client isolation.');
 ip=candidate;staIp=candidate;el('kitIp').value=candidate;
 forgetNativePin();online=false;auth=null;
 show(found?'mDNS candidate '+candidate+' • click Connect to verify signed Kit identity':
  'Cached previously verified IP '+candidate+' • click Connect for fresh signed identity','warn');
}
async function request(route,method='GET',args={}){
 if(!allowed.has(method+' '+route))throw Error('Unsupported FlightCore operation');
 // Central admission control also covers signed-session calls whose auth is
 // already open; blocking ONLY nativeTransport would leave a race here.
 if(!route.startsWith('/api/rc/')&&(rcClaiming||rcSession||previewBusy))
  throw Error('RC ACK has priority • STOP diagnostic input before Kit requests');
 if(!auth||Date.now()>auth.expiresAt-5000){
  if(!authOpening){
   const epoch=linkEpoch,host=ip,id=verifiedKitId,scope=link==='ap'?'ap_diagnostics':'sta_observer';
   const transport=(route,method='GET',args={},headers={})=>nativeTransport(route,method,args,headers,host);
   const opening=(async()=>{
    if(!id)throw Error('Connect and verify Kit first');
    const session=diagnosticKey?await window.ZebjusKitAuth.open(transport,id,diagnosticKey):
      await window.ZebjusKitAuth.local(transport,id,scope);
    if(epoch!==linkEpoch||ip!==host||verifiedKitId!==id)throw Error('Kit link changed during authentication');
    auth=session;
   })();
   authOpening=opening;
   opening.finally(()=>{if(authOpening===opening)authOpening=null}).catch(()=>{});
  }
  await authOpening;
 }
 try{const d=await auth.request(route,method,args);if(d.kitId&&d.kitId!==verifiedKitId)throw Error('Kit Device ID mismatch');return d}
 catch(e){if(e.status===401)auth=null;throw e}
}
async function connectKit(automatic=false){
 if(otaBusy||connecting)throw Error('Another Kit operation is in progress');connecting=true;syncHeaderTransport();
 try{
  // Wait until the system permission dialog returns before signed Kit auth.
  await ensureWifiPermission(automatic);
  const value=el('kitKey').value.trim();
  if(value){
   const p=window.ZebjusKitAuth.label(value);
   // A cached address is a candidate only; identify + HMAC enrollment + signed
   // status are always repeated. Never carry permissions from the old link.
   if(link==='sta'&&!validHost(ip)){
    const fallback=cachedIp(p.deviceId);
    if(fallback){ip=fallback;staIp=fallback;el('kitIp').value=fallback;}
   }
   let raw;
   try{raw=await nativeTransport('/api/identify')}
   catch(error){
    // An mDNS TXT candidate is untrusted. Fall back only on transient link
    // failure, and perform a fresh identify/enroll/signed status on cached IP.
    const retryable=policy?.retryDisposition?.(error)?.retry!==false;
    if(link!=='sta'||discoveredId!==p.deviceId||!cachedFallbackIp||!retryable)throw error;
    ip=cachedFallbackIp;staIp=ip;el('kitIp').value=ip;
    discoveredId='';cachedFallbackIp='';
    show('mDNS address unreachable • checking last verified IP with fresh signed identity','warn');
    raw=await nativeTransport('/api/identify');
   }
   const live=JSON.parse(raw.text);
   if(raw.status!==200||live.kitId!==p.deviceId)throw Error('Private label Device ID does not match this kit.');
   if(rcSession)await releaseRc();
   if(verifiedKitId&&verifiedKitId!==p.deviceId)forgetGrants();
   verifiedKitId=p.deviceId;diagnosticKey=window.ZebjusKitAuth.diagnosticKey(p.secret,p.deviceId);
   auth=await window.ZebjusKitAuth.open(nativeTransport,verifiedKitId,link==='ap'?p.secret:diagnosticKey,link==='ap'?'setup':'diagnostic');
   el('kitKey').value='';
  }else if(!auth||Date.now()>auth.expiresAt-5000){
   // AP member auto-onboarding: the Android phone is already joined to the Kit
   // via its WPA2 SSID/password. Never use a label, OWNER key or Wi-Fi password.
   if(link!=='ap')throw Error('For STA, use saved enrollment. For simple setup, join Kit AP Wi-Fi.');
   ip='192.168.4.1';el('kitIp').value=ip;
   const raw=await nativeTransport('/api/identify');
   if(raw.status!==200)throw Error('No FlightCore Kit on the selected AP network');
   let identity;try{identity=JSON.parse(raw.text)}catch{throw Error('Invalid Kit identification response')}
   if(!/^ZFC-A[12]-[0-9A-F]{12}$/.test(identity.kitId||'')||
       identity.authVersion!==2||identity.simpleConnection!==true)
    throw Error('Kit does not support label-free AP setup; update FlightCore firmware');
   if(automatic&&verifiedKitId&&verifiedKitId!==identity.kitId)throw Error('Fallback AP belongs to a different Kit; connection rejected');
   if(verifiedKitId&&verifiedKitId!==identity.kitId)forgetGrants();
   verifiedKitId=identity.kitId;
   diagnosticKey='';
   auth=await window.ZebjusKitAuth.local(nativeTransport,verifiedKitId,'ap_diagnostics');
  }
  await status();reconnectEnabled=true;
  if(value&&link==='sta'&&el('kitRememberDiagnostic')?.checked&&diagnosticKey){
   try{await vaultCall('saveDiagnostic',verifiedKitId,diagnosticKey);show('Diagnostic key encrypted in Android Keystore; OWNER not stored','good')}
   catch(error){show('Connected but key not saved: '+error.message,'warn')}
   el('kitRememberDiagnostic').checked=false;
  }
 }finally{connecting=false;syncHeaderTransport()}
}
async function connectSavedKit(){
 if(link!=='sta')throw Error('Saved diagnostic credentials work only on STA; AP setup requires private label.');
 const id=(el('kitSavedId')?.value||'').trim().toUpperCase();
 if(!/^ZFC-A[12]-[0-9A-F]{12}$/.test(id))throw Error('Enter exact saved Kit Device ID');
 if(otaBusy||connecting)throw Error('Another Kit operation is in progress');
 connecting=true;syncHeaderTransport();
 try{
  await ensureWifiPermission();
  const credential=await vaultCall('loadDiagnostic',id);
  if(!/^[a-f0-9]{32}$/.test(credential))throw Error('No saved diagnostic credential for Kit');
  const oldInput=(el('kitIp')?.value||'').trim(),known=cachedIp(id);
  let found='';
  try{await discoverKit(id);if(discoveredId===id)found=ip}
  catch(error){show('mDNS unavailable • verifying saved Kit IP candidates','warn')}
  // Prefer fresh NSD, then verified Kit-specific cache, then manual STA IP.
  // Never treat default AP address or stale editor value as the primary target.
  const candidates=[found,known,oldInput!=='192.168.4.1'?oldInput:'']
   .filter((v,i,all)=>validHost(v)&&all.indexOf(v)===i);
  if(!candidates.length)throw Error('No Kit STA IP candidate; discover or enter router address');
  let lastFailure;
  forgetGrants();
  for(const candidate of candidates){
   try{
    ip=candidate;staIp=candidate;el('kitIp').value=candidate;
    forgetNativePin();auth=null;online=false;onKitLink=false;
    const raw=await nativeTransport('/api/identify');
    const identified=JSON.parse(raw.text);
    if(raw.status!==200||identified.kitId!==id)
     throw Error('Device ID mismatch at '+candidate+'; verify physical Kit');
    auth=await window.ZebjusKitAuth.open(nativeTransport,id,credential,'diagnostic');
    verifiedKitId=id;diagnosticKey=credential;
    await status();reconnectEnabled=true;
    finishHandover();show('STA CONNECTED • Saved Kit verified at '+candidate+' • grants OFF','good');
    return;
   }catch(error){
    lastFailure=error;
    if(/Device ID mismatch|Wrong kit|Different Kit|signed|proof|unauthoriz|session expired/i.test(String(error.message)))
     throw error;
    if(policy?.retryDisposition?.(error)?.retry===false)throw error;
    show('IP '+candidate+' unreachable • checking next Kit candidate','warn');
   }
  }
  throw lastFailure||Error('Could not verify saved Kit over selected Wi-Fi');
 }finally{connecting=false;syncHeaderTransport()}
}
async function forgetSavedKit(){
 const id=(el('kitSavedId')?.value||'').trim().toUpperCase();
 await vaultCall('forgetDiagnostic',id);
 if(verifiedKitId===id){diagnosticKey='';auth=null;online=false;forgetNativePin()}
 show('Saved diagnostic enrollment deleted; OWNER code was never stored');
}
function dropInput(message){++rcEpoch;rcInputArmed=false;rcSession='';firmwareAck=null;window.dispatchEvent(new CustomEvent('zebjus:diagnostic-control',{detail:{active:false}}));show(message,'warn');}
window.zebjusNativeOtaResult=data=>{show(data?.message||'OTA status unknown',data?.ok?'good':'warn');if(data?.ok){online=false;}};
window.zebjusNativeResult=data=>{
 const item=pending.get(data?.id);if(!item)return;
 clearTimeout(item.timer);pending.delete(data.id);
 if(data.ok&&item.raw)item.resolve({status:data.status,text:data.text||JSON.stringify(data.body||{}),proof:data.proof||''});
 else if(data.ok&&data.status<400)item.resolve(data.body||{});
 else item.reject(Error(data.error||data.body?.error||'Device HTTP '+data.status));
};
async function refreshSavedSta(){
 if(link!=='ap'||!online||!onKitLink||!verifiedKitId)return;
 const data=await request('/api/wifi/saved');
 const names=(data.networks||[]).map(n=>n.ssid).filter(v=>typeof v==='string'&&v.length);
 const preferred=typeof data.preferred==='string'?data.preferred:'';
 const label=el('kitSavedStaStatus');
 if(label)label.textContent=preferred?'Saved STA: '+preferred+(names.length>1?' ('+names.length+' networks)':''):'Saved STA: none';
 if(preferred&&el('kitSsid')&&!el('kitSsid').value.trim())el('kitSsid').value=preferred;
 savedProfilesFor=verifiedKitId;
}
function syncLedButton(){
 const b=el('flightLedToggle');if(!b)return;
 b.disabled=otaBusy||connecting||ledBusy||!online||!onKitLink||Date.now()-lastStatus>12000;
 b.setAttribute('aria-pressed',String(ledOn));
 b.setAttribute('aria-label','Kit internal LED '+(ledOn?'ON':'OFF')+(b.disabled?' • kit not verified':''));
 b.title='Kit internal LED '+(ledOn?'ON':'OFF');
 const caption=b.querySelector?.('span');if(caption)caption.textContent=ledOn?'ON':'LED';
}
async function toggleLed(forceOff=false){
 if(ledBusy||otaBusy||!online||!onKitLink)throw Error('Verify Kit connection before using internal LED');
 ledBusy=true;syncLedButton();const next=forceOff?false:!ledOn;
 try{
  const response=await command('ZJLED,'+(++ledSequence)+',SET,'+(next?'100':'0'));
  if(response?.accepted!==true)throw Error('Kit did not acknowledge LED command');
  ledOn=next;show('KIT '+link.toUpperCase()+' CONNECTED • LED '+(ledOn?'ON':'OFF'),'good');
 }finally{ledBusy=false;syncLedButton()}
}
function finishHandover(){handoverExpectedKit='';handoverAttempts=0;clearTimeout(handoverTimer);handoverTimer=null;clearTimeout(staObserverTimer);staObserverTimer=null;}
function scheduleStaObserver(delay=2500){
 if(!handoverExpectedKit||link!=='sta'||online||otaBusy||document.hidden)return;
 clearTimeout(staObserverTimer);
 staObserverTimer=setTimeout(async()=>{
  staObserverTimer=null;
  if(!handoverExpectedKit||link!=='sta'||online||otaBusy||document.hidden||connecting)return;
  const wanted=handoverExpectedKit;
  connecting=true;syncHeaderTransport();
  try{
   await ensureWifiPermission(true);
   await discoverKit(wanted); // NSD candidate is still untrusted.
   const raw=await nativeTransport('/api/identify');
   const identity=JSON.parse(raw.text);
   if(raw.status!==200||identity.kitId!==wanted)throw Error('STA Device ID mismatch');
   auth=diagnosticKey?await window.ZebjusKitAuth.open(nativeTransport,wanted,diagnosticKey):
     await window.ZebjusKitAuth.local(nativeTransport,wanted,'sta_observer');
   verifiedKitId=wanted;
   await status();reconnectEnabled=true;
   show(controlAuthorized?'STA CONNECTED • ready for ARM':'STA CONNECTED • read-only observer • use saved pairing for control','good');
  }catch(error){
   show('STA CONNECTING • '+String(error.message||error).slice(0,125)+' • AP fallback remains available','warn');
  }finally{connecting=false;syncHeaderTransport();if(!online)scheduleStaObserver(6000)}
 },delay);
}
function scheduleFallbackCheck(delay=25000){
 if(!handoverExpectedKit||link!=='sta'||online||otaBusy||document.hidden)return;
 clearTimeout(handoverTimer);
 handoverTimer=setTimeout(async()=>{
  handoverTimer=null;
  if(!handoverExpectedKit||link!=='sta'||online||otaBusy||document.hidden)return;
  if(connecting){scheduleFallbackCheck(10000);return;}
  // Android cannot forcibly join an AP; probe only the current Wi-Fi, and
  // accept fallback solely after a fresh signed status for the SAME Kit ID.
  const wanted=handoverExpectedKit,epoch=linkEpoch;
  connecting=true;
  try{
   // Probe in a separate transport. Never flip the visible AP/STA selector
   // just because a timed fallback probe is running on the current Wi-Fi.
   const transport=(route,method='GET',args={},headers={})=>nativeTransport(route,method,args,headers,'192.168.4.1');
   const raw=await transport('/api/identify'),identity=JSON.parse(raw.text);
   if(raw.status!==200||identity.kitId!==wanted)throw Error('Fallback AP belongs to a different Kit');
   const session=await window.ZebjusKitAuth.local(transport,wanted,'ap_diagnostics');
   const state=await session.request('/api/status');
   if(state.kitId!==wanted||state.requestTransport!=='AP'||state.apActive!==true||epoch!==linkEpoch)
    throw Error('Fallback identity/path not verified');
   forgetNativePin();link='ap';ip='192.168.4.1';auth=session;verifiedKitId=wanted;
   if(el('kitLink'))el('kitLink').value='ap';if(el('kitIp'))el('kitIp').value=ip;
   await status();reconnectEnabled=true;finishHandover();
   show('AP FALLBACK CONNECTED • saved networks retained','warn');return;
  }catch(error){
   show('STA CONNECTING • join saved router or Kit fallback hotspot • '+String(error.message||error).slice(0,100),'warn');
  }finally{connecting=false;syncHeaderTransport()}
  if(++handoverAttempts<8)scheduleFallbackCheck(18000);
  else{handoverExpectedKit='';show('STA timeout • Kit should restore AP; reconnect phone to Kit hotspot and tap Connect Kit','warn')}
 },delay);
}
async function status(){
 const epoch=linkEpoch;
 const data=await request('/api/status');
 if(epoch!==linkEpoch)throw Error('Kit link changed during status');
 if(verifiedKitId&&verifiedKitId!==data.kitId){online=false;dropInput('Wrong kit: input released');throw Error('Kit hardware ID changed — reconnect and verify physical board')}
 verifiedKitId=data.kitId||'';mode=data.mode||mode;
 // Reject the wrong interface BEFORE pinning Wi-Fi or advertising ONLINE.
 onKitLink=data.requestTransport===link.toUpperCase()&&(link==='ap'?data.apActive===true:data.staConnected===true);
 if(!onKitLink){online=false;dropInput('Wrong Wi-Fi path • select '+(data.requestTransport||'the actual')+' connection and reconnect');throw Error('Kit responded over '+(data.requestTransport||'unknown')+' while '+link.toUpperCase()+' was selected')}
 // Pin Android's exact Wi-Fi Network + signed SSID/BSSID before any writes.
 await pinVerifiedStatus(data);
 if(epoch!==linkEpoch)throw Error('Kit link changed during Wi-Fi verification');
 online=true;lastStatus=Date.now();statusFailures=0;
 inputArmSupported=data.inputArmSupported===true;controlAuthorized=data.controlAuthorized===true;
 if(typeof data.ledOn==='boolean'&&!ledBusy)ledOn=data.ledOn;
 if(el('kitSavedId')&&verifiedKitId)el('kitSavedId').value=verifiedKitId;
 saveVerifiedIp(verifiedKitId,ip,link==='ap'?data.apSsid:data.ssid);
 if(kitCode&&data.kitCode!==kitCode)rcSession='';kitCode=data.kitCode||'';
 el('kitMode').value=mode;el('kitDevice').textContent=(data.board||'FlightCore')+' • '+(data.version||'')+' • '+(data.phase||'');
 el('kitAddresses').textContent='STA: '+(data.ip||'offline')+' • AP: '+(data.apIp||'offline');
 if(el('kitAppOta'))el('kitAppOta').disabled=otaBusy||!online||!onKitLink||!!rcSession;
 if(data.ip&&validHost(data.ip))staIp=data.ip;
 if(link==='sta'&&handoverExpectedKit===verifiedKitId)finishHandover();
 if(link==='ap'&&data.staCredentialsSaved&&savedProfilesFor!==verifiedKitId){
  try{await refreshSavedSta()}catch(error){if(el('kitSavedStaStatus'))el('kitSavedStaStatus').textContent='Saved STA: could not load ('+error.message+')'}
 }else if(link==='ap'&&!data.staCredentialsSaved&&el('kitSavedStaStatus'))el('kitSavedStaStatus').textContent='Saved STA: none';
 if(epoch!==linkEpoch)throw Error('Kit link changed during status');
 syncLedButton();
 const fallback=link==='ap'&&data.mode!=='ap'&&data.phase==='sta_failed_ap_fallback';
 show((fallback?'AP FALLBACK CONNECTED • saved STA unavailable':('Phone → '+data.requestTransport+ (auth?.local?(link==='ap'?' CONNECTED • AP-local signed session':' CONNECTED • STA signed observer'):' VERIFIED signed identity')))+' • Router STA '+(data.staConnected?'online':'offline')+' • '+(rcSession?'Android owns diagnostic input':'control released'),'good');
 return data;
}
async function scan(){
 const data=await request('/api/wifi/scan');const box=el('kitNetworks');if(!box)return data;
 if(data.state==='scanning'){show('Scanning nearby Wi-Fi…');return data}
 box.replaceChildren(new Option('Select scanned Wi-Fi',''));
 for(const n of data.networks||[])if(n.ssid)box.add(new Option(n.ssid+'  '+n.rssi+' dBm'+(n.secure?' 🔒':''),n.ssid));
 show('Found '+(data.networks||[]).length+' Wi-Fi networks','good');return data;
}
async function testSave(){
 const ssid=el('kitSsid').value.trim(),password=el('kitPassword').value;
 if(!ssid)throw Error('Choose or enter an SSID first');
 await request('/api/wifi/test','POST',{ssid,password});
 el('kitPassword').value='';show('Testing router association and DHCP • not saved yet.');
 for(let attempt=0;attempt<30;attempt++){
  await new Promise(r=>setTimeout(r,1000));let d;try{d=await request('/api/status')}catch{continue}
  if(d.wifiTestState==='saved'){show('VERIFIED & SAVED • STA '+d.ip+' • reconnect laptop to '+d.ssid,'good');return}
  if(d.wifiTestState==='failed')throw Error('Not saved • router test failed (reason '+d.lastStaFailureReason+'). Previous credentials preserved.');
 }
 throw Error('Save not verified. Reconnect the kit and inspect status before retrying.');
}
async function setMode(desired=el('kitMode')?.value){
 if(!['ap','sta','auto'].includes(desired))throw Error('Invalid Wi-Fi mode');
 if(otaBusy||connecting)throw Error('Kit operation is already in progress');
 if(!online||!onKitLink)throw Error('Connect and verify the Kit on its current AP/STA network before switching');
 const before=link,same=desired===before,physical=desired==='auto'?'sta':desired;
 if(same&&mode===desired){show('KIT '+before.toUpperCase()+' CONNECTED • already selected','good');return}
 if(rcSession||rcClaiming)await releaseRc();
 connecting=true;syncHeaderTransport();
 const id=verifiedKitId;
 try{
  show('SWITCHING '+before.toUpperCase()+' → '+physical.toUpperCase()+' • sending authenticated mode command','');
  const response=await request('/api/wifi/mode','POST',{mode:desired});
  if(response.kitId!==id||response.mode!==desired||response.state!=='switching')
   throw Error('Kit did not verify mode switching acknowledgement');
  // Only switch Android's request target AFTER the authenticated command is accepted.
  ++linkEpoch;authOpening=null;finishHandover();forgetGrants();forgetNativePin();dropInput('Switching link • inputs disarmed');
  if(before==='sta'&&validHost(ip))staIp=ip;
  link=physical;mode=desired;ip=physical==='ap'?'192.168.4.1':staIp;
  if(el('kitLink'))el('kitLink').value=link;
  if(el('kitMode'))el('kitMode').value=mode;
  if(el('kitIp'))el('kitIp').value=ip;
  online=false;onKitLink=false;auth=null;reconnectEnabled=false;
  savedProfilesFor='';ledOn=false;
  if(physical==='sta'){
   handoverExpectedKit=id;
   show('STA CONNECTING • saved Wi-Fi selected • join same router when available; AP fallback remains enabled','');
  }else show('AP SWITCHING • join Kit hotspot; waiting for signed connection','');
 }finally{connecting=false;syncHeaderTransport()}
 if(physical==='ap')scheduleAutoApConnect(1200);
 else{scheduleStaObserver(3000);scheduleFallbackCheck()}
}
async function command(line){
 if(typeof line!=='string'||line.length>160||!/^(ZJI2C,SCAN|ZJINFO,GET|ZJLED,[0-9]+,(?:STOP|KEEP|SET|BLINK|FADE|SAFE|WARNING|SOS|PATTERN)(?:,.*)?|ZJTEL,RATE,(?:10|20|50))$/.test(line))throw Error('Command is not allowed on the network bridge');
 return request('/api/command','POST',{line});
}
async function pollTelemetry(){
 if(rcClaiming||rcSession||previewBusy)throw Error('Release diagnostic input before requesting full IMU telemetry; RC ACK has priority.');
 const data=await request('/api/telemetry');const line='ZJTEL,1,'+data.board+','+(data.rcSeq||0)+','+data.millis+',0x'+Number(data.address).toString(16).toUpperCase()+','+(data.gyroReady?'READY':'NOT_FOUND')+','+data.roll+','+data.pitch+','+data.yaw+',1,0';
 window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line,transport:mode,device:'android-native'}}));return data;
}
async function onWebRequest(req,peer){
 if(!peer?.status()?.paired)return peer?.sendNetworkResponse?.({id:req?.id,ok:false,error:'Pair WebApp with Android first'});
 const method=req?.method,route=req?.route,id=req?.id;
 if(!Number.isInteger(id)||id<1||id>1e9||!allowed.has(method+' '+route))return;
 const grant=grantFor(route,method);
 if(!grant||!el(grant)?.checked)return peer.sendNetworkResponse({id,ok:false,error:'Android has not granted '+(grant||'this operation')});
 if(!online||!onKitLink)return peer.sendNetworkResponse({id,ok:false,error:'Selected Kit Wi-Fi is not verified'});
 // Paired WebApp reads, Wi-Fi changes and diagnostics may not starve the
 // Android owner's 100ms RC frames. Emergency STOP is still authorized.
 if((rcClaiming||rcSession||previewBusy)&&!(method==='POST'&&route==='/api/rc/stop'))
  return peer.sendNetworkResponse({id,ok:false,error:'Android RC active • release control before requesting Kit data'});
 try{
  const data=await request(route,method,req.args||{});
  peer.sendNetworkResponse({id,ok:true,data});
 }catch(e){peer.sendNetworkResponse({id,ok:false,error:String(e.message||e).slice(0,150)})}
}
async function releaseRc(){
 const session=rcSession;dropInput('Diagnostic input released • motors disabled');
 if(session&&online)await request('/api/rc/release','POST',{session}).catch(()=>{});
}
async function claimRc(){
 if(!online||!onKitLink)throw Error('Connect and verify the phone on the selected kit '+link.toUpperCase()+' network first.');
 if(rcClaiming)throw Error('ARM request is already in progress');
 const epoch=rcEpoch,networkEpoch=linkEpoch,id=verifiedKitId;
 rcClaiming=true;
 try{
  // A periodic signed GET and RC CLAIM share the same monotonic session and
  // native single-worker queue. Finish any already-started status transaction
  // before claiming input, and stop starting more while ARM is in progress.
  if(statusInFlight)await statusInFlight.catch(()=>{});
  // Covers a paired WebApp read, LED command or Wi-Fi operation that was
  // already submitted before ARM. New non-RC traffic is now rejected.
  if(nonRcNativeRequests.size)await Promise.allSettled([...nonRcNativeRequests]);
  if(epoch!==rcEpoch||networkEpoch!==linkEpoch||id!==verifiedKitId||!online||!onKitLink||document.hidden)
   throw Error('Kit changed or went offline before ARM; reconnect and verify');
  const d=await request('/api/rc/claim','POST',{source:'ANDROID',kitCode});
  if(d.kitId!==verifiedKitId||!d.session)throw Error('Firmware claim identity failed');
  if(epoch!==rcEpoch||!online||document.hidden){
   await request('/api/rc/release','POST',{session:d.session}).catch(()=>{});
   throw Error('ARM cancelled; input released');
  }
  rcSession=d.session;rcSeq=0;firmwareAck=null;
  window.dispatchEvent(new CustomEvent('zebjus:diagnostic-control',{detail:{active:true}}));
  show('Android owns input • motors disabled','good');
 }finally{rcClaiming=false}
}
async function armControls(){
 if(!canArm())throw Error(inputArmSupported?'Verify Kit control permission first':'Update FlightCore firmware for direct ARM');
 if(rcSession)await releaseRc();
 await claimRc();
 rcInputArmed=true;
 try{
  await previewControls({throttle:1000,axes:{roll:0,pitch:0,yaw:0},responseMode:'Medium'},true);
  if(!rcInputArmed||!firmwareAck?.inputArmed)throw Error('Kit did not acknowledge ARM');
 }catch(error){await releaseRc();throw error;}
 return firmwareAck;
}
function canArm(){return inputArmSupported&&controlAuthorized&&!otaBusy&&!connecting&&!rcClaiming&&!previewBusy&&online&&onKitLink&&Date.now()-lastStatus<12000;}
function previewControls(m,critical=false){
 if(otaBusy||!online||!onKitLink||!rcSession||previewBusy||rcClaiming||document.hidden||(!critical&&Date.now()-lastPreview<100))return;
 if(!m?.axes||![m.axes.roll,m.axes.pitch,m.axes.yaw,m.throttle].every(Number.isFinite))return;
 lastPreview=Date.now();previewBusy=true;const at=performance.now(),session=rcSession,epoch=rcEpoch,frameSeq=++rcSeq;
 const clamp=v=>Math.max(1000,Math.min(2000,Math.round(1500+500*v)));
 return request('/api/rc/preview','POST',{session,source:'ANDROID',seq:frameSeq,armed:'false',inputArmed:String(rcInputArmed),ledKeep:String(ledOn),responseMode:m.responseMode||'Medium',
  throttle:Math.max(1000,Math.min(2000,Math.round(m.throttle))),roll:clamp(m.axes.roll),pitch:clamp(m.axes.pitch),yaw:clamp(m.axes.yaw)})
 .then(d=>{
  if(session!==rcSession||epoch!==rcEpoch)return;
  if(!d.received||d.kitId!==verifiedKitId||d.seq!==frameSeq||rcInputArmed&&d.inputArmed!==true)throw Error('Invalid firmware receive ACK');
  lastStatus=Date.now();statusFailures=0;
  firmwareAck={seq:d.seq,at:Date.now(),rtt:Math.round(performance.now()-at),inputArmed:d.inputArmed===true};
  if(typeof d.ledOn==='boolean'&&!ledBusy)ledOn=d.ledOn;
  if(el('kitRcAck'))el('kitRcAck').textContent='ESP32 received #'+d.seq+' • '+firmwareAck.rtt+' ms round trip';
 })
 .catch(e=>{
  if(session!==rcSession||epoch!==rcEpoch)return;
  // A delayed/rejected RC ACK disarms the diagnostic input, but must not
  // relabel the verified AP Wi-Fi link itself as disconnected.
  dropInput('RC ACK failed • diagnostic input disarmed • '+e.message);
  void request('/api/rc/release','POST',{session}).catch(()=>{});
  if(critical)throw e;
 })
 .finally(()=>{previewBusy=false});
}
async function pollConnection(){
 if(otaBusy||!reconnectEnabled||connecting||statusBusy||document.hidden)return;
 // Never queue expensive signed status/SSID verification ahead of ARM/RC.
 // A missing RC ACK is handled by the flight UI and the 350ms firmware
 // watchdog; it is NOT evidence that the AP Wi-Fi association is gone.
 // Poll only after diagnostic control is released, even when ACK is stale.
 if(rcClaiming||rcSession||previewBusy)return;
 const epoch=linkEpoch;statusBusy=true;
 const task=status();statusInFlight=task;
 try{await task}
 catch(error){
  if(epoch!==linkEpoch)return;
  const fatal=error.status===401||error.status===403||/identity|wrong|mismatch|Wi-Fi path|pin|SSID|BSSID/i.test(error.message);
  if(fatal||++statusFailures>=3||Date.now()-lastStatus>=12000){
   online=false;dropInput('Kit disconnected • '+error.message+' • retrying same Device ID');
  }else show('Kit response delayed • retrying same connection','warn');
 }finally{if(statusInFlight===task)statusInFlight=null;statusBusy=false;syncHeaderTransport()}
}
// Secure Android OTA v1.7.3 uses the same admin-enrolled AES-GCM/HMAC session as the
// WebApp, never the legacy raw X-ZJ-Key multipart endpoint. No credentials are
// retained in localStorage, IndexedDB, URLs, files or WebRTC signaling.
const firmwareHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const otaSleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Recovery invariant: a lost ACK is reconciled against a fresh, signed
// firmware status from the SAME admin session before any further flash write.
// Older firmware without ota.offset stays fail-closed on uncertain writes.
async function uploadAdminApp(file){
 if(otaBusy||!online||!onKitLink||!verifiedKitId||!['ap','sta'].includes(link))throw Error('Connect and verify the same Kit over AP/STA first.');
 if(rcSession)throw Error('Release Android diagnostic control before OTA.');
 const credential=el('kitOtaAdminKey')?.value.trim()||'';
 if(el('kitOtaAdminKey'))el('kitOtaAdminKey').value='';
 if(!/^[a-fA-F0-9]{32}$/.test(credential))throw Error('Enter the 32-hex USB-paired OWNER key. Diagnostic label secrets cannot authorize firmware.');
 if(!file||!/\.bin$/i.test(file.name)||/factory|merged/i.test(file.name))throw Error('Select a matching official APP .bin, not Factory.');
 otaBusy=true;otaCancelRequested=false;otaPaused=false;otaNeedsRecheck=false;reconnectEnabled=false;
 syncHeaderTransport();
 if(el('kitOtaProgress'))el('kitOtaProgress').value=0;
 show('OTA preflight • verifying official APP image size, board and SHA-256');
 try{native?.setOtaKeepAwake?.(true)}catch{}
 const id=verifiedKitId,host=ip,transport=link;
 let admin=null,beginAttempted=false,endAttempted=false,pre=null,hash='',bytes,board='',result=null;
 const checkTarget=(allowCancellation=false)=>{
  if(ip!==host||link!==transport||verifiedKitId!==id)throw Error('Selected Kit or Wi-Fi link changed during firmware upload.');
  if(otaCancelRequested&&!allowCancellation)throw Error('OTA cancelled: no further firmware writes will be sent.');
 };
 const checkStatus=data=>{
  if(data.kitId!==id||data.board!==board||data.requestTransport!==transport.toUpperCase())
   throw Error('Different Kit, physical board or network answered; write state cannot be trusted.');
 };
 const signedProgress=async()=>{
  // Auth.request serializes signed sequence numbers even after transport errors.
  const state=await admin.request('/api/status');checkStatus(state);
  const ota=state.ota;
  if(!ota||typeof ota.active!=='boolean'||!Number.isSafeInteger(ota.offset))
   throw Error('Controller cannot report signed OTA offset; do NOT retry the flash write. Update firmware over USB if required.');
  return {state,ota};
 };
 const waitResume=async (offset,allowNext=offset)=>{
  if(!otaPaused&&!otaNeedsRecheck)return;
  show('OTA paused • waiting for foreground and signed offset verification','warn');
  const deadline=Date.now()+45000;
  while(otaPaused&&Date.now()<deadline){
   if(otaCancelRequested)throw Error('OTA cancelled while backgrounded');
   await otaSleep(250);
  }
  if(otaPaused)throw Error('OTA paused too long; safe recovery requires a new verified session');
  otaNeedsRecheck=false;
  const {ota}=await signedProgress();
  if(!owned(ota,offset)&&!owned(ota,allowNext))throw Error('OTA resume unsafe: signed session/hash/offset changed; no further writes');
  show('OTA resumed • signed offset '+offset+' verified','good');
 };
 const owned=(ota,offset)=>ota.active===true&&ota.owned===true&&ota.size===bytes.length&&
  String(ota.sha256).toLowerCase()===hash&&ota.offset===offset;
 if(el('kitAppOta'))el('kitAppOta').disabled=true;
 if(el('kitOtaCancel'))el('kitOtaCancel').disabled=false;
 for(const selector of ['kitLink','kitIp','kitSwitch'])if(el(selector))el(selector).disabled=true;
 try{
  const catalogResponse=await fetch('./firmware-catalog.json',{cache:'no-store'});
  if(!catalogResponse.ok)throw Error('Official firmware catalog is unavailable in this Android release.');
  const catalog=await catalogResponse.json();
  const target=policy?.otaTarget?.({method:'wifi',kit:{connected:online&&onKitLink,transport:link,kitId:id,board:id.slice(0,6)}});
  board=target?.boardId||(id.startsWith('ZFC-A2-')?'ZFC-A2':'ZFC-A1');
  if(target&&target.kitId!==id)throw Error('Selected Wi-Fi Kit is not verified for OTA');
  const entry=catalog.boards?.find(v=>v.id===board),release=entry?.latest?.app;
  if(!release?.available||!release.sha256||file.name!==release.file)throw Error('Choose the official '+board+' APP firmware from the currently bundled release.');
  // Reject oversized, wrong type and board image before allocating whole firmware.
  const advertisedSize=Number(file.size);
  if(!Number.isSafeInteger(advertisedSize)||advertisedSize!==release.size||
     advertisedSize<32768||advertisedSize>0x1e0000)
   throw Error('Firmware size does not match official APP catalog; nothing allocated/flashed');
  if(file.type&&file.type!=='application/octet-stream'&&file.type!=='application/x-binary')
   throw Error('Firmware MIME type unsupported; choose the official APP .bin');
  if(typeof file.slice!=='function')throw Error('Firmware picker does not support header verification');
  const header=new Uint8Array(await file.slice(0,208).arrayBuffer());
  const hChip=header[12]|(header[13]<<8),hDescriptor=(header[32]|header[33]<<8|header[34]<<16|header[35]<<24)>>>0;
  if(header.length!==208||header[0]!==0xe9||header[1]<1||header[1]>16||
     hChip!==(board==='ZFC-A2'?13:5)||hDescriptor!==0xabcd5432)
   throw Error('ESP header or physical board mismatch; full image not allocated');
  const buffer=await file.arrayBuffer();
  if(buffer.byteLength!==advertisedSize)throw Error('Firmware file changed size during read');
  bytes=new Uint8Array(buffer);
  checkTarget();
  hash=firmwareHex(window.ZfcCrypto.sha256(bytes));
  if(bytes.length!==release.size||hash!==String(release.sha256).toLowerCase())throw Error('Official APP image size/SHA-256 mismatch. Nothing was flashed.');
  if(bytes.length<32768||bytes.length>0x1e0000||bytes[0]!==0xe9||bytes[1]<1||bytes[1]>16)
   throw Error('Invalid ESP32 application image.');
  const chip=bytes[12]|(bytes[13]<<8),descriptor=(bytes[32]|bytes[33]<<8|bytes[34]<<16|bytes[35]<<24)>>>0;
  if(chip!==(board==='ZFC-A2'?13:5)||descriptor!==0xabcd5432)throw Error('Firmware header does not match this physical board.');
  const expectedBuild=firmwareHex(bytes.slice(176,208));
  show('Authenticating USB-paired OWNER code for '+id+'…');
  admin=await window.ZebjusKitAuth.open(nativeTransport,id,credential,'admin');
  checkTarget();
  pre=await admin.request('/api/status');checkStatus(pre);
  if(pre.rc?.claimed||pre.motorsArmed!==false||pre.firmwareControl!==false||pre.otaAppOnly!==true)
   throw Error('Release control and DISARM. Firmware must guarantee disabled motor outputs.');
  if(pre.partitionLayout!=='ZFC_DUAL_1E0000'||bytes.length>(pre.otaMaxBytes||0))
   throw Error('Existing OTA partition incompatible. Use USB recovery; preserve saved Wi-Fi.');
  if(pre.encryptedOta!==true||!/^[a-fA-F0-9]{32}$/.test(pre.bootId||''))
   throw Error('Kit does not support encrypted, independently verifiable APP OTA.');
  const chunkSize=Number(pre.otaChunkMaxBytes)>=2048?2048:Number(pre.otaChunkMaxBytes)>=1024?1024:384;
  show('Encrypted '+chunkSize+'-byte APP OTA • verified '+id);
  checkTarget();
  beginAttempted=true;
  try{
   const begin=await admin.request('/api/firmware/begin','POST',{size:bytes.length,sha256:hash,boardId:board});
   if(begin.kitId!==id||begin.offset!==0)throw Error('Controller did not ACK the correct device and initial offset.');
  }catch(error){
   const {ota}=await signedProgress().catch(e=>{throw Error('BEGIN unconfirmed: '+e.message)});
   if(!owned(ota,0))throw Error('BEGIN unconfirmed; controller OTA state does not match this session. No further write sent.');
   show('Recovered lost BEGIN ACK using signed controller state','warn');
  }
  let offset=0,lastPct=-1;
  while(offset<bytes.length){
   checkTarget();
   await waitResume(offset);
   const chunk=bytes.subarray(offset,Math.min(offset+chunkSize,bytes.length));
   const next=offset+chunk.length;
   let completed=false;
   for(let attempt=0;attempt<2&&!completed;attempt++){
    checkTarget();
    try{
     const ack=await admin.request('/api/firmware/chunk','POST',{offset,data:firmwareHex(chunk)});
     if(ack.kitId!==id||ack.offset!==offset+chunk.length)throw Error('Authenticated firmware chunk ACK/offset mismatch.');
     completed=true;
    }catch(error){
     let progress;
     try{if(otaPaused)await waitResume(offset,next);progress=(await signedProgress()).ota}
     catch(e){throw Error('WRITE UNCONFIRMED at '+offset+': '+e.message+'. Do not restart OTA without checking the Kit.');}
     if(owned(progress,next)){
      completed=true;show('Recovered lost chunk ACK at byte '+next,'warn');
     }else if(owned(progress,offset)&&attempt===0&&policy?.retryDisposition?.(error)?.retry!==false){
      show('Signed offset unchanged at '+offset+'; retrying this chunk once','warn');
     }else{
      throw Error('WRITE UNCONFIRMED at '+offset+': offset/session mismatch ('+progress.offset+'). Do not retry automatically.');
     }
    }
   }
   if(!completed)throw Error('Chunk recovery exhausted: verify signed status before retrying.');
   offset=next;
   const pct=Math.floor(100*offset/bytes.length);
   if(pct!==lastPct){lastPct=pct;if(el('kitOtaProgress'))el('kitOtaProgress').value=pct;show('Encrypted APP upload '+pct+'% • '+chunkSize+' B chunks');}
  }
  checkTarget();
  await waitResume(offset);
  endAttempted=true; // An uncertain END could already have selected a new boot partition.
  try{
   const done=await admin.request('/api/firmware/end','POST');
   if(done.kitId!==id||done.sha256!==hash||done.rebooting!==true)throw Error('Firmware SHA-256 or reboot acknowledgment invalid.');
  }catch(error){
   show('END acknowledgment unconfirmed; checking new boot and running build. Never resending END blindly.','warn');
  }
  if(el('kitOtaCancel'))el('kitOtaCancel').disabled=true;
  show('OTA transmitted • waiting for verified controller reboot and running build','warn');
  const deadline=Date.now()+120000;
  await otaSleep(1700);
  while(Date.now()<deadline){
   checkTarget(true);
   try{
    const live=await window.ZebjusKitAuth.open(nativeTransport,id,credential,'admin');
    const status=await live.request('/api/status');checkStatus(status);
    if(status.bootId===pre.bootId||!status.bootId)throw Error('Waiting for a new firmware boot ID.');
    if(status.version!==catalog.version||String(status.appElfSha256||'').toLowerCase()!==expectedBuild)
     throw Error('Updated firmware version/build is not yet verified.');
    result=status;break;
   }catch(e){if(/Different Kit|network answered|Selected Kit/i.test(String(e.message)))throw e}
   await otaSleep(2200);
  }
  if(!result){online=false;show('OTA END UNCONFIRMED / runtime NOT VERIFIED. Inspect same Kit and running build before any retry.','warn');return}
  auth=null;online=false;
  show('OTA VERIFIED • '+id+' • '+result.version+' • matching new boot & running build','good');
  if(el('kitOtaProgress'))el('kitOtaProgress').value=100;
 }catch(error){
  // Only abort a positively identified, still-active SAME-session OTA.
  // If status is unreachable, leaving the firmware's 30s inactivity rollback
  // is safer than racing a possibly completed END or replaying a write.
  let abortMessage='';
  if(beginAttempted&&!endAttempted&&admin&&bytes&&hash){
   try{
    const {ota}=await signedProgress();
    if(ota.active&&ota.owned&&ota.size===bytes.length&&String(ota.sha256).toLowerCase()===hash){
     const response=await admin.request('/api/firmware/abort','POST');
     abortMessage=response.aborted===true?' • controller confirmed OTA aborted':' • abort response unconfirmed';
    }else if(ota.active){abortMessage=' • different/unconfirmed OTA owner: do not retry';}
   }catch(e){abortMessage=' • flash state not confirmed; let controller timeout, inspect status before retry';}
  }
  show('Secure APP OTA stopped: '+String(error?.message||error)+abortMessage+' • no blind retries','warn');
  if(el('kitOtaPhase'))el('kitOtaPhase').textContent=
   (abortMessage.includes('controller confirmed OTA aborted')?'OTA ABORT CONFIRMED':
    abortMessage.includes('not confirmed')||abortMessage.includes('not trusted')||abortMessage.includes('not reachable')?'OTA STATE UNCONFIRMED':'OTA STOPPED / CHECK KIT')+
   ' • '+String(error?.message||error)+abortMessage;
  throw error;
 }finally{
  otaBusy=false;otaCancelRequested=false;otaPaused=false;otaNeedsRecheck=false;auth=null;
  syncHeaderTransport();
  try{native?.setOtaKeepAwake?.(false)}catch{}
  for(const selector of ['kitLink','kitIp','kitSwitch'])if(el(selector))el(selector).disabled=false;
  if(el('kitAppOta'))el('kitAppOta').disabled=!online||!onKitLink||!!rcSession;
  if(el('kitOtaCancel'))el('kitOtaCancel').disabled=true;
  reconnectEnabled=online&&onKitLink;
 }
}
function action(id,fn){el(id)?.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>show(e.message,'warn')))}
function syncHeaderTransport(){
 const b=el('flightNetworkSwitch');if(!b)return;
 b.setAttribute('aria-checked',String(link==='sta'));
 b.setAttribute('aria-label','Selected FlightCore request connection: '+link.toUpperCase()+'. Tap to select '+(link==='ap'?'STA':'AP'));
 b.dataset.transport=link;
 b.disabled=otaBusy||connecting||!native?.requestSecure;
 syncLedButton();
 for(const id of ['kitLink','kitIp','kitKey','kitSavedId','kitConnect','kitConnectSaved','kitDiscover','kitForgetSaved'])if(el(id))el(id).disabled=otaBusy||connecting;
 window.dispatchEvent(new CustomEvent('zebjus:kit-transport',{detail:{transport:link,online:online&&onKitLink}}));
}
function selectTransport(next){
 if(!['ap','sta'].includes(next)||otaBusy||connecting)return false;
 if(next===link){syncHeaderTransport();return true}
 const e=el('kitLink');if(!e)return false;
 e.value=next;e.dispatchEvent(new Event('change',{bubbles:true}));
 return link===next;
}
function bind(){
 if(!el('kitNetStatus'))return;
 syncHeaderTransport();
 if(!native?.requestSecure){show('Install updated Android APK for signed Wi-Fi sessions');return;}
 el('kitIp').value=ip;
 syncHeaderTransport();
 action('flightNetworkSwitch',async()=>{
  if(otaBusy||connecting)return;
  await window.ZebjusFlightApp?.doStop();
  const next=link==='ap'?'sta':'ap';
  try{await setMode(next)}finally{
   el('flightSettings')?.click();window.ZebjusMobileMenu?.select('wifi');
  }
 });
 el('kitLink').addEventListener('change',()=>{
  if(online&&onKitLink&&!otaBusy&&!connecting){const desired=el('kitLink').value;el('kitLink').value=link;
   void setMode(desired).catch(error=>show('Wi-Fi switch failed: '+error.message,'warn'));return;}
  if(otaBusy||connecting){el('kitLink').value=link;show('Kit operation active • wait for verification or OTA recovery before switching','warn');return;}
  if(!['ap','sta'].includes(el('kitLink').value)){el('kitLink').value=link;return;}
  if(el('kitLink').value===link){syncHeaderTransport();return;}
  window.ZebjusFlightApp?.doStop();
  ++linkEpoch;authOpening=null;finishHandover();void releaseRc();forgetGrants();forgetNativePin();if(link==='sta'&&validHost(ip))staIp=ip;
  discoveredId='';cachedFallbackIp='';link=el('kitLink').value;ip=link==='ap'?'192.168.4.1':staIp;
  el('kitIp').value=ip;online=false;auth=null;diagnosticKey='';reconnectEnabled=false;kitCode='';verifiedKitId='';onKitLink=false;
  syncHeaderTransport();
  show(link==='sta'?'STA selected • join the same router as this Kit, discover and verify again.':'AP selected • join the Kit hotspot; app will connect automatically.');
  if(link==='ap')scheduleAutoApConnect();
 });
 el('kitIp').addEventListener('change',()=>{if(otaBusy||connecting){el('kitIp').value=ip;return;}++linkEpoch;authOpening=null;void releaseRc();forgetGrants();forgetNativePin();discoveredId='';cachedFallbackIp='';ip=el('kitIp').value.trim();if(link==='sta')staIp=ip;online=false;auth=null;diagnosticKey='';reconnectEnabled=false;kitCode='';verifiedKitId='';onKitLink=false});
 el('kitKey').addEventListener('input',()=>{reconnectEnabled=false});
 el('kitNetworks').addEventListener('change',()=>{el('kitSsid').value=el('kitNetworks').value});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void releaseRc();else scheduleAutoApConnect(300)});
 window.addEventListener('blur',()=>{if(rcSession)void releaseRc()});
 action('kitWifiSettings',async()=>{await ensureWifiPermission();native.openWifiSettings();});
 action('kitDiscover',async()=>{
  if(otaBusy||connecting)throw Error('Another Kit operation is in progress');
  connecting=true;syncHeaderTransport();
  try{await discoverKit()}finally{connecting=false;syncHeaderTransport()}
 });
 action('kitConnectSaved',connectSavedKit);
 action('kitForgetSaved',forgetSavedKit);
 try{native.getInstalledVersion?.()}catch{}
 action('kitConnect',connectKit);action('kitScan',async()=>{await scan();if(el('kitNetStatus')?.textContent.includes('Scanning'))setTimeout(()=>scan().catch(()=>{}),2300)});
 action('kitTestSave',testSave);action('kitSwitch',()=>setMode());
 action('flightLedToggle',()=>toggleLed());
 action('kitRead',async()=>{const data=await pollTelemetry();el('kitTelemetry').textContent=JSON.stringify(data,null,2)});
 action('kitI2cScan',async()=>{await command('ZJI2C,SCAN');show('I²C scan requested; refresh telemetry for device addresses','good')});
 action('kitLedOff',()=>toggleLed(true));
 action('kitOtaCancel',()=>{if(otaBusy){otaCancelRequested=true;show('Cancelling after the current signed write; checking Kit state before abort','warn');}});
 action('kitAppOta',()=>{
  if(!online||!onKitLink||rcSession||otaBusy)throw Error('Connect and verify an idle Kit. Release diagnostic control before OTA.');
  if(!/^[a-fA-F0-9]{32}$/.test(el('kitOtaAdminKey')?.value.trim()||''))throw Error('Enter the USB-paired OWNER code to authorize encrypted APP OTA.');
  if(!confirm('BENCH APP OTA ONLY. Propellers removed, ESC disconnected, Kit DISARMED, and saved Wi-Fi must be preserved. Continue?'))return;
  el('kitOtaFile')?.click();
 });
 el('kitOtaFile')?.addEventListener('change',event=>{
  const file=event.target.files?.[0];
  event.target.value='';
  if(file)void uploadAdminApp(file).catch(error=>{if(!/OTA stopped:|UNCONFIRMED|NOT VERIFIED/.test(el('kitNetStatus')?.textContent||''))show('OTA: '+error.message,'warn');});
 });
 setInterval(pollConnection,3500);
 setInterval(()=>{if(ledOn&&online&&onKitLink&&!rcSession&&!ledBusy&&!statusBusy&&!connecting&&!otaBusy&&!document.hidden)
  void command('ZJLED,'+(++ledSequence)+',KEEP').catch(()=>{ledOn=false;syncLedButton()});},1800);
 scheduleAutoApConnect(1000);
}
function scheduleAutoApConnect(delay=650){
 if(link!=='ap'||online||otaBusy||connecting||document.hidden||
    !native?.requestSecure||!native?.pinSelectedNetwork||!window.ZebjusKitAuth?.local)return;
 delay=Math.max(delay,nextAutoApAttempt-Date.now());
 clearTimeout(autoApTimer);
 autoApTimer=setTimeout(()=>{
  autoApTimer=null;
  if(link!=='ap'||online||otaBusy||connecting||document.hidden)return;
  nextAutoApAttempt=Date.now()+15000; // Avoid repeated permission dialogs/probes.
  connectKit(true).catch(error=>show('AP DISCONNECTED • '+error.message,'warn'))
   .finally(()=>{if(!online)scheduleAutoApConnect(15000)});
 },delay);
}
function networkChanged(){
 ++linkEpoch;authOpening=null;inputArmSupported=controlAuthorized=false;
 forgetGrants();forgetNativePin();
 if(otaBusy)otaCancelRequested=true;
 cancelNativePending('Android Wi-Fi changed; request delivery unconfirmed');
 dropInput('Android Wi-Fi changed • awaiting verified AP/STA reconnection');
 nextAutoApAttempt=0; // A real network change must bypass the old network's retry cooldown.
 online=false;auth=null;reconnectEnabled=false;onKitLink=false;lastStatus=0;ledOn=false;savedProfilesFor='';
 if(link==='sta'&&verifiedKitId)handoverExpectedKit=verifiedKitId;
 syncHeaderTransport();scheduleAutoApConnect();
 if(handoverExpectedKit&&link==='sta'){scheduleStaObserver(900);scheduleFallbackCheck(2500)}
}
window.zebjusNativeAppPaused=()=>{
 if(otaBusy){
  otaPaused=true;otaNeedsRecheck=true;
  show('OTA PAUSED • app backgrounded; no writes until signed offset verified','warn');
  cancelNativePending('Android backgrounded during OTA: result uncertain until signed offset recovery')
 }
 else {dropInput('App paused • input disarmed');online=false;onKitLink=false;forgetNativePin();}
};
window.zebjusNativeAppResumed=()=>{
 if(otaBusy){otaPaused=false;otaNeedsRecheck=true;show('App resumed • signed OTA offset must be verified before next write','warn')}
 else {nextAutoApAttempt=0;if(reconnectEnabled)void pollConnection();else scheduleAutoApConnect(350);if(handoverExpectedKit&&link==='sta'){scheduleStaObserver(900);scheduleFallbackCheck(2500)}}
};
 window.ZebjusNetwork={request,status,pollConnection,armControls,canArm,inputArmed:()=>rcInputArmed&&!!firmwareAck?.inputArmed,scan,command,refreshSavedSta,setMode,toggleLed,previewControls,releaseRc,onWebRequest,networkChanged,selectTransport,selectedTransport:()=>link,hasControl:()=>!!rcSession&&online&&onKitLink&&Date.now()-lastStatus<12000,feedback:()=>firmwareAck,isConnected:()=>online&&onKitLink&&Date.now()-lastStatus<12000,mode:()=>mode};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
