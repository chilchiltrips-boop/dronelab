/* One stable selector/summary adapter for the WebApp and Android cockpit.
 * Rendering never claims input or sends commands. All changes are explicit. */
(function(root){
 'use strict';
 const policy=root.ZebjusControlPaths;if(!policy||typeof document==='undefined')return;
 const android=!!document.getElementById('flightCockpit');
 let pending=false,message='',lastConfirmed='',view=null,lastBinding='';
 const put=(el,text)=>{text=String(text);if(el&&el.textContent!==text)el.textContent=text};
 const adapter=()=>android?root.ZebjusNetwork:root.ZebjusKits;
 const kitState=()=>adapter()?.getState?.()||{};
 function peerState(){return android?root.ZebjusFlightApp?.peerState?.()||{}:root.ZebjusDeviceRelay?.status?.()||{}}
 function virtualState(){
  if(android)return root.ZebjusFlightApp?.virtualState?.()||{};
  return root.ZebjusVirtualControl||{};
 }
 function announce(kit){
  const path=kit.rcAccess?.pathVersion===1?kit.rcAccess.controlPath:null;
  const key=[kit.kitId,kit.bootId,kit.connectionGeneration,path].join('|');
  if(!policy.find(path)||key===lastConfirmed)return;
  lastConfirmed=key;
  root.dispatchEvent(new CustomEvent('dronelab:control-path',{detail:{path,kitId:kit.kitId,bootId:kit.bootId}}));
 }
 function refresh(){
  const kit=kitState();view=policy.describe({kit,peer:peerState(),virtual:virtualState(),client:android?'android':'web',pending});
  root.ZebjusAckDiagnostics?.observeView?.(view,kit);
  const binding=[kit.kitId,kit.bootId,kit.connectionGeneration].join('|');
  if(binding!==lastBinding){lastBinding=binding;message='';for(const box of document.querySelectorAll('[data-control-selector]'))delete box.dataset.dirty;}
  announce(kit);
  for(const box of document.querySelectorAll('[data-control-selector]')){
   const select=box.querySelector('select'),apply=box.querySelector('button[data-control-apply]');
   if(!box.dataset.dirty&&!pending&&select.value!==view.selected)select.value=view.selected||'';
   for(const option of select.options){
    const item=view.paths.find(p=>p.id===option.value);if(!item)continue;
    put(option,item.label+' · '+item.status);option.disabled=!item.selectable&&item.id!==view.selected;
   }
   const chosen=view.paths.find(p=>p.id===select.value);
   select.disabled=pending;
   apply.disabled=pending||!chosen?.selectable||chosen.id===kit.rcAccess?.controlPath;
   put(apply,android?(pending?'Switching…':'Select input'):(pending?'…':'✓'));
   apply.setAttribute('aria-label',pending?'Switching input':'Confirm selected input');
   select.title='Selected: '+view.selectedLabel;
   put(box.querySelector('[data-control-active]'),view.activeLabel);
   box.querySelector('[data-control-active]').title=view.activeLabel;
   put(box.querySelector('[data-control-selected]'),'Selected: '+view.selectedLabel);
   put(box.querySelector('[data-control-target]'),'Target: '+view.target);
   put(box.querySelector('[data-control-reason]'),message||chosen?.reason||view.reason);
   box.dataset.state=view.paused?'paused':view.active?'active':'idle';
  }
  const text=view.connection+' · Selected '+view.selectedLabel+' · '+(view.active?'Active '+view.activeLabel:view.activeLabel)+' · '+view.telemetryLabel+' · '+view.reason;
  for(const summary of document.querySelectorAll('[data-control-summary]')){put(summary,text);if(summary.title!==text)summary.title=text;}
  return view;
 }
 async function selectPath(path){
  if(pending)throw Error('Wait for the current input selection');
  const k=kitState(),current=refresh(),item=current.paths.find(p=>p.id===path);
  if(!item?.selectable)throw Error(item?.reason||'Input unavailable');
  if(virtualState().running)throw Error('Stop the simulator before changing input');
  pending=true;message='';refresh();
  try{
   await adapter().selectControlPath(path);
   // A resolved request is not sufficient: only a confirmed, same-Kit state is shown.
   const actual=kitState();
   if(!policy.sameBinding(k,actual)||actual.rcAccess?.controlPath!==path)throw Error('Input selection was not confirmed by the same Kit');
   message='Selected '+item.label+'. '+(path==='PPM'?'Receiver input is admitted safely; telemetry remains available.':path==='ANDROID_WEBRTC'?'Run the simulator on WebApp; Kit RC is not claimed.':path==='WEB_STA'?'Enable Send to selected Kit in PID and Use WebApp RC; input remains disarmed.':'Connect Android to the Kit hotspot; input remains disarmed.');
   for(const box of document.querySelectorAll('[data-control-selector]'))delete box.dataset.dirty;
  }catch(error){message=String(error.message||error);throw error}
  finally{pending=false;refresh()}
 }
 function mount(host){
  if(!host||host.querySelector('[data-control-selector]'))return;
  const details=document.createElement(android?'details':'div');details.className='control-path-selector'+(android?'':' control-path-inline');details.dataset.controlSelector='';
  const summary=document.createElement('summary');summary.append('Input: ');
  const active=document.createElement('b');active.dataset.controlActive='';summary.append(active);
  const panel=document.createElement('div');panel.className='control-path-popover';
  const label=document.createElement('label');label.textContent=android?'Control input':'Input';
  const select=document.createElement('select');select.setAttribute('aria-label','Control input path');select.append(new Option('Select input…',''));
  for(const p of policy.paths)select.append(new Option(p.label,p.id));label.append(select);
  const selected=document.createElement('span');selected.dataset.controlSelected='';
  const target=document.createElement('span');target.dataset.controlTarget='';
  const reason=document.createElement('p');reason.dataset.controlReason='';reason.setAttribute('role','status');
  const apply=document.createElement('button');apply.type='button';apply.dataset.controlApply='';apply.className='btn primary';
  select.addEventListener('change',()=>{details.dataset.dirty='1';message='';refresh()});
  apply.addEventListener('click',()=>void selectPath(select.value).catch(()=>{}));
  if(android){
   panel.append(label,selected,target,apply,reason);details.append(summary,panel);
  }else{
   select.id='headerControlPath';label.htmlFor=select.id;
   // Keep the real selection and explicit confirmation visible. Opening input
   // details only explains availability; it never changes the selected source.
   label.removeChild(select);
   const info=document.createElement('details');info.className='control-path-info';
   const help=document.createElement('summary');help.textContent='i';help.setAttribute('aria-label','Input availability and target details');
   const close=document.createElement('button');close.type='button';close.dataset.headerClose='';close.textContent='Close';close.className='btn ghost small';close.setAttribute('aria-label','Close input details');
   panel.append(close,selected,target,reason);info.append(help,panel);
   details.append(label,select,apply,active,info);
  }
  host.append(details);
 }
 function init(){
  mount(android?document.querySelector('.flight-brand'):document.getElementById('headerInputSlot')||document.getElementById('kitTopStatus'));
  if(!android){
   const header=document.querySelector('#app .topbar');
   const close=box=>{box.open=false;box.querySelector('summary')?.focus()};
   header?.addEventListener('click',event=>{const button=event.target.closest('[data-header-close]');if(button)close(button.closest('details'))});
   header?.addEventListener('keydown',event=>{if(event.key==='Escape'){const box=event.target.closest('details[open]');if(box){event.preventDefault();close(box)}}});
  }
  // The monitor owns its single title; compact display rules live in control-path.css.
  for(const host of document.querySelectorAll('.dw-view:not(#dw-panel-inputs)>.dw-view-header,#fwLiveInputs .li-header>div,#tab-python .python-toolbar,#tab-python .python-target-row,#tab-pid .pid-workspace-header')){
   if(host.querySelector('[data-control-summary]'))continue;
   const line=document.createElement('small');line.dataset.controlSummary='';line.className='control-path-summary';host.append(line);
  }
  for(const event of ['dronelab:kit-link','dronelab:kit-access','dronelab:devices-view','zebjus:kit-status','dronelab:virtual-state'])root.addEventListener(event,refresh);
  refresh();setInterval(()=>{if(!document.hidden)refresh()},300);
 }
 root.ZebjusControlUI=Object.freeze({refresh,selectPath,snapshot:()=>view});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(globalThis);
