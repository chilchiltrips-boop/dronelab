/* ZEBJUS v1.4.5 Smart Mobile Pairing • direct QR / optional online code signaling.
   Refresh clears all QR sessions, answer data, and control privileges. */
const $=id=>document.getElementById(id);
let host,offer='',expiryTimer=null,scanStop=null,answerProcessing=false,offerEpoch=0,pairMode='code',codeBusy=false,codeAbort=null,scanEpoch=0,cameraStarting=false,creatingOffer=false,answerAccepted=false,connectionTimer=null;
let simulatorReady=false,lastSimulatorFrame=0,pendingSimulator=new Map(),flightWatchdog=null;
function frame(){return document.getElementById('simRemoteFrame')}
function stopSimulatorRemote(reason='Control lost'){
 for(const p of pendingSimulator.values()){clearTimeout(p.timer);p.resolve({accepted:false,reason})}
 pendingSimulator.clear();lastSimulatorFrame=0;
 if(simulatorReady)frame()?.contentWindow?.postMessage({type:'ZJ_SIM_STOP',reason},location.origin);
 const status=document.getElementById('simControlInfo');if(status)status.textContent='STOP • '+reason;
}
function forwardSimulatorControl(m){
 if(!simulatorReady||!frame()?.contentWindow)return {accepted:false,reason:'Open ANDROID FLIGHT page on Web App'};
 return new Promise(resolve=>{
  const timer=setTimeout(()=>{pendingSimulator.delete(m.seq);resolve({accepted:false,reason:'Simulator did not acknowledge'})},650);
  pendingSimulator.set(m.seq,{resolve,timer});lastSimulatorFrame=performance.now();
  frame().contentWindow.postMessage({type:'ZJ_SIM_CONTROL',...m},location.origin);
 });
}
function onSimulatorMessage(event){
 if(event.origin!==location.origin||event.source!==frame()?.contentWindow)return;
 const m=event.data;if(!m||typeof m!=='object')return;
 if(m.type==='ZJ_TRIPOD_READY'){
  simulatorReady=true;host?.setSimulatorReady(true);const e=document.getElementById('simReceiverState');if(e)e.textContent='SIMULATOR READY • VIRTUAL ONLY';
 }else if(m.type==='ZJ_SIM_ACK'){
  const p=pendingSimulator.get(m.seq);if(!p)return;
  clearTimeout(p.timer);pendingSimulator.delete(m.seq);p.resolve(m);
  const e=document.getElementById('simControlInfo');if(e)e.textContent=m.accepted?
   'Mobile control #'+m.seq+' • '+m.applied.mode.toUpperCase()+' • '+m.applied.throttle+' µs • '+(m.applied.armed?'VIRTUAL ARMED':'DISARMED'):
   'Control denied: '+(m.reason||'Unknown');
 }
}
function openStep(number){
 const s=host.status();
 if((number===2&&!offer)||(number===3&&!s.connected))return;
 for(let i=1;i<=3;i++)$('pairStep'+i).open=i===number;
 if(number!==2)stopCamera();
}
function cancelCode(){codeAbort?.abort();codeAbort=null;codeBusy=false;if($('pairConnectCodeBtn'))$('pairConnectCodeBtn').textContent='Connect with Code'}
function clearOfferUi(){
 clearTimeout(connectionTimer);connectionTimer=null;
 $('pairOfferCanvas').hidden=true;$('pairOfferBox').querySelector('p')?.removeAttribute('hidden');
 $('pairOfferText').value='';$('pairAnswerText').value='';$('pairCode').textContent='------';
 $('pairPhoneCode').value='';$('pairExpiry').textContent='New QR required';$('pairHeartbeat').textContent='Last heartbeat: —';
 openStep(1);
}
function stamp(text){const e=$('ledActivityLog');e.textContent=(e.textContent+'\n'+new Date().toLocaleTimeString()+'  '+text).slice(-6800);e.scrollTop=e.scrollHeight}
function scanFeedback(text,state='waiting'){
 const target=$('pairScanHint');if(!target)return;
 target.textContent=text;target.dataset.status=state;
}
function status(text){
 $('pairStatus').textContent=text;$('pairTopStatus').textContent=text;
 $('pairTopStatus').dataset.status=host?.status()?.approved?'success':host?.status()?.connected?'ready':'waiting';
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
 const confirm=$('pairConfirmBtn'),panel=$('pairConfirmPanel'),hint=$('pairConfirmHint');
 confirm.disabled=!s.connected||s.approved;
 panel.classList.toggle('ready',s.connected&&!s.approved);
 panel.classList.toggle('confirmed',s.approved);
 panel.classList.toggle('waiting',!s.connected);
 confirm.classList.toggle('ready',s.connected&&!s.approved);
 confirm.textContent=s.approved?'✓ Pairing Confirmed':s.connected?'✓ Confirm Pairing Now':'Waiting for Connection';
 hint.textContent=s.approved?'Paired successfully • Android can request control':s.connected?'✓ ANDROID CONNECTED • Compare the Safety Verification PIN on both screens, then press the glowing Confirm Pairing button.':'Step 1: Android scans Web QR → Step 2: enter CONNECT code → Confirm Pairing unlocks automatically.';
 $('pairConnectCodeBtn').classList.toggle('is-ready',pairMode==='code'&&offer&&!codeBusy&&ZebjusCodePair.validCode($('pairPhoneCode').value));
 $('pairCreateBtn').disabled=creatingOffer;
 $('topPairMobileBtn').disabled=creatingOffer;
 $('pairCancelBtn').disabled=!creatingOffer&&!offer&&!s.connected;
 $('pairDisconnectBtn').disabled=!offer&&!s.connected;
 $('pairRejectBtn').disabled=!s.connected;
 $('pairStep1NextBtn').disabled=!offer||creatingOffer;
 $('pairStep1NextBtn').textContent=pairMode==='camera'?'Next • Scan Phone QR':'Next • Enter CONNECT Code';
 $('pairStep1State').textContent=s.approved?'QR exchanged':offer?'QR ready':'Start here';
 $('pairStep2State').textContent=s.connected?'Connected':answerAccepted?'Connecting…':offer?'Ready':'Create QR first';
 $('pairStep3State').textContent=s.approved?'Paired':s.connected?'Verify Safety PIN':'Connect first';
 $('pairVerifyPin').textContent=s.pin||'------';
 $('pairConnectCodeBtn').disabled=!offer||codeBusy||answerProcessing||answerAccepted||s.connected||!ZebjusCodePair.validCode($('pairPhoneCode').value);
 $('pairScanAnswerBtn').disabled=!offer||cameraStarting||answerProcessing||answerAccepted||s.connected;
 $('pairStopScanBtn').disabled=!cameraStarting&&!scanStop;
 $('pairUseAnswerBtn').disabled=!offer||answerProcessing||answerAccepted||s.connected||!$('pairAnswerText').value.trim();
 $('pairCopyOfferBtn').disabled=!offer;
 $('pairStep2').querySelector('summary').setAttribute('aria-disabled',String(!offer));
 $('pairStep3').querySelector('summary').setAttribute('aria-disabled',String(!s.connected));
 for(const id of ['ledTakeWeb','pairTakeWebBtn'])$(id).disabled=s.controller==='mobile';
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
  connected:()=>{clearTimeout(connectionTimer);openStep(3);status('Connected • VERIFY PIN');$('pairAnswerState').textContent='✓ PHONE CONNECTED • Compare the Safety PIN and click the highlighted Confirm Pairing button!';scanFeedback('✓ Android response received • Confirm Pairing is now ready','success');stamp('WebRTC connected • confirmation required');sync()},
  paired:()=>{status('Connected • paired');scanFeedback('✓ Pairing confirmed • Turn ON Grant Mobile Control after Android Take Control','success');stamp('Pairing approved, mobile needs control permission');sync()},
  led:v=>{sync();stamp('LED '+(v.led?'ON':'OFF')+' • rev '+v.revision+' • '+v.origin)},
  control:()=>{if(host.status().controller!=='mobile')stopSimulatorRemote('Ownership released');sync();stamp('Control: '+(host.status().controller||'none'))},
  simControl:forwardSimulatorControl,
  simStop:d=>stopSimulatorRemote(d?.reason||'Pairing stopped'),
  controlRequest:d=>{$('pairAnswerState').textContent='Android requested control: turn ON the header Grant Mobile Control toggle.';stamp('Mobile requests control • '+d.deviceId);sync()},
  heartbeat:at=>$('pairHeartbeat').textContent='Last heartbeat: '+new Date(at).toLocaleTimeString(),
  reconnecting:()=>{status('Reconnecting • control released');sync()},
  disconnected:reason=>{stopSimulatorRemote(reason);if(offer){++offerEpoch;offer='';answerAccepted=false;answerProcessing=false;cancelCode();stopCamera();clearOfferUi()}status('Disconnected');scanFeedback('Mobile disconnected • Create a new QR','error');stamp(reason);sync();$('pairAnswerState').textContent='Connection lost. Pair Mobile → new QR.'},
  error:reason=>{$('pairAnswerState').textContent=reason;stamp('Pairing error: '+reason);sync()}
 };
}
function startHost(){host=ZebjusP2P.session('host',callbacks());sync()}
function selectMode(mode){
 cancelCode();
 pairMode=mode==='code'?'code':'camera';
 const camera=pairMode==='camera';
 $('pairCameraMode').className='btn '+(camera?'primary':'ghost');
 $('pairCodeMode').className='btn '+(!camera?'primary qr-priority-button':'ghost');
 $('pairCameraMode').setAttribute('aria-pressed',String(camera));
 $('pairCodeMode').setAttribute('aria-pressed',String(!camera));
 $('pairCameraSection').hidden=!camera;$('pairCodeSection').hidden=camera;
 $('pairStep2Title').textContent=camera?'Step 2 • Scan Phone QR':'Step 2 • Type Android CONNECT Code';
 scanFeedback(camera?'Camera mode • Scan Android Phone Response QR':'Recommended • Scan Step 1 Web QR on Android, then enter its CONNECT code','waiting');
 if(!camera){stopCamera();if(!host.status().paired)$('pairAnswerState').textContent='Type the Android 6-digit CONNECT code. No webcam needed.'}
 else if(offer&&!host.status().paired)$('pairAnswerState').textContent='Step 2 ready • Show Android Phone QR, then click Start Camera.';
 sync();
}
async function connectWithCode(){
 const raw=$('pairPhoneCode').value.replace(/\D/g,'').slice(0,6);
 if(!ZebjusCodePair.validCode(raw)){ $('pairCodeStatus').textContent='Enter the 6-digit CONNECT code displayed on Android.';return }
 const state=host.status(),ticket=offerEpoch;
 if(!offer||!state.sessionId||!state.expires){$('pairCodeStatus').textContent='Click Pair Mobile to create a Web QR first.';return}
 if(state.paired||state.connected||answerAccepted||answerProcessing){$('pairCodeStatus').textContent='Response already received; wait for the connection or create a new QR.';return}
 if(codeBusy)return;
 const controller=new AbortController();codeAbort=controller;
 codeBusy=true;$('pairConnectCodeBtn').disabled=true;$('pairConnectCodeBtn').textContent='Connecting…';
 scanFeedback('Connecting to Android via 6-digit code…','processing');
 try{
  const answer=await ZebjusCodePair.resolveAnswer({
   offer,code:raw,sid:state.sessionId,expires:state.expires,signal:controller.signal,
   onStatus:s=>{if(ticket===offerEpoch&&!controller.signal.aborted)$('pairCodeStatus').textContent=s}
  });
  if(ticket!==offerEpoch||controller.signal.aborted)return;
  $('pairCodeStatus').textContent='✓ ANDROID CODE ACCEPTED • Establishing WebRTC…';
  scanFeedback('✓ Android code authenticated • Completing secure connection…','success');
  await receiveResponse(answer);
 }catch(error){
  if(ticket===offerEpoch&&!controller.signal.aborted){
   $('pairCodeStatus').textContent='Code pairing failed: '+error.message+'. Check both devices have Internet or use Camera mode.';
   scanFeedback('Code pairing failed • Check Internet / try a new CONNECT code','error');
   stamp('Six-digit code error: '+error.message);
  }
 }finally{if(codeAbort===controller){codeAbort=null;codeBusy=false;$('pairConnectCodeBtn').textContent='Connect with Code';sync()}}
}

