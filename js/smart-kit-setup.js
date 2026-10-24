/* Guided physical USB setup, using the existing firmware admin contract. */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id),api=()=>root.ZebjusKits,policy=()=>root.ZebjusSmartKitPolicy;
 if(!$('smartKitSetup'))return;
 let boundId='',busy=false,dirty=false,result=null,message='',messageTone='';
 const set=(id,value)=>{const el=$(id),text=String(value??'—');if(el&&el.textContent!==text)el.textContent=text};
 const fields=()=>({expectedId:boundId,name:$('smartKitName').value,prefix:$('smartApPrefix').value,
  password:$('smartApPassword').value,teacher:$('smartTeacher').value,enrollConsent:$('smartEnrollConsent').checked});
 const clearSecrets=()=>{for(const id of ['smartApPassword','smartTeacher','smartTeacherConfirm'])$(id).value='';$('smartApPassword').type='password';$('smartShowPassword').setAttribute('aria-pressed','false')};
 function render(){
  const s=api()?.usbSetupState?.();if(!s)return;
  if(s.verified&&s.kitId!==boundId){
   if(boundId)message='Different USB Kit verified. Review its settings before saving.';
   boundId=s.kitId;dirty=false;result=null;clearSecrets();if($('smartTeacherVerify'))$('smartTeacherVerify').open=false;
   $('smartKitName').value=s.kitName||'';
   $('smartApPrefix').value=s.apSsid===s.prefix+'-'+s.kitCode?s.prefix:'';
   $('smartEnrollConsent').checked=false;
  }else if(s.verified&&!dirty&&!busy&&s.readAt){
   if($('smartKitName').value!==s.kitName)$('smartKitName').value=s.kitName||'';
   if(!$('smartApPrefix').value&&s.apSsid===s.prefix+'-'+s.kitCode)$('smartApPrefix').value=s.prefix;
  }
  set('smartKitConnection',s.verified?s.board+' • '+s.version+' • USB VERIFIED':'USB verification required');
  set('smartKitId',s.verified?s.kitId:'—');set('smartCurrentAp',s.verified?s.apSsid||'Read current Kit settings':'—');
  set('smartNetworkState',s.verified?'AP '+(s.apActive?'ON':'OFF')+' • STA '+(s.staConnected?s.staIp||'CONNECTED':'OFFLINE'):'Connect the intended A1/A2 board.');
  $('smartApPrefix').placeholder=s.board==='ZFC-A2'?'Example: ZEBJUS-A2-LAB':'Example: ZEBJUS-A1-LAB';
  const first=s.enrolled===false;$('smartFirstEnrollment').hidden=!first;
  $('smartTeacher').autocomplete=first?'new-password':'current-password';
  set('smartTeacherLabel',first?'Create Teacher Passphrase':'Teacher Passphrase');
  let reason=s.reason;
  try{
   const f=fields(),v=policy().validate(f);
   set('smartSsidPreview',s.verified?policy().preview(f,s):'Connect USB to preview');
   if(s.available){
    var changed=v.password||v.name&&v.name!==s.kitName||v.prefix&&(v.prefix!==s.prefix||s.apSsid!==v.prefix+'-'+s.kitCode);
    reason=!changed?'Edit the Kit Name, AP prefix or password to save.':!v.teacher?'Enter '+(first?'a new':'the existing')+' Teacher Passphrase.':
     first&&(!f.enrollConsent||$('smartTeacherConfirm').value!==v.teacher)?'Confirm the new passphrase and first-time enrollment.':'Ready to verify Teacher and save.';
   }
   $('smartSave').disabled=busy||!s.available||!changed||!v.teacher||first&&(!f.enrollConsent||$('smartTeacherConfirm').value!==v.teacher);
  }catch(e){reason=e.message;set('smartSsidPreview','Check AP prefix');$('smartSave').disabled=true;}
  for(const id of ['smartKitName','smartApPrefix','smartApPassword','smartTeacher','smartTeacherConfirm','smartEnrollConsent','smartGeneratePassword','smartShowPassword'])$(id).disabled=busy||!s.available;
  $('smartConnectUsb').disabled=busy||s.busy;
  if($('smartReview'))$('smartReview').disabled=busy||!s.available||!changed;
  set('smartSaveReason',reason);set('smartProgress',busy?'Working on verified USB Kit…':message||reason);
  $('smartProgress').dataset.tone=messageTone;
  const names=api()?.getDiscovered?.()||[];
  const duplicate=names.some(k=>k.kitId!==boundId&&String(k.kitName).toLowerCase()===$('smartKitName').value.trim().toLowerCase());
  set('smartNameWarning',duplicate?'Another discovered Kit uses this name. Use a board-specific name; Device ID remains authoritative.':'');
  if(result){
   const verified=result.verified||s.verified&&s.kitId===result.kitId&&s.readAt>result.savedAt&&s.apSsid===result.expectedSsid;
   set('smartResult',verified?(result.rebooting?'AP SSID verified after restart; password save acknowledged on ':'Settings verified on ')+result.kitId+'. AP Wi-Fi: '+result.expectedSsid:
    'Restart acknowledged. Expected AP Wi-Fi: '+result.expectedSsid+'. Connect Kit via USB again to verify this Device ID; then join the new Wi-Fi using your new password.');
   $('smartResult').hidden=false;
  }
 }
 async function perform(action){
  if(busy)return;busy=true;message='';messageTone='';
  try{
   // Start before rendering/awaiting so port selection retains user activation.
   const operation=action();render();await operation;
  }catch(e){message=e.message||String(e);messageTone='error';}
  finally{busy=false;render();}
 }
 $('smartConnectUsb').addEventListener('click',()=>void perform(async()=>{
  await api().connectSetupUsb();message='USB identity and current settings verified. Edit the fields below.';
 }));
 $('smartReview')?.addEventListener('click',()=>{if($('smartTeacherVerify'))$('smartTeacherVerify').open=true;$('smartTeacher').focus();});
 $('smartSave').addEventListener('click',()=>void perform(async()=>{
  const input=fields();
  try{result=await api().saveUsbSetup(input);dirty=false;message='Settings saved. '+(result.rebooting?'Kit restarting.':'Fresh USB read-back confirmed.');messageTone='good';}
  finally{input.password='';input.teacher='';clearSecrets();}
 }));
 for(const id of ['smartKitName','smartApPrefix','smartApPassword','smartTeacher','smartTeacherConfirm','smartEnrollConsent'])
  $(id).addEventListener('input',()=>{dirty=true;message='';render()});
 $('smartShowPassword').addEventListener('click',()=>{const show=$('smartApPassword').type==='password';$('smartApPassword').type=show?'text':'password';$('smartShowPassword').setAttribute('aria-pressed',String(show));set('smartShowPassword',show?'Hide password':'Show password')});
 $('smartGeneratePassword').addEventListener('click',()=>{
  const bytes=new Uint8Array(24);root.crypto.getRandomValues(bytes);
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_';
  $('smartApPassword').value=Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');dirty=true;message='Strong password generated. Use Show password to copy it securely.';render();
 });
 root.addEventListener('pagehide',clearSecrets);
 root.addEventListener('dronelab:usb-state',e=>{if(e.detail?.connected===false){clearSecrets();render();}});
 root.addEventListener('dronelab:kit-link',()=>{const s=api()?.usbSetupState?.();if(!s?.verified)clearSecrets();render()});
 root.addEventListener('dronelab:devices-view',e=>{if(e.detail?.name==='wifi'&&api()?.usbSetupState?.().available&&!api()?.usbSetupState?.().readAt)void perform(()=>api().readUsbSetup());render()});
 render();root.setInterval(render,750);
})(window);
