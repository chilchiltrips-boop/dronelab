/* ZEBJUS v1.2.0: One-scan local QR pairing; sessions never persist through refresh. */
const $=id=>document.getElementById(id);
let host,offer='',bridgeSession=null,pollTimer=null,pollBusy=false,expiresTimer=null,replyApplied=false;
function stamp(text){
 const log=$('ledActivityLog');log.textContent=(log.textContent+'\n'+new Date().toLocaleTimeString()+'  '+text).slice(-7000);log.scrollTop=log.scrollHeight;
}
function status(text){
 $('pairStatus').textContent=text;$('pairTopStatus').textContent=text;
 const el=$('mobileHeaderStatus'),st=host?.status();
 el.textContent='Mobile: '+(st?.connected?(st.approved?'Connected':'Awaiting approval'):'Disconnected');
 el.className='qr-header-status '+(st?.connected?(st.approved?'good':'warn'):'disconnected');
}
function sync(){
 const st=host.status();
 $('ledBulb').classList.toggle('on',st.led);
 $('ledBulb').setAttribute('aria-label','Virtual LED '+(st.led?'on':'off'));
 $('ledState').textContent=st.led?'LED ON':'LED OFF';
 $('ledRevision').textContent='State revision '+st.revision;
 $('ledController').textContent='CONTROL: '+(st.controller||'none').toUpperCase();
 $('ledPeerState').textContent=st.connected?'MOBILE CONNECTED':'MOBILE DISCONNECTED';
 $('ledPeerState').classList.toggle('disconnected',!st.connected);
 $('ledControlNote').textContent=st.controller==='mobile'?'Android has exclusive control. Turn OFF Grant Mobile Control before using the Web LED.':st.controller==='web'?'Web App holds exclusive LED control.':'Take Control (Web) or grant control to a paired Android phone.';
 $('webLedOn').disabled=st.controller!=='web';$('webLedOff').disabled=st.controller!=='web';
 $('ledRelease').disabled=!st.controller;$('pairReleaseBtn').disabled=!st.controller;
 $('pairConfirmBtn').disabled=!st.connected||st.approved;
 const control=$('topGrantMobileSwitch');control.checked=st.controller==='mobile';
 control.disabled=!st.connected||!st.approved;
 $('pairControlStatus').textContent='Controller: '+(st.controller||'none')+' • '+(st.approved?'Paired':'Not approved');
 $('pairDeviceList').replaceChildren();
 if(st.connected){
  const card=document.createElement('div');card.className='qr-device-item';
  const name=document.createElement('b');name.textContent='Android companion • '+(st.approved?'Paired':'Awaiting approval');
  const detail=document.createElement('small');detail.textContent='WebRTC local • controller: '+(st.controller||'none')+' • session '+(st.sessionId||'—');
  card.append(name,detail);$('pairDeviceList').append(card);
 }else $('pairDeviceList').textContent='No mobile device connected.';
 status($('pairStatus').textContent);
}
function go(name){document.querySelector('.tab[data-tab="'+name+'"]')?.click();location.hash='#'+name}
function callbacks(){
 return {
  status:txt=>{status(txt);sync()},
  connected:()=>{status('Connected • confirm matching code');$('pairAnswerState').textContent='Android is connected. Verify the six-digit code, then Confirm Pairing.';stamp('Android WebRTC connected');sync()},
  paired:()=>{status('Connected • paired');stamp('Paired: Android can request control');sync()},
  led:detail=>{sync();stamp('LED '+(detail.led?'ON':'OFF')+' • revision '+detail.revision+' • '+detail.origin)},
  control:()=>{sync();stamp('Controller: '+(host.status().controller||'none'))},
  controlRequest:d=>{$('pairAnswerState').textContent='Android requests control: switch ON Grant Mobile Control in the top header.';stamp('Android requested control • '+d.deviceId);sync()},
  heartbeat:at=>$('pairHeartbeat').textContent='Last heartbeat: '+new Date(at).toLocaleTimeString(),
  reconnecting:()=>{status('Reconnecting • control released');sync()},
  disconnected:reason=>{status('Disconnected');stamp(reason);sync();$('pairAnswerState').textContent='Disconnected. Create a new QR to pair again.'},
  error:reason=>{status('Error');stamp(reason);$('pairAnswerState').textContent=reason}
 };
}
function makeHost(){host=ZebjusP2P.session('host',callbacks());sync()}
async function bridgeCall(endpoint,body){
 const response=await fetch('/__pairing/'+endpoint,{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(body),cache:'no-store'
 });
 const json=await response.json();
 if(!response.ok)throw Error(json.error||'Local pairing bridge request failed');
 return json;
}
async function bridgeInfo(){
 const res=await fetch('/__pairing/info',{cache:'no-store'});
 if(!res.ok)throw Error('Open the Web App from the local bridge: http://localhost:8765/#settings');
 const info=await res.json();
 if(info.version!==2||!/^http:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.0\.0\.1)/.test(info.bridge||''))throw Error('Invalid bridge LAN IP. Restart the local bridge with --lan-ip YOUR_LAPTOP_IP');
 return info;
}
function endPolling(){if(pollTimer)clearInterval(pollTimer);pollTimer=null}
async function clearBridge(){
 endPolling();const old=bridgeSession;bridgeSession=null;replyApplied=false;
 if(old){try{await bridgeCall('close',old)}catch{}}
}
async function pollAnswer(){
 if(pollBusy||!bridgeSession||replyApplied)return;
 pollBusy=true;const session=bridgeSession;
 try{
  const u=new URL('/__pairing/poll',location.origin);
  u.searchParams.set('sid',session.sid);u.searchParams.set('secret',session.secret);u.searchParams.set('tick',String(Date.now()));
  const res=await fetch(u,{cache:'no-store'}),data=await res.json();
  if(session!==bridgeSession)return;
  if(!res.ok)throw Error(data.error||'Bridge poll error');
  if(data.answer){
   replyApplied=true;endPolling();
   await host.receiveAnswer(data.answer);
   $('pairAnswerState').textContent='Android answer received automatically. Connecting via local Wi-Fi…';
   stamp('WebRTC answer received over local bridge');
  }
 }catch(e){
  if(session===bridgeSession){endPolling();$('pairAnswerState').textContent='Local bridge error: '+e.message;stamp('Bridge: '+e.message)}
 }finally{pollBusy=false}
}
async function createOffer(){
 $('pairCreateBtn').disabled=true;
 // Never leave an expired QR visible while a replacement offer is generating.
 // Wi-Fi re-pairing must not accidentally scan the previous session.
 offer='';$('pairOfferText').value='';$('pairCode').textContent='------';
 $('pairOfferCanvas').hidden=true;$('pairOfferBox').querySelector('p')?.removeAttribute('hidden');
 $('pairAnswerState').textContent='Preparing new pairing QR and invalidating old session…';
 try{
  const info=await bridgeInfo();
  await clearBridge();
  host.close('New QR pairing');
  const secret=ZebjusP2P.randomId(24);
  const signal=await host.makeOffer({bridge:info.bridge,secret});
  await bridgeCall('register',{sid:signal.sessionId,secret,expires:signal.expires});
  bridgeSession={sid:signal.sessionId,secret};
  offer=signal.qr;
  $('pairOfferText').value=signal.qr;$('pairCode').textContent=signal.pin;
  $('pairOfferCanvas').hidden=false;$('pairOfferBox').querySelector('p')?.setAttribute('hidden','');
  ZebjusQR.draw($('pairOfferCanvas'),signal.qr);
  $('pairBridgeStatus').textContent='Local bridge ready: '+info.bridge;
  $('pairAnswerState').textContent='Scan this QR ONCE using Android. The phone sends its response automatically.';
  go('settings');status('Waiting for Android to scan QR');
  stamp('Fresh one-scan pairing QR created • 3-minute expiry');
  endPolling();pollTimer=setInterval(()=>void pollAnswer(),700);
  await pollAnswer();
 }catch(e){
  $('pairBridgeStatus').textContent='Local bridge required: start python3 tools/local_pair_server.py on the laptop.';
  $('pairAnswerState').textContent=e.message;status('Bridge unavailable');
  stamp('Cannot create one-scan QR: '+e.message);
 }finally{$('pairCreateBtn').disabled=false;sync()}
}
function discard(reason='Disconnected by Web App'){
 void clearBridge();
 host.close(reason);offer='';
 $('pairOfferCanvas').hidden=true;$('pairOfferBox').querySelector('p')?.removeAttribute('hidden');
 $('pairCode').textContent='------';$('pairOfferText').value='';
 $('pairExpiry').textContent='New QR required';$('pairAnswerState').textContent=reason;
 status('Disconnected');sync();
}
async function showVersion(){
 try{const res=await fetch('./app-version.json',{cache:'no-store'});if(res.ok){const obj=await res.json();$('webappVersion').textContent='v'+obj.version+' • '+obj.channel.toUpperCase()}}catch{}
}
function bind(){
 $('topPairMobileBtn').onclick=()=>{go('settings');void createOffer()};
 $('pairCreateBtn').onclick=createOffer;
 $('pairCancelBtn').onclick=()=>discard('Pairing cancelled');
 $('pairDisconnectBtn').onclick=()=>discard('Disconnected');
 $('pairRejectBtn').onclick=()=>{host.decline();discard('Pairing rejected')};
 $('pairCopyOfferBtn').onclick=async()=>{try{await ZebjusQR.copy(offer);$('pairAnswerState').textContent='Offer copied. QR scanning is recommended.'}catch(e){$('pairAnswerState').textContent=e.message}};
 $('pairConfirmBtn').onclick=()=>{try{host.approvePairing();status('Connected • paired')}catch(e){$('pairAnswerState').textContent=e.message}sync()};
 $('topGrantMobileSwitch').onchange=e=>{
  if(e.target.checked){if(host.grantMobileControl())stamp('Header switch: Android control ON');else stamp('Connect and approve pairing first')}
  else{host.releaseControl();stamp('Header switch: Android control OFF')}
  sync();
 };
 $('ledTakeWeb').onclick=$('pairTakeWebBtn').onclick=()=>{if(!host.takeWebControl())stamp('Release mobile control first');sync()};
 $('ledRelease').onclick=$('pairReleaseBtn').onclick=()=>{host.releaseControl();sync()};
 $('webLedOn').onclick=()=>{host.toggleWebLed(true);sync()};
 $('webLedOff').onclick=()=>{host.toggleWebLed(false);sync()};
 $('ledGoSettings').onclick=()=>go('settings');
 expiresTimer=setInterval(()=>{
  const st=host.status();if(st.expires&&!st.approved){
   const remaining=Math.max(0,Math.ceil((st.expires-Date.now())/1000));
   $('pairExpiry').textContent='Offer expires in '+remaining+' seconds';
   if(remaining===0)discard('Pairing QR expired • generate a new QR');
  }
  if(st.connected&&st.lastHeartbeat&&Date.now()-st.lastHeartbeat>9500)$('pairHeartbeat').textContent='Heartbeat delayed • verify Wi-Fi';
 },1000);
 window.addEventListener('pagehide',()=>{endPolling();host?.close('Web App refreshed');clearInterval(expiresTimer);if(bridgeSession)void clearBridge()});
}
function init(){if(!$('topPairMobileBtn'))return;makeHost();bind();void showVersion();status('Disconnected');sync()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
