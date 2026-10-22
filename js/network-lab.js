/* FlightCore diagnostics use the verified MY KITS session when present.
 * Every read is bound to the selected Device ID; Python executes in the browser. */
(function(){
'use strict';
const $=id=>document.getElementById(id),bridge=()=>window.ZebjusDeviceRelay,dataInterface=()=>window.ZebjusKitData;
let netReady=false,netMode='',lastSeen=0,pollTimer=null,scanSequence=-1,frameSeq=0,pollBusy=false;
let joystickReadAt=0,joystickPending=null;
const output=(text,kind='')=>{const e=$('netResult');if(e){e.textContent=text;e.dataset.state=kind;}};
async function request(route,method='GET',args={},binding=null){
 const kits=window.ZebjusKits,selected=kits?.getState?.();
 if(binding)dataInterface().assertBoundSession(binding,selected,{allowDelayed:/,STOP\s*$/.test(args.line||'')});
 if(!selected?.connected||!selected.kitId||!dataInterface()?.isNetwork(selected.transport))
  throw Error('Connect and verify an AP / STA / Android Relay Kit before reading network data.');
 let result;
 try{result=await (binding&&kits.requestBound?kits.requestBound(binding,route,method,args):kits.request(route,method,args))}
 catch(error){if(binding)dataInterface().assertBoundSession(binding,kits.getState(),{allowDelayed:true});throw error;}
 const after=kits.getState();
 if(binding)dataInterface().assertBoundSession(binding,after,{allowDelayed:true});
 const requireKitId=['/api/status','/api/telemetry','/api/rc/snapshot'].includes(route);
 dataInterface().validateReply(selected,after,result,{requireKitId});
 if(result?.board&&route==='/api/status'){
  netReady=true;netMode=selected.transport;lastSeen=Date.now();
 }
 return result;
}

async function read(){
 const d=await request('/api/status'),e=$('netRuntime');
 if(e)e.textContent=(d.board||'FlightCore')+' • '+d.version+' • '+d.phase+' • STA '+(d.ip||'offline')+' • AP '+(d.apIp||'offline');
 output('FlightCore connected • '+(d.kitName||d.board)+' • '+String(d.requestTransport||window.ZebjusKits?.getState?.().transport||'unknown').toUpperCase(),'good');return d;
}
async function scan(){
 output('Scanning nearby 2.4 GHz routers…');const networks=await pythonWifiScan(),d={networks};
 const select=$('netNetworks');if(select){select.replaceChildren(new Option('Select Wi-Fi',''));for(const n of d.networks||[])if(n.ssid)select.add(new Option(n.ssid+' ('+n.rssi+' dBm)',n.ssid));}
 output('Found '+(d.networks||[]).length+' Wi-Fi networks','good');
}
async function save(){
 const ssid=$('netSsid').value.trim(),password=$('netPass').value;if(!ssid)throw Error('Enter or select a Wi-Fi SSID');
 $('netPass').value='';output('Testing router association • not saved yet.');const result=await pythonWifiTestSave(ssid,password);
 output(result.saved?'Verified & saved • STA '+result.staIp:result.state==='handover'?result.message:'Not saved: '+(result.message||result.reason||result.state),result.saved?'good':'warn');
}
async function switchMode(){
 const mode=$('netMode').value;if(!['auto','ap','sta'].includes(mode))throw Error('Invalid mode');
 await window.ZebjusKits.switchNetworkMode(mode);netReady=false;lastSeen=0;
 output('Kit changing to '+mode.toUpperCase()+'. Join its Wi-Fi, scan and approve Connect. Saved USB pairing is reused.');
}
function telemetryLine(d){
 const addr='0x'+Number(d.address||0).toString(16).toUpperCase();
 return 'ZJTEL,1,'+d.board+','+(++frameSeq)+','+d.millis+','+addr+','+(d.gyroReady?'READY':'NOT_FOUND')+','+d.roll+','+d.pitch+','+d.yaw+',1,0';
}
async function getTelemetry(){
 const started=Date.now(),d=await request('/api/telemetry');d.transportAgeMs=Date.now()-started;lastSeen=Date.now();netReady=true;
 if(d.sampleAgeMs!==undefined&&(d.sampleValid!==true||!Number.isSafeInteger(d.sampleAgeMs)||d.sampleAgeMs<0||d.sampleAgeMs+d.transportAgeMs>1000))
  d.gyroReady=false; // Keep scanner data usable even when the IMU is absent/stale.
 window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line:telemetryLine(d),transport:netMode||'network'}}));
 if(d.scannerRunning===false&&Array.isArray(d.scanner)&&scanSequence!==d.scanSequence){
  scanSequence=d.scanSequence;
  const frame='ZJSCAN,'+d.board+','+d.millis+','+d.scanner.length+d.scanner.map(x=>',0x'+Number(x).toString(16).toUpperCase().padStart(2,'0')).join('');
  window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line:frame,transport:netMode||'network'}}));
 }
 const e=$('netTelemetry');if(e)e.textContent='Gyro '+d.board+(d.managementProtocol==='ZJM1'?' • UDP':'')+' • Roll '+d.roll+'°/s • Pitch '+d.pitch+'°/s • Yaw '+d.yaw+'°/s • '+d.scanner?.length+' I²C devices'+(d.rc?' • RC '+(d.rc.active?'LIVE':'IDLE')+' T'+d.rc.throttle+' R'+d.rc.roll+' P'+d.rc.pitch+' Y'+d.rc.yaw:'');
 return d;
}
async function writeLine(text,binding=null){
 const line=String(text||'').trim();if(!/^(ZJINFO,GET|ZJI2C,SCAN|ZJLED,[0-9]+,(?:STOP|SET|KEEP|BLINK|FADE|PATTERN|SAFE|WARNING|SOS)(?:,.*)?|ZJTEL,RATE,(?:10|20|50))$/.test(line))throw Error('Only FlightCore bench commands can use network transport');
 const result=await request('/api/command','POST',{line},binding);
 if(result?.accepted===false||result?.ok===false||result?.error)throw Error('LED command rejected: '+(result.error||result.reason||'not accepted'));
 return result;
}
async function verifyBinding(binding){
 const kits=window.ZebjusKits,contract=dataInterface();
 contract.assertBoundSession(binding,kits?.getState?.(),{allowDelayed:true});
 // read() adopts a fresh authenticated status without changing the selected
 // Kit, acquiring RC ownership, or discovering a different router peer.
 const result=await kits.read();
 contract.assertBoundSession(binding,kits.getState());
 if(result?.kitId!==binding.kitId)throw Object.assign(Error('Device ID mismatch during LED re-verification'),{code:'KIT_SESSION_CHANGED'});
 if(kits.getState().controlAuthorized!==true)throw Object.assign(Error('LED diagnostic permission is no longer authorized.'),{code:'KIT_AUTH_REJECTED'});
 return result;
}
// Python runs in Pyodide on the browser; firmware exposes only these allowlisted
// authenticated Wi-Fi operations. The program itself is never uploaded to ESP32.
async function pythonWifiScan(){
 for(let attempt=0;attempt<12;attempt++){
  const d=await request('/api/wifi/scan');
  if(d.state==='ready')return d.networks||[];
  await new Promise(resolve=>setTimeout(resolve,800));
 }
 throw Error('2.4 GHz router scan timed out; retry while connected via verified AP/STA.');
}
async function pythonWifiTestSave(ssid,password){
 const kit=window.ZebjusKits?.getState?.();
 if(!kit?.connected||!dataInterface()?.isNetwork(kit.transport))throw Error('Connect a verified Kit first.');
 if(kit.transport==='android-relay')throw Error('Wi-Fi credential provisioning over Android Relay is not supported; use direct authorized AP/STA or USB.');
 if(kit.rc?.claimed)throw Error('Controller busy: release Android/WEB diagnostic control before network setup.');
 if(!kit.setupAuthorized)throw Error('Connect Kit AP setup or authorize this USB-paired STA kit before changing router settings.');
 if(kit.exclusiveWifi)return window.ZebjusKits.testWifi(ssid,password);
 await request('/api/wifi/test','POST',{ssid:String(ssid),password:String(password)});
 for(let attempt=0;attempt<30;attempt++){
  await new Promise(resolve=>setTimeout(resolve,1000));let state;
  try{state=await request('/api/status')}catch{continue}
  if(state.kitId!==kit.kitId)throw Error('Device ID changed during Wi-Fi test.');
  if(state.wifiTestState==='saved')return {saved:true,state:'saved',staIp:state.ip};
  if(state.wifiTestState==='failed')return {saved:false,state:'failed',reason:state.lastStaFailureReason};
 }
 return {saved:false,state:'unverified',message:'Reconnect and verify status before retrying.'};
}
async function readJoystick(){
 if(joystickPending)return joystickPending;
 const operation=async()=>{
  const before=window.ZebjusKits?.getState?.(),contract=dataInterface();
  if(!before?.connected||!before.kitId)throw Error('Connect and verify a Kit before reading accepted RC.');
  if(before.transport==='usb'){
   // Serial Monitor already decoded accepted ZJRC / combined ZJTEL for
   // this verified USB Kit. Never start a second port or infer ACKs.
   const result=contract.usbJoystick(before);
   const after=window.ZebjusKits?.getState?.();
   contract.validateReply(before,after,result);return result;
  }
  if(!contract.isNetwork(before.transport))throw Error('Unsupported Kit data transport');
  const wait=Math.max(0,100-(performance.now()-joystickReadAt));
  if(wait)await new Promise(r=>setTimeout(r,wait));
  const start=performance.now(),rc=await request('/api/rc/snapshot'),after=window.ZebjusKits?.getState?.();
  contract.validateReply(before,after,rc);
  if(rc.motorsDisabled!==true)throw Error('Hardware motor-disabled confirmation absent');
  const rtt=Math.round(performance.now()-start),valid=rc.inputValid===true&&rc.failsafe===false&&
   Number.isFinite(rc.ageMs)&&rc.ageMs+rtt<=350;
  joystickReadAt=performance.now();
  return {...rc,device_id:rc.kitId,owner_id:rc.ownerId,
   age_ms:rc.ageMs===null?null:rc.ageMs+rtt,input_valid:valid,failsafe:!valid,
   throttle:valid?rc.throttle:1000,roll:valid?rc.roll:1500,
   pitch:valid?rc.pitch:1500,yaw:valid?rc.yaw:1500,response_mode:rc.responseMode,
   received_at_ms:rc.receivedAtMs,round_trip_ms:rtt,motors_disabled:true,
   transport:before.transport,physical_transport:before.physicalLink||before.transport};
 };
 joystickPending=operation().finally(()=>{joystickPending=null});return joystickPending;
}

