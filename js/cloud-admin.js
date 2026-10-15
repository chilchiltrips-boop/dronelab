/* Central school staff accounts are authenticated only by the deployed Node API.
 * This UI never embeds developer passwords or treats cloud login as USB Kit access.
 */
(function(root){
'use strict';
const host=document.getElementById('dw-body-security');
if(!host)return;
const panel=document.createElement('section');
panel.className='kit-card cloud-admin-card';
panel.id='cloudAdminCenter';
panel.setAttribute('aria-label','Central Developer and School Admin accounts');
panel.innerHTML=`
 <div class="kit-card-title"><span>WEBAPP SERVER • CENTRAL ACCESS</span><strong>Developer &amp; School Staff Accounts</strong></div>
 <p class="kit-hint">Sign in on the shared HTTPS DroneLab server from any laptop. Developer can add, reset and revoke staff accounts. This does not replace physical USB authorization for a Kit.</p>
 <p id="cloudAdminStatus" class="kit-hint" role="status" aria-live="polite">Checking central admin server…</p>
 <div id="cloudAdminLogin">
  <form id="cloudAdminLoginForm" autocomplete="on">
   <div class="kit-form-row">
    <label>Username<input id="cloudAdminUsername" name="username" autocomplete="username" value="developer" required maxlength="40"/></label>
    <label>Password<input id="cloudAdminPassword" name="password" type="password" autocomplete="current-password" required maxlength="128"/></label>
   </div>
   <div class="kit-actions"><button class="btn primary" type="submit">Sign in to WebApp Admin</button></div>
  </form>
 </div>
 <div id="cloudAdminDashboard" hidden>
  <p id="cloudAdminIdentity" class="kit-hint"></p>
  <div class="kit-actions"><button id="cloudAdminLogout" class="btn ghost" type="button">Sign Out</button></div>
  <form id="cloudAdminOwnPasswordForm">
   <div class="kit-card-title"><span>ACCOUNT SECURITY</span><strong>Change My Login Password</strong></div>
   <div class="kit-form-row">
    <label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required maxlength="128"/></label>
    <label>New password (12+ characters)<input name="newPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128"/></label>
   </div>
   <div class="kit-actions"><button class="btn ghost" type="submit">Change Password</button></div>
  </form>
  <div id="cloudAdminDeveloper" hidden>
   <form id="cloudAdminNewStaffForm">
    <div class="kit-card-title"><span>DEVELOPER ONLY</span><strong>Add School Staff Admin</strong></div>
    <div class="kit-form-row">
     <label>Staff username<input name="username" autocomplete="off" required maxlength="40" placeholder="school01_admin"/></label>
     <label>Initial staff password<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128"/></label>
    </div>
    <div class="kit-actions"><button class="btn primary" type="submit">Create Staff Admin</button></div>
   </form>
   <div class="kit-card-title"><span>REVOKABLE ACCOUNTS</span><strong>Manage School Admins</strong></div>
   <div id="cloudAdminUsers" class="kit-known-list">Loading staff accounts…</div>
  </div>
 </div>
 <p class="kit-hint">WebApp accounts are stored on the private server, not GitHub or in this browser. To manage a physical Kit, connect its USB cable and separately unlock its Teacher maintenance passphrase.</p>
`;
host.prepend(panel);
const $=id=>panel.querySelector('#'+id);
let logged=null,serverAvailable=false,busy=false;
function message(msg,tone='info'){
 const e=$('cloudAdminStatus');e.textContent=msg;e.dataset.tone=tone;
}
function reveal(){
 $('cloudAdminLogin').hidden=!!logged;
 $('cloudAdminDashboard').hidden=!logged;
 $('cloudAdminDeveloper').hidden=!(logged?.role==='developer');
 if(logged)$('cloudAdminIdentity').textContent='Signed in: '+logged.username+' • '+(logged.role==='developer'?'Developer / account owner':'School Staff Admin');
 // Cloud account login and physical USB Teacher Admin are distinct security
 // boundaries. Never hide the hardware maintenance accordion merely because
 // a cloud login session is unavailable (e.g. offline, unconfigured, or signed out).
 // The Kit firmware performs its own USB/teacher authorization checks.
}
async function api(path,method='GET',data){
 const headers={'Accept':'application/json'};
 if(method!=='GET'){headers['Content-Type']='application/json';headers['X-Zebjus-Admin-Request']='1'}
 const res=await fetch('/api/admin/'+path,{method,credentials:'same-origin',cache:'no-store',headers,body:data===undefined?undefined:JSON.stringify(data)});
 let dataOut;
 try{dataOut=await res.json()}catch{throw Error('Central Admin requires a deployed Node.js WebApp server. GitHub Pages cannot run this API.')}
 if(!res.ok)throw Error(dataOut?.error||'Admin request failed');
 return dataOut;
}
function clearForm(form){form?.reset()}
async function loadStaff(){
 if(logged?.role!=='developer')return;
 const data=await api('users'),list=$('cloudAdminUsers');
 list.replaceChildren();
 for(const user of data.users){
  const line=document.createElement('div');line.className='kit-actions';
  const name=document.createElement('span');name.textContent=user.username+' • '+user.role;
  line.append(name);
  if(user.role==='admin'){
   const reset=document.createElement('button');reset.type='button';reset.className='btn ghost';reset.textContent='Reset Password';
   reset.addEventListener('click',()=>run(async()=>{
    const next=await new Promise(resolve=>{
     const dialog=document.createElement('dialog'),form=document.createElement('form');
     form.method='dialog';
     const label=document.createElement('label');label.textContent='New password for '+user.username+' (12+ characters)';
     const field=document.createElement('input');field.type='password';field.required=true;field.minLength=12;field.maxLength=128;field.autocomplete='new-password';
     label.append(field);
     const row=document.createElement('div');row.className='kit-actions';
     const cancel=document.createElement('button');cancel.type='submit';cancel.value='cancel';cancel.textContent='Cancel';cancel.className='btn ghost';
     const save=document.createElement('button');save.type='submit';save.value='apply';save.textContent='Apply New Password';save.className='btn primary';
     row.append(cancel,save);form.append(label,row);dialog.append(form);document.body.append(dialog);
     dialog.addEventListener('close',()=>{const value=dialog.returnValue==='apply'?field.value:null;field.value='';dialog.remove();resolve(value)},{once:true});
     dialog.showModal();field.focus();
    });
    if(next===null)return;
    if(next.length<12||next.length>128)throw Error('Staff password must be 12–128 characters');
    if(!confirm('Reset password and revoke all active sessions for '+user.username+'?'))return;
    await api('users/'+user.id+'/password','POST',{password:next});
    message('Password reset. All previous sessions for '+user.username+' revoked.','good');
   }));
   const remove=document.createElement('button');remove.type='button';remove.className='btn danger ghost';remove.textContent='Remove Access';
   remove.addEventListener('click',()=>run(async()=>{
    if(!confirm('Permanently remove '+user.username+' and end their active sessions?'))return;
    await api('users/'+user.id,'DELETE',{});await loadStaff();
    message(user.username+' access removed and sessions revoked.','good');
   }));
   line.append(reset,remove);
  }
  list.append(line);
 }
}
async function run(fn){
 if(busy)return;busy=true;
 try{await fn()}catch(e){message(e.message,'error')}finally{busy=false}
}
async function refresh(){
 try{
  const session=await api('session');
  serverAvailable=session.available===true;logged=session.user||null;reveal();
  if(!serverAvailable)message('Central Admin is NOT configured on this WebApp host. GitHub Pages has no account server; deploy Node with private environment settings.','warn');
  else if(logged){message('Central server authenticated. Staff accounts work from other laptops using this same HTTPS URL.','good');await loadStaff()}
  else message('Central Admin online. Sign in with your Developer or assigned Staff username and password.','info');
 }catch(e){serverAvailable=false;logged=null;reveal();message(e.message,'warn')}
}
$('cloudAdminLoginForm').addEventListener('submit',e=>{
 e.preventDefault();const form=e.currentTarget;
 void run(async()=>{
  const username=form.elements.namedItem('username').value;
  const password=form.elements.namedItem('password').value;
  try{
   const data=await api('login','POST',{username,password});
   logged=data.user;serverAvailable=true;form.elements.namedItem('password').value='';
   reveal();await loadStaff();
   message('Signed in as '+logged.username+' on the central WebApp server.','good');
  }finally{form.elements.namedItem('password').value=''}
 });
});
$('cloudAdminLogout').addEventListener('click',()=>run(async()=>{
 await api('logout','POST',{});logged=null;reveal();message('Signed out of central Admin.','info')
}));
$('cloudAdminNewStaffForm').addEventListener('submit',e=>{
 e.preventDefault();const form=e.currentTarget;
 void run(async()=>{
  const username=form.elements.namedItem('username').value;
  const password=form.elements.namedItem('password').value;
  try{
   await api('users','POST',{username,password});clearForm(form);await loadStaff();
   message('Staff account '+username+' created. Share its password privately.','good');
  }finally{form.elements.namedItem('password').value=''}
 });
});
$('cloudAdminOwnPasswordForm').addEventListener('submit',e=>{
 e.preventDefault();const form=e.currentTarget;
 void run(async()=>{
  const currentPassword=form.elements.namedItem('currentPassword').value;
  const newPassword=form.elements.namedItem('newPassword').value;
  try{
   await api('password','POST',{currentPassword,newPassword});message('Login password changed on the central server.','good');
  }finally{clearForm(form)}
 });
});
void refresh();
})(window);
