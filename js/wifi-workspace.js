/* Presentation adapter. All radio/router writes use the original authenticated
 * classroom handlers and selected Device ID. Never issue a command on render. */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 let selected='sta',selectionDirty=false,binding='',savedSignature='';
 const set=(id,value)=>{const el=$(id),text=String(value);if(el&&el.textContent!==text)el.textContent=text};
 function render(){
  const s=root.ZebjusKits?.getState?.();if(!s||!$('wifiModeTitle'))return;
  const key=(s.kitId||'')+'|'+(s.connectionGeneration||0);
  if(key!==binding){
   binding=key;selectionDirty=false;selected=['auto','ap','sta'].includes(s.mode)?s.mode:'sta';
   $('kitRouterPass').value='';$('kitRouterPass').type='password';
   $('wifiShowRouterPassword').setAttribute('aria-pressed','false');set('wifiShowRouterPassword','Show');
   $('kitRouterSsid').value='';$('wifiManualSsid').checked=false;$('wifiManualField').hidden=true;
   $('kitSavedNetworks').replaceChildren(new Option('Refresh saved routers',''));
   $('kitWifiNetworks').replaceChildren(new Option('Select a network',''));
  }
  const connected=s.connected===true,direct=['usb','ap','sta'].includes(s.transport);
  if(!selectionDirty&&['auto','ap','sta'].includes(s.mode))selected=s.mode;
  const passwordShown=$('kitRouterPass').type==='text';
  $('wifiShowRouterPassword').setAttribute('aria-label',passwordShown?'Hide router password':'Show router password');
  $('wifiShowRouterPassword').setAttribute('aria-pressed',String(passwordShown));set('wifiShowRouterPassword',passwordShown?'Hide':'Show');
  const busy=!!(s.working||s.networkBusy||s.otaInProgress),owned=!!(s.owner||s.rc?.claimed);
  const allowed=connected&&direct&&!busy&&!owned&&(s.transport==='usb'||s.setupAuthorized===true);
  const safePpm=s.rcAccess?.pathVersion===1&&s.rc?.source==='PPM'&&s.rc.inputArmed!==true&&s.rc.throttle<=1050;
  const modeAllowed=connected&&direct&&!busy&&(!owned||safePpm)&&(s.transport==='usb'||s.setupAuthorized===true||s.controlAuthorized===true);
  $('kitWifiMode').value=selected;
  for(const button of document.querySelectorAll('[data-wifi-mode]')){
   button.setAttribute('aria-pressed',String(button.dataset.wifiMode===selected));button.disabled=!connected||!direct||busy;
  }
  const actual=connected?(s.staConnected?'STA':s.apActive?'AP':'Not reported'):'Not verified';
  set('wifiActualMode',actual);set('wifiBrowserLink',connected?String(s.transport).toUpperCase():'Offline');
  const same=connected&&selected===s.mode,apply=$('kitModeApply');
  if(same)selectionDirty=false;
  apply.disabled=!modeAllowed||same;
  for(const id of ['kitWifiScan','kitWifiSave'])$(id).disabled=!allowed;
  for(const id of ['kitSavedUse','kitSavedForget'])$(id).disabled=!allowed||!$('kitSavedNetworks').value;
  for(const id of ['wifiManualSsid','kitRouterSsid','kitRouterPass','wifiShowRouterPassword'])$(id).disabled=!allowed;
  $('kitWifiNetworks').disabled=!allowed||$('wifiManualSsid').checked;
  set('kitModeApply',same?(selected==='auto'?'Automatic selected':selected.toUpperCase()+' selected'):selected==='auto'?'Apply automatic mode':'Switch to '+selected.toUpperCase());
  $('wifiConnectKit').hidden=connected;
  const reason=!connected?'Connect and verify a Kit before changing its radio mode.':busy?'A Kit operation is in progress. Wait for its result.':
   owned&&!safePpm?'RC input is active. Lower throttle and disarm PPM, or release the current controller.':!direct?'Use a direct USB/AP/STA connection for network settings.':
   !modeAllowed?'Read-only connection. Verify physical USB pairing to authorize settings.':
   selected==='ap'?'AP keeps only the Kit hotspot active. Join its Wi-Fi on this computer after switching.':selected==='auto'?'Automatic startup uses a saved router, otherwise AP. The active radio is shown above.':
   'STA uses a saved router and turns the Kit hotspot off. AP returns if every saved router fails.';
  set('wifiModeHint',reason);
  set('wifiPermissionHint',!connected?'Settings require an authorized Kit connection.':s.transport==='usb'?'Physical USB verified. Protected provisioning still requires teacher verification.':
   s.setupAuthorized?'Wi-Fi settings authorized'+(s.otaAuthorized?' • protected updates authorized.':'. Protected STA access and updates require USB pairing.'):'Read-only • physical USB pairing is required for settings.');
  $('wifiPermission').hidden=!connected||s.transport==='usb'||s.otaAuthorized===true;
  renderSaved(s,connected,busy);
 }
 function renderSaved(s,connected,busy){
  const select=$('kitSavedNetworks');
  const options=[...select.options].filter(option=>option.value);
  const signature=JSON.stringify([options.map(o=>[o.value,o.textContent]),select.value,connected,s.ssid,s.staConnected,busy]);
  if(signature===savedSignature)return;savedSignature=signature;
  const list=$('wifiSavedList');list.replaceChildren();
  if(!options.length){const p=document.createElement('p');p.className='wifi-empty';
   p.textContent=!connected?'Connect a Kit, then refresh saved Wi-Fi.':select.options[0]?.textContent==='No saved router profiles'?'No saved Wi-Fi yet. Scan or enter a router to add one.':'Refresh to read saved Wi-Fi from this Kit.';list.append(p);return;}
  for(const option of options){
   const button=document.createElement('button'),name=document.createElement('span'),status=document.createElement('small');
   button.type='button';button.className='wifi-saved-choice';name.textContent=option.value;
   const active=connected&&s.staConnected&&s.ssid===option.value;
   status.textContent=active?'Connected':option.textContent.includes(' • preferred')?'Preferred':'';status.dataset.connected=String(active);
   button.setAttribute('aria-pressed',String(select.value===option.value));button.disabled=!connected||busy;
   button.addEventListener('click',()=>{select.value=option.value;render()});button.append(name,status);list.append(button);
  }
 }
 function init(){
  if(!$('wifiModeTitle')||!root.ZebjusKits)return;
  for(const button of document.querySelectorAll('[data-wifi-mode]'))button.addEventListener('click',()=>{selected=button.dataset.wifiMode;selectionDirty=true;render()});
  $('kitWifiMode').addEventListener('change',e=>{selected=e.target.value;selectionDirty=true;render()});
  $('wifiConnectKit').addEventListener('click',()=>root.ZebjusDevicesWorkspace?.open('connection'));
  $('wifiManualSsid').addEventListener('change',e=>{
   $('wifiManualField').hidden=!e.target.checked;$('kitWifiNetworks').disabled=e.target.checked;
   if(!e.target.checked)$('kitRouterSsid').value=$('kitWifiNetworks').value;
  });
  $('kitWifiNetworks').addEventListener('change',()=>{if(!$('wifiManualSsid').checked)$('kitRouterSsid').value=$('kitWifiNetworks').value});
  $('wifiShowRouterPassword').addEventListener('click',()=>{
   const show=$('kitRouterPass').type==='password';$('kitRouterPass').type=show?'text':'password';
   $('wifiShowRouterPassword').setAttribute('aria-label',show?'Hide router password':'Show router password');
   $('wifiShowRouterPassword').setAttribute('aria-pressed',String(show));set('wifiShowRouterPassword',show?'Hide':'Show');
  });
  new MutationObserver(()=>render()).observe($('kitSavedNetworks'),{childList:true,subtree:true});
  for(const event of ['dronelab:kit-access','dronelab:kit-link','dronelab:devices-view'])root.addEventListener(event,render);
  root.addEventListener('pagehide',()=>{$('kitRouterPass').value='';$('kitRouterPass').type='password'});
  root.ZebjusWifiWorkspace={refresh:render};render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
