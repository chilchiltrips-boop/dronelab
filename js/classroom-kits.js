/* ZEBJUS AERION Classroom Kit Center.
 * Firmware >=1.3.4: kit identity, authenticated RC diagnostics, NO MOTOR OUTPUTS.
 * The kit code is a selector. It MUST NOT authorize RC or admin actions.
 * Device secrets never go into localStorage, DOM logs, URLs or WebRTC messages.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id), sleep=ms=>new Promise(r=>setTimeout(r,ms));
const RC_TIMEOUT=350,RC_INTERVAL=110,codePattern=/^\d{6}$/;
const state={connected:false,working:false,transport:'none',mode:'usb',board:'',kitId:'',kitCode:'',kitName:'',
 version:'',rc:null,rcSession:'',rcSource:'',seq:0,sent:0,rejected:0,ackAt:0,frameAt:0,
 ip:'',key:'',setupAuthorized:false,otaAuthorized:false,owner:false,usbInfo:{},lastError:'',tone:'offline',since:0,controller:'none'};
let apiReady=false,sendBusy=false,pollTimer=null,rcTimer=null,logs=[],adminPending=false,serialClaims=[];
const usbCandidate={};let wifiTesting=false,adminUnlockedUntil=0,adminEnrolled=null;
const EVENTS_MAX=70;
const localKitHosts=new Map(),authSessions=new Map(),secureIds=new Set();try{for(const id of JSON.parse(localStorage.getItem('zebjus.kit.v2.ids')||'[]'))secureIds.add(id)}catch{}let setupStep=0;
const adminKitHosts=new Map();
let headerNetworkChoice='sta',headerModePending=false;
let statusPending=null,recoveryTarget=null;
const HEARTBEAT_MAX_AGE=6500;
state.heartbeatAt=0;state.linkState='disconnected';state.internet='unknown';
state.controlAuthorized=false;state.apIp='';state.apSsid='';state.ssid='';state.hostname='';state.bootId='';state.firmwareBuiltAt='';
let discoveryPending=null,ownOwnerId='',controlTicket=0;
let savedNetworks=[];
function adoptNetworkStatus(d){
 Object.assign(state,{setupAuthorized:!!d.setupAuthorized,otaAuthorized:d.otaAuthorized===true,
  controlAuthorized:d.controlAuthorized===true||(d.controlAuthorized===undefined&&(state.transport==='ap'||!!state.key)),
  mode:d.mode||state.mode,version:d.version||state.version,kitName:d.kitName||d.name||state.kitName,
  apActive:!!d.apActive,apIp:d.apIp||'',apSsid:d.apSsid||'',staConnected:!!d.staConnected,staIp:d.ip||'',ssid:d.ssid||'',
  hostname:d.hostname||state.hostname,bootId:d.bootId||'',firmwareBuiltAt:d.firmwareBuiltAt||'',
  partitionLayout:d.partitionLayout||'',otaMaxBytes:Number(d.otaMaxBytes)||0,networkState:d.networkState||d.phase||'',
  staDisconnectReason:Number(d.staDisconnectReason)||0,rssi:Number.isFinite(Number(d.rssi))?Number(d.rssi):null});
}
function nameHosts(name){
 const normalized=String(name||'').trim().toLowerCase().replace(/[ _]+/g,'-');
 return normalized?[normalized+'.local']:[];
}
function identityHosts(kit){
 const hosts=[kit.ip,kit.staIp,kit.hostname,...nameHosts(kit.kitName||kit.name),
  'zebjus-'+String(kit.board||'').replace('ZFC-','').toLowerCase()+'-'+(kit.kitCode||kit.code)+'.local',
  ...discoveredKits.filter(k=>k.kitId===(kit.kitId||kit.id)).map(k=>k.ip)];
 return [...new Set(hosts.filter(safeKitHost))];
}
function linkFresh(){return state.connected&&state.linkState==='connected'&&Date.now()-state.heartbeatAt<=HEARTBEAT_MAX_AGE&&(state.transport!=='usb'||!!serial()?.isOpen?.())}
function verifiedTransport(d){const t=String(d.requestTransport||'').toLowerCase();if(!['ap','sta'].includes(t))throw Error('Missing authenticated request transport');return t}
let lastWifiTestState='',wifiTestNonce=0;const recentWifiMessages=new Map();
const pairing=()=>root.ZebjusKitPairingStore;
const pairedKeys=new Map();let discoveredKits=[],discovering=false,lastDiscoverAt=0,reconnectTicket=0,pollErrors=0,pollBusy=false;
function audit(s,kind='info'){
 const line=new Date().toLocaleTimeString()+'  '+kind.toUpperCase()+'  '+String(s).slice(0,160);
 logs.push(line);if(logs.length>EVENTS_MAX)logs.shift();
 const e=$('kitEvents');if(e){e.textContent=logs.join('\n');e.scrollTop=e.scrollHeight;}
}
function byId(id,v){const e=$(id);if(e)e.textContent=v;}
function tone(s,t='offline'){state.tone=t;state.lastError=t==='error'?s:'';byId('kitMessage',s);const e=$('kitMessage');if(e)e.dataset.tone=t;render();}
function render(){
 if($('kitCenter'))$('kitCenter').dataset.connected=String(state.connected);
 (document.querySelectorAll?.('#kitSetupSteps li')||[]).forEach((el,i)=>{el.dataset.state=i<setupStep?'done':i===setupStep?'active':'pending';if(i===setupStep)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current')});
 byId('kitTopology',state.connected?'Laptop '+state.transport.toUpperCase()+' → '+state.kitCode+' • Android AP '+(state.apActive?'ready':'offline')+' • '+(state.rc?.active?'input live':'input idle'):'Power kit → join kit Wi-Fi → Connect Kit');
 const ready=linkFresh(),code=state.kitCode||'------';
 // Keep selected target independent of the currently verified transport.
 const label=ready?(state.kitName||'AERION')+' • '+code:'NO KIT';
 byId('kitGlobalName',label);byId('kitGlobalDetail',ready?state.transport.toUpperCase()+' • '+(state.owner?'YOU CONTROL':state.rc?.claimed?'VIEW ONLY':'CONNECTED'):'Connect the kit on router Wi-Fi or AP');
 byId('kitWifiModeLive',ready?'Wi-Fi '+String(state.mode||'unknown').toUpperCase()+' • Link '+state.transport.toUpperCase():'Not connected');
 byId('kitDiscoveryCount',discovering?'Scanning…':discoveredKits.length+' found');
 byId('fwDiscoveryCount',discovering?'Scanning…':discoveredKits.length+' found');
 const globalTone=state.working?'info':ready&&state.rc?.claimed&&!state.owner?'locked':ready?'good':state.tone==='error'?'error':state.tone==='warn'?'warn':'offline';
 byId('kitDiagnosticId',state.kitId||'Unverified');
 byId('kitDiagnosticBuild',(state.board||'—')+' / '+(state.version||'—'));
 byId('kitDiagnosticMode',(state.mode||'—')+' / '+(ready?state.transport:'offline'));
 byId('kitDiagnosticInterfaces','AP '+(state.apActive?state.apIp||'active':'offline')+' / STA '+(state.staConnected?state.staIp||'active':'offline'));
 byId('kitDiagnosticOwner',!ready?'Unverified':state.owner?'This browser':state.rc?.claimed?state.rc.source||'Other controller':'Available');
 byId('kitInternetStatus','Web '+state.internet);
 byId('kitHeartbeat',state.heartbeatAt?Math.max(0,Math.round((Date.now()-state.heartbeatAt)/1000))+' s ago':'Unverified');
 byId('kitGlobalState',state.linkState==='stale'?'LINK STALE':state.linkState==='reconnecting'?'RECONNECTING':state.working?'CONNECTING':globalTone==='locked'?'KIT IN USE':ready?'KIT CONNECTED':'KIT OFFLINE');
 const pill=$('kitGlobalState');if(pill)pill.dataset.tone=globalTone;
 const bar=$('kitTopStatus');if(bar)bar.dataset.tone=globalTone;
 byId('kitSelectedId',ready?state.kitId:'—');byId('kitSelectedName',ready?state.kitName:'—');
 byId('kitSelectedBoard',ready?state.board:'—');byId('kitSelectedVersion',ready?state.version:'—');
 byId('kitSelectedTransport',ready?state.transport.toUpperCase():'OFFLINE');
 byId('kitSelectedMode',ready?String(state.mode||'unknown').toUpperCase():'—');
 byId('kitSelectedSta',ready?(state.staConnected?'CONNECTED'+(state.staIp?' • '+state.staIp:''):'OFFLINE'):'—');
 byId('kitSelectedAp',ready?(state.apActive?'ACTIVE':'OFFLINE'):'—');
 byId('kitSelectedIp',ready?(state.ip||state.staIp||'USB'):'—');
 byId('kitSelectedRssi',ready&&Number.isFinite(state.rssi)?state.rssi+' dBm':'—');
 byId('kitSelectedReason',ready?(state.staDisconnectReason||0)+' (ESP reason)':'—');
 byId('kitController',!ready?'OFFLINE':state.rc?.claimed?(state.rc.source+' • '+(state.rc.active?'ACTIVE':'IDLE')):state.owner?'SESSION RESERVED':'AVAILABLE');
 byId('kitLinkState',ready?(state.rc?.active?'RC INPUT LIVE':'TELEMETRY READY'):'NO KIT');
 const rc=ready?state.rc||{}:{};
 for(const field of ['throttle','roll','pitch','yaw'])byId('kitVal'+field[0].toUpperCase()+field.slice(1),Number.isInteger(rc[field])?rc[field]:'—');
 byId('kitRcPacket',Number.isFinite(rc.seq)?String(rc.seq):String(state.seq||'—'));
 byId('kitRcAge',Number.isFinite(rc.ageMs)?rc.ageMs+' ms':'—');
 byId('kitRcCounts',(rc.accepted??state.sent)+' / '+(rc.rejected??state.rejected));
 byId('kitRcOrigin',rc.source||state.rcSource||'NONE');
 byId('kitRcState',!ready?'OFFLINE':rc.active?'RECEIVING':rc.claimed?'LOCKED / INPUT IDLE':'AVAILABLE');
 const rcBadge=$('kitRcState');if(rcBadge)rcBadge.dataset.tone=!ready?'offline':rc.active?'good':rc.claimed?'locked':'info';
 if($('kitRememberBrowser'))$('kitRememberBrowser').disabled=ready&&state.transport!=='usb'&&!state.key;
 if($('kitFindSaved'))$('kitFindSaved').disabled=state.working;
 const top=$('kitTopConnect');if(top)top.textContent=ready?'⚙ Kit':'＋ Kit';
 const switcher=$('kitTopNetworkSwitch');
 if(switcher){switcher.disabled=state.working||state.owner||headerModePending;switcher.setAttribute('aria-checked',String(headerNetworkChoice==='ap'));switcher.dataset.link=ready?state.transport:'offline';switcher.title='Selected '+headerNetworkChoice.toUpperCase()+' • live link '+(ready?state.transport.toUpperCase():'OFFLINE')+' • controller mode '+String(state.mode||'?').toUpperCase()+' • AUTO in MY KITS';}
 const wifiButton=$('kitTopWifiConnect');if(wifiButton){wifiButton.disabled=state.working||headerModePending;wifiButton.textContent=ready&&state.transport===headerNetworkChoice?'✓ '+headerNetworkChoice.toUpperCase():headerNetworkChoice.toUpperCase()+' Connect';}
 const controlButton=$('kitTopControl');
 if(controlButton){controlButton.disabled=!ready||!['usb','ap','sta'].includes(state.transport)||state.working||(!state.owner&&(!state.controlAuthorized&&state.transport!=='usb'||!!state.rc?.claimed));
 byId('kitTopControlLabel',ready&&state.owner?'ON':ready&&state.rc?.claimed?'LOCKED':'OFF');
 controlButton.classList.toggle('kit-control-active',!!(ready&&state.owner));
 controlButton.setAttribute('aria-checked',String(!!(ready&&state.owner)));controlButton.title=state.owner?'Release WEB diagnostic control and neutralize input':!state.controlAuthorized&&state.transport!=='usb'?'STA observer: pair this browser once over USB to authorize control':'Take WEB diagnostic control (motors disabled)';}
 for(const id of ['kitDisconnect','kitIdentify','kitReadInfo','kitTakeControl','kitReleaseControl','kitStop'])if($(id))$(id).disabled=!ready||state.working;
 if($('kitTopStop'))$('kitTopStop').disabled=!ready||state.working;
 if($('kitTakeControl'))$('kitTakeControl').disabled=!ready||state.owner||state.working||!!state.rc?.claimed||!state.controlAuthorized&&state.transport!=='usb';
 if($('kitReleaseControl'))$('kitReleaseControl').disabled=!ready||!state.owner||state.working;
 const adminReady=ready&&state.transport==='usb'&&!state.owner&&!state.working;
 if($('kitAdminApply'))$('kitAdminApply').disabled=!adminReady||Date.now()>adminUnlockedUntil;
 for(const id of ['kitAdminEnroll','kitAdminUnlock','kitAdminLock'])if($(id))$(id).disabled=!adminReady;
 if($('kitAdminRead'))$('kitAdminRead').disabled=!ready||state.transport!=='usb'||state.working;
 for(const id of ['kitRotateKey','kitFactoryReset'])if($(id))$(id).disabled=!adminReady||Date.now()>adminUnlockedUntil;
 for(const id of ['kitModeApply','kitWifiSave','kitWifiScan'])if($(id))$(id).disabled=!ready||state.working||state.owner||wifiTesting||(state.transport!=='usb'&&!state.setupAuthorized);
 for(const id of ['kitSavedRefresh','kitSavedUse','kitSavedForget'])if($(id))$(id).disabled=!ready||state.working||state.owner||!!state.rc?.claimed||wifiTesting||(state.transport!=='usb'&&!state.setupAuthorized);
 const status=$('kitAdminAccess');if(status)status.textContent=!adminReady?'Admin requires the selected unlocked USB kit':Date.now()<adminUnlockedUntil?'Teacher admin unlocked temporarily — complete configuration before 60s':adminEnrolled===false?'Teacher must enroll a strong passphrase first':'Teacher passphrase required for admin changes';
 const readOnly=$('kitHwId');if(readOnly)readOnly.value=state.kitId||'Not verified';
 const selected=$('kitActiveCode');if(selected)selected.textContent=code;
 const target=$('kitTargetLabel');if(target)target.textContent=ready?state.kitName+' • '+code:'Connect a kit in MY KITS';
 const hint=$('kitPidMonitor');if(hint)hint.textContent=ready?'RC '+(rc.active?'LIVE':'IDLE')+' • '+(rc.source||'NONE')+' • T '+(rc.throttle??1000)+' R '+(rc.roll??1500)+' P '+(rc.pitch??1500)+' Y '+(rc.yaw??1500):'No hardware connected • simulator available';
 const targetHardware=$('kitHardwareTarget');if(targetHardware)targetHardware.disabled=!ready;
 if($('kitWifiStatus')&&!ready)$('kitWifiStatus').textContent='Join Kit AP → Connect Kit → Scan Wi-Fi → Test & Save → return to classroom Wi-Fi.';
}
const serial=()=>root.DroneLabSerial;
const relay=()=>root.ZebjusDeviceRelay;
function safeKitHost(host){
 return privateIPv4(host)||/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.local$/i.test(String(host||''))||/^zebjus_drone_\d{1,2}\.local$/i.test(String(host||''));
}
function privateIPv4(host){
 const parts=String(host).split('.').map(Number);
 if(parts.length!==4||parts.some((v,i)=>!Number.isInteger(v)||v<0||v>255||!String(host).split('.')[i].match(/^\d{1,3}$/)))return false;
 return parts[0]===10||(parts[0]===192&&parts[1]===168)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31);
}
function selectedCode(){return ($('kitCodeInput')?.value||'').replace(/\D/g,'').slice(0,6)}
function selectedMode(){return $('kitTransport')?.value||'usb'}
async function resolveKitAccess(code,ip,expectedId=''){
 if(!codePattern.test(code))throw Error('Select a valid 6-digit Kit Code.');
 if(!safeKitHost(ip))throw Error('Choose AP 192.168.4.1 or a verified STA address.');
 // Public discovery only supplies immutable identity, NEVER authorization.
 const found=await probeIdentity(ip,2900);
 if(!found)throw Error('Kit not reachable at '+ip+'. First join its AP hotspot (or the same STA router); allow browser Local Network Access.');
 if(found.kitCode!==code)throw Error('Kit Code does not match the live controller at '+ip);
 if(expectedId&&found.kitId!==expectedId)throw Error('Different hardware detected: Device ID mismatch');
 if(state.connected&&state.kitId&&state.kitId!==found.kitId)throw Error('A different physical Device ID is responding. Connection blocked.');
 // AP setup prefers its scoped local session. STA can use physical-USB pairing
 // for control/admin; otherwise it opens an explicitly read-only local session.
 const manualKey=($('kitKeyInput')?.value||'').trim();
 const remembered=pairedKeys.get(found.kitId)||pairing()?.fromSession?.(found.kitId)||await pairing()?.restore?.(found.kitId)||'';
 if(found.simpleConnection&&['ap','sta'].includes(found.transport)&&!manualKey&&(found.transport==='ap'||!remembered)){
  adminKitHosts.delete(ip);
  const session=await root.ZebjusKitAuth.openLocal(root.ZebjusKitAuth.http('http://'+ip),found.kitId,found.transport);
  localKitHosts.set(ip,found.kitId);authSessions.set(found.kitId+'@'+ip,session);return {kitId:found.kitId,key:''};
 }
 const key=manualKey||remembered;
 if(!/^[a-fA-F0-9]{32}$/.test(key)){
  throw Error('Kit '+code+' is reachable, but the running firmware does not support simple sessions. Install FlightCore 1.4.3 for direct AP setup.');
 }
 if(localKitHosts.has(ip)){localKitHosts.delete(ip);authSessions.delete(found.kitId+'@'+ip);}
 if(($('kitKeyInput')?.value||'').trim()){secureIds.delete(found.kitId);localStorage.setItem('zebjus.kit.v2.ids',JSON.stringify([...secureIds]));}
 pairedKeys.set(found.kitId,key);pairing()?.saveSession?.(found.kitId,key);
 if(found.adminSessions)adminKitHosts.set(ip,found.kitId);
 return {kitId:found.kitId,key};
}
async function rememberBrowserPairing(){
 const id=state.kitId||usbCandidate.kitId;
 const secret=id&&(pairedKeys.get(id)||pairing()?.fromSession?.(id));
 if(!id||!secret)throw Error('Connect physical USB once to authorize remembered STA/settings access. Simple AP diagnostics needs no saved credential.');
 await pairing()?.remember?.(id,secret);
 tone('This personal browser now remembers '+id+' for AP/STA without USB. Clear site data or Forget this browser to revoke the saved local copy.','good');
 audit('Trusted browser pairing saved for '+id+' (no credential printed)','success');
}
async function forgetBrowserPairing(){
 const code=selectedCode(),found=discoveredKits.find(k=>k.kitCode===code);
 const id=state.kitId||usbCandidate.kitCode===code&&usbCandidate.kitId||found?.kitId;
 if(!id)throw Error('Select or discover a physical kit before forgetting its pairing.');
 if(state.connected&&state.kitId===id&&state.transport!=='usb')await disconnect('Pairing revoked on this browser');
 pairedKeys.delete(id);await pairing()?.forget?.(id);
 if($('kitRememberBrowser'))$('kitRememberBrowser').checked=false;
 tone('Pairing forgotten for '+id+'. Simple AP diagnostics remains available; use USB to authorize protected STA access again.','warn');
}

function checkIdentity(d,transport,code,expected=''){
 const kitId=String(d.kitId||''),got=String(d.kitCode||'');
 const board=String(d.board||'');
 // Do not silently accept an A2 running app on an A1 kit label or vice versa.
 if(board&&/^ZFC-A[12]$/.test(board)&&!kitId.startsWith(board+'-'))throw Error('Firmware board does not match physical kit identity');
 if(!/^ZFC-A[12]-[A-Fa-f0-9]{12}$/.test(kitId)||!codePattern.test(got)||got!==code)throw Error('Kit identity mismatch: verify the 6-digit code and physical hardware');
 if(expected&&kitId!==expected)throw Error('Different hardware detected: Device ID mismatch');
 return {kitId,kitCode:got,kitName:String(d.kitName||d.name||d.board||'ZEBJUS AERION').slice(0,36),board:String(d.board||'').slice(0,24),version:String(d.version||'').slice(0,24),transport};
}
function recordKnown(){if(!state.kitId)return;
 try{const key='zebjus.classroom.known.v1',list=JSON.parse(localStorage.getItem(key)||'[]');
 const entry={id:state.kitId,code:state.kitCode,name:state.kitName,board:state.board,ip:state.staIp||state.usbInfo?.staIp||state.ip||'',hostname:state.hostname||nameHosts(state.kitName)[0]||'',at:Date.now()};
 const next=[entry,...list.filter(v=>v.id!==entry.id)].slice(0,20);localStorage.setItem(key,JSON.stringify(next));
 localStorage.setItem('zebjus.classroom.last.v1',JSON.stringify(entry));
 showKnown();
 }catch{}
}
function showKnown(){
 const box=$('kitKnown');if(!box)return;box.replaceChildren();
 let known=[];try{known=JSON.parse(localStorage.getItem('zebjus.classroom.known.v1')||'[]')}catch{}
 if(!known.length){box.textContent='No previously verified kits on this browser.';return;}
 const seen=new Map();for(const v of known)seen.set(v.code,(seen.get(v.code)||0)+1);
 for(const v of known.slice(0,20)){
  const row=document.createElement('button');row.type='button';row.className='kit-known-item';
  const name=document.createElement('b');name.textContent=v.code+' • '+v.name;
  const sub=document.createElement('small');sub.textContent=(seen.get(v.code)>1?'DUPLICATE CODE • ':'')+v.id+(v.ip?' • '+v.ip:'');
  row.append(name,sub);row.onclick=()=>{if($('kitCodeInput'))$('kitCodeInput').value=v.code;if(v.ip&&$('kitIpInput'))$('kitIpInput').value=v.ip;byId('kitMessage','Known kit selected • reconnect and verify identity; this is not a live discovery result.');};
  box.append(row);
 }
}
async function disconnect(reason='Disconnected'){
 const priorId=state.kitId;
 ++controlTicket;ownOwnerId='';++wifiTestNonce;wifiTesting=false;
 ++reconnectTicket;recoveryTarget=null;for(const key of Object.keys(usbCandidate))delete usbCandidate[key];state.heartbeatAt=0;state.linkState='disconnected';
 if(state.rcSession||state.owner)await releaseRc().catch(()=>{});
 for(const slot of authSessions.keys())if(slot.startsWith(priorId+'@'))authSessions.delete(slot);
 for(const [host,id] of localKitHosts)if(id===priorId)localKitHosts.delete(host);
 for(const [host,id] of adminKitHosts)if(id===priorId)adminKitHosts.delete(host);
 state.connected=false;state.rc=null;state.key='';state.rcSession='';state.owner=false;state.working=false;state.rcSource='';state.transport='none';state.ip='';state.kitId='';state.kitCode='';state.kitName='';state.board='';state.version='';
 Object.assign(state,{setupAuthorized:false,otaAuthorized:false,controlAuthorized:false,apActive:false,staConnected:false,staIp:'',apIp:'',apSsid:'',ssid:'',hostname:'',bootId:'',firmwareBuiltAt:''});
 audit(reason);tone(reason,'offline');root.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:false,transport:'none'}})); // USB Serial remains open for Firmware/Python; never steal its port.
}
function waitSerial(pattern,timeout=2300){
 return new Promise((resolve,reject)=>{
  const item={pattern,resolve,reject};serialClaims.push(item);
  const t=setTimeout(()=>{serialClaims=serialClaims.filter(x=>x!==item);reject(Error('No response from selected USB kit'))},timeout);
  item.resolve=v=>{clearTimeout(t);resolve(v)};item.reject=e=>{clearTimeout(t);reject(e)};
 });
}
async function usbWrite(line){if(!serial()?.isOpen?.()||serial()?.isFlashing?.())throw Error('USB Serial unavailable; open 115200-baud firmware runtime, not ROM bootloader');await serial().writeLine(line.endsWith('\n')?line:line+'\n');}
async function connectUSB(code,ticket=reconnectTicket){
 if(!serial()?.isOpen?.())await serial()?.connect?.();
 if(!serial()?.isOpen?.())throw Error('Select a USB port and open Serial Monitor in the Firmware page');
 const messages=[];let identity={};
 const listener=e=>{const line=String(e.detail?.line||'');if(line.startsWith('ZJKIT,ID,'))identity.kitId=line.slice(9).trim();
  if(line.startsWith('ZJKIT,CODE,'))identity.kitCode=line.slice(11).trim();
  if(line.startsWith('ZJKIT,NAME,'))identity.kitName=line.slice(11).trim();
  if(line.startsWith('ZJINFO,FW,')){const p=line.split(',');identity.board=p[2]||'';identity.version=p[3]||'';}
  messages.push(line);
 };
 root.addEventListener('dronelab:serial-line',listener);
 try{
  await usbWrite('ZJKIT,GET');await usbWrite('ZJINFO,GET');await usbWrite('ZJNET,GET');
  for(let i=0;i<18&&(!identity.kitId||!identity.kitCode);i++)await sleep(140);
 }finally{root.removeEventListener('dronelab:serial-line',listener);}
 if(ticket!==reconnectTicket)throw Error('Connection cancelled before USB identity verification');
 Object.assign(state,checkIdentity(identity,'usb',code||identity.kitCode));
 state.usbInfo=identity;state.key='';state.ip='';
}
const form=args=>new URLSearchParams(args||{});
async function wifiDirect(ip,key,route,method='GET',args={}){
 const expected=state.kitId||localKitHosts.get(ip)||discoveredKits.find(k=>k.ip===ip)?.kitId||[...pairedKeys].find(([id,k])=>k===key)?.[0];
 const local=localKitHosts.get(ip)===expected;
 const admin=adminKitHosts.get(ip)===expected;
 if(local||admin||secureIds.has(expected)){
  const slot=expected+'@'+ip;let session=authSessions.get(slot);
  if(!session||Date.now()>session.expiresAt-5000){session=local?await root.ZebjusKitAuth.openLocal(root.ZebjusKitAuth.http('http://'+ip),expected,ip==='192.168.4.1'?'ap':'sta'):await root.ZebjusKitAuth.open(root.ZebjusKitAuth.http('http://'+ip),expected,key,admin?'admin':'diagnostic');authSessions.set(slot,session)}
  try{return await session.request(route,method,args)}
  catch(e){
   if(e.status===401)authSessions.delete(slot);
   if(e.status!==401||!local&&!admin)throw e;
   // The kit may have rebooted (or its local session may have been replaced).
   // Retry ONCE only after rechecking the full hardware Device ID.
   const fresh=await probeIdentity(ip,2800);
   if(!fresh||fresh.kitId!==expected)throw Error('Kit session rejected and Device ID could not be reverified. Connection blocked.');
   const mode=ip==='192.168.4.1'?'ap':'sta';
   const renewed=admin?await root.ZebjusKitAuth.open(root.ZebjusKitAuth.http('http://'+ip),expected,key,'admin'):await root.ZebjusKitAuth.openLocal(root.ZebjusKitAuth.http('http://'+ip),expected,mode);
   authSessions.set(slot,renewed);
   return renewed.request(route,method,args);
  }
 }
 if(!safeKitHost(ip))throw Error('Use a verified private IP or safe .local host for your kit');
 if(!/^[a-fA-F0-9]{32}$/.test(key))throw Error('Use the separate 32-character kit access key enrolled over USB');
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),4200);
 try{
  const res=await fetch('http://'+ip+route,{
   method,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:ctrl.signal,
   targetAddressSpace:'local',headers:{'X-ZJ-Key':key,'X-ZJ-Device':expected||'',...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
   ...(method==='POST'?{body:form(args)}:{})
  });
  const data=await res.json().catch(()=>({error:'Invalid kit response'}));
  if(!res.ok)throw Error(data.error||'Kit returned HTTP '+res.status);
  return data;
 }catch(e){if(e.name==='AbortError')throw Error('Kit did not respond within 4.2 s');
  if(e instanceof TypeError)throw Error('Direct LAN blocked by browser or network. Use USB, a compatible Chromium Local Network Access browser, or Android WebRTC relay.');
  throw e;
 }finally{clearTimeout(timeout)}
}
async function deviceRequest(route,method='GET',args={}){
 if(!state.connected&&route!=='/api/status')throw Error('Kit not connected');
 if(state.transport==='usb')throw Error('USB uses native Serial commands, not HTTP');
 if(state.transport==='android-relay')return relay().request(route,method,args);
 const expected=state.kitId,ticket=reconnectTicket;const data=await wifiDirect(state.ip,state.key,route,method,args);
 if(ticket!==reconnectTicket||expected!==state.kitId)throw Error('Selected kit changed during request');
 if(data.kitId&&data.kitId!==expected)throw Error('Device ID mismatch in authenticated response');return data;
}
async function connectNetwork(code,mode,ticket=reconnectTicket,expectedId=''){
 const ip=($('kitIpInput')?.value||'').trim();
 const transport=mode==='android-relay'?'android-relay':mode;
 if(mode==='android-relay'&&!relay()?.request)throw Error('Pair Android over WebRTC first and enable its kit access');
 const access=mode==='android-relay'?null:await resolveKitAccess(code,ip,expectedId);
 const key=access?.key||'';
 const d=mode==='android-relay'?await relay().request('/api/status'):await wifiDirect(ip,key,'/api/status');
 const verified=checkIdentity(d,transport,code,expectedId||access?.kitId||state.kitId||'');
 if(access&&access.kitId!==verified.kitId)throw Error('Public discovery Device ID differs from authenticated hardware. Blocked.');
 if(access&&key){pairing()?.saveSession?.(access.kitId,key);
  if($('kitRememberBrowser')?.checked)try{await pairing()?.remember?.(access.kitId,key)}catch(e){audit('Trusted browser storage not available: '+e.message,'warn')}
 }
 if(ticket!==reconnectTicket)throw Error('Connection cancelled before network verification');
 Object.assign(state,verified,{setupAuthorized:!!d.setupAuthorized,otaAuthorized:!!d.otaAuthorized,ip:mode==='android-relay'?'':ip,key:mode==='android-relay'?'':key,rc:d.rc||null,mode:d.mode||'',staIp:d.ip||'',staConnected:!!d.staConnected,apActive:!!d.apActive,staDisconnectReason:Number(d.staDisconnectReason)||0,rssi:Number(d.rssi)||null,physicalLink:d.staConnected?'sta':'ap',since:Date.now()});
 if($('kitKeyInput'))$('kitKeyInput').value=''; // do not leave access credentials in the visible input
 if(mode!=='android-relay')state.transport=verifiedTransport(d);
 state.physicalLink=String(d.requestTransport||'').toLowerCase()||state.physicalLink;
 adoptNetworkStatus(d);
}
async function findSaved(){
 const code=selectedCode();if(!codePattern.test(code))throw Error('Enter a 6-digit code first');
 if(state.working)return;
 let list=[];try{list=JSON.parse(localStorage.getItem('zebjus.classroom.known.v1')||'[]')}catch{}
 const known=list.filter(k=>k.code===code&&safeKitHost(k.ip)).slice(0,10);
 if(!known.length)throw Error('No saved IP for this code; join the kit AP and choose Connect Kit, or enter its STA IP');
 const seen=new Set(known.map(k=>k.id));if(seen.size>1)throw Error('Duplicate six-digit kit code in saved devices; teacher must resolve via USB');
 state.working=true;render();tone('Checking previously verified kit IP(s)…','info');
 try{
  const online=[];
  for(const k of known){
   const ctr=new AbortController(),timer=setTimeout(()=>ctr.abort(),3300);
   try{
    const reply=await fetch('http://'+k.ip+'/api/identify',{method:'GET',mode:'cors',cache:'no-store',
     credentials:'omit',redirect:'error',signal:ctr.signal,targetAddressSpace:'local'});
    if(!reply.ok)continue;
    const d=await reply.json();if(d.kitId===k.id&&d.kitCode===code)online.push(k);
   }catch{}finally{clearTimeout(timer)}
  }
  if(online.length!==1)throw Error(online.length?'Multiple online matches; verify each physical kit':'Saved IP not reachable; check browser local-network permission, Wi-Fi or Android relay');
  $('kitIpInput').value=online[0].ip;$('kitTransport').value=online[0].ip==='192.168.4.1'?'ap':'sta';
  audit('Saved IP verified by code and full hardware Device ID • '+online[0].id,'success');
  tone('Matching kit IP verified • Connect & Verify with saved access, or connect over physical USB','good');
 }finally{state.working=false;render()}
}
async function connect(expectedId=''){
 if(state.working)return;const ticket=++reconnectTicket,mode=selectedMode();let code=selectedCode();
 state.working=true;render();
 if(!codePattern.test(code)&&mode!=='android-relay'){
  if(mode==='usb'&&usbCandidate.kitCode)code=usbCandidate.kitCode;
  else if(mode!=='usb'){const live=await probeIdentity(($('kitIpInput')?.value||'').trim()||'192.168.4.1',3000);if(ticket!==reconnectTicket)return;if(live){code=live.kitCode;if($('kitCodeInput'))$('kitCodeInput').value=code;}}
 }
 if(mode!=='usb'){try{const known=JSON.parse(localStorage.getItem('zebjus.classroom.known.v1')||'[]');
  if(new Set(known.filter(k=>k.code===code).map(k=>k.id)).size>1&&!expectedId){state.working=false;tone('Duplicate Kit Code detected in known classroom kits • choose an exact Device ID or use physical USB admin to assign a unique code','error');return;}
 }catch{}}
 if(mode!=='usb'&&!codePattern.test(code)){state.working=false;tone('Kit not detected. Join its Wi-Fi or enter its address, then Connect Kit.','warn');return}
 if(state.owner)await releaseRc().catch(()=>{});
 state.working=true;state.connected=false;render();tone('Verifying hardware identity…','info');
 try{
  if(mode==='usb')await connectUSB(code,ticket);else await connectNetwork(code,mode,ticket,expectedId);
  if(ticket!==reconnectTicket)return;
  state.connected=true;state.heartbeatAt=Date.now();state.linkState='connected';recoveryTarget=null;pollErrors=0;state.since=Date.now();state.owner=false;state.seq=0;state.rcSession='';state.rcSource='';
  state.working=false;if(state.transport==='ap'||state.transport==='sta')headerNetworkChoice=state.transport;
 audit('Device verified • '+state.kitId+' • '+state.transport,'success');
  if(state.transport==='usb')state.controlAuthorized=true;
  if(state.transport==='sta')setupStep=5;recordKnown();tone('Verified '+state.kitName+' • '+state.transport.toUpperCase()+' • motors disabled','good');
  root.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:true,transport:state.transport,kitId:state.kitId}}));
  if(state.transport==='usb')void pairUsb().catch(e=>audit('USB pairing unavailable on older firmware: '+e.message,'warn'));
  if(mode!=='usb')await read().catch(e=>audit(e.message,'warn'));
 }catch(e){if(ticket!==reconnectTicket)return;state.working=false;state.connected=false;state.linkState='disconnected';state.key='';audit(e.message,'error');tone(e.message,'error')}
}
function read(){
 if(statusPending)return statusPending;
 statusPending=readStatus().finally(()=>{statusPending=null});return statusPending;
}
async function readStatus(){
 if(!state.connected)return;
 if(state.transport==='usb'){
  const expected=state.kitId,ticket=reconnectTicket;
  const response=waitSerial(/^ZJKIT,ID,/,3200);response.catch(()=>{});
  await usbWrite('ZJKIT,GET');await usbWrite('ZJINFO,GET');
  const identity=await response;
  if(ticket!==reconnectTicket||identity.slice(9).trim()!==expected)throw Error('USB identity changed during refresh');
  state.heartbeatAt=Date.now();state.linkState='connected';render();return state.usbInfo;
 }
 const d=await deviceRequest('/api/status');
 if(d.kitId!==state.kitId||d.kitCode!==state.kitCode){await disconnect('Device identity changed • RC stopped');throw Error('Hardware identity changed')}
 const actualTransport=verifiedTransport(d);
 state.heartbeatAt=Date.now();state.linkState='connected';
 if(state.transport!=='android-relay')state.transport=actualTransport;
 state.physicalLink=actualTransport;state.apIp=d.apIp||'';
 const priorName=state.kitName,priorAddress=state.staIp;
 if(state.owner&&(!d.rc?.claimed||ownOwnerId&&d.rc.ownerId!==ownOwnerId||d.rc?.source!==state.rcSource)){state.owner=false;state.rcSession='';state.rcSource='';ownOwnerId=''}
 state.rc=d.rc||null;state.version=d.version||state.version;state.mode=d.mode||state.mode;
 const wasSetupAuthorized=state.setupAuthorized;
 state.setupAuthorized=!!d.setupAuthorized;state.otaAuthorized=!!d.otaAuthorized;
 if(!wasSetupAuthorized&&state.setupAuthorized&&state.transport==='ap')setupHint('Ready: Scan Wi-Fi → select router → Test & Save → join classroom router → Scan Kits.');
 if(wasSetupAuthorized&&!state.setupAuthorized&&state.transport==='ap')setupHint('AP setup access lost. Reconnect the Kit AP and retry.');
 if(state.tone==='error'){state.tone='good';state.lastError=''}
 state.apActive=!!d.apActive;state.staConnected=!!d.staConnected;state.staIp=d.ip||'';state.staDisconnectReason=Number(d.staDisconnectReason)||0;state.rssi=Number.isFinite(Number(d.rssi))?Number(d.rssi):null;
 adoptNetworkStatus(d);
 if(priorName!==state.kitName||priorAddress!==state.staIp){
  for(const kit of discoveredKits)if(kit.kitId===state.kitId){kit.kitName=state.kitName;kit.hostname=state.hostname;}
  recordKnown();root.dispatchEvent(new CustomEvent('dronelab:kit-name',{detail:{kitId:state.kitId,name:state.kitName}}));
 }
 const monitor=$('kitNetworkMonitor');
 if(monitor){
  const rc=state.rc||{},ts=new Date().toLocaleTimeString();
  const line=ts+' NET-'+(d.requestTransport||state.transport).toUpperCase()+' '+state.kitId+
   ' • phase '+(d.phase||'unknown')+' • '+(d.apActive?'AP ON':'AP OFF')+
   ' • '+(d.staConnected?'STA CONNECTED':'STA OFFLINE')+
   ' • RC '+(rc.active?'LIVE':rc.claimed?'IDLE':'UNCLAIMED')+
   ' seq='+String(rc.seq||0)+' T='+String(rc.throttle??1000)+' R='+String(rc.roll??1500)+
   ' P='+String(rc.pitch??1500)+' Y='+String(rc.yaw??1500)+
   ' accepted='+String(rc.accepted??0)+' rejected='+String(rc.rejected??0);
  monitor.textContent=(line+'\n'+monitor.textContent).slice(0,8000);
 }
 render();return d;
}
async function claim(source='WEB'){
 if(!linkFresh())throw Error('Refresh and connect a verified kit first');
 if(state.transport!=='usb'&&!state.controlAuthorized)throw Error('STA observer access cannot take control. Pair this browser once over physical USB, then reconnect the same kit.');
 if(state.owner&&state.rcSource===source)return;
 if(source==='WEB'){
  if(!$('kitHardwareTarget')?.checked)throw Error('Enable Send to selected kit under PID Tuning first');
  if(!$('tab-pid')?.classList.contains('active'))document.querySelector('[data-tab="pid"]')?.click();
 }
 if(state.owner)await releaseRc();
 const ticket=++controlTicket,expected=state.kitId,connection=reconnectTicket;
 if(source!=='WEB'&&source!=='ANDROID')throw Error('Invalid RC source');
 if(source==='ANDROID'&&(state.transport==='ap'||state.transport==='android-relay'&&state.physicalLink==='ap'))throw Error('Android direct AP owns this path; do not relay via WebApp');
 if(source==='ANDROID'){const mobile=root.ZebjusDeviceRelay?.status?.();if(!mobile?.paired||!mobile?.connected||mobile.controller!=='mobile')throw Error('Pair Android and grant Mobile Control in WebRTC settings first');}
 if(state.transport==='usb'){
  const promise=waitSerial(/^ZJRC,(?:ACK,CLAIM,USB|ERR,CLAIM_REJECTED)$/);
  await usbWrite('ZJRC,CLAIM,'+source+','+state.kitCode);
  const line=await promise;
  if(!line.startsWith('ZJRC,ACK'))throw Error('Kit already controlled by another session');
 }else{
  const data=await deviceRequest('/api/rc/claim','POST',{source,kitCode:state.kitCode});
  if(!data?.session||data.kitId!==state.kitId)throw Error('RC claim failed hardware identity check');
  if(ticket!==controlTicket||connection!==reconnectTicket||expected!==state.kitId){
   if(connection===reconnectTicket)await deviceRequest('/api/rc/release','POST',{session:data.session}).catch(()=>{});
   throw Error('Control request cancelled');
  }
  state.rcSession=data.session;ownOwnerId=data.ownerId||'';
 }
 if(ticket!==controlTicket||connection!==reconnectTicket||expected!==state.kitId)throw Error('Control request cancelled');
 state.owner=true;state.rcSource=source;state.seq=0;state.frameAt=0;audit('RC claimed by '+source+' • motors OFF','success');render();
 // Immediately send a safe neutral diagnostic frame so ownership does not idle-expire.
 await sendFrame({throttle:1000,axes:{roll:0,pitch:0,yaw:0},armed:false},source);
}
async function releaseRc(){
 ++controlTicket;ownOwnerId='';
 const had=state.owner,session=state.rcSession;
 state.owner=false;state.rcSession='';state.rcSource='';state.rc={claimed:false,active:false,throttle:1000,roll:1500,pitch:1500,yaw:1500};render();
 if(!had)return;
 try{
  if(state.transport==='usb')await usbWrite('ZJRC,RELEASE');
  else if(session)await deviceRequest('/api/rc/release','POST',{session});
 }catch(e){audit('RC release response unavailable; firmware watchdog still applies: '+e.message,'warn')}
 audit('RC input session released');
}
async function stop(){
 ++controlTicket;ownOwnerId='';
 const was=state.owner,session=state.rcSession;state.owner=false;state.rcSession='';state.rcSource='';
 state.rc={active:false,claimed:false,throttle:1000,roll:1500,pitch:1500,yaw:1500};render();
 try{if(state.connected&&state.transport==='usb')await usbWrite('ZJRC,STOP');
  else if(state.connected){await deviceRequest('/api/rc/stop','POST',{}).catch(e=>audit('STOP release failed • firmware watchdog active: '+e.message,'warn'));}
 }catch(e){audit('STOP command lost; wait for hardware failsafe: '+e.message,'warn')}
 audit('STOP • RC input neutral • motors disabled','warn');
}
function toRc(frame){
 const a=frame?.axes||{},n=v=>Number.isFinite(Number(v))?Number(v):NaN;
 const clamp=v=>Math.max(1000,Math.min(2000,Math.round(v)));
 if(![a.roll,a.pitch,a.yaw].every(v=>Number.isFinite(Number(v)))||!Number.isFinite(n(frame?.throttle)))return null;
 return {throttle:clamp(n(frame.throttle)),roll:clamp(1500+n(a.roll)*500),
 pitch:clamp(1500+n(a.pitch)*500),yaw:clamp(1500+n(a.yaw)*500)};
}
async function sendFrame(frame,source='WEB'){
 if(!linkFresh()||!state.owner||state.rcSource!==source||sendBusy||document.hidden)return false;
 const rc=toRc(frame);if(!rc)return false;
 sendBusy=true;
 try{
  const seq=++state.seq;
  if(state.transport==='usb')await usbWrite('ZJRC,SET,'+[seq,rc.throttle,rc.roll,rc.pitch,rc.yaw,source].join(','));
  else{const ack=await deviceRequest('/api/rc/preview','POST',{session:state.rcSession,source,seq,armed:'false',...rc});
   if(ack?.received!==true||ack.kitId!==state.kitId)throw Error('Kit did not acknowledge the intended hardware Device ID');
   state.ackAt=Date.now();state.rc={...(state.rc||{}),...rc,active:true,claimed:true,source,seq};
  }
  // USB writes are not hardware ACKs. Serial ZJRC frames update readouts separately.
  state.frameAt=Date.now();state.sent++;
  render();return true;
 }catch(e){state.rejected++;audit('RC frame rejected: '+e.message,'error');state.owner=false;state.rcSession='';state.rcSource='';tone('RC lost • '+e.message,'error');return false}
 finally{sendBusy=false}
}
function ingestAndroid(frame){
 // AP direct belongs to Android native, never forward its WebRTC echo via WebApp.
 if(state.transport==='ap'||state.transport==='none'||(state.transport==='android-relay'&&state.physicalLink==='ap')||!$('kitHardwareTarget')?.checked)return;
 if(!state.owner||state.rcSource!=='ANDROID')return;
 if(!frame)return;
 // Virtual ARM is ignored for hardware. The firmware only accepts armed=false.
 void sendFrame({...frame,armed:false},'ANDROID');
}
function webControls(){
 const pidActive=$('tab-pid')?.classList.contains('active');
 const pythonActive=$('tab-python')?.classList.contains('active')&&root.ZebjusPythonHardwareActive===true;
 if((!pidActive&&!pythonActive)||!$('kitHardwareTarget')?.checked||
   !state.connected||!state.owner||state.rcSource!=='WEB'||document.hidden)return;
 // Keep the 1.8 s diagnostic lease alive on Python Lab with neutral frames only.
 // No motors/arming; pausing/backgrounding or STOP still releases the lease.
 if(pythonActive){void sendFrame({throttle:1000,axes:{roll:0,pitch:0,yaw:0},armed:false},'WEB');return}
 const f=$('pidFrame')?.contentWindow?.ZebjusTraining?.hardwareInput?.();
 if(f)void sendFrame(f,'WEB');
 else void sendFrame({throttle:1000,axes:{roll:0,pitch:0,yaw:0},armed:false},'WEB');
}
async function identify(){
 if(!state.connected)throw Error('Connect a kit first');
 if(state.owner)throw Error('Release the RC input session before LED identification');
 const line='ZJLED,900,BLINK,150,150,100';
 if(state.transport==='usb')await usbWrite(line);
 else await deviceRequest('/api/command','POST',{line});
 audit('Identify LED pattern requested','success');
}
function wifiNote(message,tone='info'){
 const now=Date.now();if(now-(recentWifiMessages.get(message)||0)<30000)return;
 recentWifiMessages.set(message,now);
 if(recentWifiMessages.size>60)for(const [key,at] of recentWifiMessages)if(now-at>30000)recentWifiMessages.delete(key);
 const e=$('kitWifiStatus');if(e){e.textContent=message;e.dataset.tone=tone}
 audit(message,tone);render();
 // A network transition is independent of the USB flash writer; forward sanitized
 // diagnostics to Firmware Log without claiming firmware write failure or success.
 root.dispatchEvent(new CustomEvent('dronelab:kit-network-event',{detail:{message:String(message).slice(0,220),level:tone}}));
}
async function scanWifi(){
 if(!state.connected||state.owner)throw Error('Connect an unlocked kit first');
 const select=$('kitWifiNetworks');if(select)select.replaceChildren(new Option('Scanning 2.4 GHz networks…',''));
 if(state.transport==='usb'){
  await usbWrite('ZJNET,SCAN');
  wifiNote('Scanning via USB Serial • results will appear below','info');
 }else{
  let d;const expected=state.kitId;setupStep=2;render();
  for(let i=0;i<18;i++){d=await deviceRequest('/api/wifi/scan');if(state.kitId!==expected)throw Error('Selected kit changed');if(d.state==='ready')break;await sleep(650)}
  if(d?.state!=='ready')throw Error('Router scan timed out. Keep kit AP connected and retry.');
  setupStep=3;
  if(select){select.replaceChildren(new Option('Select a router',''));for(const v of d.networks||[])if(v.ssid)select.add(new Option(v.ssid+' • '+v.rssi+' dBm',v.ssid))}
  wifiNote('Received '+(d.networks||[]).length+' nearby Wi-Fi networks','good');
 }
}
async function applyMode(){
 if(!state.connected)throw Error('Select and verify your kit before changing modes');
 if(state.owner)throw Error('Release controller before changing Wi-Fi modes');
 const mode=$('kitWifiMode')?.value||'auto';
 if(!['auto','ap','sta'].includes(mode))throw Error('Invalid Wi-Fi mode');
 if(!confirm('Switch kit to '+mode.toUpperCase()+'? STA-only can hide AP. AUTO keeps AP visible. Proceed?'))return false;
 if(state.transport==='usb'){
  const ack=waitSerial(/^ZJNET,(?:ACK,MODE|ERR,)/,3200);
  await usbWrite('ZJNET,MODE,'+mode);
  const line=await ack;
  if(!line.startsWith('ZJNET,ACK,MODE,'))throw Error('Firmware rejected mode change: '+line);
  state.mode=mode;wifiNote('ESP32 Wi-Fi mode set to '+mode.toUpperCase()+'; WebApp connection remains USB until you separately Connect '+mode.toUpperCase()+' with verified STA/AP IP and device key.','good');
  await usbWrite('ZJNET,GET');render();
 }else{
  await deviceRequest('/api/wifi/mode','POST',{mode});
  wifiNote('Switching to '+mode.toUpperCase()+'. Reconnect via matching AP or STA IP.','warn');
  await disconnect('Wi-Fi mode changed • reconnect using Device ID');
 }
 return true;
}
function showSavedNetworks(data){
 savedNetworks=Array.isArray(data?.networks)?data.networks.filter(k=>typeof k.ssid==='string'):[];
 const box=$('kitSavedNetworks');if(!box)return;
 box.replaceChildren(new Option(savedNetworks.length?'Choose a saved router':'No saved router profiles',''));
 for(const item of savedNetworks)box.add(new Option(item.ssid+(item.preferred?' • preferred':''),item.ssid));
 if(data.preferred)box.value=data.preferred;
}
async function refreshSavedNetworks(){
 if(!linkFresh())throw Error('Connect and verify the Kit first');
 if(state.transport==='usb')return usbWrite('ZJNET,SAVED');
 showSavedNetworks(await deviceRequest('/api/wifi/saved'));
}
async function manageSavedNetwork(action){
 if(!linkFresh()||state.owner||state.rc?.claimed||state.working||wifiTesting)throw Error('Release control and finish Wi-Fi tests first');
 const ssid=$('kitSavedNetworks')?.value||'';
 if(!savedNetworks.some(k=>k.ssid===ssid))throw Error('Choose a saved router profile');
 if(action==='forget'&&!confirm('Forget saved Wi-Fi '+ssid+' on this Kit? The active connection remains until disconnect.'))return;
 if(state.transport==='usb'){
  if(/[\r\n]/.test(ssid))throw Error('Use the AP setup page for router names containing line breaks');
  return usbWrite('ZJNET,'+(action==='use'?'USE,':'FORGET,')+ssid);
 }
 const target=connectionTarget();await deviceRequest('/api/wifi/'+action,'POST',{ssid});
 if(action==='use'){await disconnect('Changing to the preferred router • join its Wi-Fi and reconnect');if(target.transport==='ap')void recoverVerifiedLink(target);}
 else await refreshSavedNetworks();
}
async function waitNetworkWifiTest(nonce){
 const until=Date.now()+24000;
 while(nonce===wifiTestNonce&&Date.now()<until&&state.connected&&['ap','sta'].includes(state.transport)){
  await sleep(1200);
  try{
   const d=await deviceRequest('/api/status');
   if(d.kitId!==state.kitId)throw Error('Device ID changed');
   const phase=String(d.wifiTestState||d.phase||'');
   if(phase==='saved'||phase==='sta_test_pass_saved'||phase==='ap_ready_credentials_saved'){
    wifiTesting=false;lastWifiTestState='saved';state.staConnected=!!d.staConnected;state.staIp=d.ip||'';
    setupStep=4;recordKnown();render();wifiNote('Wi-Fi VERIFIED and saved. Switch your laptop to the router, then Connect STA. Android can stay on the kit AP or join the same router for STA.','good');return true;
   }
   if(phase==='failed'||phase==='sta_test_failed_not_saved'){
    wifiTesting=false;lastWifiTestState='failed';wifiNote('STA association failed; password NOT saved. ESP Wi-Fi reason '+(d.lastStaFailureReason||'unknown')+'. Check router 2.4 GHz/WPA2 and selected SSID.','error');return false;
   }
  }catch(e){if(/Device ID changed/.test(e.message)){wifiTesting=false;wifiNote('STA test identity mismatch; check USB','error');return false}}
 }
 if(nonce===wifiTestNonce){wifiTesting=false;wifiNote('STA outcome not verified over network; reconnect USB to inspect ZJNET,TEST_STATE. Do not assume saved.','warn')}
 return false;
}
async function wifiSave(){
 if(!state.connected)throw Error('Connect a kit by USB, AP or STA first');
 if(state.owner)throw Error('Release controller before Wi-Fi provisioning');
 const ssid=$('kitRouterSsid')?.value.trim()||'',password=$('kitRouterPass')?.value||'';
 if(!ssid||new TextEncoder().encode(ssid).length>32||password.length>63||
    (state.transport==='usb'&&(/[,\r\n]/.test(ssid)||/[,\r\n]/.test(password)))||(password.length>0&&password.length<8))
  throw Error('SSID must be 1–32 bytes; password 8–63 characters or empty. USB text commands cannot contain commas or line breaks.');
 if(state.transport==='usb'){
  // No credential appears in event history or the URL; the firmware does not echo it.
  wifiTesting=true;lastWifiTestState='testing';
  try{await usbWrite('ZJNET,TEST,'+ssid+','+password)}catch(e){wifiTesting=false;throw e}
  wifiNote('STA test in progress (up to 20 s). Save only after firmware confirms association.','info');
 }else{
  wifiTesting=true;lastWifiTestState='testing';
  try{await deviceRequest('/api/wifi/test','POST',{ssid,password})}catch(e){wifiTesting=false;throw e}
  wifiNote('STA association in progress; WAIT for verified saved/failed status (up to 20 s).','info');
  void waitNetworkWifiTest(++wifiTestNonce);
 }
 if($('kitRouterPass'))$('kitRouterPass').value='';
}
async function adminSave(){
 if(state.transport!=='usb'||!state.connected||state.owner)throw Error('USB admin access requires selected, unlocked physical kit');
 if(Date.now()>adminUnlockedUntil)throw Error('Unlock teacher admin using your 12+ character passphrase first');
 const name=$('kitAdminName')?.value.trim()||'',code=$('kitAdminCode')?.value.trim()||'',ap=$('kitAdminSsid')?.value.trim()||'',pass=$('kitAdminPass')?.value||'';
 const validName=/^[A-Za-z0-9 _-]{3,31}$/,validAP=/^[A-Za-z0-9_-]{3,24}$/;
 if(name&&!validName.test(name)||code&&!codePattern.test(code)||ap&&!validAP.test(ap)||pass&&(pass.length<8||pass.length>63||/[^\x21-\x7E]|,/.test(pass)))throw Error('Invalid admin input. Kit name 3–31, code six digits, AP prefix 3–24, password 8–63 printable characters.');
 if(!name&&!code&&!ap&&!pass)throw Error('Enter one or more new values');
 if(code&&code!==state.kitCode&&!confirm('Teacher: verify no other kit uses '+code+'. This browser cannot guarantee global code uniqueness. Continue?'))return;
 const cmds=[];
 if(name&&name!==state.kitName)cmds.push('ZJADMIN,NAME,'+name);
 if(code&&code!==state.kitCode)cmds.push('ZJKIT,CODE,'+code);
 if(ap)cmds.push('ZJADMIN,APNAME,'+ap);
 if(pass)cmds.push('ZJADMIN,APPASS,'+pass);
 if(!cmds.length){audit('No admin changes needed');return}
 if(!confirm('Apply '+cmds.length+' USB-only settings to device '+state.kitId+'? Active AP clients may need to reconnect after restart.'))return;
 for(const cmd of cmds){
  const ack=waitSerial(/^ZJ(?:ADMIN|KIT),(?:ACK|ERR),/);
  await usbWrite(cmd);const response=await ack;
  if(response.includes(',ERR,'))throw Error('Device rejected admin setting: '+response);
 }
 if($('kitAdminPass'))$('kitAdminPass').value='';
 audit('Admin settings submitted over physical USB; inspect Serial ACKs • reboot kit to apply AP settings','warn');
 await disconnect('Kit settings changed • verify Device ID / new code and reconnect');
}
async function adminDanger(action){
 if(!state.connected||state.transport!=='usb'||state.owner)throw Error('Admin operation requires unlocked USB kit');
 if(Date.now()>adminUnlockedUntil)throw Error('Unlock teacher admin first');
 const cmd=action==='rotate'?'ZJADMIN,ROTATE_KEY,CONFIRM':'ZJADMIN,FACTORY_RESET,CONFIRM';
 const confirmation=prompt('DANGEROUS ADMIN OPERATION on '+state.kitId+'. Type the 6-digit Kit Code to confirm:');
 if(confirmation!==state.kitCode)return;
 const ackPromise=waitSerial(/^ZJADMIN,(?:ACK|ERR),/,3000);
 await usbWrite(cmd);
 const ack=await ackPromise;
 if(ack.includes(',ERR,'))throw Error('Kit rejected operation: '+ack);
 audit('Physical USB admin operation acknowledged • '+action,'warn');
 await disconnect('Admin operation acknowledged • reboot hardware and re-enroll');
}
async function adminAccess(action){
 if(!state.connected||state.transport!=='usb'||state.owner)throw Error('Connect your selected USB kit with controller released');
 const pass=$('kitAdminSecret')?.value||'';
 if(action!=='LOCK'&&(pass.length<12||pass.length>64||/[,\r\n]/.test(pass)))throw Error('Teacher passphrase must be 12–64 characters without commas or line breaks');
 if(action==='ENROLL'&&!confirm('Teacher: enroll a new admin passphrase on this kit? Save it securely; it cannot be recovered from USB.'))return;
 const response=waitSerial(/^ZJADMIN,(?:ACK|ERR),/,3300);
 // Password is written directly over physical USB, never stored in localStorage or UI logs.
 await usbWrite(action==='LOCK'?'ZJADMIN,LOCK':'ZJADMIN,'+action+','+pass);
 if($('kitAdminSecret'))$('kitAdminSecret').value='';
 const line=await response;
 if(line.startsWith('ZJADMIN,ERR,'))throw Error('Admin refused: '+line.replace('ZJADMIN,ERR,',''));
 adminUnlockedUntil=action==='LOCK'?0:Date.now()+60000;
 if(action==='ENROLL')adminEnrolled=true;
 wifiNote('Teacher admin '+(action==='LOCK'?'locked':'unlocked for 60 seconds')+' on physical USB','good');
 render();
}
function onSerial(e){
 // Network telemetry is a remote readout; it must never impersonate a physical USB kit.
 if(e.detail?.transport&&e.detail.transport!=='usb')return;
 const line=String(e.detail?.line||'').trim();
 if(line.startsWith('ZJKIT,ID,')){if(usbCandidate.kitId!==line.slice(9))for(const key of Object.keys(usbCandidate))delete usbCandidate[key];usbCandidate.kitId=line.slice(9);usbCandidate.identityAt=Date.now();}
 if(line.startsWith('ZJNET,PAIR,')){
  const f=line.split(',');if(/^ZFC-A[12]-[A-Fa-f0-9]{12}$/.test(f[2])&&/^[a-fA-F0-9]{32}$/.test(f[3])&&
    (f[2]===state.kitId||f[2]===usbCandidate.kitId)){
   secureIds.delete(f[2]);localStorage.setItem('zebjus.kit.v2.ids',JSON.stringify([...secureIds]));pairedKeys.set(f[2],f[3]);pairing()?.saveSession?.(f[2],f[3]);
   audit('Private USB session paired for '+f[2]+'; secret never shown in UI','success');
  }
 }
 if(line.startsWith('ZJKIT,CODE,'))usbCandidate.kitCode=line.slice(11);
 if(line.startsWith('ZJKIT,NAME,'))usbCandidate.kitName=line.slice(11);
 if(line.startsWith('ZJINFO,FW,')){const f=line.split(',');usbCandidate.board=f[2];usbCandidate.version=f[3];}
 if(line.startsWith('ZJNET,STA,CONNECTED,')){
  const parts=line.split(','),ip=parts[3]||'';
  if(privateIPv4(ip)){
   usbCandidate.staIp=ip;
   if(state.connected&&state.transport==='usb'){
    state.usbInfo.staIp=ip;if($('kitIpInput'))$('kitIpInput').value=ip;
    recordKnown();audit('STA IP learned from verified USB kit: '+ip,'good');
   }
  }
 }
 if(!state.connected&&!state.working&&serial()?.isOpen?.()&&usbCandidate.kitId&&usbCandidate.kitCode&&usbCandidate.board&&Date.now()-usbCandidate.identityAt<=HEARTBEAT_MAX_AGE){
  try{
   const kit=checkIdentity(usbCandidate,'usb',usbCandidate.kitCode);
   Object.assign(state,kit,{connected:true,heartbeatAt:usbCandidate.identityAt,linkState:'connected',transport:'usb',mode:'usb',key:'',ip:'',usbInfo:{...usbCandidate},rc:null,owner:false,since:Date.now()});
   if($('kitCodeInput'))$('kitCodeInput').value=kit.kitCode;
   if($('kitTransport'))$('kitTransport').value='usb';
   recordKnown();tone('USB kit auto-verified • '+kit.kitName+' • '+kit.kitCode,'good');
   audit('USB firmware handshake verified • '+kit.kitId,'success');
   void usbWrite('ZJNET,GET').catch(()=>{});
   void usbWrite('ZJADMIN,GET').catch(()=>{});
   void pairUsb().catch(e=>audit('Automatic USB pairing unavailable: '+e.message,'warn'));
  }catch(err){audit('USB identity not verified: '+err.message,'warn')}
 }
 if(state.connected&&state.transport==='usb'&&line.startsWith('ZJNET,')){
  const text=line.replace(/[\r\n]/g,'');
  if(text.startsWith('ZJNET,SCAN,STARTED'))wifiNote('Searching nearby 2.4 GHz networks…','info');
  else if(text.startsWith('ZJNET,SCAN,COUNT,')){
   const count=Number(text.slice(17));
   const select=$('kitWifiNetworks');if(select)select.replaceChildren(new Option('Select router ('+count+' found)',''));
  }else if(text.startsWith('ZJNET,SCAN,ITEM,')){
   const match=/^ZJNET,SCAN,ITEM,(.*),(-?\d+),(OPEN|SECURE)$/.exec(text);
   if(match&&$('kitWifiNetworks'))$('kitWifiNetworks').add(new Option(match[1]+' • '+match[2]+' dBm'+(match[3]==='SECURE'?' 🔒':''),match[1]));
  }else if(text==='ZJNET,SCAN,END')wifiNote('Router scan complete • select SSID and enter password','good');
  else if(text==='ZJNET,TEST,SAVED'){wifiTesting=false;lastWifiTestState='saved';wifiNote('STA CONNECTED and credentials saved. AUTO keeps the AP available; join the router and Connect STA.','good');void usbWrite('ZJNET,GET').catch(()=>{})}
  else if(text.startsWith('ZJNET,SAVED,')){try{showSavedNetworks(JSON.parse(text.slice(12)))}catch{audit('Invalid saved-router response','warn')}}
  else if(text.startsWith('ZJNET,TEST,FAILED_NOT_SAVED')){wifiTesting=false;lastWifiTestState='failed';const n=Number(text.split(',')[3])||0;wifiNote('STA FAILED • not saved. Disconnect reason '+(n===36?'36 (STA_LEAVING, not password proof)':n||'unknown')+'. Check selected 2.4 GHz WPA2 router.','error');void usbWrite('ZJNET,GET').catch(()=>{})}
  else if(text.startsWith('ZJNET,ERR,')){wifiTesting=false;wifiNote(text.replace('ZJNET,ERR,','Wi-Fi error: '),'error')}
  else if(text.startsWith('ZJNET,ACK,MODE,')){state.mode=text.slice(15).toLowerCase();wifiNote('Network mode: '+state.mode.toUpperCase(),'good')}
  else if(text.startsWith('ZJNET,MODE,')){state.mode=text.slice(11).toLowerCase();if(['ap','sta'].includes(state.mode))headerNetworkChoice=state.mode;if($('kitWifiMode')&&['auto','ap','sta'].includes(state.mode))$('kitWifiMode').value=state.mode;render()}
  else if(text.startsWith('ZJNET,AP,')){state.apActive=/^ZJNET,AP,(?:ON|READY),/.test(text);wifiNote('AP '+text.slice(9)+' • Password is configured in Device Admin','info');render()}
  else if(text.startsWith('ZJNET,TEST_STATE,')){lastWifiTestState=text.slice(17);if(lastWifiTestState==='testing'&&!wifiTesting)wifiNote('ESP32 STA test is running; waiting for association','info')}
  else if(text.startsWith('ZJNET,STA_REASON,')){state.staDisconnectReason=Number(text.slice(17))||0;if(state.staDisconnectReason&&state.staDisconnectReason!==36&&lastWifiTestState==='failed')wifiNote('STA failure reason '+state.staDisconnectReason+' • check 2.4 GHz SSID/security/signal','warn');render()}
  else if(text.startsWith('ZJNET,STA,')){const p=text.split(',');state.staConnected=p[2]==='CONNECTED';state.staIp=state.staConnected?p[3]:'';if(state.staConnected&&privateIPv4(p[3])){$('kitIpInput').value=p[3];state.usbInfo.staIp=p[3];recordKnown()}render()}
 }
 for(const pending of serialClaims.slice())if(pending.pattern.test(line)){serialClaims=serialClaims.filter(x=>x!==pending);pending.resolve(line)}
 if(!state.connected||state.transport!=='usb')return;
 if(line.startsWith('ZJKIT,ID,')&&line.slice(9)!==state.kitId){void disconnect('USB hardware identity changed');return}
 const rc=/^ZJRC,USB,(WEB|ANDROID),(\d+),T=(\d+),R=(\d+),P=(\d+),Y=(\d+)$/.exec(line);
 if(rc){state.rc={...(state.rc||{}),active:true,claimed:true,source:rc[1],seq:+rc[2],throttle:+rc[3],roll:+rc[4],pitch:+rc[5],yaw:+rc[6]};state.ackAt=Date.now();render()}
 if(line.startsWith('ZJRC,FAILSAFE')||line.startsWith('ZJRC,RELEASE,')){if(line.startsWith('ZJRC,FAILSAFE'))void usbWrite('ZJRC,RELEASE').catch(()=>{});state.owner=false;state.rcSession='';state.rcSource='';state.rc={claimed:false,active:false,throttle:1000,roll:1500,pitch:1500,yaw:1500};audit(line,'warn');render()}
 if(line.startsWith('ZJADMIN,ERR,')||line.startsWith('ZJKIT,ERR,'))audit(line,'error');
 if(line.startsWith('ZJADMIN,AUTH,')){
  const status=line.slice(13);adminEnrolled=status!=='ENROLL_REQUIRED';
  if(status==='LOCKED'||status==='ENROLL_REQUIRED')adminUnlockedUntil=0;
  render();
 }
 if(line==='ZJADMIN,ACK,LOCKED')adminUnlockedUntil=0;
 if(line.startsWith('ZJADMIN,NAME,')){$('kitAdminName').value=line.slice(13)}
 if(line.startsWith('ZJADMIN,APNAME,')){$('kitAdminSsid').value=line.slice(15)}
 if(line.startsWith('ZJKIT,CODE,')){$('kitAdminCode').value=line.slice(11)}
 if(line.startsWith('ZJADMIN,ACK,')||line.startsWith('ZJKIT,ACK,'))audit(line,'success');
}

// Read-only reconnect to exactly the same kit; RC ownership is NEVER resumed.
async function recoverVerifiedLink(old){
 if(!old||!['sta','ap'].includes(old.transport)||!identityHosts(old).length)return false;
 const ticket=++reconnectTicket;recoveryTarget=old;state.linkState='reconnecting';render();
 for(const delay of [400,1100,2400,5000,8000]){
  await sleep(delay);
  if(reconnectTicket!==ticket||document.hidden||state.connected)return false;
  try{
   let d,address=old.ip;for(const host of identityHosts(old)){try{
    const found=await probeIdentity(host,1800);
    if(!found||found.kitId!==old.kitId||found.kitCode!==old.kitCode)continue;
    if(old.key&&found.adminSessions)adminKitHosts.set(host,old.kitId);
    if(!old.key){
     if(!found.simpleConnection)continue;
     localKitHosts.set(host,old.kitId);
     if(!authSessions.has(old.kitId+'@'+host))authSessions.set(old.kitId+'@'+host,await root.ZebjusKitAuth.openLocal(root.ZebjusKitAuth.http('http://'+host),old.kitId,old.transport));
    }
    d=await wifiDirect(host,old.key,'/api/status');address=host;break;
   }catch{}}if(!d)throw Error('Kit unavailable at its last IP and verified Kit Name');
   const verified=checkIdentity(d,old.transport,old.kitCode,old.kitId);
   if(d.board!==old.board||String(d.requestTransport||'').toLowerCase()!==old.transport)
    throw Error('Transport or physical hardware changed; reconnect blocked');
   if(old.previousBootId&&d.bootId===old.previousBootId)throw Error('Waiting for the selected kit to reboot');
   // Restore read-only monitoring even while Android owns input. Never reclaim RC.
   if(reconnectTicket!==ticket)return false;
   Object.assign(state,verified,{connected:true,ip:address,key:old.key,setupAuthorized:!!d.setupAuthorized,otaAuthorized:!!d.otaAuthorized,transport:old.transport,
    mode:d.mode||'',apActive:!!d.apActive,staConnected:!!d.staConnected,staIp:d.ip||'',staDisconnectReason:Number(d.staDisconnectReason)||0,
    heartbeatAt:Date.now(),linkState:'connected',rssi:Number(d.rssi)||null,rc:d.rc||null,owner:false,rcSource:'',rcSession:'',since:Date.now()});
   adoptNetworkStatus(d);recoveryTarget=null;pollErrors=0;headerNetworkChoice=old.transport;recordKnown();tone('Wi-Fi recovered • same Device ID verified • Take Control again','good');
   root.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:true,transport:old.transport,kitId:old.kitId}}));
   return true;
  }catch(e){audit('Verified reconnect attempt: '+String(e.message||e).slice(0,100),'warn')}
 }
 if(reconnectTicket===ticket){tone('Kit offline • monitoring will retry; use Rescan Kits or Network Recovery','warn');setTimeout(()=>{if(reconnectTicket===ticket&&!document.hidden&&!state.connected)void recoverVerifiedLink(old)},30000)}
 return false;
}
/* Bounded reference-style hostname discovery. Browsers cannot enumerate Wi-Fi,
 * so probe advertised/saved hostnames, prior IPs, and the AP gateway only.
 * /api/identify is public discovery data; controller operations remain authenticated. */
