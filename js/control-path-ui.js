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
   put(apply,pending?'Switching…':'Select input');
   put(box.querySelector('[data-control-active]'),view.activeLabel);
   put(box.querySelector('[data-control-selected]'),'Selected: '+view.selectedLabel);
   put(box.querySelector('[data-control-target]'),'Target: '+view.target);
   put(box.querySelector('[data-control-reason]'),message||chosen?.reason||view.reason);
   box.dataset.state=view.paused?'paused':view.active?'active':'idle';
  }
  const text=view.connection+' · Selected '+view.selectedLabel+' · '+(view.active?'Active '+view.activeLabel:view.activeLabel)+' · '+view.telemetryLabel+' · '+view.reason;
  for(const summary of document.querySelectorAll('[data-control-summary]'))put(summary,text);
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
  const details=document.createElement('details');details.className='control-path-selector';details.dataset.controlSelector='';
  const summary=document.createElement('summary');summary.append('Input: ');
  const active=document.createElement('b');active.dataset.controlActive='';summary.append(active);
  const panel=document.createElement('div');panel.className='control-path-popover';
  const label=document.createElement('label');label.textContent='Control input';
  const select=document.createElement('select');select.setAttribute('aria-label','Control input path');select.append(new Option('Select input…',''));
  for(const p of policy.paths)select.append(new Option(p.label,p.id));label.append(select);
  const selected=document.createElement('span');selected.dataset.controlSelected='';
  const target=document.createElement('span');target.dataset.controlTarget='';
  const reason=document.createElement('p');reason.dataset.controlReason='';reason.setAttribute('role','status');
  const apply=document.createElement('button');apply.type='button';apply.dataset.controlApply='';apply.className='btn primary';
  select.addEventListener('change',()=>{details.dataset.dirty='1';message='';refresh()});
  apply.addEventListener('click',()=>void selectPath(select.value).catch(()=>{}));
  panel.append(label,selected,target,apply,reason);details.append(summary,panel);host.append(details);
 }
 function init(){
  mount(android?document.querySelector('.flight-brand'):document.getElementById('kitTopStatus'));
  if(!android){
   const compact=matchMedia('(max-width:950px)'),selector=document.querySelector('[data-control-selector]');
   const place=()=>{const host=compact.matches?document.querySelector('.topbar-main>.brand'):document.getElementById('kitTopStatus');if(host&&selector&&selector.parentElement!==host)host.append(selector)};
   place();compact.addEventListener('change',place);
  }
  for(const host of document.querySelectorAll('.dw-view-header,#tab-python .python-toolbar,#tab-python .python-target-row,#tab-pid .pid-workspace-header')){
   if(host.querySelector('[data-control-summary]'))continue;
   const line=document.createElement('small');line.dataset.controlSummary='';line.className='control-path-summary';host.append(line);
  }
  for(const event of ['dronelab:kit-link','dronelab:kit-access','dronelab:devices-view','zebjus:kit-status','dronelab:virtual-state'])root.addEventListener(event,refresh);
  refresh();setInterval(()=>{if(!document.hidden)refresh()},300);
 }
 root.ZebjusControlUI=Object.freeze({refresh,selectPath,snapshot:()=>view});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(globalThis);
