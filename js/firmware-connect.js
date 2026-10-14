/* Firmware tab connection center inspired by the legacy ZEBJUS school UI.
 * Uses the existing identity-bound DroneLab kit transport; never trusts
 * discovery alone, never grants motor control or OTA with a public Kit name.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id),kit=()=>root.ZebjusKits;
let discovered=[],selectedId='',scanning=false,requesting=false,healthAt=0,lastScanAt=0,lastConnectedId='',lastConnectedName='',lastConnectedTransport='',lastWasOnline=false,telemetry=null,telemetryTime=0;
const set=(id,value)=>{const el=$(id);if(el)el.textContent=String(value??'--')};
function line(message){
 const el=$('fwConnectLog');if(!el)return;
 el.textContent=new Date().toLocaleTimeString()+'  '+String(message).slice(0,160)+'\n'+el.textContent.slice(0,3500);
}
function note(value,isError=false){
 set('fwConnectionHint',value);
 if(isError)line('ERROR  '+value);else line(value);
}
function state(){return kit()?.getState?.()||{connected:false}}
function select(device){
 if(!device?.kitId)return;
 selectedId=device.kitId;
 if($('fwKitNameInput'))$('fwKitNameInput').value=device.kitName;
 if($('fwKitCachedIp')){$('fwKitCachedIp').value=state().connected&&state().kitId===device.kitId?state().ip||state().staIp||'':'';$('fwKitCachedIp').title='Filled only after the selected Device ID returns a verified status'}
 if($('fwKitSelect'))$('fwKitSelect').value=device.kitId;
 renderAvailable(discovered,false);
 note('Selected '+device.kitName+' • '+device.kitId+'. Press Connect Selected Kit to authenticate.');
}
function renderAvailable(kits=[],inProgress=false){
 discovered=Array.isArray(kits)?kits.map(k=>({...k})):[];
 if(!selectedId&&discovered.length){
  let remembered;try{remembered=JSON.parse(localStorage.getItem('zebjus.classroom.last.v1')||'null')}catch{}
  const auto=discovered.find(k=>k.kitId===remembered?.id)||discovered[0];
  selectedId=auto.kitId;if($('fwKitNameInput'))$('fwKitNameInput').value=auto.kitName;
 }
 const dropdown=$('fwKitSelect'),list=$('fwDiscoveryResults');
 if(dropdown){
  dropdown.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';
  placeholder.textContent=inProgress?'Scanning default kit names…':discovered.length?'Select detected Kit':'No compatible Kit detected';
  dropdown.append(placeholder);
  for(const d of discovered){const option=document.createElement('option');option.value=d.kitId;option.textContent=d.kitName+' • '+d.kitId;dropdown.append(option)}
  dropdown.value=discovered.some(k=>k.kitId===selectedId)?selectedId:'';
 }
 set('fwDiscoveryCount',(inProgress?'Scanning • ':'')+discovered.length+' kit'+(discovered.length===1?'':'s'));
 if(!list)return;
 list.replaceChildren();
 if(!discovered.length){const p=document.createElement('p');p.className='micro-note';p.textContent=inProgress?'Scanning saved addresses, zebjus_drone_1… and current AERION mDNS names…':'No Kit found. Join the same Wi-Fi and allow Local Network Access. New Kits may require mDNS support or the local discovery helper.';list.append(p);return}
 for(const d of discovered){
  const row=document.createElement('button');row.type='button';row.className='kit-known-item';
  row.dataset.kitId=d.kitId;row.setAttribute('aria-pressed',String(d.kitId===selectedId));
  const name=document.createElement('b');name.textContent=d.kitName;
  const summary=document.createElement('small');summary.textContent=(discovered.some(k=>k.kitId!==d.kitId&&k.kitName.toLowerCase()===d.kitName.toLowerCase())?'DUPLICATE NAME • ':'')+d.board+' • '+d.transport.toUpperCase()+' • '+d.kitCode+' • '+d.kitId;
  row.append(name,summary);row.onclick=()=>select(d);list.append(row);
 }
}
async function scan(){
 if(scanning||!kit()?.discoverKits)return;
 scanning=true;renderAvailable(discovered,true);line('Discovery started • saved IP + default mDNS + AERION names');
 try{
  const result=await kit().discoverKits();
  discovered=Array.isArray(result)?result:kit().getDiscovered?.()||[];
  if(discovered.length===1&&!selectedId)select(discovered[0]);
  renderAvailable(discovered,false);
  line('Discovery complete • '+discovered.length+' candidate kit(s) • identity verification still required');
 }catch(e){note('Discovery failed: '+e.message,true)}
 finally{scanning=false;lastScanAt=Date.now();renderAvailable(discovered,false)}
}
async function guarded(fn){
 if(requesting)return;requesting=true;render();
 try{await fn()}catch(e){note(e.message||String(e),true)}
 finally{requesting=false;render()}
}
async function connectSelected(){
 const choice=discovered.find(k=>k.kitId===selectedId);
 if(choice){
  await kit().connectDiscoveredKit(choice);
 }else{
  const name=String($('fwKitNameInput')?.value||'').trim();
  if(!name)throw Error('Select a discovered Kit or type its known Kit Name.');
  await kit().connectNamedKit(name);
 }
 const s=state();
 if(!s.connected)throw Error('Kit did not return an authenticated status.');
 selectedId=s.kitId;
 const latest=kit().getDiscovered?.().find(k=>k.kitId===s.kitId);
 if(latest)discovered=[latest,...discovered.filter(k=>k.kitId!==s.kitId)];
 if($('fwKitCachedIp'))$('fwKitCachedIp').value=s.transport==='ap'?'192.168.4.1':s.staIp||latest?.ip||'';
 if($('fwKitNameInput'))$('fwKitNameInput').value=s.kitName;
 line('Verified connect • '+s.kitName+' • '+s.transport.toUpperCase()+' • '+s.kitId);
 renderAvailable(discovered,false);
}
async function ping(){
 const s=state();if(!s.connected)throw Error('Select and connect a Kit first.');
 const d=await kit().refreshConnection();
 if(d.kitId!==s.kitId)throw Error('Ping rejected: Device ID changed.');
 healthAt=Date.now();line('Ping OK • '+d.kitId+' • AP '+(d.apActive?'ON':'OFF')+' • STA '+(d.staConnected?'CONNECTED':'OFFLINE'));
}
async function changeName(reset){
 const s=state();
 if(!s.connected||!['ap','sta'].includes(s.transport)||!s.setupAuthorized)throw Error('Use AP Setup or authorize this USB-paired STA connection before changing its name.');
 const newName=reset?'':String($('fwRenameInput')?.value||'').trim();
 const result=await kit().renameConnectedKit(newName,reset);
 if($('fwKitNameInput'))$('fwKitNameInput').value=result;
 if($('fwRenameInput'))$('fwRenameInput').value=result;
 set('fwRenameMessage','Saved on the physical Kit: '+result+' • immutable Device ID unchanged.');
 line('Kit Name confirmed by firmware • '+result);
 discovered=kit().getDiscovered?.()||discovered;renderAvailable(discovered,false);
}
function render(){
 const s=state(),demo=!!$('fwKitDemoMode')?.checked,live=!!s.connected&&!demo;
 const changed=s.kitId!==lastConnectedId||s.kitName!==lastConnectedName||s.transport!==lastConnectedTransport||live!==lastWasOnline;
 if(changed){lastConnectedId=s.kitId||'';lastConnectedName=s.kitName||'';lastConnectedTransport=s.transport||'';lastWasOnline=live;telemetry=null;telemetryTime=0;if(live)line('Kit online • '+s.kitName+' • '+s.transport.toUpperCase())}
 set('fwConnectBadge',demo?'DEMO PREVIEW':live?'CONNECTED':'Not connected');
 $('fwConnectBadge')?.classList.toggle('offline',!live);
 set('fwSelectedKitName',live?s.kitName:demo?'Offline Simulation':'No kit selected');
 set('fwSelectedOnline',live?'Online':demo?'Simulation':'Offline');
 set('fwLocalLink',live?'LOCAL CONNECTED':'LOCAL READY');
 set('fwKitStateSimple',live?s.kitCode:'NOT SELECTED');
 set('fwControlSimple',live?s.owner?'YOURS':s.rc?.claimed?'BUSY':'AVAILABLE':'--');
 set('fwNetworkSimple',live?s.transport.toUpperCase():'--');
 const age=live&&s.heartbeatAt?Date.now()-s.heartbeatAt:Infinity;
 const current=live&&age<=6500;
 set('fwHealthCommand',current?s.rc?.active?'RC LIVE':'LINK OK':demo?'SIMULATED':'LOST');
 set('fwHealthCommandNote',current?'Status '+Math.round(age/1000)+'s ago':demo?'No physical commands':'Kit offline');
 const t=current&&Date.now()-telemetryTime<13000?telemetry:null;
 set('fwHealthImu',t?(t.gyroReady?'READY':'NOT FOUND'):'NOT REPORTED');
 set('fwHealthBaro','NOT REPORTED');set('fwHealthLidar','NOT REPORTED');
 set('fwHealthReceiver',t?(t.rcAlive||t.rc?.inputValid?'RC LIVE':'NO LIVE RC'):'NOT REPORTED');
 for(const id of ['fwHealthCommand','fwHealthImu','fwHealthBaro','fwHealthLidar','fwHealthReceiver']){const x=$(id);if(x)x.dataset.state=id==='fwHealthCommand'&&current||id==='fwHealthImu'&&t?.gyroReady||id==='fwHealthReceiver'&&(t?.rcAlive||t?.rc?.inputValid)?'live':'lost'}
 set('fwDetailName',live?s.kitName:'--');
 set('fwDetailId',live?s.kitId:'--');
 set('fwDetailAccess',live?(s.otaAuthorized?'USB-paired control / updates':s.setupAuthorized?'AP Setup':'STA observer'):'--');
 set('fwDetailMode',live?s.mode||s.transport:'--');
 set('fwDetailWifi',live?s.staConnected?'STA connected':s.apActive?'AP available':'Offline':'--');
 set('fwDetailRssi',live&&s.staConnected&&Number.isFinite(s.rssi)?s.rssi+' dBm':'--');
 set('fwDetailFirmware',live?s.version||'Not reported':'--');
 set('fwDetailBuild',live?s.firmwareBuiltAt||'Not reported by Kit':'--');
 set('fwDetailIp',live?s.transport==='ap'?'192.168.4.1':s.staIp||'Unknown':'--');
 set('fwDetailControl',live?s.owner?'Owned here':s.rc?.claimed?'Owned elsewhere':'Released':'--');
 set('fwDetailLastSeen',live&&s.heartbeatAt?new Date(s.heartbeatAt).toLocaleTimeString():'--');
 set('fwControlNote',demo?'Simulation preview only; no hardware commands.':live?s.controlAuthorized?'Take Control reserves this Kit; Release Control neutralizes input. Motor outputs remain disabled.':'STA observer: pair this browser once over USB, then reconnect to authorize diagnostic control and updates.':'Select a live Kit. No commands are sent while offline.');
 set('fwApIndicator',live?s.apActive?'ACTIVE':'OFF':'--');
 set('fwStaIndicator',live?s.staConnected?'CONNECTED':'OFF':'--');
 if($('fwKitConnectSelected'))$('fwKitConnectSelected').disabled=requesting||scanning||s.working;
 if($('fwKitDisconnect'))$('fwKitDisconnect').disabled=requesting||!s.connected;
 if($('fwKitPing'))$('fwKitPing').disabled=requesting||!live;
 if($('fwKitTakeControl')){$('fwKitTakeControl').disabled=requesting||s.working||!live||!s.controlAuthorized&&s.transport!=='usb'||!!s.rc?.claimed&&!s.owner;$('fwKitTakeControl').textContent=s.owner?'Release Control':'Take Control'}
 for(const id of ['fwRenameSave','fwRenameReset'])if($(id))$(id).disabled=requesting||s.working||!live||!['ap','sta'].includes(s.transport)||!s.setupAuthorized||s.owner||!!s.rc?.claimed;
 for(const id of ['fwWifiConnectAp','fwWifiConnectSta'])if($(id))$(id).disabled=requesting||s.working||s.owner||!!s.rc?.claimed;
 set('fwWifiName',live?s.ssid||'Router not connected':'--');
 set('fwWifiApName',live?s.apSsid||'Not reported':'--');
 set('fwWifiState',live?s.staConnected?(s.apActive?'STA + AP':'STA CONNECTED'):s.apActive?'AP • STA OFF':'Router offline':'Kit offline');
 set('fwWifiAddress',live?(s.staIp||'STA offline')+' / '+(s.apActive?s.apIp||'192.168.4.1':'AP off'):'--');
 set('fwWifiAccess',(live?s.otaAuthorized?'Control, settings & APP OTA authorized':s.setupAuthorized?'AP setup available • USB pairing required for APP OTA':'STA monitoring • USB pairing required for settings/control/OTA':s.pendingNetworkMode?'Waiting for '+s.pendingNetworkMode.toUpperCase()+' • join matching Wi-Fi and approve Connect':'Connect a kit to manage its Wi-Fi')+(live&&s.authorizationNotice?' • '+s.authorizationNotice:''));
 const router=s.ssid?'router Wi-Fi "'+s.ssid+'"':'the saved router Wi-Fi';
 set('fwWifiRouteHint',live?s.transport==='ap'?(s.exclusiveWifi?'AP only: saved routers are not connected. Select STA in the header to turn AP off and try saved routers; failed routers restore AP.':s.staConnected?'The kit has connected to '+router+'. This browser still uses the kit AP. Update to FlightCore 1.4.6 for exclusive AP/STA modes.':'This browser uses the kit AP; router STA is offline. Configure Wi-Fi, then switch to STA and join the router.'):
  s.transport==='sta'?'This browser is connected through '+router+'. '+(s.apActive?'Update to FlightCore 1.4.6 to disable AP while STA is connected.':'The kit AP hotspot is off.'):
  s.transport==='usb'?'USB is connected. Test & Save the router, join its Wi-Fi on this computer, then Connect STA.':'The kit is connected through the Android relay. Manage its router/AP settings through the verified kit connection.':'First setup: join the kit AP, connect the kit, then Scan Wi-Fi → Test & Save STA.');
 if($('fwAuthorizeUpdates')){
  $('fwAuthorizeUpdates').disabled=requesting||!live||!['ap','sta'].includes(s.transport)||s.working||s.owner||!!s.rc?.claimed||s.otaAuthorized||s.authorizationRetryAt>Date.now();
  $('fwAuthorizeUpdates').title=s.authorizationNotice||'Verify the pairing saved from this physical USB kit';
 }
 if(changed&&live){if($('fwKitNameInput'))$('fwKitNameInput').value=s.kitName;
   if($('fwKitCachedIp'))$('fwKitCachedIp').value=s.transport==='ap'?'192.168.4.1':s.staIp||''}
}
async function sampleHealth(){
 const s=state();
 if(!s.connected||$('fwKitDemoMode')?.checked||!$('tab-firmware')?.classList.contains('active'))return;
 try{
  const t=await kit().request('/api/telemetry');
  if(t.kitId===s.kitId){telemetry=t;telemetryTime=Date.now();healthAt=telemetryTime}
 }catch(e){line('Telemetry unavailable • '+e.message)}
}
function init(){
 if(!$('fwConnectionWorkspace')||!kit())return;
 const bind=(id,cb)=>$(id)?.addEventListener('click',()=>void guarded(cb));
 bind('fwKitConnectSelected',connectSelected);
 bind('fwKitDisconnect',()=>kit().disconnect('Firmware page disconnected'));
 bind('fwKitPing',ping);
 bind('fwKitTakeControl',()=>kit().toggleControl());
 bind('fwAuthorizeUpdates',()=>kit().authorizeNetwork());
 bind('fwWifiConnectAp',()=>kit().connectTransport('ap'));
 bind('fwWifiConnectSta',()=>kit().connectTransport('sta'));
 $('fwWifiSettingsBtn')?.addEventListener('click',()=>root.ZebjusDevicesWorkspace?.open('wifi',{scroll:true}));
 bind('fwRenameSave',()=>changeName(false));bind('fwRenameReset',()=>changeName(true));
 $('fwDiscoverKits')?.addEventListener('click',()=>void scan());
 $('fwKitSelect')?.addEventListener('change',e=>{const d=discovered.find(k=>k.kitId===e.target.value);if(d)select(d);else selectedId=''});
 $('fwKitNameInput')?.addEventListener('input',()=>{
  const chosen=discovered.find(k=>k.kitId===selectedId);
  if(chosen&&$('fwKitNameInput').value!==chosen.kitName){
   selectedId='';if($('fwKitSelect'))$('fwKitSelect').value='';
   if($('fwKitCachedIp'))$('fwKitCachedIp').value='';
  }
 });
 $('fwKitDemoMode')?.addEventListener('change',()=>{line($('fwKitDemoMode').checked?'Demo preview enabled; physical commands unchanged':'Live connected-kit mode enabled');render()});
 $('fwRenameInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void guarded(()=>changeName(false))}});
 root.addEventListener('dronelab:kit-link',render);
 root.addEventListener('dronelab:kit-name',render);
 document.querySelector('[data-tab="firmware"]')?.addEventListener('click',()=>{if(Date.now()-lastScanAt>20000)void scan()});
 renderAvailable(kit().getDiscovered?.()||[],false);render();
 if($('tab-firmware')?.classList.contains('active'))void scan();
 setInterval(render,1200);setInterval(()=>{if($('tab-firmware')?.classList.contains('active')&&Date.now()-lastScanAt>65000)void scan()},18000);
 setInterval(()=>void sampleHealth(),4200);
}
root.ZebjusFirmwareConnect={renderAvailable,scan,select,selected:()=>discovered.find(k=>k.kitId===selectedId)||null};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
