/* Native Android-to-FlightCore AP/STA transport (bench diagnostics only).
 * The per-device key never crosses the WebRTC relay and is not stored in site data.
 * Received RC frames are preview-only; motor arming is deliberately unsupported. */
(function(){
'use strict';
const el=id=>document.getElementById(id),native=window.ZebjusNative;
const pending=new Map();let ip='192.168.4.1',key='',mode='auto',online=false,requestId=0,previewBusy=false,lastPreview=0,lastStatus=0,lastScan=0,kitCode='',verifiedKitId='',rcSession='',rcClaiming=false,onKitAp=false,rcSeq=0,auth=null,diagnosticKey='',connecting=false,reconnectEnabled=false,firmwareAck=null;
const validHost=v=>/^(?:10|192|172)\./.test(v)&&/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v);
const allowed=new Set(['GET /api/health','GET /api/identify','GET /api/status','GET /api/wifi/scan','GET /api/telemetry','GET /api/rc/snapshot','POST /api/wifi/test','POST /api/rc/stop','POST /api/wifi/mode','POST /api/command','POST /api/rc/claim','POST /api/rc/release','POST /api/rc/preview']);
function show(text,tone=''){const v=el('kitNetStatus');if(v){v.textContent=text;v.dataset.state=tone} }
function form(v){return new URLSearchParams(v||{}).toString()}
function nativeTransport(route,method='GET',args={},headers={}){
 if(!native?.requestSecure)return Promise.reject(Error('Install the current Android APK for private label enrollment.'));
 if(!validHost(ip))return Promise.reject(Error('Use the kit private IPv4 address.'));
 const id='zj'+(++requestId);
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('Device request timed out'))},4500);
  pending.set(id,{resolve,reject,timer,raw:true});native.requestSecure(id,ip,method,route,method==='POST'?form(args):'',JSON.stringify(headers));
 });
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
  const value=el('kitKey').value.trim();
  if(value){
   const p=window.ZebjusKitAuth.label(value),raw=await nativeTransport('/api/identify'),live=JSON.parse(raw.text);
   if(raw.status!==200||live.kitId!==p.deviceId)throw Error('Private label Device ID does not match this AP.');
   if(rcSession)await releaseRc();
   verifiedKitId=p.deviceId;diagnosticKey=window.ZebjusKitAuth.diagnosticKey(p.secret,p.deviceId);
   auth=await window.ZebjusKitAuth.open(nativeTransport,verifiedKitId,ip==='192.168.4.1'?p.secret:diagnosticKey,ip==='192.168.4.1'?'setup':'diagnostic');
   el('kitKey').value='';
  }
  await status();reconnectEnabled=true;
 }finally{connecting=false}
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
 verifiedKitId=data.kitId||'';online=true;mode=data.mode||mode;lastStatus=Date.now();
 // AUTO can run AP + STA simultaneously. STA being connected does NOT imply AP request.
 onKitAp=data.requestTransport==='AP'&&data.apActive===true;
 if(kitCode&&data.kitCode!==kitCode)rcSession='';kitCode=data.kitCode||'';
 el('kitMode').value=mode;el('kitDevice').textContent=(data.board||'FlightCore')+' • '+(data.version||'')+' • '+(data.phase||'');
 el('kitAddresses').textContent='STA: '+(data.ip||'offline')+' • AP: '+(data.apIp||'offline');
 if(el('kitAppOta'))el('kitAppOta').disabled=true;
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
 if(rcSession){await request('/api/rc/release','POST',{session:rcSession}).catch(()=>{});rcSession='';}
 const v=el('kitMode').value;
 if(!['ap','sta','auto'].includes(v))throw Error('Invalid Wi-Fi mode');
 await request('/api/wifi/mode','POST',{mode:v});show('Switching to '+v.toUpperCase()+'; reconnect your phone to the new network.');
}
async function command(line){
 if(typeof line!=='string'||line.length>160||!/^(ZJI2C,SCAN|ZJINFO,GET|ZJLED,[0-9]+,(?:STOP|KEEP|SET|BLINK|FADE|SAFE|WARNING|SOS|PATTERN)(?:,.*)?|ZJTEL,RATE,(?:10|20|50))$/.test(line))throw Error('Command is not allowed on the network bridge');
 return request('/api/command','POST',{line});
}
async function pollTelemetry(){const data=await request('/api/telemetry');const line='ZJTEL,1,'+data.board+','+(data.rcSeq||0)+','+data.millis+',0x'+Number(data.address).toString(16).toUpperCase()+','+(data.gyroReady?'READY':'NOT_FOUND')+','+data.roll+','+data.pitch+','+data.yaw+',1,0';
 window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line,transport:mode,device:'android-native'}}));return data;
}
async function onWebRequest(req,peer){
 if(!el('kitAllowWeb')?.checked||!peer?.status()?.paired)return peer?.sendNetworkResponse?.({id:req?.id,ok:false,error:'Enable Allow paired WebApp on Android first'});
 const method=req?.method,route=req?.route,id=req?.id;
 if(!Number.isInteger(id)||id<1||id>1e9||!allowed.has(method+' '+route))return;
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
 if(!online||!onKitAp)throw Error('Connect and verify the phone on the kit AP first.');
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
 if(!online||!onKitAp||!rcSession||!el('kitRcPreview')?.checked||previewBusy||rcClaiming||document.hidden||Date.now()-lastPreview<100)return;
 if(!m?.axes||![m.axes.roll,m.axes.pitch,m.axes.yaw,m.throttle].every(Number.isFinite))return;
 lastPreview=Date.now();previewBusy=true;const at=performance.now(),session=rcSession;
 const clamp=v=>Math.max(1000,Math.min(2000,Math.round(1500+500*v)));
 request('/api/rc/preview','POST',{session,source:'ANDROID',seq:++rcSeq,armed:'false',responseMode:m.responseMode||'Medium',
  throttle:Math.max(1000,Math.min(2000,Math.round(m.throttle))),roll:clamp(m.axes.roll),pitch:clamp(m.axes.pitch),yaw:clamp(m.axes.yaw)})
 .then(d=>{if(session!==rcSession)return;if(!d.received||d.kitId!==verifiedKitId||d.seq!==rcSeq)throw Error('Invalid firmware receive ACK');firmwareAck={seq:d.seq,at:Date.now(),rtt:Math.round(performance.now()-at)};if(el('kitRcAck'))el('kitRcAck').textContent='ESP32 received #'+d.seq+' • '+firmwareAck.rtt+' ms round trip';})
 .catch(e=>{dropInput('Input stopped: '+e.message);void request('/api/rc/release','POST',{session}).catch(()=>{});})
 .finally(()=>{previewBusy=false});
}
function action(id,fn){el(id)?.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>show(e.message,'warn')))}
function bind(){
 if(!el('kitNetStatus'))return;
 if(!native?.request){show('Install updated Android APK for Wi-Fi connection');return;}
 el('kitIp').value=ip;
 el('kitIp').addEventListener('change',()=>{void releaseRc();ip=el('kitIp').value.trim();online=false;auth=null;diagnosticKey='';reconnectEnabled=false;kitCode='';verifiedKitId='';onKitAp=false});
 el('kitKey').addEventListener('input',()=>{reconnectEnabled=false});
 el('kitNetworks').addEventListener('change',()=>{el('kitSsid').value=el('kitNetworks').value});
 el('kitRcPreview')?.addEventListener('change',()=>{if(!el('kitRcPreview').checked)void releaseRc();else void claimRc().catch(e=>dropInput(e.message))});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void releaseRc()});
 window.addEventListener('blur',()=>{if(rcSession)void releaseRc()});
 action('kitWifiSettings',()=>native.openWifiSettings());
 action('kitConnect',connectKit);action('kitScan',async()=>{await scan();if(el('kitNetStatus')?.textContent.includes('Scanning'))setTimeout(()=>scan().catch(()=>{}),2300)});
 action('kitTestSave',testSave);action('kitSwitch',setMode);
 action('kitRead',async()=>{const data=await pollTelemetry();el('kitTelemetry').textContent=JSON.stringify(data,null,2)});
 action('kitI2cScan',async()=>{await command('ZJI2C,SCAN');show('I²C scan requested; refresh telemetry for device addresses','good')});
 action('kitLedOff',()=>command('ZJLED,1,STOP'));
 action('kitAppOta',()=>{
  if(!online||!native?.pickAppFirmware)throw Error('Connect FlightCore first');
  if(!confirm('APP OTA BENCH UPDATE ONLY. Propellers removed and ESC power disconnected? Use matching A1/A2 APP .bin only. Continue?'))return;
  native.pickAppFirmware(ip,key);show('Select matching FlightCore APP .bin using Android Files');
 });
 setInterval(()=>{if(!reconnectEnabled||connecting||document.hidden)return;connecting=true;status().catch(()=>{online=false;dropInput('Kit disconnected • retrying the same Device ID; control remains released')}).finally(()=>{connecting=false})},3500);
}
window.ZebjusNetwork={request,status,scan,command,previewControls,releaseRc,onWebRequest,hasControl:()=>!!rcSession&&online,feedback:()=>firmwareAck,isConnected:()=>online&&Date.now()-lastStatus<12000,mode:()=>mode};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
