/* Local Android companion. Uses the same offline WebRTC/QR protocol as the website. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let peer=null,rawOffer='',rawAnswer='',scannerStop=null,expiryTimer=null,pending=false;
function message(m){const l=$('mobileLog');l.textContent=(l.textContent+'\n'+new Date().toLocaleTimeString()+'  '+m).slice(-8500);l.scrollTop=l.scrollHeight}
function status(s){$('connectionDetail').textContent=s;$('appConnection').textContent=s.toUpperCase();$('appConnection').className='conn-status'+(/connected|paired|granted/i.test(s)?' connected':'');sync()}
function sync(){
 if(!peer)return;const p=peer.status();const connected=p.connected;
 $('controllerDetail').textContent=p.controller||'None';
 $('controlState').textContent=p.controller==='mobile'?'CONTROL GRANTED':p.paired?'PAIRED • VIEW ONLY':'NO CONTROL';
 $('requestControlBtn').disabled=!p.paired||!connected||p.controller==='mobile';
 $('releaseControlBtn').disabled=!connected||p.controller!=='mobile';
 $('mobileLedOn').disabled=!connected||!p.paired||p.controller!=='mobile'||pending;
 $('mobileLedOff').disabled=!connected||!p.paired||p.controller!=='mobile'||pending;
 $('mobileLedBulb').classList.toggle('on',p.led);
 $('mobileLedBulb').setAttribute('aria-label','LED '+(p.led?'on':'off'));
 $('mobileLedState').textContent='LED '+(p.led?'ON':'OFF');
 if(!connected&&rawAnswer)$('commandStatus').textContent='Disconnected • new QR pairing required';
}
function makePeer(){
 peer=ZebjusP2P.session('mobile',{
  status:s=>status(s),
  connected:()=>{status('Connected • waiting approval');message('DataChannel connected. Ask Web App to confirm pairing code.')},
  paired:()=>{status('Connected • Paired');message('Pairing approved. Click Take Control.')},
  led:d=>{sync();$('commandStatus').textContent='Confirmed by Web App • revision '+d.revision;message('LED '+(d.led?'ON':'OFF')+' ACK / sync #'+d.revision)},
  control:d=>{sync();if(d.owner==='mobile')message('Exclusive control granted by Web App')},
  denied:r=>{message('Control denied: '+r);$('commandStatus').textContent=r},
  heartbeat:time=>{$('heartbeatDetail').textContent=new Date(time).toLocaleTimeString()},
  reconnecting:()=>status('Reconnecting'),
  disconnected:reason=>{status('Disconnected');message(reason);$('commandStatus').textContent='Connection lost • re-pair with fresh QR'},
  error:message
 });
 sync();
}
async function loadOffer(raw){
 const s=raw?.trim();if(!s)return alert('Scan or paste a Web App offer QR first.');
 try{
  const qr=await ZebjusP2P.unpack(s);if(qr.kind!=='offer')throw Error('This is not a Web App offer');
  if(scannerStop){scannerStop();scannerStop=null}
  rawOffer=s;rawAnswer='';
  $('offerInput').value=s;$('appPairCode').textContent=qr.pin;
  $('offerState').textContent='Valid offer received';$('offerExpiry').textContent='Expires '+new Date(qr.expires).toLocaleTimeString();
  $('createAnswerBtn').disabled=false;$('answerState').textContent='Click Accept Pairing to create answer QR';
  $('answerCanvas').hidden=true;$('answerPlaceholder').hidden=false;$('answerText').value='';
  message('Offer received. Verify same 6-digit code on the Web App before accepting.');
 }catch(e){$('offerState').textContent=e.message;message('Invalid QR: '+e.message)}
}
async function scanOffer(){
 $('offerState').textContent='Opening camera • approve Android camera permission…';
 try{
  scannerStop=await ZebjusQR.scan({video:$('scanVideo'),canvas:$('scanCanvas'),
   onData:txt=>{scannerStop?.();scannerStop=null;void loadOffer(txt)},
   onStatus:s=>$('offerState').textContent=s,onError:e=>$('offerState').textContent=e.message});
 }catch(e){
  const denied=e?.name==='NotAllowedError'||e?.name==='PermissionDeniedError'||/denied|permission/i.test(e?.message||'');
  const help=denied?'Camera denied. Android Settings → Apps → ZEBJUS DroneLab QR → Permissions → Camera → Allow only while using the app.':String(e?.message||e);
  $('offerState').textContent=denied?'CAMERA PERMISSION DENIED':'Camera unavailable';
  $('cameraPermissionHelp').textContent=help;
  message('QR scanner: '+help);
 }
}
async function acceptOffer(){
 if(!rawOffer)return;
 $('createAnswerBtn').disabled=true;
 try{
  peer.close('Accepting new offer');const response=await peer.makeAnswer(rawOffer);
  rawAnswer=response.qr;
  ZebjusQR.draw($('answerCanvas'),response.qr);
  $('answerCanvas').hidden=false;$('answerPlaceholder').hidden=true;
  $('answerText').value=response.qr;$('answerState').textContent='Show this QR to Web App webcam';
  $('offerState').textContent='Offer accepted • waiting for Web App answer scan';
  $('appPairCode').textContent=response.pin;message('Response QR ready. Web App must scan it and confirm pairing.');
 }catch(e){$('answerState').textContent=e.message;message('Failed generating response: '+e.message);$('createAnswerBtn').disabled=false}
}
async function ledCommand(value){
 if(pending)return;
 pending=true;$('commandStatus').textContent='Waiting for Web App acknowledgement…';sync();
 try{const reply=await peer.commandLed(value);$('commandStatus').textContent='Web confirmed '+(reply.led?'ON':'OFF')+' • revision '+reply.revision}
 catch(e){$('commandStatus').textContent=e.message;message('LED command not accepted: '+e.message)}
 finally{pending=false;sync()}
}
function reset(){
 ZebjusQR.stop();scannerStop=null;peer?.close('Android reset / new QR required');rawOffer='';rawAnswer='';pending=false;
 $('offerInput').value='';$('answerText').value='';$('appPairCode').textContent='------';
 $('offerState').textContent='Waiting for QR';$('answerState').textContent='No response yet';
 $('createAnswerBtn').disabled=true;$('answerCanvas').hidden=true;$('answerPlaceholder').hidden=false;
 $('offerExpiry').textContent='QR expires after 3 minutes.';$('commandStatus').textContent='Start pairing with a new Web App QR';
 makePeer();
}
function bind(){
 $('scanOfferBtn').onclick=scanOffer;$('stopCameraBtn').onclick=()=>ZebjusQR.stop();
 $('useOfferBtn').onclick=()=>loadOffer($('offerInput').value);
 $('createAnswerBtn').onclick=acceptOffer;$('copyAnswerBtn').onclick=async()=>{if(!rawAnswer)return;try{await ZebjusQR.copy(rawAnswer);message('Answer copied to clipboard')}catch(e){message(e.message)}};
 $('resetPairBtn').onclick=reset;$('disconnectBtn').onclick=reset;
 $('requestControlBtn').onclick=()=>{peer.requestControl();$('commandStatus').textContent='Waiting for Web App to grant exclusive control';message('Requested LED control')};
 $('releaseControlBtn').onclick=()=>{peer.releaseControl();sync();message('Released control')};
 $('mobileLedOn').onclick=()=>ledCommand(true);
 $('mobileLedOff').onclick=()=>ledCommand(false);
 expiryTimer=setInterval(()=>{
  if(!peer)return;let st=peer.status();
  if(!st.paired&&st.expires&&Date.now()>st.expires){$('offerExpiry').textContent='Pairing QR expired. Scan a fresh Web QR';$('createAnswerBtn').disabled=true;if(!st.connected)peer.close('QR expired')}
  if(st.lastHeartbeat&&Date.now()-st.lastHeartbeat>9500)$('heartbeatDetail').textContent='No heartbeat';
 },1200);
 window.addEventListener('pagehide',()=>{ZebjusQR.stop();peer?.close('Companion closed');clearInterval(expiryTimer)});
}
function init(){makePeer();bind();status('Disconnected')}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
