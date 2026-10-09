/* ZEBJUS v1.4.3 Smart Two-Way QR • static GitHub Pages / no signaling server.
   Refresh clears all QR sessions, answer data, and control privileges. */
const $=id=>document.getElementById(id);
let host,offer='',expiryTimer=null,scanStop=null,answerProcessing=false,offerEpoch=0,pairMode='camera',codeBusy=false;
function stamp(text){const e=$('ledActivityLog');e.textContent=(e.textContent+'\n'+new Date().toLocaleTimeString()+'  '+text).slice(-6800);e.scrollTop=e.scrollHeight}
function status(text){
 $('pairStatus').textContent=text;$('pairTopStatus').textContent=text;
 const s=host?.status(),e=$('mobileHeaderStatus');
 e.textContent='Mobile: '+(s?.connected?(s.approved?'Connected':'Awaiting approval'):'Disconnected');
 e.className='qr-header-status '+(s?.connected?(s.approved?'good':'warn'):'disconnected');
}
function sync(){
 const s=host.status();
 $('ledBulb').classList.toggle('on',s.led);$('ledBulb').setAttribute('aria-label','Virtual LED '+(s.led?'on':'off'));
 $('ledState').textContent=s.led?'LED ON':'LED OFF';
 $('ledRevision').textContent='State revision '+s.revision;
 $('ledController').textContent='CONTROL: '+(s.controller||'none').toUpperCase();
 $('ledPeerState').textContent=s.connected?'MOBILE CONNECTED':'MOBILE DISCONNECTED';
 $('ledPeerState').classList.toggle('disconnected',!s.connected);
 $('ledControlNote').textContent=s.controller==='mobile'?'Android has exclusive control. Turn OFF Grant Mobile Control first.':s.controller==='web'?'Web App holds LED control.':'Take Control (Web) or grant control to the Android app.';
 $('webLedOn').disabled=s.controller!=='web';$('webLedOff').disabled=s.controller!=='web';
 $('ledRelease').disabled=!s.controller;$('pairReleaseBtn').disabled=!s.controller;
 $('pairConfirmBtn').disabled=!s.connected||s.approved;
 const toggle=$('topGrantMobileSwitch');toggle.checked=s.controller==='mobile';toggle.disabled=!s.connected||!s.approved;
 $('pairControlStatus').textContent='Controller: '+(s.controller||'none')+' • '+(s.approved?'Paired':'Not approved');
 $('pairDeviceList').replaceChildren();
 if(s.connected){
  const el=document.createElement('div');el.className='qr-device-item';
  const name=document.createElement('b');name.textContent='Android companion • '+(s.approved?'Paired':'Awaiting approval');
  const detail=document.createElement('small');detail.textContent='WebRTC encrypted P2P • controller: '+(s.controller||'none')+' • session '+s.sessionId;
  el.append(name,detail);$('pairDeviceList').append(el);
 }else $('pairDeviceList').textContent='No mobile device connected.';
 status($('pairStatus').textContent);
}
function go(section){document.querySelector('.tab[data-tab="'+section+'"]')?.click();location.hash='#'+section}
function callbacks(){
 return {
  status:s=>{status(s);sync()},
  connected:()=>{status('Connected • verify code');$('pairAnswerState').textContent='Connected! Verify the same six-digit PIN, then Confirm Pairing.';stamp('WebRTC connected via QR response');sync()},
  paired:()=>{status('Connected • paired');stamp('Pairing approved, mobile needs control permission');sync()},
  led:v=>{sync();stamp('LED '+(v.led?'ON':'OFF')+' • rev '+v.revision+' • '+v.origin)},
  control:()=>{sync();stamp('Control: '+(host.status().controller||'none'))},
  controlRequest:d=>{$('pairAnswerState').textContent='Android requested control: turn ON the header Grant Mobile Control toggle.';stamp('Mobile requests control • '+d.deviceId);sync()},
  heartbeat:at=>$('pairHeartbeat').textContent='Last heartbeat: '+new Date(at).toLocaleTimeString(),
  reconnecting:()=>{status('Reconnecting • control released');sync()},
  disconnected:reason=>{status('Disconnected');stamp(reason);sync();$('pairAnswerState').textContent='Connection lost. Pair Mobile → new QR.'},
  error:reason=>{$('pairAnswerState').textContent=reason;stamp('Pairing error: '+reason);sync()}
 };
}
function startHost(){host=ZebjusP2P.session('host',callbacks());sync()}
function selectMode(mode){
 pairMode=mode==='code'?'code':'camera';
 const camera=pairMode==='camera';
 $('pairCameraMode').className='btn '+(camera?'primary':'ghost');
 $('pairCodeMode').className='btn '+(!camera?'primary':'ghost');
 $('pairCameraMode').setAttribute('aria-pressed',String(camera));
 $('pairCodeMode').setAttribute('aria-pressed',String(!camera));
 $('pairCameraSection').hidden=!camera;$('pairCodeSection').hidden=camera;
 $('pairStep2Title').textContent=camera?'Step 2 • Scan Phone QR':'Step 2 • Type Android Code';
 if(!camera){stopCamera();if(!host.status().paired)$('pairAnswerState').textContent='Type the Android 6-digit CONNECT code. No webcam needed.'}
 else if(offer&&!host.status().paired)$('pairAnswerState').textContent='Step 2 ready • Show Android Phone QR, then click Start Camera.';
}
async function connectWithCode(){
 const raw=$('pairPhoneCode').value.replace(/\D/g,'').slice(0,6);
 if(!ZebjusCodePair.validCode(raw)){ $('pairCodeStatus').textContent='Enter the 6 digits displayed on Android.';return }
 const state=host.status(),ticket=offerEpoch;
 if(!offer||!state.sessionId||!state.expires){$('pairCodeStatus').textContent='Click Pair Mobile to create a Web QR first.';return}
 if(state.paired||state.connected){$('pairCodeStatus').textContent='Already connected; confirm existing session.';return}
 if(codeBusy)return;
 codeBusy=true;$('pairConnectCodeBtn').disabled=true;
 try{
  const answer=await ZebjusCodePair.resolveAnswer({
   offer,code:raw,sid:state.sessionId,expires:state.expires,
   onStatus:s=>{if(ticket===offerEpoch)$('pairCodeStatus').textContent=s}
  });
  if(ticket!==offerEpoch)return;
  $('pairCodeStatus').textContent='Answer authenticated • waiting for WebRTC connection…';
  await receiveResponse(answer);
 }catch(error){
  if(ticket===offerEpoch){
   $('pairCodeStatus').textContent='Code pairing failed: '+error.message+'. Check both devices have Internet or use Camera mode.';
   stamp('Six-digit code error: '+error.message);
  }
 }finally{codeBusy=false;$('pairConnectCodeBtn').disabled=!ZebjusCodePair.validCode($('pairPhoneCode').value)}
}