async function pairUsb(){
 if(!serial()?.isOpen?.()||!(state.transport==='usb'&&state.connected))
  throw Error('Connect the selected physical USB kit first (running firmware, not ROM bootloader).');
 const pending=waitSerial(/^ZJNET,(?:PAIR,|ERR,)/,3200);pending.catch(()=>{});
 await usbWrite('ZJNET,PAIR');
 const result=await pending,parts=result.split(',');
 if(parts[1]!=='PAIR'||parts[2]!==state.kitId||!/^[a-fA-F0-9]{32}$/.test(parts[3]||''))
  throw Error('USB pairing rejected or unsupported. A new firmware release is required for automatic keyless UI pairing.');
 secureIds.delete(state.kitId);localStorage.setItem('zebjus.kit.v2.ids',JSON.stringify([...secureIds]));pairedKeys.set(state.kitId,parts[3]);pairing()?.saveSession?.(state.kitId,parts[3]);
 if($('kitRememberBrowser')?.checked)await rememberBrowserPairing();
 else tone('USB paired in this tab • enable Remember this browser on a personal laptop to reconnect over AP after closing the page','good');
 return true;
}
async function probeIdentity(ip,timeoutMs=1550){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{
  const response=await fetch('http://'+ip+'/api/identify',{method:'GET',mode:'cors',credentials:'omit',
   redirect:'error',cache:'no-store',signal:ctrl.signal,targetAddressSpace:'local'});
  if(!response.ok)return null;
  const d=await response.json();
  if(!/^ZFC-A[12]-[A-Fa-f0-9]{12}$/.test(String(d.kitId||''))||!/^\d{6}$/.test(String(d.kitCode||''))||
     !String(d.kitId).startsWith(String(d.board||'')+'-'))return null;
  return {kitId:d.kitId,kitCode:d.kitCode,kitName:String(d.name||'ZEBJUS AERION').slice(0,36),
   simpleConnection:!!d.simpleConnection,adminSessions:!!d.adminSessions,hostname:d.hostname||'',board:d.board,ip:ip,transport:ip==='192.168.4.1'?'ap':'sta',lastSeen:Date.now()};
 }catch{return null}finally{clearTimeout(timer)}
}
function showDiscovered(){
 for(const id of ['kitDiscoveryResults','fwDiscoveryResults']){
  const target=$(id);if(!target)continue;
  if(id==='fwDiscoveryResults'&&root.ZebjusFirmwareConnect?.renderAvailable){
   root.ZebjusFirmwareConnect.renderAvailable(discoveredKits,discovering);continue;
  }
  target.replaceChildren();
  if(!discoveredKits.length){const empty=document.createElement('p');empty.className='kit-hint';
   empty.textContent=discovering?'Scanning mDNS kits, saved addresses and optional LAN helper…':'No Kit verified. Allow Local Network Access, join classroom Wi-Fi or run the optional LAN helper for new STA kits.';target.append(empty);continue}
  for(const k of discoveredKits){
   const btn=document.createElement('button');btn.type='button';btn.className='kit-known-item';btn.title='Select '+k.kitId+' • identity verified by live /api/identify; AP diagnostics connects without a private label; protected settings require trusted access';
   const label=document.createElement('b');label.textContent=k.kitName+' • '+k.kitCode;
   const small=document.createElement('small');small.textContent=k.board+' • '+k.transport.toUpperCase()+' • '+k.ip+' • '+k.kitId;
   btn.append(label,small);btn.onclick=()=>{
    if(id==='fwDiscoveryResults')goKits();
    void (async()=>{
     if(state.owner)throw Error('Release diagnostic control before switching kits');
     if(state.connected&&state.kitId!==k.kitId)await disconnect('Switching selected classroom kit');
     $('kitCodeInput').value=k.kitCode;$('kitIpInput').value=k.ip;$('kitTransport').value=k.transport;
     headerNetworkChoice=k.transport;render();tone('Connecting '+k.kitName+' over '+k.transport.toUpperCase()+'…','info');
     await connect();
    })().catch(e=>tone(e.message,'error'));
   };
   target.append(btn);
  }
 }
 render();
}
async function discoverBridgeHosts(){
 // A hosted browser cannot multicast-query mDNS; optional localhost helper gives
 // candidate IPs only. Every candidate is reverified against /api/identify.
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),1400);
 try{
  const response=await fetch('http://127.0.0.1:8766/kits',{mode:'cors',credentials:'omit',cache:'no-store',
   redirect:'error',targetAddressSpace:'loopback',signal:ctrl.signal});
  if(!response.ok)return [];
  const data=await response.json();return Array.isArray(data.kits)?data.kits.filter(v=>privateIPv4(v.ip)).slice(0,64).map(v=>v.ip):[];
 }catch{return []}finally{clearTimeout(timer)}
}
async function discoverKits(){
 if(discoveryPending)return discoveryPending;
 discoveryPending=scanKitCandidates().finally(()=>{discoveryPending=null});return discoveryPending;
}
async function scanKitCandidates(){
 discovering=true;render();showDiscovered();
 try{
  let known=[];try{known=JSON.parse(localStorage.getItem('zebjus.classroom.known.v1')||'[]')}catch{}
  const candidates=new Set(['192.168.4.1']);
  for(const k of known){
   if(privateIPv4(k.ip))candidates.add(k.ip);
   const id=String(k.id||'').match(/^ZFC-A([12])-([0-9A-F]{12})$/i);
   if(id)candidates.add('zebjus-a'+id[1]+'-'+id[2].slice(-6).toLowerCase()+'.local');
   if(k.name&&/^[a-zA-Z0-9_-]{3,31}$/.test(k.name))candidates.add(k.name.toLowerCase().replace(/_/g,'-')+'.local');
   if(safeKitHost(k.hostname))candidates.add(k.hostname);
  }
  if(usbCandidate.staIp&&privateIPv4(usbCandidate.staIp))candidates.add(usbCandidate.staIp);
  for(const ip of await discoverBridgeHosts())candidates.add(ip);
  for(let n=1;n<=30;n++){
   candidates.add('zebjus-drone-'+n+'.local');
   candidates.add('zebjus_drone_'+n+'.local'); // legacy firmware hostname pattern
  }
  const codes=new Set([selectedCode(),usbCandidate.kitCode,...known.map(v=>v.code)].filter(v=>/^\d{6}$/.test(String(v||''))));
  for(const code of codes)for(const board of ['a1','a2'])candidates.add('zebjus-'+board+'-'+code+'.local');
  const addresses=[...candidates];let cursor=0;const found=new Map();
  await Promise.all(Array.from({length:8},async()=>{
   while(cursor<addresses.length){
    const addr=addresses[cursor++],kit=await probeIdentity(addr);
    if(!kit)continue;
    const prior=found.get(kit.kitId);
    if(!prior||prior.transport==='ap'&&kit.transport==='sta')found.set(kit.kitId,kit);
    discoveredKits=[...found.values()].sort((a,b)=>a.kitName.localeCompare(b.kitName,undefined,{numeric:true}));
    showDiscovered();
   }
  }));
  discoveredKits=[...found.values()].sort((a,b)=>a.kitName.localeCompare(b.kitName,undefined,{numeric:true}));
  lastDiscoverAt=Date.now();audit('Discovery completed • '+discoveredKits.length+' live kit(s) • public identity only','info');
  return discoveredKits;
 }finally{discovering=false;showDiscovered()}
}

