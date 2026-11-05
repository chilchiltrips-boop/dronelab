// Page-level actions: no browser dialogs, overlays or automatic approvals.
(function(root){
 'use strict';
 const doc=root.document;if(!doc||root.AerionDialogs?.mode==='inline')return;
 let pending=null,notice=null,sequence=0;
 const styles=doc.createElement('style');styles.id='aerion-inline-ui-style';
 styles.textContent=`.aerion-inline-action{position:static!important;inset:auto!important;transform:none!important;box-sizing:border-box;width:100%;min-width:0!important;max-width:none!important;grid-column:1/-1;flex:1 0 100%;margin:10px 0!important;padding:13px 15px;border:1px solid #53766e;border-radius:9px;background:#102b30;color:#e3f1ed;font:13px/1.5 system-ui,sans-serif;box-shadow:none!important}.aerion-inline-action[hidden],.aerion-inline-page[hidden]{display:none!important}.aerion-inline-page{position:static!important;inset:auto!important;transform:none!important;width:100%!important;min-width:0!important;max-width:none!important;height:100dvh!important;min-height:100dvh!important;max-height:none!important;margin:0!important;box-sizing:border-box;border:0!important;border-radius:0!important;overflow:auto!important;resize:none!important;background:#09131e}.aerion-inline-action p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:inherit}.aerion-inline-action label{display:block;margin-top:10px;color:inherit}.aerion-inline-action input:not([type=checkbox]):not([type=radio]):not([type=range]){box-sizing:border-box;display:block;width:100%;margin-top:5px;min-height:38px;padding:8px 10px;background:#091e29;color:#ecf5f2;border:1px solid #52756e;border-radius:6px;font:inherit}.aerion-inline-action input:focus-visible,.aerion-inline-action button:focus-visible{outline:2px solid #71e1c2;outline-offset:3px}.aerion-inline-buttons{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}.aerion-inline-buttons button{min-height:36px;padding:7px 13px;border:1px solid #4f8b7d;border-radius:6px;background:#236a59;color:#f2fff9;font:600 12px system-ui,sans-serif;cursor:pointer}.aerion-inline-buttons .aerion-inline-cancel{background:#142e3c;border-color:#496476}.aerion-inline-action[data-danger=true]{border-color:#aa7451;background:#30271e}.aerion-inline-error{margin-top:7px!important;color:#ffc3b4!important}.aerion-inline-error:empty{display:none}.aerion-inline-notice{background:#152b3a;border-color:#4a687e}`;
 (doc.head||doc.documentElement).append(styles);
 const kitKey=()=>{
  try{
   const k=root.ZebjusKits?.getState?.(),serial=root.DroneLabSerial;
   let usb=null;try{usb=root.ZebjusKits?.getUsbMonitorState?.();}catch{/* An absent USB link is normal on AP/STA. */}
   return JSON.stringify([k?.kitId,k?.bootId,k?.transport,k?.connectionGeneration,k?.generation,k?.connected,usb?.kitId,usb?.bootId,serial?.generation?.(),serial?.isOpen?.()]);
  }catch{return null;}
 };
 function place(panel,options={}){
  const focused=doc.activeElement;
  const owner=focused?.closest?.('.aerion-inline-page[open],dialog[open],.tab-panel.active')||doc.querySelector('.aerion-inline-page[open]')||doc.querySelector('dialog[open],.tab-panel.active')||doc.querySelector('main')||doc.body;
  const host=typeof options.host==='function'?options.host():options.host;
  if(host?.isConnected)host.append(panel);
  else if(owner.id==='tab-python'&&owner.querySelector('.python-project-bar'))owner.querySelector('.python-project-bar').append(panel);
  else{
   const row=focused?.closest?.('.kit-actions,.a2-actions,.fw-actions,.terminal-toolbar-actions');
   if(row&&owner.contains(row))row.after(panel);
   else (owner.querySelector?.('[data-panel]:not([hidden])')||owner).append(panel);
  }
  return {owner,focused};
 }
 function visible(owner){return owner.isConnected&&!owner.hidden&&(!owner.classList.contains('tab-panel')||owner.classList.contains('active'))&&(!owner.matches('dialog')||owner.open);}
 function request(kind,message,value='',options={}){
  pending?.cancel();
  return new Promise(resolve=>{
   const panel=doc.createElement('section'),form=doc.createElement('form'),body=doc.createElement('p');
   const id='aerion-inline-'+(++sequence);panel.className='aerion-inline-action';panel.dataset.kind=kind;panel.dataset.danger=String(!!options.danger);
   panel.setAttribute('role','region');panel.setAttribute('aria-label',kind==='prompt'?'Enter a value':'Confirm action');panel.setAttribute('aria-labelledby',id);
   body.id=id;body.textContent=String(message);form.noValidate=true;form.append(body);
   let field=null;
   if(kind==='prompt'){
    const label=doc.createElement('label');label.textContent=options.label||'Value';field=doc.createElement('input');
    field.type=options.type==='password'?'password':'text';field.value=String(value??'');field.autocomplete=options.autocomplete||'off';
    field.maxLength=options.maxLength||1024;field.readOnly=!!options.readOnly;
    if(options.inputMode)field.inputMode=options.inputMode;
    label.append(field);form.append(label);
   }
   const error=doc.createElement('p');error.className='aerion-inline-error';error.setAttribute('role','status');form.append(error);
   const buttons=doc.createElement('div');buttons.className='aerion-inline-buttons';
   const accept=doc.createElement('button'),cancel=doc.createElement('button');
   accept.type='submit';accept.textContent=options.confirmLabel||'Continue';accept.dataset.inlineAccept='';
   cancel.type='button';cancel.className='aerion-inline-cancel';cancel.textContent=options.cancelLabel||'Cancel';cancel.dataset.inlineCancel='';
   buttons.append(accept,cancel);form.append(buttons);panel.append(form);
   const {owner,focused}=place(panel,options),binding=options.kitBound===false?'':kitKey();
   let settled=false,timer=null;
   const cancelled=kind==='prompt'?null:false;
   const valid=()=>{
    try{return !doc.hidden&&visible(owner)&&panel.isConnected&&panel.getClientRects().length>0&&(options.kitBound===false||binding!==null&&kitKey()===binding)&&(!options.guard||options.guard());}catch{return false;}
   };
   const finish=(result,restore=false)=>{
    if(settled)return;settled=true;clearInterval(timer);
    doc.removeEventListener('visibilitychange',check);root.removeEventListener('pagehide',abort);root.removeEventListener('hashchange',check);
    options.signal?.removeEventListener('abort',abort);
    if(pending?.panel===panel)pending=null;
    if(field)field.value='';panel.remove();
    if(restore&&focused?.isConnected&&visible(owner))focused.focus?.({preventScroll:true});
    resolve(result);
   };
   const abort=()=>finish(cancelled);
   const check=()=>{if(!valid())abort();};
   form.addEventListener('submit',event=>{
    event.preventDefault();if(!valid()){abort();return;}
    const result=field?field.value:true;
    let reason='';
    if(field&&options.required&&!result.trim())reason='Enter a value to continue.';
    if(field&&options.minLength&&result.length<options.minLength)reason=`Use at least ${options.minLength} characters.`;
    if(field&&options.maxLength&&result.length>options.maxLength)reason=`Use at most ${options.maxLength} characters.`;
    if(!reason&&options.validate)reason=options.validate(result)||'';
    if(reason){error.textContent=String(reason);field?.setAttribute('aria-invalid','true');field?.focus();return;}
    finish(result,true);
   });
   field?.addEventListener('input',()=>{error.textContent='';field.removeAttribute('aria-invalid');});
   cancel.addEventListener('click',()=>finish(cancelled,true));
   panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(cancelled,true);}});
   pending={panel,cancel:abort};
   doc.addEventListener('visibilitychange',check);root.addEventListener('pagehide',abort);root.addEventListener('hashchange',check);
   options.signal?.addEventListener('abort',abort,{once:true});
   timer=setInterval(check,100);
   if(options.signal?.aborted||!valid()){abort();return;}
   panel.scrollIntoView?.({block:'nearest'});
   (field||cancel).focus({preventScroll:true});field?.select();
  });
 }
 function notify(message,options={}){
  notice?.remove();const panel=doc.createElement('section');panel.className='aerion-inline-action aerion-inline-notice';panel.setAttribute('role','status');
  const text=doc.createElement('p');text.textContent=String(message);
  const row=doc.createElement('div');row.className='aerion-inline-buttons';const close=doc.createElement('button');close.type='button';close.textContent='Dismiss';close.className='aerion-inline-cancel';
  close.addEventListener('click',()=>{panel.remove();if(notice===panel)notice=null;});row.append(close);panel.append(text,row);place(panel,options);notice=panel;return panel;
 }
 function mount(panel,options={}){
  if(options.page&&panel.open&&!panel.hidden)return panel;
  panel.classList.add(options.page?'aerion-inline-page':'aerion-inline-action');panel.hidden=false;panel.open=true;panel.setAttribute('open','');const {focused}=place(panel,options);
  const previous=options.page?[...doc.body.children].filter(node=>node!==panel&&!['SCRIPT','STYLE','LINK'].includes(node.tagName)).map(node=>({node,hidden:node.hidden,display:node.style.getPropertyValue('display'),priority:node.style.getPropertyPriority('display')})):[];
  for(const {node} of previous){node.hidden=true;node.style.setProperty('display','none','important');}
  panel.close=()=>{
   if(!panel.open){panel.hidden=true;return;}
   panel.hidden=true;panel.open=false;panel.removeAttribute('open');
   for(const old of previous)if(old.node.isConnected){old.node.hidden=old.hidden;if(old.display)old.node.style.setProperty('display',old.display,old.priority);else old.node.style.removeProperty('display');}
   panel.dispatchEvent(new Event('close'));
   if(options.page&&focused?.isConnected&&!focused.closest('[hidden]'))focused.focus?.({preventScroll:true});
  };
  if(!panel.dataset.inlineEscape){panel.dataset.inlineEscape='true';panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();panel.dispatchEvent(new Event('cancel',{cancelable:true}));panel.close();}});}
  if(options.page){panel.tabIndex=-1;panel.focus({preventScroll:true});}
  return panel;
 }
 root.AerionDialogs=Object.freeze({mode:'inline',confirm:(message,options)=>request('confirm',message,'',options),prompt:(message,value,options)=>request('prompt',message,value,options),notify,mount,cancel:()=>pending?.cancel()});
})(typeof window!=='undefined'?window:globalThis);