function stopCamera(){
 ZebjusQR.stop();scanStop=null;
 $('pairScanFrame')?.classList.remove('scanning');
 if($('pairScanPlaceholder'))$('pairScanPlaceholder').hidden=false;
}
async function receiveResponse(raw){
 if(answerProcessing)return;
 const ticket=offerEpoch;answerProcessing=true;stopCamera();
 $('pairAnswerState').textContent='Reading phone QR and establishing encrypted connection…';
 try{
  if(!offer)throw Error('Create a Web QR first');
  await host.receiveAnswer(raw);
  if(ticket!==offerEpoch)return;
  $('pairAnswerText').value=raw;
  $('pairAnswerState').textContent='Response accepted. Wait for Connected → Confirm Pairing.';
  stamp('Phone response QR verified (session + PIN)');
 }catch(err){
  if(ticket!==offerEpoch)return;
  $('pairAnswerState').textContent='Phone QR not accepted: '+err.message+'. Click Start Camera to retry.';
  stamp('Rejected QR: '+err.message);
 }finally{answerProcessing=false;sync()}
}
async function scanResponse(){
 if(pairMode!=='camera')return;
 stopCamera();
 if(!host.status().sessionId){$('pairAnswerState').textContent='Click Pair Mobile to create a fresh QR first.';return}
 if(host.status().paired){$('pairAnswerState').textContent='Already paired. Disconnect before scanning another phone.';return}
 $('pairScanAnswerBtn').disabled=true;
 $('pairAnswerState').textContent='Step 2 initializing • allow laptop camera permission…';
 $('pairScanFrame')?.classList.add('scanning');
 if($('pairScanPlaceholder'))$('pairScanPlaceholder').hidden=true;
 try{
  scanStop=await ZebjusQR.scan({
   video:$('pairScanVideo'),canvas:$('pairScanCanvas'),
   onData:text=>{stopCamera();$('pairAnswerState').textContent='QR detected instantly • verifying WebRTC response…';void receiveResponse(text)},
   onError:err=>{$('pairAnswerState').textContent='Camera error: '+err.message},
   onStatus:message=>{$('pairAnswerState').textContent=message}
  });
 }catch(err){
  stopCamera();
  $('pairAnswerState').textContent='Laptop camera unavailable: '+err.message+'. Use Advanced → manual response as a fallback.';
  stamp('Laptop camera blocked/unavailable: '+err.message);
 }finally{$('pairScanAnswerBtn').disabled=false}
}
async function createOffer(){
 const ticket=++offerEpoch;
 $('pairCreateBtn').disabled=true;stopCamera();answerProcessing=false;
 offer='';$('pairOfferText').value='';$('pairAnswerText').value='';$('pairCode').textContent='------';
 $('pairPhoneCode').value='';$('pairConnectCodeBtn').disabled=true;
 $('pairOfferCanvas').hidden=true;$('pairOfferBox').querySelector('p')?.removeAttribute('hidden');
 $('pairAnswerState').textContent='Preparing new QR…';host.close('Starting fresh QR pairing');
 try{
  const data=await host.makeOffer();
  if(ticket!==offerEpoch)return;
  offer=data.qr;
  $('pairOfferText').value=data.qr;$('pairCode').textContent=data.pin;
  ZebjusQR.draw($('pairOfferCanvas'),data.qr);
  $('pairOfferCanvas').hidden=false;$('pairOfferBox').querySelector('p')?.setAttribute('hidden','');
  $('pairAnswerState').textContent='Step 1 ready. Scan the Web QR with Android. When Phone Response QR appears, initialize Step 2 by clicking Start Camera.';
  status('Waiting for Android QR');go('settings');
  stamp('Web QR ready; expiry in 3 minutes');
  // The webcam must NEVER open during Step 1. Step 2 explicitly starts it.
  if(pairMode==='camera')$('pairAnswerState').textContent='Step 2 ready • Show Android Phone QR, then press Start Camera.';
  else $('pairCodeStatus').textContent='Web QR ready. Scan it on Android; type the phone CONNECT code here.';
 }catch(err){$('pairAnswerState').textContent='Could not generate QR: '+err.message;stamp('QR failure: '+err.message)}
 finally{$('pairCreateBtn').disabled=false;sync()}
}
function disconnect(reason='Disconnected by Web App'){
 ++offerEpoch;stopCamera();host.close(reason);offer='';answerProcessing=false;
 $('pairOfferCanvas').hidden=true;$('pairOfferBox').querySelector('p')?.removeAttribute('hidden');
 $('pairOfferText').value='';$('pairAnswerText').value='';$('pairCode').textContent='------';
 $('pairPhoneCode').value='';$('pairConnectCodeBtn').disabled=true;
 $('pairExpiry').textContent='New QR required';$('pairAnswerState').textContent=reason;
 status('Disconnected');sync();
}
async function showVersion(){try{const r=await fetch('./app-version.json',{cache:'no-store'});if(r.ok){const meta=await r.json();$('webappVersion').textContent='v'+meta.version+' • '+meta.channel.toUpperCase()}}catch{}}
function bind(){
 $('topPairMobileBtn').onclick=()=>{go('settings');void createOffer()};
 $('pairCreateBtn').onclick=createOffer;
 $('pairCameraMode').onclick=()=>selectMode('camera');
 $('pairCodeMode').onclick=()=>selectMode('code');
 $('pairPhoneCode').oninput=()=>{const e=$('pairPhoneCode');e.value=e.value.replace(/\D/g,'').slice(0,6);$('pairConnectCodeBtn').disabled=!ZebjusCodePair.validCode(e.value)||codeBusy};
 $('pairConnectCodeBtn').onclick=()=>void connectWithCode();
 $('pairPhoneCode').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void connectWithCode()}};
 $('pairCancelBtn').onclick=()=>disconnect('Pairing cancelled');
 $('pairDisconnectBtn').onclick=()=>disconnect('Disconnected');
 $('pairRejectBtn').onclick=()=>{host.decline();disconnect('Pairing rejected')};
 $('pairScanAnswerBtn').onclick=scanResponse;
 $('pairStopScanBtn').onclick=()=>{stopCamera();$('pairAnswerState').textContent='Camera closed; click Start Camera to resume.'};
 $('pairUseAnswerBtn').onclick=()=>{const txt=$('pairAnswerText').value.trim();if(txt)void receiveResponse(txt);else $('pairAnswerState').textContent='Paste Android QR answer text first.'};
 $('pairCopyOfferBtn').onclick=async()=>{try{await ZebjusQR.copy(offer);$('pairAnswerState').textContent='Web QR offer copied to clipboard.'}catch(err){$('pairAnswerState').textContent='Copy failed: '+err.message}};
 $('pairConfirmBtn').onclick=()=>{try{host.approvePairing();status('Connected • paired');stopCamera()}catch(err){$('pairAnswerState').textContent=err.message}sync()};
 $('topGrantMobileSwitch').onchange=e=>{
  if(e.target.checked){if(host.grantMobileControl())stamp('Android control ON');else stamp('Pair first')}
  else{host.releaseControl();stamp('Android control OFF')}
  sync();
 };
 $('ledTakeWeb').onclick=$('pairTakeWebBtn').onclick=()=>{if(!host.takeWebControl())stamp('Release Android control first');sync()};
 $('ledRelease').onclick=$('pairReleaseBtn').onclick=()=>{host.releaseControl();sync()};
 $('webLedOn').onclick=()=>{host.toggleWebLed(true);sync()};
 $('webLedOff').onclick=()=>{host.toggleWebLed(false);sync()};
 $('ledGoSettings').onclick=()=>go('settings');
 expiryTimer=setInterval(()=>{
  const s=host.status();if(s.expires&&!s.approved){
   const remain=Math.max(0,Math.ceil((s.expires-Date.now())/1000));
   $('pairExpiry').textContent='QR expires in '+remain+' seconds';
   if(remain===0)disconnect('QR expired; tap Pair Mobile for a fresh QR');
  }
  if(s.connected&&s.lastHeartbeat&&Date.now()-s.lastHeartbeat>9500)$('pairHeartbeat').textContent='Heartbeat delayed; check Wi-Fi';
 },1000);
 window.addEventListener('pagehide',()=>{++offerEpoch;stopCamera();host?.close('Web App refreshed');clearInterval(expiryTimer)});
}
function init(){if(!$('topPairMobileBtn'))return;startHost();bind();selectMode('camera');void showVersion();status('Disconnected');sync()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