function guardAction(id,fn){$(id)?.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>{const locked=/locked|occupied|not_controller_owner/i.test(e.message);tone(e.message,locked?'locked':'error');audit(e.message,locked?'warn':'error')}))}
function connectionTarget(){return {kitId:state.kitId,kitCode:state.kitCode,kitName:state.kitName,hostname:state.hostname,
 transport:state.transport,ip:state.ip,staIp:state.staIp,key:state.key,board:state.board};}
async function reconnectSelected(){
 const target=recoveryTarget||connectionTarget();
 if(!target.kitId)throw Error('Select a Kit first');
 if(state.transport==='usb'&&state.connected)return read();
 if(state.owner)throw Error('Release control before reconnecting');
 await disconnect('Reconnecting the selected Device ID');
 return recoverVerifiedLink(target);
}
async function restoreLastKit(){
 if(state.connected||state.working||recoveryTarget)return;
 let known;try{known=JSON.parse(localStorage.getItem('zebjus.classroom.last.v1')||'null')}catch{}
 if(!known?.id||!known.code||!known.board)return;
 const ticket=reconnectTicket;
 for(const host of identityHosts(known)){
  const live=await probeIdentity(host,1500);
  if(ticket!==reconnectTicket||state.connected||state.working)return;
  if(live?.kitId!==known.id||live.kitCode!==known.code)continue;
  await connectDiscoveredKit(live);return;
 }
}
async function rebootConnectedKit(){
 if(!linkFresh()||!['ap','sta'].includes(state.transport)||!state.otaAuthorized)throw Error('Reboot requires an authorized AP/STA connection; USB uses Reset Board');
 if(state.owner||state.rc?.claimed||state.working)throw Error('Release control before rebooting');
 const target={...connectionTarget(),previousBootId:state.bootId};
 const result=await deviceRequest('/api/reboot','POST');
 if(result.kitId!==state.kitId||result.rebooting!==true)throw Error('Reboot was not acknowledged by the selected kit');
 await disconnect('Kit reboot acknowledged • verifying reconnect');
 return recoverVerifiedLink(target);
}
async function authorizeNetwork(){
 if(!linkFresh()||!['ap','sta'].includes(state.transport)||state.owner||state.rc?.claimed||state.working)throw Error('Connect an idle AP/STA kit before authorizing updates');
 const id=state.kitId,ip=state.ip,ticket=reconnectTicket;
 const key=pairedKeys.get(id)||pairing()?.fromSession?.(id)||await pairing()?.restore?.(id)||'';
 if(!/^[a-fA-F0-9]{32}$/.test(key))throw Error('Connect this kit once using Read Running Firmware over USB to pair this browser, then reconnect AP/STA and authorize updates.');
 const local=localKitHosts.get(ip),previousKey=state.key;
 const found=await probeIdentity(ip,2000);
 if(ticket!==reconnectTicket||found?.kitId!==id)throw Error('Device ID changed before authorization');
 if(found.adminSessions)adminKitHosts.set(ip,id);
 localKitHosts.delete(ip);authSessions.delete(id+'@'+ip);state.key=key;
 try{
  const d=await read();
  if(ticket!==reconnectTicket||state.kitId!==id||!d.otaAuthorized)throw Error('Selected kit did not grant firmware-update permission');
  pairedKeys.set(id,key);tone('Physical USB pairing verified • control, settings and APP OTA authorized for '+state.kitName,'good');
 }catch(e){
  if(ticket===reconnectTicket){state.key=previousKey;if(local)localKitHosts.set(ip,local);adminKitHosts.delete(ip);authSessions.delete(id+'@'+ip);}
  throw Error('Authorization failed. Pair this physical kit again over USB: '+e.message);
 }
}
function goKits(){document.querySelector('[data-tab="settings"]')?.click();$('kitCodeInput')?.focus()}
async function toggleHeaderNetwork(){
 if(state.working||headerModePending||state.owner)throw Error('Release diagnostic control before selecting a connection');
 headerNetworkChoice=headerNetworkChoice==='ap'?'sta':'ap';render();
 tone('Selected '+headerNetworkChoice.toUpperCase()+' transport (not a firmware mode change). Press Connect; configure STA after successful Test & Save.','info');
}
async function connectHeaderNetwork(mode=headerNetworkChoice){
 if(!['sta','ap'].includes(mode))throw Error('Choose STA or AP first');
 headerNetworkChoice=mode;
 if($('kitTransport'))$('kitTransport').value=mode;
 if($('kitIpInput')&&mode==='ap')$('kitIpInput').value='192.168.4.1';
 if(state.connected&&state.transport===mode){tone('Kit already connected over '+mode.toUpperCase(),'good');goKits();return}
 if(state.owner||state.rc?.claimed)throw Error('Release diagnostic control before switching AP/STA connections');
 const selected=root.ZebjusFirmwareConnect?.selected?.(),preferred=state.kitId||selected?.kitId;
 const candidates=discoveredKits.filter(k=>k.transport===mode&&(!preferred||k.kitId===preferred));
 if(candidates.length===1)return connectDiscoveredKit(candidates[0]);
 if(preferred){
  const target=state.kitId?connectionTarget():selected;
  for(const host of mode==='ap'?['192.168.4.1']:identityHosts(target)){
   if(mode==='sta'&&host==='192.168.4.1')continue;
   const found=await probeIdentity(host,1800);
   if(found?.kitId===preferred&&found.transport===mode)return connectDiscoveredKit(found);
  }
 }
 if(state.connected&&state.kitCode&&$('kitCodeInput'))$('kitCodeInput').value=state.kitCode;
 if(mode==='sta'&&state.staIp&&privateIPv4(state.staIp)&&$('kitIpInput'))$('kitIpInput').value=state.staIp;
 let code=selectedCode(),ip=($('kitIpInput')?.value||'').trim();
 if(mode==='ap'&&!codePattern.test(code)){
  const found=discoveredKits.find(k=>k.ip==='192.168.4.1')||await probeIdentity('192.168.4.1',2500);
  if(found){$('kitCodeInput').value=found.kitCode;code=found.kitCode;}
 }
 if(!codePattern.test(code)){goKits();tone('Join your AERION AP Wi-Fi, select the discovered kit or enter its 6-digit Kit Code.','warn');return}
 if(!safeKitHost(ip)){goKits();tone('Choose a reachable AP/STA address. AP is 192.168.4.1.','warn');return}
 await connect(preferred||'');
}
async function toggleHeaderControl(){
 if(!state.connected||!['usb','sta','ap'].includes(state.transport))throw Error('Connect a verified kit over USB, STA or AP first');
 if(state.owner){await releaseRc();return}
 if(state.rc?.claimed)throw Error('Kit already locked by a controller');
 // Hardware target is BENCH RC diagnostics only. Firmware does not drive motors.
 if($('kitHardwareTarget'))$('kitHardwareTarget').checked=true;
 if($('kitSourceSelect'))$('kitSourceSelect').value='WEB';
 await claim('WEB');render();
}

