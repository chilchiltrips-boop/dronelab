/* Web HTTPS -> encrypted paired WebRTC -> Android native Wi-Fi -> FlightCore.
 * Direct ws://192.168.x.x from GitHub Pages is intentionally not used. */
(function(){
'use strict';
const $=id=>document.getElementById(id),bridge=()=>window.ZebjusDeviceRelay;
let netReady=false,netMode='',lastSeen=0,pollTimer=null,scanSequence=-1,frameSeq=0;
const output=(text,kind='')=>{const e=$('netResult');if(e){e.textContent=text;e.dataset.state=kind;}};
async function request(route,method='GET',args={}){
 if(!bridge()?.request)throw Error('Android WebRTC bridge unavailable');
 const data=await bridge().request(route,method,args);
 if(data?.board&&route==='/api/status'){netReady=true;netMode=data.mode;lastSeen=Date.now();}
 return data;
}
async function read(){
 const d=await request('/api/status'),e=$('netRuntime');
 if(e)e.textContent=(d.board||'FlightCore')+' • '+d.version+' • '+d.phase+' • STA '+(d.ip||'offline')+' • AP '+(d.apIp||'offline');
 output('FlightCore connected via Android • '+(d.staConnected?'STA':'AP'),'good');return d;
}
async function scan(){
 const d=await request('/api/wifi/scan');if(d.state!=='ready'){output('Scanning Wi-Fi. Select Scan again to load results.');return}
 const select=$('netNetworks');if(select){select.replaceChildren(new Option('Select Wi-Fi',''));for(const n of d.networks||[])if(n.ssid)select.add(new Option(n.ssid+' ('+n.rssi+' dBm)',n.ssid));}
 output('Found '+(d.networks||[]).length+' Wi-Fi networks','good');
}
async function save(){
 const ssid=$('netSsid').value.trim(),password=$('netPass').value;if(!ssid)throw Error('Enter or select a Wi-Fi SSID');
 await request('/api/wifi/test','POST',{ssid,password});$('netPass').value='';
 output('STA connection test started. Credentials are saved only after a successful association.','good');
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
 const e=$('netTelemetry');if(e)e.textContent='Gyro '+d.board+' • Roll '+d.roll+'°/s • Pitch '+d.pitch+'°/s • Yaw '+d.yaw+'°/s • '+d.scanner?.length+' I²C devices';
 return d;
}
async function writeLine(text){
 const line=String(text||'').trim();if(!/^(ZJINFO,GET|ZJI2C,SCAN|ZJLED,[0-9]+,(?:STOP|SET|KEEP|BLINK|FADE|PATTERN|SAFE|WARNING|SOS)(?:,.*)?|ZJTEL,RATE,(?:10|20|50))$/.test(line))throw Error('Only FlightCore bench commands can use network transport');
 return request('/api/command','POST',{line});
}
function stream(on=true){
 if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
 if(on)pollTimer=setInterval(()=>getTelemetry().catch(()=>{netReady=false;lastSeen=0;stream(false)}),170);
}
function bindAction(id,callback){$(id)?.addEventListener('click',()=>Promise.resolve().then(callback).catch(e=>output(e.message,'warn')))}
function init(){
 if(!$('netResult'))return;
 bindAction('netRefresh',read);bindAction('netScan',scan);bindAction('netSave',save);bindAction('netSwitch',switchMode);
 bindAction('netReadGyro',async()=>{const d=await getTelemetry();output('Live gyro received from '+d.board,'good')});
 bindAction('netScanI2c',async()=>{await writeLine('ZJI2C,SCAN');output('I²C scan triggered; fetch telemetry after scan completes','good')});
 $('netNetworks').addEventListener('change',()=>{$('netSsid').value=$('netNetworks').value});
}
window.DroneLabNetwork={request,read,scan,getTelemetry,writeLine,stream,
 isConnected:()=>netReady&&Date.now()-lastSeen<15000,mode:()=>netMode};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
