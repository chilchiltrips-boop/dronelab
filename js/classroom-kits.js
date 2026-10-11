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
 ip:'',key:'',owner:false,usbInfo:{},lastError:'',tone:'offline',since:0,controller:'none'};
let apiReady=false,sendBusy=false,pollTimer=null,rcTimer=null,logs=[],adminPending=false,serialClaims=[];
const usbCandidate={};let wifiTesting=false,adminUnlockedUntil=0,adminEnrolled=null;
const EVENTS_MAX=70;
function audit(s,kind='info'){
 const line=new Date().toLocaleTimeString()+'  '+kind.toUpperCase()+'  '+String(s).slice(0,160);
 logs.push(line);if(logs.length>EVENTS_MAX)logs.shift();
 const e=$('kitEvents');if(e){e.textContent=logs.join('\n');e.scrollTop=e.scrollHeight;}
}
function byId(id,v){const e=$(id);if(e)e.textContent=v;}
function tone(s,t='offline'){state.tone=t;state.lastError=t==='error'?s:'';byId('kitMessage',s);const e=$('kitMessage');if(e)e.dataset.tone=t;render();}
function render(){
 const ready=state.connected,code=state.kitCode||'------';
 const label=ready?(state.kitName||'AERION')+' • '+code:'NO KIT CONNECTED';
 byId('kitGlobalName',label);byId('kitGlobalDetail',ready?state.transport.toUpperCase()+' • '+(state.version||'?'):'Connect using a 6-digit Kit Code');
 const globalTone=state.working?'info':state.tone==='locked'?'locked':state.rc?.claimed&&!state.owner?'locked':state.tone==='error'?'error':state.tone==='warn'?'warn':ready?'good':'offline';
 byId('kitGlobalState',state.working?'CONNECTING':globalTone==='locked'?'KIT LOCKED':state.tone==='error'?'LINK ERROR':ready?'CONNECTED':'DISCONNECTED');
 const pill=$('kitGlobalState');if(pill)pill.dataset.tone=globalTone;
 const bar=$('kitTopStatus');if(bar)bar.dataset.tone=globalTone;
 byId('kitSelectedId',ready?state.kitId:'—');byId('kitSelectedName',ready?state.kitName:'—');
 byId('kitSelectedBoard',ready?state.board:'—');byId('kitSelectedVersion',ready?state.version:'—');
 byId('kitSelectedTransport',ready?state.transport.toUpperCase():'OFFLINE');
 byId('kitController',state.rc?.claimed?(state.rc.source+' • '+(state.rc.active?'ACTIVE':'IDLE')):state.owner?'SESSION RESERVED':'AVAILABLE');
 byId('kitLinkState',ready?(state.rc?.active?'RC INPUT LIVE':'TELEMETRY READY'):'NO KIT');
 const rc=state.rc||{};
 for(const field of ['throttle','roll','pitch','yaw'])byId('kitVal'+field[0].toUpperCase()+field.slice(1),Number.isInteger(rc[field])?rc[field]:'—');
 byId('kitRcPacket',Number.isFinite(rc.seq)?String(rc.seq):String(state.seq||'—'));
 byId('kitRcAge',Number.isFinite(rc.ageMs)?rc.ageMs+' ms':'—');
 byId('kitRcCounts',(rc.accepted??state.sent)+' / '+(rc.rejected??state.rejected));
 byId('kitRcOrigin',rc.source||state.rcSource||'NONE');
 byId('kitRcState',!ready?'OFFLINE':rc.active?'RECEIVING':rc.claimed?'LOCKED / INPUT IDLE':'AVAILABLE');
 const rcBadge=$('kitRcState');if(rcBadge)rcBadge.dataset.tone=!ready?'offline':rc.active?'good':rc.claimed?'locked':'info';
 if($('kitFindSaved'))$('kitFindSaved').disabled=state.working;
 const top=$('kitTopConnect');if(top)top.textContent=ready?'⚙ Manage Kit':'＋ Connect Kit';
 const modeButton=$('kitTopMode');if(modeButton)modeButton.textContent=ready?'MODE '+(state.mode||state.transport).toUpperCase():'USB / STA / AP';
 for(const id of ['kitDisconnect','kitIdentify','kitReadInfo','kitTakeControl','kitReleaseControl','kitStop'])if($(id))$(id).disabled=!ready||state.working;
 if($('kitTopStop'))$('kitTopStop').disabled=!ready||state.working;
 if($('kitTakeControl'))$('kitTakeControl').disabled=!ready||state.owner||state.working;
 if($('kitReleaseControl'))$('kitReleaseControl').disabled=!ready||!state.owner||state.working;
 const adminReady=ready&&state.transport==='usb'&&!state.owner&&!state.working;
 if($('kitAdminApply'))$('kitAdminApply').disabled=!adminReady||Date.now()>adminUnlockedUntil;
 for(const id of ['kitAdminEnroll','kitAdminUnlock','kitAdminLock'])if($(id))$(id).disabled=!adminReady;
 if($('kitAdminRead'))$('kitAdminRead').disabled=!ready||state.transport!=='usb'||state.working;
 for(const id of ['kitRotateKey','kitFactoryReset'])if($(id))$(id).disabled=!adminReady||Date.now()>adminUnlockedUntil;
 for(const id of ['kitModeApply','kitWifiSave','kitWifiScan'])if($(id))$(id).disabled=!ready||state.working||state.owner||wifiTesting;
 const status=$('kitAdminAccess');if(status)status.textContent=!adminReady?'Admin requires the selected unlocked USB kit':Date.now()<adminUnlockedUntil?'Teacher admin unlocked temporarily — complete configuration before 60s':adminEnrolled===false?'Teacher must enroll a strong passphrase first':'Teacher passphrase required for admin changes';
 const readOnly=$('kitHwId');if(readOnly)readOnly.value=state.kitId||'Not verified';
 const selected=$('kitActiveCode');if(selected)selected.textContent=code;
 const target=$('kitTargetLabel');if(target)target.textContent=ready?state.kitName+' • '+code:'Connect a kit in MY KITS';
 const hint=$('kitPidMonitor');if(hint)hint.textContent=ready?'RC '+(rc.active?'LIVE':'IDLE')+' • '+(rc.source||'NONE')+' • T '+(rc.throttle??1000)+' R '+(rc.roll??1500)+' P '+(rc.pitch??1500)+' Y '+(rc.yaw??1500):'No hardware connected • simulator available';
 const targetHardware=$('kitHardwareTarget');if(targetHardware)targetHardware.disabled=!ready;
 if($('kitWifiStatus')&&!ready)$('kitWifiStatus').textContent='Connect the board over USB, then Scan Wi-Fi → Test & Save → Apply Mode.';
}
const serial=()=>root.DroneLabSerial;
const relay=()=>root.ZebjusDeviceRelay;
function privateIPv4(host){
 const parts=String(host).split('.').map(Number);
 if(parts.length!==4||parts.some((v,i)=>!Number.isInteger(v)||v<0||v>255||!String(host).split('.')[i].match(/^\d{1,3}$/)))return false;
 return parts[0]===10||(parts[0]===192&&parts[1]===168)||(parts[0]===172&&parts[1]>=16&&parts[1]<=31);
}
function selectedCode(){return ($('kitCodeInput')?.value||'').replace(/\D/g,'').slice(0,6)}
function selectedMode(){return $('kitTransport')?.value||'usb'}
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
 const entry={id:state.kitId,code:state.kitCode,name:state.kitName,board:state.board,ip:state.ip||state.usbInfo?.staIp||'',at:Date.now()};
 const next=[entry,...list.filter(v=>v.id!==entry.id)].slice(0,20);localStorage.setItem(key,JSON.stringify(next));showKnown();
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
 if(state.rcSession||state.owner)await releaseRc().catch(()=>{});
 state.connected=false;state.rc=null;state.key='';state.rcSession='';state.owner=false;state.working=false;state.rcSource='';state.transport='none';state.ip='';state.kitId='';state.kitCode='';state.kitName='';state.board='';state.version='';
 audit(reason);tone(reason,'offline'); // USB Serial remains open for Firmware/Python; never steal its port.
}
function waitSerial(pattern,timeout=2300){
 return new Promise((resolve,reject)=>{
  const item={pattern,resolve,reject};serialClaims.push(item);
  const t=setTimeout(()=>{serialClaims=serialClaims.filter(x=>x!==item);reject(Error('No response from selected USB kit'))},timeout);
  item.resolve=v=>{clearTimeout(t);resolve(v)};item.reject=e=>{clearTimeout(t);reject(e)};
 });
}
async function usbWrite(line){if(!serial()?.isOpen?.()||serial()?.isFlashing?.())throw Error('USB Serial unavailable; open 115200-baud firmware runtime, not ROM bootloader');await serial().writeLine(line.endsWith('\n')?line:line+'\n');}
async function connectUSB(code){
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
 Object.assign(state,checkIdentity(identity,'usb',code));
 state.usbInfo=identity;state.key='';state.ip='';
}
const form=args=>new URLSearchParams(args||{});
async function wifiDirect(ip,key,route,method='GET',args={}){
 if(!privateIPv4(ip))throw Error('Enter a valid private IPv4 address for your kit');
 if(!/^[a-fA-F0-9]{32}$/.test(key))throw Error('Use the separate 32-character kit access key enrolled over USB');
 const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),4200);
 try{
  const res=await fetch('http://'+ip+route,{
   method,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:ctrl.signal,
   targetAddressSpace:'local',headers:{'X-ZJ-Key':key,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})},
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
 return wifiDirect(state.ip,state.key,route,method,args);
}
async function connectNetwork(code,mode){
 const ip=($('kitIpInput')?.value||'').trim(),key=($('kitKeyInput')?.value||'').trim();
 const transport=mode==='android-relay'?'android-relay':mode;
 if(mode==='android-relay'&&!relay()?.request)throw Error('Pair Android over WebRTC first and enable its kit access');
 const d=mode==='android-relay'?await relay().request('/api/status'):await wifiDirect(ip,key,'/api/status');
 const verified=checkIdentity(d,transport,code,state.kitId||'');
 Object.assign(state,verified,{ip:mode==='android-relay'?'':ip,key:mode==='android-relay'?'':key,rc:d.rc||null,mode:d.mode||'',physicalLink:d.staConnected?'sta':'ap',since:Date.now()});
 if($('kitKeyInput'))$('kitKeyInput').value=''; // do not leave access credentials in the visible input
 if(mode!=='android-relay')state.transport=String(d.requestTransport||'').toLowerCase()==='ap'?'ap':ip==='192.168.4.1'?'ap':'sta';
 state.physicalLink=String(d.requestTransport||'').toLowerCase()||state.physicalLink;
}
async function findSaved(){
 const code=selectedCode();if(!codePattern.test(code))throw Error('Enter a 6-digit code first');
 if(state.working)return;
 let list=[];try{list=JSON.parse(localStorage.getItem('zebjus.classroom.known.v1')||'[]')}catch{}
 const known=list.filter(k=>k.code===code&&privateIPv4(k.ip)).slice(0,10);
 if(!known.length)throw Error('No previously verified IP for this code; enter STA IP or connect USB for first enrollment');
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
  tone('Matching kit IP verified • enter private access key and press Connect & Verify','good');
 }finally{state.working=false;render()}
}
async function connect(){
 if(state.working)return;const code=selectedCode(),mode=selectedMode();
 if(mode!=='usb'){try{const known=JSON.parse(localStorage.getItem('zebjus.classroom.known.v1')||'[]');
  if(new Set(known.filter(k=>k.code===code).map(k=>k.id)).size>1){tone('Duplicate Kit Code detected in known classroom kits • use physical USB admin to assign a unique code','error');return;}
 }catch{}}
 if(!codePattern.test(code)){tone('Enter your 6-digit Kit Code','warn');return}
 if(state.owner)await releaseRc().catch(()=>{});
 state.working=true;state.connected=false;render();tone('Verifying hardware identity…','info');
 try{
  if(mode==='usb')await connectUSB(code);else await connectNetwork(code,mode);
  state.connected=true;state.since=Date.now();state.rc=null;state.owner=false;state.seq=0;state.rcSession='';state.rcSource='';
  state.working=false;audit('Device verified • '+state.kitId+' • '+state.transport,'success');
  recordKnown();tone('Verified '+state.kitName+' • '+state.transport.toUpperCase()+' • motors disabled','good');
  if(mode!=='usb')await read().catch(e=>audit(e.message,'warn'));
 }catch(e){state.working=false;state.connected=false;state.key='';audit(e.message,'error');tone(e.message,'error')}
}
async function read(){
 if(!state.connected)return;
 if(state.transport==='usb'){
  await usbWrite('ZJKIT,GET');await usbWrite('ZJINFO,GET');
  return state.usbInfo;
 }
 const d=await deviceRequest('/api/status');
 if(d.kitId!==state.kitId||d.kitCode!==state.kitCode){await disconnect('Device identity changed • RC stopped');throw Error('Hardware identity changed')}
 state.rc=d.rc||null;state.version=d.version||state.version;state.mode=d.mode||state.mode;
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
 if(!state.connected)throw Error('Connect a verified kit first');
 if(state.owner&&state.rcSource===source)return;
 if(source==='WEB'){
  if(!$('kitHardwareTarget')?.checked)throw Error('Enable Send to selected kit under PID Tuning first');
  if(!$('tab-pid')?.classList.contains('active'))document.querySelector('[data-tab="pid"]')?.click();
 }
 if(state.owner)await releaseRc();
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
  state.rcSession=data.session;
 }
 state.owner=true;state.rcSource=source;state.seq=0;state.frameAt=0;audit('RC claimed by '+source+' • motors OFF','success');render();
 // Immediately send a safe neutral diagnostic frame so ownership does not idle-expire.
 await sendFrame({throttle:1000,axes:{roll:0,pitch:0,yaw:0},armed:false},source);
}
async function releaseRc(){
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
 const was=state.owner,session=state.rcSession;state.owner=false;state.rcSession='';state.rcSource='';
 state.rc={active:false,claimed:false,throttle:1000,roll:1500,pitch:1500,yaw:1500};render();
 try{if(state.connected&&state.transport==='usb')await usbWrite('ZJRC,STOP');
  else if(was&&state.connected&&session){await deviceRequest('/api/rc/release','POST',{session}).catch(e=>audit('STOP release failed • firmware watchdog active: '+e.message,'warn'));}
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
 if(!state.connected||!state.owner||state.rcSource!==source||sendBusy||document.hidden)return false;
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
 if(!$('tab-pid')?.classList.contains('active')||!$('kitHardwareTarget')?.checked||
   !state.connected||!state.owner||state.rcSource!=='WEB'||document.hidden)return;
 const f=$('pidFrame')?.contentWindow?.ZebjusTraining?.hardwareInput?.();
 if(f)void sendFrame(f,'WEB');
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
 const e=$('kitWifiStatus');if(e){e.textContent=message;e.dataset.tone=tone}
 audit(message,tone);render();
}
async function scanWifi(){
 if(!state.connected||state.owner)throw Error('Connect an unlocked kit first');
 const select=$('kitWifiNetworks');if(select)select.replaceChildren(new Option('Scanning 2.4 GHz networks…',''));
 if(state.transport==='usb'){
  await usbWrite('ZJNET,SCAN');
  wifiNote('Scanning via USB Serial • results will appear below','info');
 }else{
  const d=await deviceRequest('/api/wifi/scan');
  if(d.state!=='ready'){wifiNote('Wi-Fi scan started. Use Scan again after a moment.','info');return;}
  if(select){select.replaceChildren(new Option('Select a router',''));for(const v of d.networks||[])if(v.ssid)select.add(new Option(v.ssid+' • '+v.rssi+' dBm',v.ssid))}
  wifiNote('Received '+(d.networks||[]).length+' nearby Wi-Fi networks','good');
 }
}
async function applyMode(){
 if(!state.connected)throw Error('Select and verify your kit before changing modes');
 if(state.owner)throw Error('Release controller before changing Wi-Fi modes');
 const mode=$('kitWifiMode')?.value||'auto';
 if(!['auto','ap','sta'].includes(mode))throw Error('Invalid Wi-Fi mode');
 if(!confirm('Switch kit to '+mode.toUpperCase()+'? STA-only can hide AP. AUTO keeps AP visible. Proceed?'))return;
 if(state.transport==='usb'){
  const ack=waitSerial(/^ZJNET,(?:ACK,MODE|ERR,)/,3200);
  await usbWrite('ZJNET,MODE,'+mode);
  const line=await ack;
  if(!line.startsWith('ZJNET,ACK,MODE,'))throw Error('Firmware rejected mode change: '+line);
  state.mode=mode;wifiNote('Mode changed to '+mode.toUpperCase()+' over USB. You can still use Serial.','good');
  await usbWrite('ZJNET,GET');render();
 }else{
  await deviceRequest('/api/wifi/mode','POST',{mode});
  wifiNote('Switching to '+mode.toUpperCase()+'. Reconnect via matching AP or STA IP.','warn');
  await disconnect('Wi-Fi mode changed • reconnect using Device ID');
 }
}
async function wifiSave(){
 if(!state.connected)throw Error('Connect a kit by USB, AP or STA first');
 if(state.owner)throw Error('Release controller before Wi-Fi provisioning');
 const ssid=$('kitRouterSsid')?.value.trim()||'',password=$('kitRouterPass')?.value||'';
 if(!ssid||ssid.length>32||/[,\r\n]/.test(ssid)||password.length>63||
    /[,\r\n]/.test(password)||(password.length>0&&password.length<8))
  throw Error('SSID/password invalid for USB provisioning (commas and line breaks are unsupported)');
 if(state.transport==='usb'){
  // No credential appears in event history or the URL; the firmware does not echo it.
  await usbWrite('ZJNET,TEST,'+ssid+','+password);
  wifiTesting=true;wifiNote('Testing STA Wi-Fi via USB • waiting for result (up to 12 s). Credentials save only on success.','info');
 }else{
  await deviceRequest('/api/wifi/test','POST',{ssid,password});
  wifiNote('STA test started. Firmware saves credentials after successful association.','info');
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
 if(line.startsWith('ZJKIT,ID,'))usbCandidate.kitId=line.slice(9);
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
 if(!state.connected&&!state.working&&serial()?.isOpen?.()&&usbCandidate.kitId&&usbCandidate.kitCode&&usbCandidate.board){
  try{
   const kit=checkIdentity(usbCandidate,'usb',usbCandidate.kitCode);
   Object.assign(state,kit,{connected:true,transport:'usb',mode:'usb',key:'',ip:'',usbInfo:{...usbCandidate},rc:null,owner:false,since:Date.now()});
   if($('kitCodeInput'))$('kitCodeInput').value=kit.kitCode;
   if($('kitTransport'))$('kitTransport').value='usb';
   recordKnown();tone('USB kit auto-verified • '+kit.kitName+' • '+kit.kitCode,'good');
   audit('USB firmware handshake verified • '+kit.kitId,'success');
   void usbWrite('ZJNET,GET').catch(()=>{});
   void usbWrite('ZJADMIN,GET').catch(()=>{});
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
  else if(text==='ZJNET,TEST,SAVED'){wifiTesting=false;wifiNote('STA router connected and credentials saved in kit NVS','good')}
  else if(text==='ZJNET,TEST,FAILED_NOT_SAVED'){wifiTesting=false;wifiNote('STA test failed • old saved Wi-Fi untouched','error')}
  else if(text.startsWith('ZJNET,ERR,')){wifiTesting=false;wifiNote(text.replace('ZJNET,ERR,','Wi-Fi error: '),'error')}
  else if(text.startsWith('ZJNET,ACK,MODE,')){state.mode=text.slice(15).toLowerCase();wifiNote('Network mode: '+state.mode.toUpperCase(),'good')}
  else if(text.startsWith('ZJNET,MODE,')){state.mode=text.slice(11).toLowerCase();if($('kitWifiMode')&&['auto','ap','sta'].includes(state.mode))$('kitWifiMode').value=state.mode;render()}
  else if(text.startsWith('ZJNET,AP,')){wifiNote('AP '+text.slice(9)+' • Password is configured in Device Admin','info')}
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
function guardAction(id,fn){$(id)?.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>{const locked=/locked|occupied|not_controller_owner/i.test(e.message);tone(e.message,locked?'locked':'error');audit(e.message,locked?'warn':'error')}))}
function goKits(){document.querySelector('[data-tab="settings"]')?.click();$('kitCodeInput')?.focus()}
function init(){
 if(!$('kitCenter'))return;
 showKnown();render();root.addEventListener('dronelab:serial-line',onSerial);
 const code=$('kitCodeInput');if(code)code.oninput=()=>{code.value=code.value.replace(/\D/g,'').slice(0,6)};
 guardAction('kitFindSaved',findSaved);guardAction('kitConnect',connect);guardAction('kitDisconnect',()=>disconnect('Student disconnected'));
 guardAction('kitIdentify',identify);guardAction('kitReadInfo',read);
 guardAction('kitTopStop',stop);
 guardAction('kitTakeControl',()=>claim($('kitSourceSelect')?.value||'WEB'));guardAction('kitReleaseControl',releaseRc);guardAction('kitStop',stop);
 guardAction('kitModeApply',applyMode);guardAction('kitWifiSave',wifiSave);guardAction('kitWifiScan',scanWifi);
 $('kitWifiNetworks')?.addEventListener('change',e=>{if(e.target.value)$('kitRouterSsid').value=e.target.value});
 guardAction('kitAdminEnroll',()=>adminAccess('ENROLL'));guardAction('kitAdminUnlock',()=>adminAccess('UNLOCK'));guardAction('kitAdminLock',()=>adminAccess('LOCK'));
 guardAction('kitAdminApply',adminSave);guardAction('kitAdminRead',async()=>{if(state.transport!=='usb'||!state.connected)throw Error('Admin reads require physical USB');await usbWrite('ZJADMIN,GET');audit('Read admin settings over USB')});guardAction('kitRotateKey',()=>adminDanger('rotate'));guardAction('kitFactoryReset',()=>adminDanger('factory'));
 $('fwOpenKitNetwork')?.addEventListener('click',()=>{goKits();$('kitNetworkSettings')?.scrollIntoView({behavior:'smooth',block:'center'})});
 $('kitTopConnect')?.addEventListener('click',goKits);$('kitTopMode')?.addEventListener('click',()=>{goKits();$('kitWifiMode')?.focus()});$('kitOpenMobile')?.addEventListener('click',()=>document.querySelector('[data-tab="settings"]')?.click());
 $('kitHardwareTarget')?.addEventListener('change',e=>{if(!e.target.checked&&state.owner)void releaseRc();audit('Hardware diagnostic target '+(e.target.checked?'enabled':'disabled'))});
 $('kitSourceSelect')?.addEventListener('change',e=>{if(state.owner)void releaseRc();audit('Controller source selected: '+e.target.value)});
 $('kitCodeInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void connect()}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.owner)void releaseRc()});
 root.addEventListener('pagehide',()=>{if(state.owner)void releaseRc();clearInterval(pollTimer);clearInterval(rcTimer)});
 pollTimer=setInterval(async()=>{if(!state.connected||state.working||state.transport==='usb')return;
  try{await read()}catch(e){audit('Network telemetry lost: '+e.message,'warn');await disconnect('Kit link lost • reconnect required')}
 },2200);
 rcTimer=setInterval(webControls,RC_INTERVAL);
 audit('MY KITS loaded • no hardware connected');
}
root.ZebjusKits={
 connect,disconnect,read,claim,releaseRc,stop,sendFrame,ingestAndroid,
 getState:()=>({connected:state.connected,transport:state.transport,kitId:state.kitId,kitCode:state.kitCode,
  kitName:state.kitName,owner:state.owner,rcSource:state.rcSource,rc:state.rc,version:state.version}),
 request:deviceRequest,targetHardware:()=>!!$('kitHardwareTarget')?.checked,
 active:()=>state.connected,isConnected:()=>state.connected,view:goKits
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