function setupHint(message){const el=$('kitSimpleHelp');if(el)el.textContent=message;}
async function startSetup(){
 const ticket=++reconnectTicket;goKits();setupStep=1;$('kitTransport').value='ap';$('kitIpInput').value='192.168.4.1';
 tone('Join the kit Wi-Fi in OS settings, allow Local Network Access, then Connect Kit. No private label required.','info');
 const live=await probeIdentity('192.168.4.1',3000);if(ticket!==reconnectTicket)return;if(!live)throw Error('Kit not reachable. Join its Wi-Fi, then press Connect Kit.');
 $('kitCodeInput').value=live.kitCode;await connect();
}
async function findKitAp(){
 if(state.owner)throw Error('Release controller before switching kits');
 const found=await probeIdentity('192.168.4.1',3500);
 if(!found)throw Error('Kit AP not reachable. Join its ZEBJUS-AERION Wi-Fi hotspot in your computer settings and allow Local Network Access, then retry.');
 if(state.connected&&state.kitId&&state.kitId!==found.kitId)await disconnect('Selecting a different physical kit');
 $('kitCodeInput').value=found.kitCode;$('kitTransport').value='ap';$('kitIpInput').value='192.168.4.1';
 headerNetworkChoice='ap';setupStep=1;render();
 const key=pairedKeys.get(found.kitId)||pairing()?.fromSession?.(found.kitId)||await pairing()?.restore?.(found.kitId)||($('kitKeyInput')?.value||'').trim();
 if(!/^[a-fA-F0-9]{32}$/.test(key)&&!found.simpleConnection){
  setupHint('Kit detected: '+found.kitCode+' • '+found.kitId+'. Update firmware for simple AP diagnostics, or connect physical USB for protected settings access.');
  tone('Kit '+found.kitCode+' detected • Protected settings access requires physical USB on this older firmware.','warn');return found;
 }
 await connect();
 if(!linkFresh()||state.kitId!==found.kitId){
  const detail=state.lastError||'No authenticated status was received';
  throw Error('Kit AP is discoverable, but authenticated connection failed: '+detail+'. Check that FlightCore 1.4.3 is actually running; restart the kit and retry.');
 }
 if(!state.setupAuthorized){
  setupHint('AP connected. Running firmware does not support direct Wi-Fi setup. Install FlightCore 1.4.3 to enable Scan Wi-Fi → Test & Save without USB.');
  tone('AP connected • install FlightCore 1.4.3 for direct Wi-Fi setup','warn');return found;
 }
 setupStep=2;setupHint('Kit '+found.kitCode+' securely connected over AP. Scroll to Classroom Network → Scan Wi-Fi → Test & Save.');render();
 tone('Kit '+found.kitCode+' connected over AP • Scan Wi-Fi to continue.','good');return found;
}
async function pairNewKitUsb(){
 if(state.owner)throw Error('Release controller before pairing a new kit');
 if(!serial()?.isOpen?.())await serial()?.connect?.();
 if(!serial()?.isOpen?.())throw Error('Select your USB serial port and connect running FlightCore firmware (not ROM bootloader).');
 const pending=waitSerial(/^ZJKIT,CODE,\d{6}$/,3500);pending.catch(()=>{});
 await usbWrite('ZJKIT,GET');await usbWrite('ZJINFO,GET');
 const code=(await pending).slice(11);
 $('kitCodeInput').value=code;$('kitTransport').value='usb';setupStep=1;render();
 await connect();
 if(!linkFresh()||state.transport!=='usb')throw Error('USB firmware identity verification failed. Check the active port and running firmware.');
 if(!pairedKeys.has(state.kitId))await pairUsb();
 if(!pairedKeys.has(state.kitId))throw Error('USB connected but secure pairing was not acknowledged.');
 if($('kitRememberBrowser')?.checked)await rememberBrowserPairing();
 setupHint('USB authorized: '+state.kitCode+'. You may unplug USB and join the kit AP Wi-Fi, then press Find Kit on AP. Remember this browser is optional and recommended only on a personal device.');
 tone('USB settings access authorized • join kit AP Wi-Fi and Find Kit on AP to configure the router.','good');
}
async function handoverSta(){
 const id=state.kitId,code=state.kitCode,ip=state.staIp;
 if(!id||!code)throw Error('Connect the kit and finish authorized Test & Save first');
 if(state.rc?.claimed)throw Error('Release diagnostic control before handover');
 setupStep=4;render();tone('Switch laptop Wi-Fi to your router. Checking the same Device ID over STA…','info');
 const hosts=[ip,'zebjus-'+state.board.replace('ZFC-','')+'-'+code+'.local'].filter(safeKitHost);
 for(let attempt=0;attempt<12;attempt++){
  for(const host of hosts){const d=await probeIdentity(host,1500);if(d&&d.kitId!==id)throw Error('Another kit is using that address. Handover blocked.');if(d?.kitId===id){$('kitTransport').value='sta';$('kitIpInput').value=host;await connect();if(state.connected){setupStep=5;render();return}}}
  await sleep(1000);
 }
 throw Error('STA kit not reachable yet. Join the same 2.4 GHz router, allow Local Network Access, and retry Connect STA.');
}
let internetPending=null;
function checkWebReachability(){
 if(internetPending)return internetPending;
 internetPending=(async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
  try{
   const url=new URL('app-version.json',location.href);url.searchParams.set('connectivity_probe',Date.now());
   const response=await fetch(url,{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
   const data=response.ok?await response.json():null;
   state.internet=data&&typeof data.version==='string'?'reachable':'unavailable';
  }catch{state.internet='offline'}finally{clearTimeout(timer);render()}
 })().finally(()=>{internetPending=null});return internetPending;
}
async function refreshConnection(){
 void checkWebReachability();
 if(state.connected){
  try{return await read()}catch(e){state.linkState='stale';state.owner=false;state.rcSession='';state.rcSource='';render();throw e}
 }
 if(recoveryTarget)return recoverVerifiedLink(recoveryTarget);
 await discoverKits();
 const authorized=[];
 for(const kit of discoveredKits){
  const key=pairedKeys.get(kit.kitId)||pairing()?.fromSession?.(kit.kitId)||await pairing()?.restore?.(kit.kitId);
  if(key)authorized.push(kit);
 }
 if(authorized.length===1){
  const kit=authorized[0];$('kitCodeInput').value=kit.kitCode;$('kitIpInput').value=kit.ip;$('kitTransport').value=kit.transport;
  await connect();
 }else tone(authorized.length?'Multiple authorized kits • select a Device ID in My Kits':'Scan Kits on the same classroom Wi-Fi, then click a Kit Name. Start the optional LAN helper for brand-new STA kits.','info');
}
function init(){
 if(!$('kitCenter'))return;
 guardAction('kitNewSetup',startSetup);guardAction('kitFindAp',findKitAp);guardAction('kitHandover',handoverSta);
 showKnown();render();root.addEventListener('dronelab:serial-line',onSerial);
 const code=$('kitCodeInput');if(code)code.oninput=()=>{code.value=code.value.replace(/\D/g,'').slice(0,6)};
 guardAction('kitFindSaved',findSaved);guardAction('kitPairUsb',pairUsb);
 guardAction('kitForgetBrowserPairing',forgetBrowserPairing);
 $('kitRememberBrowser')?.addEventListener('change',e=>{
  if(!e.target.checked)return;
  const id=state.kitId||usbCandidate.kitId;
  if(!id||!pairedKeys.get(id)){tone('Simple AP diagnostics needs no saved pairing. Authorize Settings over USB to remember protected STA/settings access on this personal browser.','info');return}
  void rememberBrowserPairing().catch(err=>{e.target.checked=false;tone(err.message,'warn')});
 });guardAction('kitDiscover',discoverKits);
 // Firmware tab owns its discovery results; My Kits keeps independent actions.
 $('fwOpenDiscovery')?.addEventListener('click',goKits);
 guardAction('kitConnect',connect);guardAction('kitDisconnect',()=>disconnect('Student disconnected'));
 guardAction('kitIdentify',identify);guardAction('kitReadInfo',refreshConnection);guardAction('kitTopRefresh',refreshConnection);
 guardAction('kitTopStop',stop);
 guardAction('kitTakeControl',()=>claim($('kitSourceSelect')?.value||'WEB'));guardAction('kitReleaseControl',releaseRc);guardAction('kitStop',stop);
 guardAction('kitModeApply',applyMode);guardAction('kitWifiSave',wifiSave);guardAction('kitWifiScan',scanWifi);
 guardAction('kitSavedRefresh',refreshSavedNetworks);guardAction('kitSavedUse',()=>manageSavedNetwork('use'));guardAction('kitSavedForget',()=>manageSavedNetwork('forget'));
 $('kitWifiNetworks')?.addEventListener('change',e=>{if(e.target.value)$('kitRouterSsid').value=e.target.value});
 guardAction('kitAdminEnroll',()=>adminAccess('ENROLL'));guardAction('kitAdminUnlock',()=>adminAccess('UNLOCK'));guardAction('kitAdminLock',()=>adminAccess('LOCK'));
 guardAction('kitAdminApply',adminSave);guardAction('kitAdminRead',async()=>{if(state.transport!=='usb'||!state.connected)throw Error('Admin reads require physical USB');await usbWrite('ZJADMIN,GET');audit('Read admin settings over USB')});guardAction('kitRotateKey',()=>adminDanger('rotate'));guardAction('kitFactoryReset',()=>adminDanger('factory'));
 $('fwOpenKitNetwork')?.addEventListener('click',()=>{goKits();$('kitNetworkSettings')?.scrollIntoView({behavior:'smooth',block:'center'})});
 guardAction('kitTopNetworkSwitch',toggleHeaderNetwork);guardAction('kitTopWifiConnect',()=>connectHeaderNetwork());guardAction('kitTopControl',toggleHeaderControl);
 guardAction('fwConnectStaBtn',()=>connectHeaderNetwork('sta'));guardAction('fwConnectApBtn',()=>connectHeaderNetwork('ap'));
 $('kitTopConnect')?.addEventListener('click',goKits);$('kitOpenMobile')?.addEventListener('click',()=>document.querySelector('[data-tab="settings"]')?.click());
 $('kitHardwareTarget')?.addEventListener('change',e=>{if(!e.target.checked&&state.owner)void releaseRc();audit('Hardware diagnostic target '+(e.target.checked?'enabled':'disabled'))});
 $('kitSourceSelect')?.addEventListener('change',e=>{if(state.owner)void releaseRc();audit('Controller source selected: '+e.target.value)});
 $('kitCodeInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void connect()}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.owner)void releaseRc();else if(!document.hidden)void refreshConnection().catch(()=>{})});
 root.addEventListener('pagehide',()=>{++reconnectTicket;if(state.owner)void releaseRc();pairedKeys.clear();clearInterval(pollTimer);clearInterval(rcTimer)});
 pollTimer=setInterval(async()=>{
  if(!state.connected||state.working||wifiTesting||pollBusy)return;
  pollBusy=true;const ticket=reconnectTicket,usb=state.transport==='usb';
  try{await read();if(ticket===reconnectTicket)pollErrors=0}
  catch(e){
   if(ticket!==reconnectTicket)return;
   state.linkState='stale';state.owner=false;state.rcSession='';state.rcSource='';render();
   if(++pollErrors<3){audit((usb?'USB':'Wi-Fi')+' check '+pollErrors+'/3 missed • '+e.message,'warn')}
   else{
    const old=connectionTarget();
    audit('3 missed '+(usb?'USB':'Wi-Fi')+' checks • releasing diagnostic control','warn');
    await disconnect(usb?'USB link lost • reconnect and verify the selected kit':'Wi-Fi link lost • automatic identity-checked reconnect');
    if(!usb&&!document.hidden)void recoverVerifiedLink(old);
   }
  }finally{pollBusy=false}
 },2200);
 rcTimer=setInterval(webControls,RC_INTERVAL);
 // Recheck verified LAN hostnames and AP once per minute only when page is visible.
 setTimeout(()=>{if(!document.hidden){void discoverKits().catch(()=>{});void restoreLastKit().catch(e=>audit('Saved kit reconnect: '+e.message,'warn'))}},600);
 root.addEventListener('online',()=>{if(!document.hidden)void refreshConnection().catch(()=>{})});
 root.addEventListener('offline',()=>{state.internet='offline';render()});
 void checkWebReachability();setInterval(()=>{if(!document.hidden)void checkWebReachability();render()},30000);
 setInterval(()=>{if(!document.hidden&&!discovering&&Date.now()-lastDiscoverAt>60000)void discoverKits().catch(()=>{})},45000);
 audit('MY KITS loaded • no hardware connected');
}
// Verified APP-only OTA via the already authenticated direct STA/AP session.
// No binary relay through WebRTC JSON messages. Browser Local Network Access may
// block HTTPS→ESP32 HTTP; never claim flashing succeeded without a firmware ACK.
async function uploadAppFirmware({bytes,name,boardId,version,onProgress=()=>{}}={}){
 if(!linkFresh()||!['sta','ap'].includes(state.transport)||state.working||!state.otaAuthorized||!/^[a-fA-F0-9]{32}$/.test(state.key))
  throw Error('APP OTA requires an authorized AP/STA kit. Pair once over physical USB and authorize updates.');
 if(state.owner||state.rc?.claimed)throw Error('Release all RC diagnostic controllers before firmware OTA');
 if(!/^\d+\.\d+\.\d+$/.test(version||''))throw Error('Read a valid application version from the image before OTA.');
 if(!(bytes instanceof Uint8Array)||bytes.length<32768||bytes[0]!==0xe9)
  throw Error('Only a verified application firmware image can be flashed via Wi-Fi');
 if(!/\.bin$/i.test(name||'')||!/^(ZFC-A1|ZFC-A2)$/.test(boardId||'')||!state.kitId.startsWith(boardId+'-'))
  throw Error('Firmware board or image name does not match the selected physical kit');
 const expectedChip=boardId==='ZFC-A2'?13:5;
 if((bytes[12]|bytes[13]<<8)!==expectedChip)throw Error('ESP chip ID mismatch. Image was NOT uploaded.');
 const target=connectionTarget(),ticket=reconnectTicket;
 const deviceId=state.kitId,kitCode=state.kitCode,ip=state.ip,key=state.key,transport=state.transport;
 const pre=await wifiDirect(ip,key,'/api/status');
 if(pre.kitId!==deviceId||pre.kitCode!==kitCode||pre.board!==boardId)
  throw Error('OTA blocked: network target Device ID/Kit Code/board mismatch');
 if(ticket!==reconnectTicket||pre.otaAuthorized!==true||verifiedTransport(pre)!==transport)throw Error('Selected kit or OTA authorization changed. Reconnect and authorize updates.');
 if(pre.rc?.claimed||pre.motorsArmed!==false||pre.firmwareControl!==false||pre.otaAppOnly!==true)
  throw Error('OTA blocked: controller busy or firmware cannot guarantee motors are disabled');
 if(!/^\d+\.\d+\.\d+$/.test(pre.version||''))
  throw Error('Unable to verify running firmware and OTA partition compatibility');
 if(!/^[a-fA-F0-9]{32}$/.test(pre.bootId||''))throw Error('Firmware must report a boot ID before an OTA reboot can be verified');
 if(bytes.length>(pre.otaMaxBytes||0x1e0000)||pre.partitionLayout&&pre.partitionLayout!=='ZFC_DUAL_1E0000')throw Error('APP does not fit the active OTA layout. Use USB FACTORY recovery.');
 state.working=true;render();
 try{
  onProgress({phase:'upload',percent:4,message:'Uploading authenticated APP image to '+transport.toUpperCase()});
  let response;
  if(pre.encryptedOta===true){
   const hex=data=>Array.from(data,b=>b.toString(16).padStart(2,'0')).join('');
   const digest=hex(root.ZfcCrypto.sha256(bytes));
   try{
    const begin=await wifiDirect(ip,key,'/api/firmware/begin','POST',{size:bytes.length,sha256:digest,boardId});
    if(begin.kitId!==deviceId||begin.offset!==0)throw Error('Encrypted OTA target did not confirm the selected Device ID');
    for(let offset=0;offset<bytes.length;offset+=384){
     if(ticket!==reconnectTicket)throw Error('Firmware update cancelled by kit selection change');
     const chunk=bytes.slice(offset,offset+384),ack=await wifiDirect(ip,key,'/api/firmware/chunk','POST',{offset,data:hex(chunk)});
     if(ack.kitId!==deviceId||ack.offset!==offset+chunk.length)throw Error('Encrypted firmware chunk offset was not confirmed');
     onProgress({phase:'upload',percent:Math.min(87,4+Math.round(ack.offset/bytes.length*82)),message:'Encrypted '+transport.toUpperCase()+' APP upload • '+Math.round(ack.offset/bytes.length*100)+'%'});
    }
    response=await wifiDirect(ip,key,'/api/firmware/end','POST');
    if(response.kitId!==deviceId||response.sha256!==digest)throw Error('Firmware SHA-256 acknowledgement did not match the submitted APP');
   }catch(e){if(ticket===reconnectTicket)await wifiDirect(ip,key,'/api/firmware/abort','POST').catch(()=>{});throw e}
  }else response=await new Promise((resolve,reject)=>{
   const req=new XMLHttpRequest();
   req.open('POST','http://'+ip+'/api/ota',true);
   req.timeout=120000;req.responseType='text';
   req.setRequestHeader('X-ZJ-Key',key);req.setRequestHeader('X-ZJ-Device',deviceId);
   req.upload.onprogress=e=>{if(e.lengthComputable)onProgress({phase:'upload',percent:Math.min(87,4+Math.round(e.loaded/e.total*82)),message:'Uploading firmware '+Math.round(100*e.loaded/e.total)+'%'})};
   req.onerror=()=>reject(Error('Wi-Fi OTA browser/network request blocked or disconnected. Do not retry until firmware version is checked via USB/STA/AP.'));
   req.ontimeout=()=>reject(Error('OTA timed out. Check firmware version before retrying.'));
   req.onload=()=>{let data={};try{data=JSON.parse(req.responseText||'{}')}catch{}
    if(req.status!==200||data.updated!==true)return reject(Error(data.error||'OTA rejected • HTTP '+req.status));
    resolve(data);
   };
   const body=new FormData();
   body.append('firmware',new Blob([bytes],{type:'application/octet-stream'}),name);
   req.send(body);
  });
  if(!response.updated)throw Error('No firmware write acknowledgement');
  if(ticket!==reconnectTicket)throw Error('OTA write acknowledged but selection changed; verify the original physical kit before retrying');
  state.connected=false;state.heartbeatAt=0;state.linkState='reconnecting';state.owner=false;state.rcSession='';state.rcSource='';render();
  root.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:false,transport,kitId:deviceId}}));
  onProgress({phase:'reboot',percent:89,message:'OTA written • rebooting selected '+transport.toUpperCase()+' kit'});
  await sleep(2300);
  const deadline=Date.now()+120000;let latest=null;
  while(Date.now()<deadline){
   if(ticket!==reconnectTicket)throw Error('OTA reconnect cancelled; firmware runtime remains unverified');
   for(const host of identityHosts(target))try{
    const live=await probeIdentity(host,1700);
    if(!live||live.kitId!==deviceId||live.kitCode!==kitCode)continue;
    localKitHosts.delete(host);authSessions.delete(deviceId+'@'+host);
    if(live.adminSessions)adminKitHosts.set(host,deviceId);
    const d=await wifiDirect(host,key,'/api/status');
    if(d.kitId!==deviceId||d.kitCode!==kitCode||d.board!==boardId)
      throw Error('Different physical kit answered at the saved IP • connection aborted');
    if(!d.bootId||d.bootId===pre.bootId)throw Error('Waiting for controller reboot');
    if(verifiedTransport(d)!==transport)throw Error('Waiting for the selected AP/STA transport');
    if(!version||d.version!==version){latest=d.version;throw Error('Reconnected but running version is '+d.version+' (expected '+version+')');}
    if(ticket!==reconnectTicket)throw Error('OTA reconnect cancelled');
    Object.assign(state,checkIdentity(d,transport,kitCode,deviceId),{connected:true,ip:host,key,version:d.version,mode:d.mode||state.mode,rc:d.rc||null,heartbeatAt:Date.now(),linkState:'connected',owner:false,rcSession:'',rcSource:''});
    adoptNetworkStatus(d);
    recordKnown();tone('OTA verified on '+deviceId+' • firmware '+d.version,'good');
    root.dispatchEvent(new CustomEvent('dronelab:kit-link',{detail:{connected:true,transport,kitId:deviceId}}));
    onProgress({phase:'verified',percent:100,message:'Firmware running and Device ID verified • '+d.version});
    return {written:true,verified:true,version:d.version,kitId:deviceId};
   }catch(e){if(/Different physical kit|cancelled/.test(e.message))throw e;latest=e.message}
   const elapsed=120000-(deadline-Date.now());
   onProgress({phase:'reconnect',percent:Math.min(98,90+Math.floor(elapsed/16000)),message:'Verifying '+transport.toUpperCase()+' kit by saved address / Kit Name • '+Math.floor(elapsed/1000)+'s'+(latest?' • '+latest:'')});
   await sleep(2100);
  }
  audit('OTA acknowledged but kit runtime not yet independently verified','warn');
  onProgress({phase:'reconnect',percent:99,message:'OTA write acknowledged • reconnect and verify firmware using Serial'});
  return {written:true,verified:false,expectedVersion:version,kitId:deviceId};
 }finally{if(ticket===reconnectTicket)state.working=false;render();}
}
async function connectDiscoveredKit(kit){
 if(!kit?.kitId||!kit?.kitCode||!safeKitHost(kit.ip))throw Error('Choose a verified Kit from discovery.');
 const found=await probeIdentity(kit.ip,2800);
 if(!found||found.kitId!==kit.kitId||found.kitCode!==kit.kitCode)
  throw Error('Kit identity changed since discovery. Rescan the Device ID.');
 if(state.owner)throw Error('Release diagnostic control before switching kits.');
 if(state.connected&&state.kitId!==found.kitId)await disconnect('Switching selected Kit');
 $('kitCodeInput').value=found.kitCode;$('kitTransport').value=found.transport;$('kitIpInput').value=found.ip;
 headerNetworkChoice=found.transport;await connect(found.kitId);
 if(!linkFresh()||state.kitId!==found.kitId)throw Error(state.lastError||'Authenticated Kit identity mismatch');
 return found;
}
async function connectNamedKit(name){
 const requested=String(name||'').trim().toLowerCase();
 if(requested.length<3||requested.length>36||!/^[a-z0-9][a-z0-9 _-]*$/.test(requested))throw Error('Enter a known Kit Name using letters, numbers, spaces, _ or -.');
 const matches=discoveredKits.filter(k=>k.kitName.toLowerCase()===requested);
 if(matches.length>1)throw Error('Duplicate Kit Names. Select the matching Device ID from Available Kits.');
 if(matches.length===1)return connectDiscoveredKit(matches[0]);
 let known=[];try{known=JSON.parse(localStorage.getItem('zebjus.classroom.known.v1')||'[]')}catch{}
 const candidates=new Set(known.filter(k=>String(k.name||'').toLowerCase()===requested).map(k=>k.ip).filter(safeKitHost));
 candidates.add(requested.replace(/[ _]+/g,'-')+'.local');
 if(/^zebjus_drone_\d{1,2}$/.test(requested))candidates.add(requested+'.local');
 const results=[];
 for(const ip of candidates){const live=await probeIdentity(ip,1700);if(live&&live.kitName.toLowerCase()===requested)results.push(live)}
 const distinct=[...new Map(results.map(k=>[k.kitId,k])).values()];
 if(distinct.length!==1)throw Error(distinct.length>1?'Duplicate live Kit Name; select a Device ID':'Kit Name not reachable. Rescan or allow LAN mDNS.');
 return connectDiscoveredKit(distinct[0]);
}
async function renameConnectedKit(name='',reset=false){
 if(!linkFresh()||!['ap','sta'].includes(state.transport)||!state.setupAuthorized)throw Error('Kit Name change requires AP Setup or a USB-paired STA connection; observer monitoring is read-only.');
 if(state.owner||state.rc?.claimed)throw Error('Release diagnostic control before renaming.');
 const normalized=String(name||'').trim();
 if(!reset&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,30}$/.test(normalized))throw Error('Name must be 3–31 letters, numbers, _ or -.');
 if(!reset&&discoveredKits.some(k=>k.kitId!==state.kitId&&k.kitName.toLowerCase()===normalized.toLowerCase()))
  throw Error('Another discovered Kit already uses that name.');
 const response=await deviceRequest(reset?'/api/kit/name/reset':'/api/kit/name','POST',reset?{}:{name:normalized});
 if(response.kitId!==state.kitId||!response.kitName)throw Error('Kit did not confirm the new name.');
 state.kitName=response.kitName;state.heartbeatAt=Date.now();
 state.hostname=nameHosts(response.kitName)[0]||'';
 for(const k of discoveredKits)if(k.kitId===state.kitId)k.kitName=response.kitName;
 recordKnown();showDiscovered();render();
 root.dispatchEvent(new CustomEvent('dronelab:kit-name',{detail:{kitId:state.kitId,name:response.kitName}}));
 return response.kitName;
}
root.ZebjusKits={
 connect,disconnect,read,refreshConnection,startSetup,findKitAp,pairNewKitUsb,handoverSta,claim,releaseRc,stop,sendFrame,ingestAndroid,uploadAppFirmware,discoverKits,pairUsb,
 scanWifi,wifiSave,applyMode,authorizeNetwork,toggleControl:toggleHeaderControl,connectTransport:connectHeaderNetwork,reconnect:reconnectSelected,reboot:rebootConnectedKit,
 getDiscovered:()=>discoveredKits.map(k=>({...k})),connectDiscoveredKit,connectNamedKit,renameConnectedKit,
 getState:()=>({connected:linkFresh(),linkState:state.connected&&!linkFresh()?'stale':state.linkState,heartbeatAt:state.heartbeatAt,internet:state.internet,transport:state.transport,kitId:state.kitId,kitCode:state.kitCode,
  kitName:state.kitName,board:state.board,owner:linkFresh()&&state.owner,rcSource:state.rcSource,rc:state.rc,mode:state.mode,version:state.version,working:state.working,apActive:linkFresh()&&!!state.apActive,staConnected:linkFresh()&&!!state.staConnected,staIp:state.staIp||'',ip:state.ip||'',apIp:state.apIp||'',apSsid:state.apSsid||'',ssid:state.ssid||'',hostname:state.hostname||'',bootId:state.bootId||'',firmwareBuiltAt:state.firmwareBuiltAt||'',networkState:state.networkState||'',partitionLayout:state.partitionLayout||'',otaMaxBytes:state.otaMaxBytes||0,rssi:state.rssi,setupAuthorized:linkFresh()&&!!state.setupAuthorized,controlAuthorized:linkFresh()&&!!state.controlAuthorized,otaAuthorized:linkFresh()&&!!state.otaAuthorized,paired:pairedKeys.has(state.kitId)}),
 request:deviceRequest,targetHardware:()=>!!$('kitHardwareTarget')?.checked,
 active:linkFresh,isConnected:linkFresh,view:goKits
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
