/* V1.1 no-cloud QR pairing in testing branch. No persistent sessions on reload. */
const $=id=>document.getElementById(id),$$=s=>[...document.querySelectorAll(s)];
let host,offer='',accepted=false,lastRequest='',expiresTimer=null,scanStop=null,webState={led:false,revision:0};
function stamp(text){const el=$('ledActivityLog');if(!el)return;el.textContent=(el.textContent+'\n'+new Date().toLocaleTimeString()+'  '+text).slice(-7000);el.scrollTop=el.scrollHeight}
function status(text){$('pairStatus').textContent=text;$('pairTopStatus').textContent=text;$('mobileHeaderStatus').textContent='Mobile: '+text;$('mobileHeaderStatus').className='qr-header-status'+(/Connected|Paired|Granted/i.test(text)?' good':/Waiting|Connecting|Reconnecting/i.test(text)?' warn':'')}
function sync(){
 const st=host.status();webState.led=st.led;webState.revision=st.revision;
 $('ledBulb').classList.toggle('on',st.led);
 $('ledBulb').setAttribute('aria-label','Virtual LED '+(st.led?'on':'off'));
 $('ledState').textContent=st.led?'LED ON':'LED OFF';
 $('ledRevision').textContent='State revision '+st.revision;
 $('ledController').textContent='CONTROL: '+(st.controller||'none').toUpperCase();
 $('ledPeerState').textContent=st.connected?'MOBILE CONNECTED':'MOBILE DISCONNECTED';
 $('ledControlNote').textContent=st.controller==='mobile'?'Mobile has control. Release/Disconnect before using Web LED.':st.controller==='web'?'Web App has exclusive LED control.':'Take Control (Web) before turning the LED on or off.';
 $('webLedOn').disabled=st.controller!=='web';$('webLedOff').disabled=st.controller!=='web';
 $('ledRelease').disabled=!st.controller;$('pairReleaseBtn').disabled=!st.controller;
 $('pairGrantControlBtn').disabled=!st.connected||!st.approved||st.controller==='web'||st.controller==='mobile';
 $('pairConfirmBtn').disabled=!st.connected||st.approved;
 $('pairControlStatus').textContent='Controller: '+(st.controller||'none')+' • '+(st.approved?'Paired':'Not approved');
 $('pairDeviceList').replaceChildren();
 if(st.connected){
  const card=document.createElement('div');card.className='qr-device-item';
  const name=document.createElement('b');name.textContent='Android companion • '+(st.approved?'Paired':'Pending approval');
  const detail=document.createElement('small');detail.textContent='WebRTC local • control: '+(st.controller||'none')+' • session '+(st.sessionId||'—');
  card.append(name,detail);$('pairDeviceList').append(card);
 }else $('pairDeviceList').textContent='No mobile device connected.';
}
function go(name){document.querySelector('.tab[data-tab="'+name+'"]')?.click();location.hash='#'+name}
function callbacks(){
 return {
  status:t=>{status(t);sync()},
  connected:()=>{status('Connected • confirm');stamp('Mobile WebRTC channel connected. Confirm pairing code.');sync()},
  paired:()=>{status('Connected • Paired');stamp('Pairing confirmed. Control not yet granted.');sync()},
  led:detail=>{sync();stamp('LED '+(detail.led?'ON':'OFF')+' • revision '+detail.revision+' • '+detail.origin)},
  control:()=>{sync();stamp('Controller: '+(host.status().controller||'none'))},
  controlRequest:d=>{lastRequest=d.deviceId;status('Mobile requests control');$('pairAnswerState').textContent='Mobile requested exclusive control. Click Grant Mobile Control.';stamp('Mobile requested Take Control');sync()},
  heartbeat:at=>{$('pairHeartbeat').textContent='Last heartbeat: '+new Date(at).toLocaleTimeString()},
  reconnecting:()=>{status('Reconnecting');sync()},
  disconnected:r=>{status('Disconnected');stamp(r);sync()},
  error:e=>{status('Error');$('pairAnswerState').textContent=e;stamp('Error: '+e)}
 }
}
function makeHost(){host=window.ZebjusP2P.session('host',callbacks());sync()}
async function createOffer(){
 window.ZebjusQR.stop();
 $('pairCreateBtn').disabled=true;
 try{
  const signal=await host.makeOffer();offer=signal.qr;
  $('pairOfferText').value=signal.qr;
  $('pairCode').textContent=signal.pin;
  $('pairOfferCanvas').hidden=false;
  $('pairOfferBox').querySelector('p')?.setAttribute('hidden','');
  window.ZebjusQR.draw($('pairOfferCanvas'),signal.qr);
  $('pairAnswerText').value='';$('pairAnswerState').textContent='Now scan this offer QR with Android, then scan the Android answer QR.';
  go('settings');status('Offer ready • scan on phone');stamp('Created expiring QR offer.');
 }catch(e){$('pairAnswerState').textContent=e.message;status('Offer failed');stamp('Offer failed: '+e.message)}
 finally{$('pairCreateBtn').disabled=false;sync()}
}
async function useAnswer(text){
 window.ZebjusQR.stop();if(!text?.trim())return alert('Scan or paste an Android answer QR first.');
 $('pairAnswerState').textContent='Applying Android WebRTC answer…';
 try{await host.receiveAnswer(text.trim());$('pairAnswerText').value=text.trim();$('pairAnswerState').textContent='Answer accepted. Wait for CONNECTED, check six-digit code on both screens, then Confirm Pairing.'}
 catch(e){$('pairAnswerState').textContent=e.message;stamp('Invalid answer: '+e.message)}
 sync();
}
async function scanAnswer(){
 try{
  scanStop=await window.ZebjusQR.scan({
   video:$('pairScanVideo'),canvas:$('pairScanCanvas'),
   onData:data=>{scanStop?.();scanStop=null;void useAnswer(data)},
   onError:e=>{$('pairAnswerState').textContent=e.message},
   onStatus:st=>{$('pairAnswerState').textContent=st}
  })
 }catch(e){$('pairAnswerState').textContent=e.message}
}
function discard(reason='Disconnected by Web App'){
 window.ZebjusQR.stop();host.close(reason);offer='';accepted=false;
 $('pairOfferCanvas').hidden=true;$('pairOfferBox').querySelector('p')?.removeAttribute('hidden');
 $('pairCode').textContent='------';$('pairOfferText').value='';$('pairAnswerText').value='';
 $('pairExpiry').textContent='New QR required';$('pairAnswerState').textContent=reason;
 status('Disconnected');sync();
}
async function showVersion(){
 try{const r=await fetch('./app-version.json',{cache:'no-store'});if(r.ok){const meta=await r.json();$('webappVersion').textContent='v'+meta.version+' • '+meta.channel.toUpperCase()}}catch{}
}
function bind(){
 $('topPairMobileBtn').onclick=()=>{go('settings');void createOffer()};
 $('pairCreateBtn').onclick=createOffer;
 $('pairCancelBtn').onclick=()=>discard('Pairing cancelled');
 $('pairDisconnectBtn').onclick=()=>discard('Disconnected');
 $('pairRejectBtn').onclick=()=>{host.decline();discard('Pairing rejected')};
 $('pairUseAnswerBtn').onclick=()=>useAnswer($('pairAnswerText').value);
 $('pairScanAnswerBtn').onclick=scanAnswer;
 $('pairStopScanBtn').onclick=()=>window.ZebjusQR.stop();
 $('pairCopyOfferBtn').onclick=async()=>{try{await window.ZebjusQR.copy(offer);$('pairAnswerState').textContent='Offer copied. Paste it in Android app.'}catch(e){$('pairAnswerState').textContent=e.message}};
 $('pairConfirmBtn').onclick=()=>{try{host.approvePairing();status('Connected • Paired')}catch(e){$('pairAnswerState').textContent=e.message}sync()};
 $('pairGrantControlBtn').onclick=()=>{if(host.grantMobileControl()){stamp('Mobile granted exclusive LED control');sync()}};
 $('ledTakeWeb').onclick=$('pairTakeWebBtn').onclick=()=>{if(!host.takeWebControl())stamp('Release mobile control first');sync()};
 $('ledRelease').onclick=$('pairReleaseBtn').onclick=()=>{host.releaseControl();sync()};
 $('webLedOn').onclick=()=>host.toggleWebLed(true);
 $('webLedOff').onclick=()=>host.toggleWebLed(false);
 $('ledGoSettings').onclick=()=>go('settings');
 expiresTimer=setInterval(()=>{
  const st=host.status();if(st.expires&&!st.approved){
   const remain=Math.max(0,Math.ceil((st.expires-Date.now())/1000));
   $('pairExpiry').textContent='Offer expires in '+remain+' seconds';
   if(remain===0)discard('Pairing QR expired • create a new one');
  }
  if(st.connected&&st.lastHeartbeat&&Date.now()-st.lastHeartbeat>9000)$('pairHeartbeat').textContent='Heartbeat delayed • check Wi-Fi';
 },1000);
 window.addEventListener('pagehide',()=>{window.ZebjusQR.stop();host?.close('Web App refreshed');clearInterval(expiresTimer)});
}
function init(){if(!$('topPairMobileBtn'))return;makeHost();bind();showVersion();status('Disconnected');sync()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
