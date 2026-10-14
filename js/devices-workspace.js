/* Consolidated Devices & Firmware workspace.
 * Move existing controls without cloning/recreating IDs; original event
 * handlers, authenticated sessions and OTA state remain authoritative.
 */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 const shell=$('devicesWorkspace');
 if(!shell)return;
 const names={
  overview:'Overview',connection:'Kit Connection',wifi:'Wi-Fi & Network',
  firmware:'Firmware Flash',mobile:'Mobile Controller',
  diagnostics:'Diagnostics',security:'Security & Admin'
 };
 let selected='overview',ready=false;
 const body=name=>$('dw-body-'+name);
 function relocate(selector,name){
  const node=document.querySelector(selector),target=body(name);
  if(!node||!target)throw Error('Missing Devices workspace element '+selector);
  target.append(node);return node;
 }
 function summary(){
  const state=root.ZebjusKits?.getState?.()||{};
  const linked=state.connected===true;
  const ota=state.otaInProgress===true;
  const kit=linked||ota?state.kitName||'AERION Kit':'No hardware connected';
  const mode=state.transport?String(state.transport).toUpperCase():'—';
  const status=ota?(linked?'OTA UPLOADING':'OTA RECONNECTING'):linked?'CONNECTED':'OFFLINE';
  $('dwTopKitName').textContent=kit;
  $('dwTopKitMeta').textContent=linked||ota?
    [state.board,mode,state.version||'Version unknown'].filter(Boolean).join(' • '):
    'Find a verified A1/A2 kit in Kit Connection';
  $('dwTopStatus').textContent=status;
  $('dwTopStatus').dataset.tone=linked?'good':ota?'warn':'offline';
  $('dwSidebarConnection').textContent=kit;
  $('dwSidebarTransport').textContent=ota?'Firmware operation in progress':linked?mode+' • '+(state.kitCode||'Verified Device ID'):'Select a verified kit';
  $('dwConnectionDot').dataset.state=ota?'busy':linked?'online':'offline';
  const notice=$('dwWorkspaceNotice');
  notice.hidden=!ota;
  if(ota)notice.textContent='Firmware OTA is in progress. Avoid disconnecting or changing networks. You can return to Firmware Flash to watch verification.';
 }
 function open(name,{activateTab=true,scroll=false}={}){
  if(!names[name]||!ready)return false;
  if(activateTab&&!$('tab-firmware')?.classList.contains('active'))
   document.querySelector('.tab[data-tab="firmware"]')?.click();
  selected=name;
  for(const key of Object.keys(names)){
   const view=$('dw-panel-'+key),tab=$('dw-tab-'+key);
   if(view)view.hidden=key!==name;
   if(tab){tab.setAttribute('aria-selected',String(key===name));tab.tabIndex=key===name?0:-1}
  }
  if(name==='mobile'){$('kitMobilePairDetails').open=true;root.ZebjusPairingBridge?.ensureSimulator?.()}
  if(scroll&&root.requestAnimationFrame)root.requestAnimationFrame(()=>shell.scrollIntoView({block:'start',behavior:'smooth'}));
  root.dispatchEvent(new CustomEvent('dronelab:devices-view',{detail:{name}}));
  summary();
  return true;
 }
 function init(){
  try{
   // Validate dependencies before any node is relocated.
   const required=[
    '.fw-kit-detail-card','.fw-connect-card','.fw-available-card',
    '.fw-rename-card','.fw-network-card','.firmware-grid',
    '.firmware-safety-strip','#kitCenter','#kitNetworkSettings','#kitAdmin',
    '#kitMobilePairDetails','.settings-heading','.kit-legacy-network',
    '.kit-browser-access','#kitTrustHelp','.fw-serial-head',
    '.fw-serial-toolbar','#fwSerialMonitorPane','#fwSerialPlotterPane',
    '#fwSerialMonitorBtn','#fwSerialClearBtn','#kitEvents'
   ];
   const missing=required.filter(selector=>!document.querySelector(selector));
   if(missing.length)throw Error('Missing controls: '+missing.join(', '));
   relocate('.fw-kit-detail-card','overview');
   relocate('.fw-connect-card','connection');
   relocate('.fw-available-card','connection');
   relocate('.fw-rename-card','connection');
   relocate('.fw-network-card','wifi');
   relocate('#kitNetworkSettings','wifi');
   relocate('.kit-legacy-network','wifi');
   relocate('.kit-browser-access','security');
   relocate('#kitTrustHelp','security');
   relocate('#kitAdmin','security');
   relocate('.settings-heading','mobile');
   relocate('#kitMobilePairDetails','mobile');
   const events=$('kitEvents').closest('details');
   if(events)body('diagnostics').append(events);
   relocate('.fw-serial-head','diagnostics');
   relocate('.fw-serial-toolbar','diagnostics');
   relocate('#fwSerialMonitorBtn','diagnostics');
   relocate('#fwSerialClearBtn','diagnostics');
   relocate('#fwSerialMonitorPane','diagnostics');
   relocate('#fwSerialPlotterPane','diagnostics');
   const legacy=document.createElement('details');
   legacy.className='dw-legacy-kit kit-accordion';
   legacy.id='dwLegacyConnection';
   const heading=document.createElement('summary');
   heading.textContent='Advanced • Manual Kit connection, recovery and controller diagnostics';
   legacy.append(heading,document.querySelector('#kitCenter'));
   body('connection').append(legacy);
   relocate('.firmware-grid','firmware');
   relocate('.firmware-safety-strip','firmware');
   const empty=$('fwConnectionWorkspace');
   if(empty)empty.hidden=true;
   // Legacy host remains available only as a compatibility source, not as a tab.
   const old=$('tab-settings');
   if(old){old.hidden=true;old.setAttribute('aria-hidden','true')}
   shell.hidden=false;ready=true;shell.dataset.ready='true';
   const defaultView=location.hash==='#settings'?'wifi':'overview';
   open(defaultView,{activateTab:false});
  }catch(error){
   console.error('Devices workspace unavailable:',error);
   shell.hidden=false;
   const notice=$('dwWorkspaceNotice');
   notice.hidden=false;notice.textContent='Unable to initialize the unified Hardware Center: '+error.message;
   const old=$('tab-settings');
   if(old){old.hidden=false;old.removeAttribute('aria-hidden');$('tab-firmware')?.append(old)}
   const original=$('fwConnectionWorkspace');
   if(original)original.hidden=false;
  }
 }
 shell.addEventListener('click',event=>{
  const button=event.target.closest('button[data-dw-view]');
  if(button)open(button.dataset.dwView);
 });
 shell.addEventListener('keydown',event=>{
  const button=event.target.closest('button[data-dw-view]');
  if(!button||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const keys=Object.keys(names),index=keys.indexOf(button.dataset.dwView);
  let next=index;
  if(['ArrowRight','ArrowDown'].includes(event.key))next=(index+1)%keys.length;
  if(['ArrowLeft','ArrowUp'].includes(event.key))next=(index-1+keys.length)%keys.length;
  if(event.key==='Home')next=0;
  if(event.key==='End')next=keys.length-1;
  event.preventDefault();open(keys[next]);$('dw-tab-'+keys[next]).focus();
 });
 root.addEventListener('dronelab:kit-link',summary);
 root.addEventListener('dronelab:devices-open',event=>open(event.detail?.name||'overview',{scroll:true}));
 root.ZebjusDevicesWorkspace={open,active:()=>selected,refresh:summary};
 init();
 root.setInterval(summary,1700);
})(window);
