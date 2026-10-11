/* Native Android-to-FlightCore AP/STA transport (bench diagnostics only).
 * The per-device key never crosses the WebRTC relay and is not stored in site data.
 * Received RC frames are preview-only; motor arming is deliberately unsupported. */
(function(){
'use strict';
const el=id=>document.getElementById(id),native=window.ZebjusNative;
const pending=new Map();let ip='192.168.4.1',key='',mode='auto',online=false,requestId=0,previewBusy=false,lastPreview=0,lastStatus=0,lastScan=0,kitCode='',rcSession='',rcClaiming=false,onKitAp=false;
const validHost=v=>/^(?:10|192|172)\./.test(v)&&/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v);
const allowed=new Set(['GET /api/health','GET /api/identify','GET /api/status','GET /api/wifi/scan','GET /api/telemetry','POST /api/wifi/test','POST /api/wifi/mode','POST /api/command','POST /api/rc/claim','POST /api/rc/release','POST /api/rc/preview']);
function show(text,tone=''){const v=el('kitNetStatus');if(v){v.textContent=text;v.dataset.state=tone} }
function form(v){return new URLSearchParams(v||{}).toString()}
function request(route,method='GET',args={},timeout=5500){
 if(!native?.request)return Promise.reject(Error('Native Wi-Fi bridge requires the updated Android APK'));
 if(!validHost(ip)||key.length!==32)return Promise.reject(Error('Enter local FlightCore IP and the 32-character access key shown by USB'));
 if(!allowed.has(method+' '+route))return Promise.reject(Error('Unsupported FlightCore operation'));
 const id='zj'+(++requestId);return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('Device request timed out'))},timeout);
  pending.set(id,{resolve,reject,timer});
  native.request(id,ip,key,method,route,method==='POST'?form(args):'');
 });
}
window.zebjusNativeOtaResult=data=>{show(data?.message||'OTA status unknown',data?.ok?'good':'warn');if(data?.ok){online=false;el('kitRcPreview').checked=false;}};
window.zebjusNativeResult=data=>{
 const item=pending.get(data?.id);if(!item)return;
 clearTimeout(item.timer);pending.delete(data.id);
 if(data.ok)item.resolve(data.body||{});
 else item.reject(Error(data.error||data.body?.error||'Device HTTP '+data.status));
};
async function status(){
 const data=await request('/api/status');
 online=true;mode=data.mode||mode;lastStatus=Date.now();onKitAp=!data.staConnected;
 if(kitCode&&data.kitCode!==kitCode)rcSession='';kitCode=data.kitCode||'';
 el('kitMode').value=mode;el('kitDevice').textContent=(data.board||'FlightCore')+' • '+(data.version||'')+' • '+(data.phase||'');
 el('kitAddresses').textContent='STA: '+(data.ip||'offline')+' • AP: '+(data.apIp||'offline');
 show((data.staConnected?'STA':'AP')+' CONNECTED • '+(data.ssid||data.apSsid||'Device'),'good');
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
 el('kitPassword').value='';show('Testing Wi-Fi; save occurs on verified association. Connection may switch.');
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
 const session=rcSession;rcSession='';
 if(session&&online)await request('/api/rc/release','POST',{session}).catch(()=>{});
}
function previewControls(m){
 // Direct Android→kit RC is AP-only. STA/USB Android frames must flow via the WebRTC host.
 if(!online||!onKitAp||!el('kitRcPreview')?.checked||previewBusy||rcClaiming||Date.now()-lastPreview<100)return;
 if(!m?.axes||!Number.isFinite(m.axes.roll)||!Number.isFinite(m.axes.pitch)||!Number.isFinite(m.axes.yaw))return;
 if(!rcSession){
  if(!/^[0-9]{6}$/.test(kitCode)){show('Read kit status and verify six-digit code first','warn');return;}
  rcClaiming=true;
  request('/api/rc/claim','POST',{source:'ANDROID',kitCode})
   .then(d=>{if(d.kitId&&d.session){rcSession=d.session;show('AERION kit RC preview claimed • motors OFF','good')}})
   .catch(e=>show('Kit RC locked: '+e.message,'warn'))
   .finally(()=>{rcClaiming=false});
  return;
 }
 lastPreview=Date.now();previewBusy=true;
 const axes=m.axes,clamp=v=>Math.max(1000,Math.min(2000,Math.round(1500+500*v)));
 request('/api/rc/preview','POST',{session:rcSession,source:'ANDROID',seq:m.seq,armed:'false',
  throttle:Math.max(1000,Math.min(2000,m.throttle|0)),
  roll:clamp(axes.roll),pitch:clamp(axes.pitch),yaw:clamp(axes.yaw)})
 .catch(e=>{rcSession='';show('RC preview stopped: '+e.message,'warn')})
 .finally(()=>{previewBusy=false});
}
function action(id,fn){el(id)?.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>show(e.message,'warn')))}
function bind(){
 if(!el('kitNetStatus'))return;
 if(!native?.request){show('Install updated Android APK for Wi-Fi connection');return;}
 el('kitIp').value=ip;
 el('kitIp').addEventListener('change',()=>{ip=el('kitIp').value.trim();online=false;rcSession='';kitCode=''});
 el('kitKey').addEventListener('input',()=>{key=el('kitKey').value.trim();online=false;rcSession=''});
 el('kitNetworks').addEventListener('change',()=>{el('kitSsid').value=el('kitNetworks').value});
 el('kitRcPreview')?.addEventListener('change',()=>{if(!el('kitRcPreview').checked)releaseRc()});
 action('kitWifiSettings',()=>native.openWifiSettings());
 action('kitConnect',status);action('kitScan',async()=>{await scan();if(el('kitNetStatus')?.textContent.includes('Scanning'))setTimeout(()=>scan().catch(()=>{}),2300)});
 action('kitTestSave',testSave);action('kitSwitch',setMode);
 action('kitRead',async()=>{const data=await pollTelemetry();el('kitTelemetry').textContent=JSON.stringify(data,null,2)});
 action('kitI2cScan',async()=>{await command('ZJI2C,SCAN');show('I²C scan requested; refresh telemetry for device addresses','good')});
 action('kitLedOff',()=>command('ZJLED,1,STOP'));
 action('kitAppOta',()=>{
  if(!online||!native?.pickAppFirmware)throw Error('Connect FlightCore first');
  if(!confirm('APP OTA BENCH UPDATE ONLY. Propellers removed and ESC power disconnected? Use matching A1/A2 APP .bin only. Continue?'))return;
  native.pickAppFirmware(ip,key);show('Select matching FlightCore APP .bin using Android Files');
 });
 setInterval(()=>{if(!online)return;status().catch(()=>{online=false;show('Kit disconnected. Check phone Wi-Fi and IP.','warn')})},3500);
}
window.ZebjusNetwork={request,status,scan,command,previewControls,releaseRc,onWebRequest,isConnected:()=>online&&Date.now()-lastStatus<12000,mode:()=>mode};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
