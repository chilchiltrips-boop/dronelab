/* Native Android-to-FlightCore AP/STA transport (bench diagnostics only).
 * The per-device key never crosses the WebRTC relay and is not stored in site data.
 * Received RC frames are preview-only; motor arming is deliberately unsupported. */
(function(){
'use strict';
const el=id=>document.getElementById(id),native=window.ZebjusNative;
const pending=new Map();let ip='192.168.4.1',staIp='',link='ap',key='',mode='auto',online=false,requestId=0,previewBusy=false,lastPreview=0,lastStatus=0,lastScan=0,kitCode='',verifiedKitId='',rcSession='',rcClaiming=false,onKitLink=false,rcSeq=0,auth=null,diagnosticKey='',connecting=false,reconnectEnabled=false,firmwareAck=null,otaBusy=false,otaCancelRequested=false,otaPaused=false,otaNeedsRecheck=false,discoveredId='',cachedFallbackIp='',pinIdentity='',pinWaiters=new Map(),discoveryWaiters=new Map();
const validHost=v=>/^(?:10|192|172)\./.test(v)&&/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v);
const policy=window.ZebjusKitNetworkPolicy;
const readRoutes=new Set(['GET /api/health','GET /api/identify','GET /api/status','GET /api/telemetry','GET /api/rc/snapshot']);
const wifiRoutes=new Set(['GET /api/wifi/scan','POST /api/wifi/test','POST /api/wifi/mode']);
const diagnosticRoutes=new Set(['POST /api/command','POST /api/rc/stop','POST /api/rc/claim','POST /api/rc/release','POST /api/rc/preview']);
const grantFor=(route,method)=>{const key=method+' '+route;return readRoutes.has(key)?'kitAllowWeb':wifiRoutes.has(key)?'kitGrantWifi':diagnosticRoutes.has(key)?'kitGrantDiagnostic':''};
const allowed=new Set(['GET /api/health','GET /api/identify','GET /api/status','GET /api/wifi/scan','GET /api/telemetry','GET /api/rc/snapshot','POST /api/wifi/test','POST /api/rc/stop','POST /api/wifi/mode','POST /api/command','POST /api/rc/claim','POST /api/rc/release','POST /api/rc/preview']);
function show(text,tone=''){
 const v=el('kitNetStatus');if(v){v.textContent=text;v.dataset.state=tone}
 if(otaBusy&&el('kitOtaPhase')){el('kitOtaPhase').textContent=text;el('kitOtaPhase').dataset.state=tone}
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
function nativeTransport(route,method='GET',args={},headers={}){
 if(!native?.requestSecure)return Promise.reject(Error('Install the current Android APK for private label enrollment.'));
 if(!validHost(ip))return Promise.reject(Error('Use the kit private IPv4 address.'));
 const id='zj'+(++requestId),write=method==='POST'&&route.startsWith('/api/firmware/');
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{
   if(!pending.has(id))return;
   pending.delete(id);
   try{native.cancelRequest?.(id)}catch{}
   const error=Error((write?'Encrypted firmware write':'Device request')+' timed out at '+route+'; delivery is unconfirmed');
   error.uncertain=write;reject(error);
  },policy?.requestTimeout?.(route,method,link,'android')||(write?18000:6000));
  pending.set(id,{resolve,reject,timer,raw:true,write});
  try{native.requestSecure(id,ip,method,route,method==='POST'?form(args):'',JSON.stringify(headers));}
  catch(e){clearTimeout(timer);pending.delete(id);const error=Error('Native request failed: '+e.message);error.uncertain=write;reject(error);}
 });
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
function ensureWifiPermission(){
 if(typeof native?.requestWifiPermission!=='function')return Promise.reject(Error('Install latest Android APK for Wi-Fi permission verification'));
 return new Promise((resolve,reject)=>{
  const id='permission'+(++requestId);
  const timer=setTimeout(()=>{permissionWaiters.delete(id);reject(Error('Location permission dialog did not return a result'))},120000);
  permissionWaiters.set(id,{timer,resolve,reject});
  try{native.requestWifiPermission(id)}
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
 for(const key of ['androidInstalledVersion','appBuildVersion']){const v=el(key);if(v)v.textContent=version}
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
 if(!auth||Date.now()>auth.expiresAt-5000){
  if(!diagnosticKey||!verifiedKitId)throw Error('Enroll the private kit label first.');
  auth=await window.ZebjusKitAuth.open(nativeTransport,verifiedKitId,diagnosticKey);
 }
 try{const d=await auth.request(route,method,args);if(d.kitId&&d.kitId!==verifiedKitId)throw Error('Kit Device ID mismatch');return d}
 catch(e){if(e.status===401)auth=null;throw e}
}
async function connectKit(){
 if(connecting)return;connecting=true;
 try{
  // Wait until the system permission dialog returns before signed Kit auth.
  await ensureWifiPermission();
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
  }
  await status();reconnectEnabled=true;
  if(value&&link==='sta'&&el('kitRememberDiagnostic')?.checked&&diagnosticKey){
   try{await vaultCall('saveDiagnostic',verifiedKitId,diagnosticKey);show('Diagnostic key encrypted in Android Keystore; OWNER not stored','good')}
   catch(error){show('Connected but key not saved: '+error.message,'warn')}
   el('kitRememberDiagnostic').checked=false;
  }
 }finally{connecting=false}
}
async function connectSavedKit(){
 if(link!=='sta')throw Error('Saved diagnostic credentials work only on STA; AP setup requires private label.');
 const id=(el('kitSavedId')?.value||'').trim().toUpperCase();
 if(!/^ZFC-A[12]-[0-9A-F]{12}$/.test(id))throw Error('Enter exact saved Kit Device ID');
 if(otaBusy||connecting)throw Error('Another Kit operation is in progress');
 connecting=true;
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
    show('Saved Kit verified by signed STA status at '+candidate+' • grants OFF','good');
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
 }finally{connecting=false}
}
async function forgetSavedKit(){
 const id=(el('kitSavedId')?.value||'').trim().toUpperCase();
 await vaultCall('forgetDiagnostic',id);
 if(verifiedKitId===id){diagnosticKey='';auth=null;online=false;forgetNativePin()}
 show('Saved diagnostic enrollment deleted; OWNER code was never stored');
}
function dropInput(message){rcSession='';firmwareAck=null;if(el('kitRcPreview'))el('kitRcPreview').checked=false;window.dispatchEvent(new CustomEvent('zebjus:diagnostic-control',{detail:{active:false}}));show(message,'warn');}
window.zebjusNativeOtaResult=data=>{show(data?.message||'OTA status unknown',data?.ok?'good':'warn');if(data?.ok){online=false;el('kitRcPreview').checked=false;}};
window.zebjusNativeResult=data=>{
 const item=pending.get(data?.id);if(!item)return;
 clearTimeout(item.timer);pending.delete(data.id);
 if(data.ok&&item.raw)item.resolve({status:data.status,text:data.text||JSON.stringify(data.body||{}),proof:data.proof||''});
 else if(data.ok&&data.status<400)item.resolve(data.body||{});
 else item.reject(Error(data.error||data.body?.error||'Device HTTP '+data.status));
};
async function status(){
 const data=await request('/api/status');
 if(verifiedKitId&&verifiedKitId!==data.kitId){online=false;dropInput('Wrong kit: input released');throw Error('Kit hardware ID changed — reconnect and verify physical board')}
 verifiedKitId=data.kitId||'';mode=data.mode||mode;
 // Reject the wrong interface BEFORE pinning Wi-Fi or advertising ONLINE.
 onKitLink=data.requestTransport===link.toUpperCase()&&(link==='ap'?data.apActive===true:data.staConnected===true);
 if(!onKitLink){online=false;dropInput('Wrong Wi-Fi path • select '+(data.requestTransport||'the actual')+' connection and reconnect');throw Error('Kit responded over '+(data.requestTransport||'unknown')+' while '+link.toUpperCase()+' was selected')}
 // Pin Android's exact Wi-Fi Network + signed SSID/BSSID before any writes.
 await pinVerifiedStatus(data);
 online=true;lastStatus=Date.now();
 if(el('kitSavedId')&&verifiedKitId)el('kitSavedId').value=verifiedKitId;
 saveVerifiedIp(verifiedKitId,ip,link==='ap'?data.apSsid:data.ssid);
 if(kitCode&&data.kitCode!==kitCode)rcSession='';kitCode=data.kitCode||'';
 el('kitMode').value=mode;el('kitDevice').textContent=(data.board||'FlightCore')+' • '+(data.version||'')+' • '+(data.phase||'');
 el('kitAddresses').textContent='STA: '+(data.ip||'offline')+' • AP: '+(data.apIp||'offline');
 if(el('kitAppOta'))el('kitAppOta').disabled=otaBusy||!online||!onKitLink||!!rcSession;
 if(data.ip&&validHost(data.ip))staIp=data.ip;
 show('Phone → '+data.requestTransport+' VERIFIED • Router STA '+(data.staConnected?'online':'offline')+' • '+(rcSession?'Android owns diagnostic input':'control released'),'good');
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
async function setMode(){
 if(rcSession)await releaseRc();
 const v=el('kitMode').value;
 if(!['ap','sta','auto'].includes(v))throw Error('Invalid Wi-Fi mode');
 await request('/api/wifi/mode','POST',{mode:v});dropInput('Wi-Fi mode changed • reconnect and claim input again');forgetGrants();forgetNativePin();online=false;onKitLink=false;auth=null;reconnectEnabled=false;show('Switching to '+v.toUpperCase()+'; reconnect your phone to the new network.');
}
async function command(line){
 if(typeof line!=='string'||line.length>160||!/^(ZJI2C,SCAN|ZJINFO,GET|ZJLED,[0-9]+,(?:STOP|KEEP|SET|BLINK|FADE|SAFE|WARNING|SOS|PATTERN)(?:,.*)?|ZJTEL,RATE,(?:10|20|50))$/.test(line))throw Error('Command is not allowed on the network bridge');
 return request('/api/command','POST',{line});
}
async function pollTelemetry(){const data=await request('/api/telemetry');const line='ZJTEL,1,'+data.board+','+(data.rcSeq||0)+','+data.millis+',0x'+Number(data.address).toString(16).toUpperCase()+','+(data.gyroReady?'READY':'NOT_FOUND')+','+data.roll+','+data.pitch+','+data.yaw+',1,0';
 window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line,transport:mode,device:'android-native'}}));return data;
}
async function onWebRequest(req,peer){
 if(!peer?.status()?.paired)return peer?.sendNetworkResponse?.({id:req?.id,ok:false,error:'Pair WebApp with Android first'});
 const method=req?.method,route=req?.route,id=req?.id;
 if(!Number.isInteger(id)||id<1||id>1e9||!allowed.has(method+' '+route))return;
 const grant=grantFor(route,method);
 if(!grant||!el(grant)?.checked)return peer.sendNetworkResponse({id,ok:false,error:'Android has not granted '+(grant||'this operation')});
 if(!online||!onKitLink)return peer.sendNetworkResponse({id,ok:false,error:'Selected Kit Wi-Fi is not verified'});
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
 rcClaiming=true;
 try{
  const d=await request('/api/rc/claim','POST',{source:'ANDROID',kitCode});
  if(d.kitId!==verifiedKitId||!d.session)throw Error('Firmware claim identity failed');
  rcSession=d.session;rcSeq=0;firmwareAck=null;
  window.dispatchEvent(new CustomEvent('zebjus:diagnostic-control',{detail:{active:true}}));
  show('Android owns diagnostic input • motors disabled','good');
 }finally{rcClaiming=false}
}
function previewControls(m){
 if(otaBusy||!online||!onKitLink||!rcSession||!el('kitRcPreview')?.checked||previewBusy||rcClaiming||document.hidden||Date.now()-lastPreview<100)return;
 if(!m?.axes||![m.axes.roll,m.axes.pitch,m.axes.yaw,m.throttle].every(Number.isFinite))return;
 lastPreview=Date.now();previewBusy=true;const at=performance.now(),session=rcSession;
 const clamp=v=>Math.max(1000,Math.min(2000,Math.round(1500+500*v)));
 request('/api/rc/preview','POST',{session,source:'ANDROID',seq:++rcSeq,armed:'false',responseMode:m.responseMode||'Medium',
  throttle:Math.max(1000,Math.min(2000,Math.round(m.throttle))),roll:clamp(m.axes.roll),pitch:clamp(m.axes.pitch),yaw:clamp(m.axes.yaw)})
 .then(d=>{if(session!==rcSession)return;if(!d.received||d.kitId!==verifiedKitId||d.seq!==rcSeq)throw Error('Invalid firmware receive ACK');firmwareAck={seq:d.seq,at:Date.now(),rtt:Math.round(performance.now()-at)};if(el('kitRcAck'))el('kitRcAck').textContent='ESP32 received #'+d.seq+' • '+firmwareAck.rtt+' ms round trip';})
 .catch(e=>{dropInput('Input stopped: '+e.message);void request('/api/rc/release','POST',{session}).catch(()=>{});})
 .finally(()=>{previewBusy=false});
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
 b.disabled=otaBusy;
 window.dispatchEvent(new CustomEvent('zebjus:kit-transport',{detail:{transport:link,online:online&&onKitLink}}));
}
function selectTransport(next){
 if(!['ap','sta'].includes(next)||otaBusy)return false;
 if(next===link){syncHeaderTransport();return true}
 const e=el('kitLink');if(!e)return false;
 e.value=next;e.dispatchEvent(new Event('change',{bubbles:true}));
 return link===next;
}
function bind(){
 if(!el('kitNetStatus'))return;
 if(!native?.requestSecure){show('Install updated Android APK for signed Wi-Fi sessions');return;}
 el('kitIp').value=ip;
 syncHeaderTransport();
 el('kitLink').addEventListener('change',()=>{
  if(otaBusy){el('kitLink').value=link;show('OTA active • AP/STA switching blocked until signed recovery completes','warn');return;}
  if(!['ap','sta'].includes(el('kitLink').value)){el('kitLink').value=link;return;}
  if(el('kitLink').value===link){syncHeaderTransport();return;}
  void releaseRc();forgetGrants();forgetNativePin();if(link==='sta'&&validHost(ip))staIp=ip;
  discoveredId='';cachedFallbackIp='';link=el('kitLink').value;ip=link==='ap'?'192.168.4.1':staIp;
  el('kitIp').value=ip;online=false;auth=null;diagnosticKey='';reconnectEnabled=false;kitCode='';verifiedKitId='';onKitLink=false;
  syncHeaderTransport();
  show(link==='sta'?'STA selected • join the same router as this Kit, discover and verify again.':'AP selected • join the Kit hotspot, then reconnect and verify.');
 });
 el('kitIp').addEventListener('change',()=>{void releaseRc();forgetGrants();forgetNativePin();discoveredId='';cachedFallbackIp='';ip=el('kitIp').value.trim();if(link==='sta')staIp=ip;online=false;auth=null;diagnosticKey='';reconnectEnabled=false;kitCode='';verifiedKitId='';onKitLink=false});
 el('kitKey').addEventListener('input',()=>{reconnectEnabled=false});
 el('kitNetworks').addEventListener('change',()=>{el('kitSsid').value=el('kitNetworks').value});
 el('kitRcPreview')?.addEventListener('change',()=>{if(!el('kitRcPreview').checked)void releaseRc();else void claimRc().catch(e=>dropInput(e.message))});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void releaseRc()});
 window.addEventListener('blur',()=>{if(rcSession)void releaseRc()});
 action('kitWifiSettings',()=>native.openWifiSettings());
 action('kitDiscover',()=>discoverKit());
 action('kitConnectSaved',connectSavedKit);
 action('kitForgetSaved',forgetSavedKit);
 try{native.getInstalledVersion?.()}catch{}
 action('kitConnect',connectKit);action('kitScan',async()=>{await scan();if(el('kitNetStatus')?.textContent.includes('Scanning'))setTimeout(()=>scan().catch(()=>{}),2300)});
 action('kitTestSave',testSave);action('kitSwitch',setMode);
 action('kitRead',async()=>{const data=await pollTelemetry();el('kitTelemetry').textContent=JSON.stringify(data,null,2)});
 action('kitI2cScan',async()=>{await command('ZJI2C,SCAN');show('I²C scan requested; refresh telemetry for device addresses','good')});
 action('kitLedOff',()=>command('ZJLED,1,STOP'));
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
 setInterval(()=>{if(otaBusy||!reconnectEnabled||connecting||document.hidden)return;connecting=true;status().catch(()=>{online=false;dropInput('Kit disconnected • retrying the same Device ID; control remains released')}).finally(()=>{connecting=false})},3500);
}
function networkChanged(){forgetGrants();forgetNativePin();if(otaBusy)otaCancelRequested=true;cancelNativePending('Android Wi-Fi changed; request delivery unconfirmed');dropInput('Android Wi-Fi changed • reconnect and claim input again');online=false;auth=null;reconnectEnabled=false;onKitLink=false;lastStatus=0;}
window.zebjusNativeAppPaused=()=>{
 if(otaBusy){
  otaPaused=true;otaNeedsRecheck=true;
  show('OTA PAUSED • app backgrounded; no writes until signed offset verified','warn');
  cancelNativePending('Android backgrounded during OTA: result uncertain until signed offset recovery')
 }
 else forgetNativePin();
};
window.zebjusNativeAppResumed=()=>{
 if(otaBusy){otaPaused=false;otaNeedsRecheck=true;show('App resumed • signed OTA offset must be verified before next write','warn')}
};
 window.ZebjusNetwork={request,status,scan,command,previewControls,releaseRc,onWebRequest,networkChanged,selectTransport,selectedTransport:()=>link,hasControl:()=>!!rcSession&&online&&onKitLink&&Date.now()-lastStatus<12000,feedback:()=>firmwareAck,isConnected:()=>online&&onKitLink&&Date.now()-lastStatus<12000,mode:()=>mode};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