function stopCamera(){
 ++scanEpoch;ZebjusQR.stop();scanStop=null;cameraStarting=false;
 $('pairScanAnswerBtn').disabled=!offer||answerProcessing||answerAccepted||!!host?.status().connected;
 $('pairStopScanBtn').disabled=true;
 $('pairScanFrame')?.classList.remove('scanning');
 if($('pairScanPlaceholder'))$('pairScanPlaceholder').hidden=false;
}
async function receiveResponse(raw){
 if(answerProcessing||answerAccepted||host.status().connected)return;
 const ticket=offerEpoch;answerProcessing=true;stopCamera();
 $('pairAnswerState').textContent='✓ PHONE QR DETECTED • Validating secure pairing…';
 scanFeedback('✓ Phone Response QR detected! Connecting to Android…','success');
 try{
  if(!offer)throw Error('Create a Web QR first');
  await host.receiveAnswer(raw);
  if(ticket!==offerEpoch)return;
  answerAccepted=true;
  $('pairAnswerText').value=raw;
  $('pairAnswerState').textContent='✓ Phone response accepted • Wait for the highlighted Confirm Pairing button.';
  stamp('Phone response QR verified (session + PIN)');
  if(!host.status().connected)connectionTimer=setTimeout(()=>{if(ticket===offerEpoch&&!host.status().connected)disconnect('WebRTC timed out. Check same Wi-Fi, client isolation or firewall, then pair again.')},25000);
 }catch(err){
  if(ticket!==offerEpoch)return;
  $('pairAnswerState').textContent='Phone QR not accepted: '+err.message+'. Click Start Camera to retry.';
  scanFeedback('QR detected, but response was rejected • Try a fresh QR','error');
  stamp('Rejected QR: '+err.message);
 }finally{if(ticket===offerEpoch){answerProcessing=false;sync()}}
}
async function scanResponse(){
 if(pairMode!=='camera'||answerAccepted||answerProcessing||host.status().connected)return;
 stopCamera();
 const ticket=scanEpoch;
 if(!host.status().sessionId){$('pairAnswerState').textContent='Click Pair Mobile to create a fresh QR first.';return}
 if(host.status().paired){$('pairAnswerState').textContent='Already paired. Disconnect before scanning another phone.';return}
 cameraStarting=true;$('pairScanAnswerBtn').disabled=true;$('pairStopScanBtn').disabled=false;
 $('pairAnswerState').textContent='Step 2 initializing • allow laptop camera permission…';
 $('pairScanFrame')?.classList.add('scanning');
 if($('pairScanPlaceholder'))$('pairScanPlaceholder').hidden=true;
 try{
  const stop=await ZebjusQR.scan({
   video:$('pairScanVideo'),canvas:$('pairScanCanvas'),
   onData:text=>{if(ticket!==scanEpoch)return;stopCamera();scanFeedback('✓ PHONE QR DETECTED • Connecting…','success');$('pairAnswerState').textContent='✓ QR DETECTED • Establishing connection…';void receiveResponse(text)},
   onError:err=>{if(ticket===scanEpoch)$('pairAnswerState').textContent='Camera error: '+err.message},
   onStatus:message=>{if(ticket===scanEpoch)$('pairAnswerState').textContent=message}
  });
  if(ticket!==scanEpoch){stop();return}scanStop=stop;
 }catch(err){
  if(ticket!==scanEpoch)return;
  stopCamera();
  $('pairAnswerState').textContent='Laptop camera unavailable: '+err.message+'. Use Advanced → manual response as a fallback.';
  stamp('Laptop camera blocked/unavailable: '+err.message);
 }finally{if(ticket===scanEpoch){cameraStarting=false;sync()}}
}
async function createOffer(){
 if(creatingOffer)return;
 const ticket=++offerEpoch;
 creatingOffer=true;cancelCode();clearTimeout(connectionTimer);answerAccepted=false;stopCamera();answerProcessing=false;openStep(1);sync();
 offer='';scanFeedback('Preparing a new secure Web QR…','processing');$('pairOfferText').value='';$('pairAnswerText').value='';$('pairCode').textContent='------';
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
  status('Waiting for Android QR');scanFeedback('Step 1 QR READY ✓ • Scan with Android, then type its six-digit CONNECT code','ready');go('settings');
  stamp('Web QR ready; expiry in 3 minutes');
  // The webcam must NEVER open during Step 1. Step 2 explicitly starts it.
  if(pairMode==='camera')$('pairAnswerState').textContent='Step 2 ready • Show Android Phone QR, then press Start Camera.';
  else $('pairCodeStatus').textContent='Web QR ready. Scan it on Android; type the phone CONNECT code here.';
 }catch(err){if(ticket===offerEpoch){$('pairAnswerState').textContent='Could not generate QR: '+err.message;scanFeedback('QR generation failed • '+err.message,'error');stamp('QR failure: '+err.message)}}
 finally{if(ticket===offerEpoch){creatingOffer=false;sync()}}
}
function disconnect(reason='Disconnected by Web App'){
 ++offerEpoch;creatingOffer=false;cancelCode();offer='';answerAccepted=false;answerProcessing=false;stopCamera();host.close(reason);clearOfferUi();scanFeedback(reason,'error');
 $('pairConnectCodeBtn').textContent='Connect with Code';$('pairAnswerState').textContent=reason;
 status('Disconnected');sync();
}
async function showVersion(){try{const r=await fetch('./app-version.json',{cache:'no-store'});if(r.ok){const meta=await r.json();$('webappVersion').textContent='v'+meta.version+' • '+meta.channel.toUpperCase()}}catch{}}
function bind(){
 window.addEventListener('message',onSimulatorMessage);
 $('simRemoteStop').onclick=()=>stopSimulatorRemote('Web emergency STOP');
 window.addEventListener('dronelab:tab',e=>{
  if(e.detail?.name==='simcontrol'&&!frame().getAttribute('src')){
   simulatorReady=false;host?.setSimulatorReady(false);frame().setAttribute('src','./tripod.html?embedded=1');
  }
 });
 flightWatchdog=setInterval(()=>{
  if(lastSimulatorFrame&&performance.now()-lastSimulatorFrame>450&&host.status().controller==='mobile')
    stopSimulatorRemote('Control timeout • virtual motors off');
 },100);
 $('topPairMobileBtn').onclick=()=>{go('settings');void createOffer()};
 $('pairCreateBtn').onclick=createOffer;
 $('pairCameraMode').onclick=()=>selectMode('camera');
 $('pairCodeMode').onclick=()=>selectMode('code');
 $('pairPhoneCode').oninput=()=>{const e=$('pairPhoneCode');e.value=e.value.replace(/\D/g,'').slice(0,6);sync()};
 $('pairStep1NextBtn').onclick=()=>openStep(host.status().connected?3:2);
 $('pairStep2BackBtn').onclick=()=>openStep(1);
 $('pairStep3BackBtn').onclick=()=>openStep(2);
 for(let i=1;i<=3;i++)$('pairStep'+i).querySelector('summary').onclick=e=>{e.preventDefault();openStep(i)};
 $('pairConnectCodeBtn').onclick=()=>void connectWithCode();
 $('pairPhoneCode').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void connectWithCode()}};
 $('pairCancelBtn').onclick=()=>disconnect('Pairing cancelled');
 $('pairDisconnectBtn').onclick=()=>disconnect('Disconnected');
 $('pairRejectBtn').onclick=()=>{host.decline();disconnect('Pairing rejected')};
 $('pairScanAnswerBtn').onclick=scanResponse;
 $('pairStopScanBtn').onclick=()=>{stopCamera();$('pairAnswerState').textContent='Camera closed; click Start Camera to resume.'};
 $('pairAnswerText').oninput=sync;
 $('pairUseAnswerBtn').onclick=()=>{const txt=$('pairAnswerText').value.trim();if(txt)void receiveResponse(txt);else $('pairAnswerState').textContent='Paste Android QR answer text first.'};
 $('pairCopyOfferBtn').onclick=async()=>{try{await ZebjusQR.copy(offer);$('pairAnswerState').textContent='Web QR offer copied to clipboard.'}catch(err){$('pairAnswerState').textContent='Copy failed: '+err.message}};
 $('pairConfirmBtn').onclick=()=>{try{host.approvePairing();status('Connected • paired');scanFeedback('✓ Pairing confirmed! Grant Mobile Control when ready','success');stopCamera()}catch(err){$('pairAnswerState').textContent=err.message}sync()};
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
 window.addEventListener('pagehide',()=>{stopSimulatorRemote('Page closed');clearInterval(flightWatchdog);++offerEpoch;stopCamera();host?.close('Web App refreshed');clearInterval(expiryTimer)});
 window.addEventListener('dronelab:tab',e=>{if(e.detail?.name!=='settings')stopCamera()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCamera();if(host.status().controller==='mobile')host.releaseControl()}});
}
function init(){if(!$('topPairMobileBtn'))return;startHost();bind();selectMode('code');void showVersion();status('Disconnected');sync()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
