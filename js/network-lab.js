/* FlightCore diagnostics use the verified MY KITS session when present.
 * Every read is bound to the selected Device ID; Python executes in the browser. */
(function(){
'use strict';
const $=id=>document.getElementById(id),bridge=()=>window.ZebjusDeviceRelay;
let netReady=false,netMode='',lastSeen=0,pollTimer=null,scanSequence=-1,frameSeq=0,pollBusy=false;
let joystickReadAt=0,joystickPending=null;
const output=(text,kind='')=>{const e=$('netResult');if(e){e.textContent=text;e.dataset.state=kind;}};
async function request(route,method='GET',args={}){
 const kits=window.ZebjusKits;
 const selected=kits?.getState?.();
 if(!selected?.connected||selected.transport==='usb')throw Error('Connect a verified STA/AP kit in MY KITS.');
 const data=await kits.request(route,method,args);
 if(data.kitId&&data.kitId!==selected.kitId)throw Error('Device ID mismatch: network sample rejected.');
 if(data?.board&&route==='/api/status'){netReady=true;netMode=data.mode;lastSeen=Date.now();}
 return data;
}
async function read(){
 const d=await request('/api/status'),e=$('netRuntime');
 if(e)e.textContent=(d.board||'FlightCore')+' • '+d.version+' • '+d.phase+' • STA '+(d.ip||'offline')+' • AP '+(d.apIp||'offline');
 output('FlightCore connected • '+(d.kitName||d.board)+' • '+(d.staConnected?'STA':'AP'),'good');return d;
}
async function scan(){
 output('Scanning nearby 2.4 GHz routers…');const networks=await pythonWifiScan(),d={networks};
 const select=$('netNetworks');if(select){select.replaceChildren(new Option('Select Wi-Fi',''));for(const n of d.networks||[])if(n.ssid)select.add(new Option(n.ssid+' ('+n.rssi+' dBm)',n.ssid));}
 output('Found '+(d.networks||[]).length+' Wi-Fi networks','good');
}
async function save(){
 const ssid=$('netSsid').value.trim(),password=$('netPass').value;if(!ssid)throw Error('Enter or select a Wi-Fi SSID');
 $('netPass').value='';output('Testing router association • not saved yet.');const result=await pythonWifiTestSave(ssid,password);
 output(result.saved?'Verified & saved • STA '+result.staIp:'Not saved: '+(result.message||result.reason||result.state),result.saved?'good':'warn');
}
async function switchMode(){
 const mode=$('netMode').value;if(!['auto','ap','sta'].includes(mode))throw Error('Invalid mode');
 await request('/api/wifi/mode','POST',{mode});netReady=false;lastSeen=0;
 output('Mode change to '+mode.toUpperCase()+' requested. Pair Android again after it joins the selected network.');
}
function telemetryLine(d){
 const addr='0x'+Number(d.address||0).toString(16).toUpperCase();
 return 'ZJTEL,1,'+d.board+','+(++frameSeq)+','+d.millis+','+addr+','+(d.gyroReady?'READY':'NOT_FOUND')+','+d.roll+','+d.pitch+','+d.yaw+',1,0';
}
async function getTelemetry(){
 const d=await request('/api/telemetry');lastSeen=Date.now();netReady=true;
 window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line:telemetryLine(d),transport:netMode||'network'}}));
 if(d.scannerRunning===false&&Array.isArray(d.scanner)&&scanSequence!==d.scanSequence){
  scanSequence=d.scanSequence;
  const frame='ZJSCAN,'+d.board+','+d.millis+','+d.scanner.length+d.scanner.map(x=>',0x'+Number(x).toString(16).toUpperCase().padStart(2,'0')).join('');
  window.dispatchEvent(new CustomEvent('dronelab:serial-line',{detail:{line:frame,transport:netMode||'network'}}));
 }
 const e=$('netTelemetry');if(e)e.textContent='Gyro '+d.board+' • Roll '+d.roll+'°/s • Pitch '+d.pitch+'°/s • Yaw '+d.yaw+'°/s • '+d.scanner?.length+' I²C devices'+(d.rc?' • RC '+(d.rc.active?'LIVE':'IDLE')+' T'+d.rc.throttle+' R'+d.rc.roll+' P'+d.rc.pitch+' Y'+d.rc.yaw:'');
 return d;
}
async function writeLine(text){
 const line=String(text||'').trim();if(!/^(ZJINFO,GET|ZJI2C,SCAN|ZJLED,[0-9]+,(?:STOP|SET|KEEP|BLINK|FADE|PATTERN|SAFE|WARNING|SOS)(?:,.*)?|ZJTEL,RATE,(?:10|20|50))$/.test(line))throw Error('Only FlightCore bench commands can use network transport');
 return request('/api/command','POST',{line});
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
 if(!kit?.connected||!['sta','ap'].includes(kit.transport))throw Error('Connect a verified kit first.');
 if(kit.rc?.claimed)throw Error('Controller busy: release Android/WEB diagnostic control before network setup.');
 if(!kit.setupAuthorized)throw Error('Renew the 5-minute setup authorization with your private label on the kit AP.');
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
 const read=async()=>{
  const wait=Math.max(0,100-(performance.now()-joystickReadAt));if(wait)await new Promise(r=>setTimeout(r,wait));
  const before=window.ZebjusKits?.getState?.(),start=performance.now();
  if(!before?.connected||!['sta','ap'].includes(before.transport))throw Error('Select a verified STA/AP kit before reading firmware joystick input.');
  const rc=await request('/api/rc/snapshot');const after=window.ZebjusKits?.getState?.();
  if(!after?.connected||after.kitId!==before.kitId||rc.kitId!==before.kitId||rc.motorsDisabled!==true)throw Error('Firmware joystick identity or motor-disabled confirmation failed.');
  const rtt=Math.round(performance.now()-start),valid=rc.inputValid===true&&rc.failsafe===false&&Number.isFinite(rc.ageMs)&&rc.ageMs+rtt<=350;
  joystickReadAt=performance.now();
  return {...rc,device_id:rc.kitId,owner_id:rc.ownerId,age_ms:rc.ageMs===null?null:rc.ageMs+rtt,input_valid:valid,failsafe:!valid,
   throttle:valid?rc.throttle:1000,roll:valid?rc.roll:1500,pitch:valid?rc.pitch:1500,yaw:valid?rc.yaw:1500,
   response_mode:rc.responseMode,received_at_ms:rc.receivedAtMs,round_trip_ms:rtt,motors_disabled:true,transport:before.transport};
 };
 joystickPending=read().finally(()=>{joystickPending=null});return joystickPending;
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
window.DroneLabNetwork={request,read,scan,getTelemetry,readJoystick,writeLine,pythonWifiScan,pythonWifiTestSave,stream,
 isConnected:()=>!!(window.ZebjusKits?.getState?.().connected&&window.ZebjusKits?.getState?.().transport!=='usb')||(netReady&&Date.now()-lastSeen<15000),mode:()=>window.ZebjusKits?.getState?.().transport||netMode};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
