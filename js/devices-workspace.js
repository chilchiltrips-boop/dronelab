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
  firmware:'Firmware Flash',mobile:'Mobile Controller',inputs:'Live Inputs',
  diagnostics:'Diagnostics',security:'Security & Admin'
 };
 let selected='overview',ready=false,securityVisited=false;
 const viewScroll=new Map();
 let layoutFrame=0;
 const body=name=>$('dw-body-'+name);
 // The GitHub main branch can contain an unreleased APK build. Show ONLY the
 // version in published stable release metadata, never the source APK version.
 const expectedAndroidCert='F1B86575B3590734654F638E4E0D68056D37B2E8884AC7D6C24636FE9B516894';
 let releaseLastChecked=0,releaseChecking=false,releaseVersion='';
 function parsePublishedAndroidRelease(text){
  const fields=new Map(text.split(String.fromCharCode(10)).filter(line=>line.includes(':')).map(line=>{
   const colon=line.indexOf(':');
   return [line.slice(0,colon).trim(),line.slice(colon+1).trim()];
  }));
  const app=fields.get('App'),version=fields.get('Version'),code=fields.get('VersionCode');
  const cert=(fields.get('Release certificate SHA256')||'').replace(/:/g,'').toUpperCase();
  if(app!=='in.zebjus.dronelab.companion'||cert!==expectedAndroidCert||
     !/^[0-9][A-Za-z0-9._-]{0,79}$/.test(version||'')||!/^[1-9][0-9]{0,9}$/.test(code||'')||
     !Number.isSafeInteger(Number(code)))
   throw Error('Official signed Android release metadata unavailable or invalid');
  return 'Android APK • '+version.split('-')[0]+' (code '+code+')';
 }
 function updatePublishedAndroidRelease(){
  const labels=document.querySelectorAll('[data-dw-android-version]');
  if(!labels.length||typeof root.fetch!=='function')return;
  if(releaseChecking||Date.now()-releaseLastChecked<300000)return;
  releaseLastChecked=Date.now();releaseChecking=true;
  root.fetch('./mobile-apk/ANDROID_RELEASE_META.txt',{cache:'no-store'})
   .then(response=>{if(!response.ok)throw Error('Release metadata HTTP '+response.status);return response.text()})
   .then(text=>{
    releaseVersion=parsePublishedAndroidRelease(text);
    for(const label of labels)label.textContent=releaseVersion;
   })
   .catch(()=>{
    for(const label of labels)label.textContent=releaseVersion||
     'Published APK version unavailable offline • official signed download link remains available';
   })
   .finally(()=>{releaseChecking=false});
 }

 function sizeWorkspace(){
  if(!ready)return;
  const compact=root.matchMedia('(max-width:780px)').matches;
  const topbar=document.querySelector('#app .topbar');
  // Header is sticky, but its height changes at tablet/phone breakpoints.
  const headerBottom=Math.max(0,Math.round(topbar?.getBoundingClientRect().bottom||0));
  shell.style.setProperty('--dw-mobile-top',(headerBottom+4)+'px');
  const page=$('tab-firmware');
  if(compact||!page?.classList.contains('active')){
   shell.style.removeProperty('--dw-height');
   return;
  }
  const top=shell.getBoundingClientRect().top;
  const viewport=root.visualViewport?.height||root.innerHeight;
  // Leave the panel bottom padding visible; never stretch from an offscreen
  // rect when switching back from a different long lab page.
  const remaining=Math.floor(viewport-Math.max(top,headerBottom+6)-14);
  shell.style.setProperty('--dw-height',Math.max(240,remaining)+'px');
 }
 function scheduleLayout(){
  if(layoutFrame)root.cancelAnimationFrame(layoutFrame);
  layoutFrame=root.requestAnimationFrame(()=>{layoutFrame=0;sizeWorkspace()});
 }
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
  if(selected!==name)viewScroll.set(selected,body(selected)?.scrollTop||0);
  selected=name;
  for(const key of Object.keys(names)){
   const view=$('dw-panel-'+key),tab=$('dw-tab-'+key);
   if(view)view.hidden=key!==name;
   if(tab){tab.setAttribute('aria-selected',String(key===name));tab.tabIndex=key===name?0:-1}
  }
  if(name==='mobile'){$('kitMobilePairDetails').open=true;root.ZebjusPairingBridge?.ensureSimulator?.()}
  if(name==='overview'||name==='mobile')updatePublishedAndroidRelease();
  // The Security workspace owns the physical USB maintenance disclosure.
  // Expand it on first entry so teacher controls are actually visible after
  // moving the original <details> into this tab. Later preserve user toggles
  // across navigation instead of forcing the accordion open each time.
  if(name==='security'&&!securityVisited){
   const admin=$('kitAdmin');
   if(admin){admin.open=true;securityVisited=true}
  }
  if(body(name))body(name).scrollTop=viewScroll.get(name)||0;
  scheduleLayout();
  if(scroll&&root.requestAnimationFrame)root.requestAnimationFrame(()=>{
   shell.scrollIntoView({block:'start',behavior:'smooth'});
   scheduleLayout();
  });
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
    '#fwSerialMonitorBtn','#fwSerialClearBtn','#kitEvents','#kitAckDiagnostics','#kitNetworkMonitor'
   ];
   const missing=required.filter(selector=>!document.querySelector(selector));
   if(missing.length)throw Error('Missing controls: '+missing.join(', '));
   relocate('.fw-kit-detail-card','overview');
   // Keep the original authenticated Take Control / Release Control button
   // visible above the long identity/sensor grid. Never clone or bypass the
   // existing state-dependent disabled flag or its listener.
   const controlActions=$('fwKitTakeControl')?.closest('.fw-connect-actions');
   const overview=$('dw-panel-overview');
   const overviewContent=body('overview');
   if(!controlActions||!overview||!overviewContent)throw Error('Overview control actions missing');
   controlActions.classList.add('dw-overview-actions');
   controlActions.setAttribute('role','group');
   controlActions.setAttribute('aria-label','Kit diagnostic control and connection test');
   overview.insertBefore(controlActions,overviewContent);

   relocate('.fw-connect-card','connection');
   relocate('.fw-live-inputs-card','inputs');
   relocate('.fw-available-card','connection');
   relocate('.fw-rename-card','connection');
   relocate('.fw-network-card','wifi');
   relocate('#kitNetworkSettings','wifi');
   relocate('.kit-legacy-network','wifi');
   relocate('.kit-browser-access','security');
   relocate('#kitTrustHelp','security');
   const admin=relocate('#kitAdmin','wifi');
   const advanced=$('smartAdvancedBody');if(advanced){advanced.append(admin);admin.open=true;admin.querySelector('summary').hidden=true;}
   relocate('.settings-heading','mobile');
   relocate('#kitMobilePairDetails','mobile');
   // Move the exact existing nodes (not clones): preserve recorder storage and listeners.
   relocate('#kitAckDiagnostics','diagnostics');
   const networkEvents=$('kitNetworkMonitor')?.closest('details');
   if(networkEvents)body('diagnostics').append(networkEvents);
   const events=$('kitEvents')?.closest('details');
   if(events)body('diagnostics').append(events);
   relocate('.fw-serial-head','diagnostics');
   relocate('.fw-serial-toolbar','diagnostics');
   relocate('#fwSerialMonitorBtn','diagnostics');
   relocate('#fwSerialClearBtn','diagnostics');
   // Preserve original serial/USB event handlers by MOVING existing nodes.
   // Group Open Serial Port and Clear Output so they never stack separately.
   const serialToolbar=document.querySelector('#dw-body-diagnostics>.fw-serial-toolbar');
   const serialHeader=document.querySelector('#dw-body-diagnostics>.fw-serial-head');
   const openSerial=$('fwSerialMonitorBtn'),clearSerial=$('fwSerialClearBtn');
   if(!serialToolbar||!serialHeader||!openSerial||!clearSerial)throw Error('Serial toolbar controls unavailable');
   serialToolbar.prepend(serialHeader);
   const serialAccess=document.createElement('div');
   serialAccess.className='dw-serial-access';
   serialAccess.setAttribute('role','group');
   serialAccess.setAttribute('aria-label','Serial port access and output');
   serialAccess.append(openSerial,clearSerial);
   serialToolbar.append(serialAccess);
   relocate('#fwSerialMonitorPane','diagnostics');
   relocate('#fwSerialPlotterPane','diagnostics');
   const legacy=document.createElement('details');
   legacy.className='dw-legacy-kit kit-accordion';
   legacy.id='dwLegacyConnection';
   const heading=document.createElement('summary');
   heading.textContent='Advanced • Manual Kit connection, recovery and controller diagnostics';
   legacy.append(heading,document.querySelector('#kitCenter'));
   // The previous My Kits page already nests manual tools inside its own
   // Advanced details. The unified page has an outer Advanced section, so
   // unwrap only the redundant disclosure (keep every control and listener).
   const innerManual=$('kitAdvancedHardware');
   if(innerManual)innerManual.classList.add('dw-unwrapped-advanced');
   // An initially collapsed parent <details> may not retain the nested
   // disclosure's open property after relocation. Synchronize on native
   // toggle instead: works for mouse, keyboard and scripted opens.
   const exposeAdvanced=()=>{
    if(!legacy.open)return;
    const inner=$('kitAdvancedHardware');
    if(inner){inner.open=true;inner.classList.add('dw-unwrapped-advanced')}
   };
   legacy.addEventListener('toggle',exposeAdvanced);
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
   open(defaultView,{activateTab:false});scheduleLayout();
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
 root.addEventListener('resize',scheduleLayout,{passive:true});
 root.visualViewport?.addEventListener('resize',scheduleLayout,{passive:true});
 root.addEventListener('dronelab:tab',event=>{
  if(event.detail?.name==='firmware'){
   scheduleLayout();
  }
 });
 if(root.ResizeObserver){
  const resize=new ResizeObserver(scheduleLayout);
  const topbar=document.querySelector('#app .topbar');
  if(topbar)resize.observe(topbar);
  const tools=document.querySelector('.v2-workspace-tools');
  if(tools)resize.observe(tools);
 }
 shell.addEventListener('click',event=>{
  const button=event.target.closest('button[data-dw-view]');
  if(button){open(button.dataset.dwView);if(button.hasAttribute('data-open-admin')&&$('smartAdvanced'))$('smartAdvanced').open=true;}
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