function stream(on=true){
 if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
 if(on)pollTimer=setInterval(async()=>{if(pollBusy||!window.ZebjusKits?.isConnected?.())return;pollBusy=true;try{await getTelemetry()}catch{netReady=false;lastSeen=0}finally{pollBusy=false}},170);
}
function bindAction(id,callback){$(id)?.addEventListener('click',()=>Promise.resolve().then(callback).catch(e=>output(e.message,'warn')))}
function init(){
 if(!$('netResult'))return;
 bindAction('netRefresh',read);bindAction('netScan',scan);bindAction('netSave',save);bindAction('netSwitch',switchMode);
 bindAction('netReadGyro',async()=>{const d=await getTelemetry();output('Live gyro received from '+d.board,'good')});
 bindAction('netScanI2c',async()=>{await writeLine('ZJI2C,SCAN');output('I²C scan triggered; fetch telemetry after scan completes','good')});
 $('netNetworks').addEventListener('change',()=>{$('netSsid').value=$('netNetworks').value});
}
window.DroneLabNetwork={request,read,scan,getTelemetry,readJoystick,writeLine,verifyBinding,pythonWifiScan,pythonWifiTestSave,stream,
 isConnected:()=>{const kit=window.ZebjusKits?.getState?.();return !!(kit?.connected&&dataInterface()?.isNetwork(kit.transport)&&kit.kitId);},mode:()=>window.ZebjusKits?.getState?.().transport||netMode};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
